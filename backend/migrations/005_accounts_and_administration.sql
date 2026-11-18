begin;

-- A unique seat enforces the upper bound. The reverse, deferred FK enforces
-- the lower bound at commit while preserving the existing provisioning RPC.
-- Existing ambiguous or missing seats abort the migration for owner review.
alter table sideline.organisation_admins add unique (organisation_id),
    add column full_name text check (btrim(full_name) <> ''),
    add column phone text;
alter table sideline.organisations add constraint organisation_requires_primary_admin
    foreign key (id) references sideline.organisation_admins (organisation_id)
    deferrable initially deferred;

create table sideline.organisation_registrations (
    id uuid primary key default gen_random_uuid(),
    name text not null check (btrim(name) <> ''),
    kind text not null check (kind in ('club','county')),
    association text not null check (association in ('gaa','lgfa')),
    purchaser_id uuid not null references auth.users,
    billing_name text not null check (btrim(billing_name) <> ''),
    billing_email text not null check (position('@' in billing_email) > 1),
    billing_phone text,
    nominee_name text not null check (btrim(nominee_name) <> ''),
    nominee_email text not null check (nominee_email = lower(btrim(nominee_email)) and position('@' in nominee_email) > 1),
    nominee_phone text,
    requested_teams integer not null check (requested_teams > 0),
    nominated_user uuid references auth.users,
    accepted_at timestamptz,
    organisation_id uuid unique references sideline.organisations,
    status text generated always as (case when organisation_id is null then 'pending' else 'provisioned' end) stored,
    check ((nominated_user is null) = (accepted_at is null)),
    check (organisation_id is null or nominated_user is not null)
);

create table sideline.organisation_contacts (
    organisation_id uuid primary key references sideline.organisations,
    contact_name text not null check (btrim(contact_name) <> ''),
    email text not null check (position('@' in email) > 1),
    phone text
);

create table sideline.admin_transfers (
    id uuid primary key default gen_random_uuid(),
    organisation_id uuid not null references sideline.organisations,
    outgoing_id uuid not null references auth.users,
    incoming_email text not null check (position('@' in incoming_email) > 1),
    token_hash bytea not null unique,
    expires_at timestamptz not null,
    revoked_at timestamptz,
    accepted_at timestamptz,
    check (accepted_at is null or revoked_at is null)
);
create unique index admin_transfer_pending on sideline.admin_transfers (organisation_id)
    where revoked_at is null and accepted_at is null;

create table sideline.admin_audit (
    id uuid primary key default gen_random_uuid(),
    organisation_id uuid not null references sideline.organisations,
    happened_at timestamptz not null default clock_timestamp(),
    action text not null check (action in ('registration_provisioned','transfer_requested','transfer_accepted',
                                           'transfer_cancelled','admin_coach_assignment')),
    actor_id uuid references auth.users,
    previous_admin_id uuid references auth.users,
    admin_id uuid references auth.users,
    team_id uuid references sideline.teams
);

alter table sideline.organisation_registrations enable row level security;
alter table sideline.organisation_contacts enable row level security;
alter table sideline.admin_transfers enable row level security;
alter table sideline.admin_audit enable row level security;
create policy purchaser_registration_read on sideline.organisation_registrations for select to authenticated
    using (purchaser_id = (select auth.uid()));
create policy organisation_contact_read on sideline.organisation_contacts for select to authenticated
    using (sideline_private.is_admin(organisation_id));
create policy admin_audit_read on sideline.admin_audit for select to authenticated
    using (sideline_private.is_admin(organisation_id));

-- Check Auth's current confirmed address at the point of use. Hold the row
-- through commit so an email change cannot interleave with the decision.
create function sideline_private.verified_email(p_user uuid)
returns text language sql volatile set search_path = '' as $$
    select lower(btrim(email)) from auth.users where id = p_user
        and email_confirmed_at is not null and btrim(email) <> '' for share;
$$;

create function sideline.register_organisation(
    p_name text, p_kind text, p_association text, p_billing_name text, p_billing_phone text,
    p_nominee_name text, p_nominee_email text, p_nominee_phone text, p_requested_teams integer,
    p_billing_email text default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
    caller uuid := auth.uid();
    email text := sideline_private.verified_email(caller);
    registration uuid;
begin
    if email is null then raise exception 'Verified purchaser required' using errcode = '42501'; end if;
    insert into sideline.organisation_registrations
        (name,kind,association,purchaser_id,billing_name,billing_email,billing_phone,
         nominee_name,nominee_email,nominee_phone,requested_teams)
    values (btrim(p_name),p_kind,p_association,caller,btrim(p_billing_name),
            coalesce(lower(btrim(p_billing_email)),email),nullif(btrim(p_billing_phone),''),
            btrim(p_nominee_name),lower(btrim(p_nominee_email)),nullif(btrim(p_nominee_phone),''),p_requested_teams)
    returning id into registration;
    return registration;
end;
$$;

create function sideline.accept_admin_nomination(p_registration uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
    r sideline.organisation_registrations;
    caller uuid := auth.uid();
begin
    select * into r from sideline.organisation_registrations where id = p_registration for update;
    if r.id is null or r.accepted_at is not null or
        sideline_private.verified_email(caller) is distinct from r.nominee_email then
        raise exception 'Nomination unavailable' using errcode = '42501';
    end if;
    update sideline.organisation_registrations set nominated_user = caller, accepted_at = clock_timestamp()
    where id = r.id;
end;
$$;

-- Provisioning confirms the account and creates the seat. Purchased capacity
-- still requires a separately authorised Phase 2A term operation.
create function sideline.provision_registration(p_registration uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
    r sideline.organisation_registrations;
    org uuid;
begin
    select * into r from sideline.organisation_registrations where id = p_registration for update;
    if r.organisation_id is not null then return r.organisation_id; end if;
    if r.nominated_user is null or sideline_private.verified_email(r.nominated_user) is distinct from r.nominee_email then
        raise exception 'Accepted verified nomination required' using errcode = '23514';
    end if;
    org := sideline.provision_organisation(r.name,r.kind,r.association,r.nominated_user);
    update sideline.organisation_admins set full_name = r.nominee_name, phone = r.nominee_phone where organisation_id = org;
    update sideline.organisation_registrations set organisation_id = org where id = r.id;
    insert into sideline.admin_audit (organisation_id,action,admin_id) values (org,'registration_provisioned',r.nominated_user);
    return org;
end;
$$;

create function sideline_private.lock_admin(p_organisation uuid)
returns void language plpgsql set search_path = '' as $$
begin
    if sideline_private.is_admin(p_organisation) then
        perform sideline_private.lock_organisation(p_organisation);
        if sideline_private.is_admin(p_organisation) then return; end if;
    end if;
    raise exception 'Organisation administrator required' using errcode = '42501';
end;
$$;

create function sideline.update_organisation_contact(p_organisation uuid, p_name text, p_email text, p_phone text)
returns void language plpgsql security definer set search_path = '' as $$
begin
    perform sideline_private.lock_admin(p_organisation);
    insert into sideline.organisation_contacts values (p_organisation,btrim(p_name),lower(btrim(p_email)),nullif(btrim(p_phone),''))
    on conflict (organisation_id) do update set contact_name = excluded.contact_name, email = excluded.email, phone = excluded.phone;
end;
$$;

create function sideline.request_admin_transfer(p_organisation uuid, p_email text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
    token uuid := gen_random_uuid();
    email text := lower(btrim(p_email));
begin
    perform sideline_private.lock_admin(p_organisation);
    if email = sideline_private.verified_email(auth.uid()) then
        raise exception 'Another administrator required' using errcode = '23514';
    end if;
    update sideline.admin_transfers set revoked_at = clock_timestamp()
    where organisation_id = p_organisation and revoked_at is null and accepted_at is null;
    insert into sideline.admin_transfers (organisation_id,outgoing_id,incoming_email,token_hash,expires_at)
    values (p_organisation,auth.uid(),email,sha256(uuid_send(token)),clock_timestamp() + interval '7 days');
    insert into sideline.admin_audit (organisation_id,action,actor_id) values (p_organisation,'transfer_requested',auth.uid());
    return token;
end;
$$;

create function sideline.cancel_admin_transfer(p_organisation uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
    perform sideline_private.lock_admin(p_organisation);
    update sideline.admin_transfers set revoked_at = clock_timestamp()
    where organisation_id = p_organisation and revoked_at is null and accepted_at is null;
    if found then
        insert into sideline.admin_audit (organisation_id,action,actor_id) values (p_organisation,'transfer_cancelled',auth.uid());
    end if;
end;
$$;

create function sideline.accept_admin_transfer(p_token uuid, p_full_name text, p_phone text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
    transfer sideline.admin_transfers;
    caller uuid := auth.uid();
begin
    select * into transfer from sideline.admin_transfers where token_hash = sha256(uuid_send(p_token));
    if transfer.id is null then raise exception 'Transfer unavailable' using errcode = '42501'; end if;
    perform sideline_private.lock_organisation(transfer.organisation_id);
    select * into transfer from sideline.admin_transfers where id = transfer.id;
    if transfer.accepted_at is not null or transfer.revoked_at is not null or transfer.expires_at <= clock_timestamp()
        or transfer.outgoing_id = caller or sideline_private.verified_email(caller) is distinct from transfer.incoming_email then
        raise exception 'Transfer unavailable' using errcode = '42501';
    end if;
    if nullif(btrim(p_full_name),'') is null then raise exception 'Full name required' using errcode = '23514'; end if;
    update sideline.organisation_admins set user_id = caller, full_name = btrim(p_full_name), phone = nullif(btrim(p_phone),'')
    where organisation_id = transfer.organisation_id and user_id = transfer.outgoing_id;
    if not found then raise exception 'Transfer unavailable' using errcode = '42501'; end if;
    update sideline.admin_transfers set accepted_at = clock_timestamp() where id = transfer.id;
    update sideline.coach_invitations i set revoked_at = clock_timestamp() from sideline.teams t
    where i.team_id = t.id and t.organisation_id = transfer.organisation_id and i.created_by = transfer.outgoing_id
      and i.accepted_at is null and i.revoked_at is null;
    insert into sideline.admin_audit (organisation_id,action,actor_id,previous_admin_id,admin_id)
    values (transfer.organisation_id,'transfer_accepted',caller,transfer.outgoing_id,caller);
    return transfer.organisation_id;
end;
$$;

-- Audit actual membership transitions through the existing invite/accept
-- path, including reinstatement. A duplicate acceptance cannot add an entry.
create function sideline_private.audit_admin_coach_assignment()
returns trigger language plpgsql set search_path = '' as $$
begin
    if new.revoked_at is null and new.user_id = auth.uid() and sideline_private.team_admin(new.team_id) then
        insert into sideline.admin_audit (organisation_id,action,actor_id,admin_id,team_id)
        select organisation_id,'admin_coach_assignment',new.user_id,new.user_id,id from sideline.teams where id = new.team_id;
    end if;
    return new;
end;
$$;
create trigger admin_coach_assignment after insert or update of revoked_at on sideline.team_coaches
    for each row execute function sideline_private.audit_admin_coach_assignment();

create or replace function sideline.create_team(p_organisation uuid, p_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
    new_id uuid;
begin
    perform sideline_private.lock_admin(p_organisation);
    insert into sideline.teams (organisation_id, name) values (p_organisation, p_name) returning id into new_id;
    return new_id;
end;
$$;

create or replace function sideline.set_team_active(p_team uuid, p_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
    scope sideline.teams;
    term sideline.subscription_terms;
    allowance integer;
begin
    select * into scope from sideline.teams where id = p_team;
    perform sideline_private.lock_admin(scope.organisation_id);
    select * into scope from sideline.teams where id = p_team;
    if p_active then
        term := sideline_private.require_term(scope.organisation_id);
        if scope.state = 'active' then return; end if;
        -- Scheduled lower limits are reserved now so renewal cannot silently
        -- leave more active teams than the purchased allowance.
        select least(term.team_allowance, min(team_allowance)) into allowance
        from sideline.subscription_terms
        where organisation_id = scope.organisation_id and starts_on > term.starts_on;
        if (select count(*) from sideline.teams where organisation_id = scope.organisation_id and state = 'active') >= allowance then
            raise exception 'Team allowance exhausted' using errcode = '23514';
        end if;
        update sideline.teams set state = 'active' where id = p_team;
    elsif p_active is false then
        if exists (select from sideline.recording_ownership where team_id = p_team and released_at is null) then
            raise exception 'Team has an active recording' using errcode = '23514';
        end if;
        update sideline.teams set state = 'archived' where id = p_team;
    else
        raise exception 'Team state is required' using errcode = '22023';
    end if;
end;
$$;

create or replace function sideline.invite_coach(p_team uuid, p_email text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
    scope sideline.teams;
    new_id uuid;
    email_address text := lower(btrim(p_email));
    issued timestamptz;
begin
    select * into scope from sideline.teams where id = p_team;
    perform sideline_private.lock_admin(scope.organisation_id);
    perform sideline_private.require_term(scope.organisation_id);
    if not exists (select from sideline.teams where id = p_team and state = 'active') then
        raise exception 'Active team required' using errcode = '23514';
    end if;
    update sideline.coach_invitations set revoked_at = clock_timestamp()
    where team_id = p_team and email = email_address and accepted_at is null and revoked_at is null;
    issued := clock_timestamp();
    insert into sideline.coach_invitations (team_id, email, created_by, issued_at, expires_at)
    values (p_team, email_address, auth.uid(), issued, issued + interval '336 hours') returning id into new_id;
    return new_id;
end;
$$;

create or replace function sideline.revoke_coach_invitation(p_invitation uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
    scope sideline.teams;
begin
    select t.* into scope from sideline.coach_invitations i join sideline.teams t on t.id = i.team_id
    where i.id = p_invitation;
    perform sideline_private.lock_admin(scope.organisation_id);
    update sideline.coach_invitations set revoked_at = clock_timestamp()
    where id = p_invitation and accepted_at is null and revoked_at is null;
end;
$$;

create or replace function sideline.revoke_coach(p_team uuid, p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
    scope sideline.teams;
begin
    select * into scope from sideline.teams where id = p_team;
    perform sideline_private.lock_admin(scope.organisation_id);
    update sideline.team_coaches set revoked_at = clock_timestamp()
    where team_id = p_team and user_id = p_user and revoked_at is null;
    -- End a revoked coach's assignment without replacing it. A future claim
    -- advances the retained generation, including if this coach is reinvited.
    update sideline.recording_ownership set released_at = clock_timestamp()
    where team_id = p_team and coach_id = p_user and released_at is null;
    -- An unconsumed invitation must not reinstate the revoked coach.
    update sideline.coach_invitations i set revoked_at = clock_timestamp()
    from auth.users u where u.id = p_user and i.team_id = p_team and i.email = lower(u.email)
      and i.revoked_at is null and i.accepted_at is null;
end;
$$;

create or replace function sideline.accept_coach_invitation(p_invitation uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
    caller uuid := auth.uid();
    invitation sideline.coach_invitations;
    scope sideline.teams;
    term sideline.subscription_terms;
    allowance integer;
begin
    select * into invitation from sideline.coach_invitations where id = p_invitation;
    if not exists (
        select from auth.users where id = caller and email_confirmed_at is not null and lower(email) = invitation.email
    ) then raise exception 'Invitation unavailable' using errcode = '42501'; end if;
    select * into scope from sideline.teams where id = invitation.team_id;
    perform sideline_private.lock_organisation(scope.organisation_id);
    select * into invitation from sideline.coach_invitations where id = p_invitation;
    if invitation.accepted_at is not null or invitation.revoked_at is not null or invitation.expires_at <= clock_timestamp()
       or exists (
           select from sideline.team_coaches c where c.team_id = scope.id and c.user_id = caller
             and c.revoked_at >= invitation.issued_at
       )
       or sideline_private.verified_email(caller) is distinct from invitation.email then
        raise exception 'Invitation unavailable' using errcode = '42501';
    end if;
    if not exists (select from sideline.teams where id = scope.id and state = 'active') then
        raise exception 'Active team required' using errcode = '23514';
    end if;
    term := sideline_private.require_term(scope.organisation_id);
    select least(term.coach_allowance, min(coach_allowance)) into allowance
    from sideline.subscription_terms
    where organisation_id = scope.organisation_id and starts_on > term.starts_on;
    if not sideline_private.is_coach(scope.id) and (
        select count(*) from sideline.team_coaches where team_id = scope.id and revoked_at is null
    ) >= allowance then raise exception 'Coach allowance exhausted' using errcode = '23514'; end if;
    insert into sideline.team_coaches (team_id, user_id) values (scope.id, caller)
    on conflict (team_id, user_id) do update set revoked_at = null, assigned_at = clock_timestamp()
        where sideline.team_coaches.revoked_at is not null;
    update sideline.coach_invitations set accepted_at = clock_timestamp(), accepted_by = caller where id = p_invitation;
    return scope.id;
end;
$$;

revoke all on sideline.organisation_registrations, sideline.organisation_contacts, sideline.admin_transfers,
    sideline.admin_audit from public, anon, authenticated, service_role;
grant select on sideline.organisation_registrations to authenticated, service_role;
grant select on sideline.organisation_contacts, sideline.admin_audit to authenticated;

revoke all on function sideline_private.lock_admin(uuid), sideline_private.verified_email(uuid),
    sideline_private.audit_admin_coach_assignment(),
    sideline.register_organisation(text,text,text,text,text,text,text,text,integer,text),
    sideline.accept_admin_nomination(uuid), sideline.provision_registration(uuid),
    sideline.update_organisation_contact(uuid,text,text,text), sideline.request_admin_transfer(uuid,text),
    sideline.cancel_admin_transfer(uuid), sideline.accept_admin_transfer(uuid,text,text)
    from public, anon, authenticated, service_role;
grant execute on function sideline.register_organisation(text,text,text,text,text,text,text,text,integer,text),
    sideline.accept_admin_nomination(uuid), sideline.update_organisation_contact(uuid,text,text,text),
    sideline.request_admin_transfer(uuid,text), sideline.cancel_admin_transfer(uuid),
    sideline.accept_admin_transfer(uuid,text,text) to authenticated;
grant execute on function sideline.provision_registration(uuid) to service_role;

commit;
