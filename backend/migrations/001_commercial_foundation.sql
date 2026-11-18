begin;

create schema sideline;
create schema sideline_private;

create table sideline.organisations (
    id uuid primary key default gen_random_uuid(),
    name text not null check (btrim(name) <> ''),
    kind text not null check (kind in ('club', 'county')),
    association text not null check (association in ('gaa', 'lgfa')),
    -- Updated by every operation that changes capacity or recording ownership.
    mutation_version bigint not null default 0
);

create table sideline.organisation_admins (
    organisation_id uuid references sideline.organisations not null,
    user_id uuid references auth.users not null,
    primary key (organisation_id, user_id)
);

create table sideline.teams (
    id uuid primary key default gen_random_uuid(),
    organisation_id uuid references sideline.organisations not null,
    name text not null check (btrim(name) <> ''),
    state text not null default 'draft' check (state in ('draft', 'active', 'archived')),
    unique (organisation_id, name)
);
create index teams_capacity_idx on sideline.teams (organisation_id, state);

create table sideline.subscription_terms (
    organisation_id uuid references sideline.organisations not null,
    starts_on date not null check (isfinite(starts_on)),
    ends_on date generated always as ((starts_on + interval '12 months')::date) stored,
    team_allowance integer not null check (team_allowance >= 0),
    coach_allowance integer not null check (coach_allowance between 1 and 5),
    grace_days integer not null default 0 check (grace_days >= 0),
    post_expiry_mode text not null default 'read_only'
        check (post_expiry_mode in ('read_only', 'suspend')),
    primary key (organisation_id, starts_on)
);

create table sideline.team_coaches (
    team_id uuid references sideline.teams not null,
    user_id uuid references auth.users not null,
    assigned_at timestamptz not null default clock_timestamp(),
    revoked_at timestamptz,
    primary key (team_id, user_id)
);
create index team_coaches_user_idx on sideline.team_coaches (user_id, team_id) where revoked_at is null;

create table sideline.coach_invitations (
    id uuid primary key default gen_random_uuid(),
    team_id uuid references sideline.teams not null,
    email text not null check (email = lower(btrim(email)) and position('@' in email) > 1),
    created_by uuid references auth.users not null,
    expires_at timestamptz not null,
    accepted_at timestamptz,
    accepted_by uuid references auth.users,
    revoked_at timestamptz,
    check ((accepted_at is null) = (accepted_by is null)),
    check (accepted_at is null or revoked_at is null)
);
create unique index coach_invitations_pending_idx on sideline.coach_invitations (team_id, email)
    where accepted_at is null and revoked_at is null;

create table sideline.team_seasons (
    team_id uuid references sideline.teams not null,
    id uuid not null default gen_random_uuid(),
    label text not null check (btrim(label) <> ''),
    primary key (team_id, id),
    unique (team_id, label)
);

create table sideline.players (
    team_id uuid references sideline.teams not null,
    id uuid not null default gen_random_uuid(),
    display_name text not null check (btrim(display_name) <> ''),
    primary key (team_id, id)
);

create table sideline.squads (
    team_id uuid not null,
    id uuid not null default gen_random_uuid(),
    season_id uuid not null,
    name text not null check (btrim(name) <> ''),
    primary key (team_id, id),
    foreign key (team_id, season_id) references sideline.team_seasons
);

create table sideline.squad_players (
    team_id uuid not null,
    squad_id uuid not null,
    player_id uuid not null,
    jersey_number integer check (jersey_number between 1 and 99),
    primary key (team_id, squad_id, player_id),
    foreign key (team_id, squad_id) references sideline.squads,
    foreign key (team_id, player_id) references sideline.players
);

-- Match identity only. Match snapshots and event uploads belong to later work.
create table sideline.matches (
    team_id uuid references sideline.teams not null,
    id uuid not null default gen_random_uuid(),
    season_id uuid,
    recording_started_at timestamptz,
    primary key (team_id, id),
    foreign key (team_id, season_id) references sideline.team_seasons
);

create table sideline.recording_ownership (
    team_id uuid primary key,
    match_id uuid not null,
    coach_id uuid not null,
    device_id uuid not null,
    generation bigint not null check (generation > 0),
    claimed_at timestamptz not null,
    released_at timestamptz,
    foreign key (team_id, match_id) references sideline.matches,
    foreign key (team_id, coach_id) references sideline.team_coaches
);

create function sideline_private.is_admin(p_organisation uuid)
returns boolean language sql stable security definer set search_path = '' as $$
    select exists (
        select from sideline.organisation_admins
        where organisation_id = p_organisation and user_id = (select auth.uid())
    );
$$;

create function sideline_private.is_coach(p_team uuid)
returns boolean language sql stable security definer set search_path = '' as $$
    select exists (
        select from sideline.team_coaches
        where team_id = p_team and user_id = (select auth.uid()) and revoked_at is null
    );
$$;

create function sideline_private.utc_today()
returns date language sql stable set search_path = '' as $$
    select (statement_timestamp() at time zone 'UTC')::date;
$$;

create function sideline_private.latest_term(p_organisation uuid)
returns sideline.subscription_terms language sql stable security definer set search_path = '' as $$
    select s.* from sideline.subscription_terms s
    where s.organisation_id = p_organisation and s.starts_on <= sideline_private.utc_today()
    order by s.starts_on desc limit 1;
$$;

create function sideline_private.can_read_team(p_team uuid)
returns boolean language sql stable security definer set search_path = '' as $$
    select sideline_private.is_coach(p_team) and exists (
        select from sideline.teams t
        cross join lateral sideline_private.latest_term(t.organisation_id) s
        where t.id = p_team and (
            sideline_private.utc_today() < s.ends_on + s.grace_days or s.post_expiry_mode = 'read_only'
        )
    );
$$;

create function sideline_private.can_see_organisation(p_organisation uuid)
returns boolean language sql stable security definer set search_path = '' as $$
    select sideline_private.is_admin(p_organisation) or exists (
        select from sideline.teams t
        where t.organisation_id = p_organisation and sideline_private.can_read_team(t.id)
    );
$$;

create function sideline_private.team_admin(p_team uuid)
returns boolean language sql stable security definer set search_path = '' as $$
    select exists (
        select from sideline.teams t where t.id = p_team and sideline_private.is_admin(t.organisation_id)
    );
$$;

-- Write a common row, rather than only taking a row/advisory lock. Thus stale
-- REPEATABLE READ/SERIALIZABLE writers fail instead of counting an old snapshot.
create function sideline_private.lock_organisation(p_organisation uuid)
returns void language plpgsql set search_path = '' as $$
begin
    update sideline.organisations set mutation_version = mutation_version + 1 where id = p_organisation;
    if not found then raise exception 'Organisation unavailable' using errcode = '22023'; end if;
end;
$$;

create function sideline_private.require_term(p_organisation uuid)
returns sideline.subscription_terms language plpgsql set search_path = '' as $$
declare
    term sideline.subscription_terms;
begin
    term := sideline_private.latest_term(p_organisation);
    if term.starts_on is null or sideline_private.utc_today() >= term.ends_on + term.grace_days then
        raise exception 'No current subscription entitlement' using errcode = '23514';
    end if;
    return term;
end;
$$;

create function sideline.provision_organisation(p_name text, p_kind text, p_association text, p_admin uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
    new_id uuid;
begin
    if not exists (select from auth.users where id = p_admin and email_confirmed_at is not null) then
        raise exception 'Verified administrator required' using errcode = '22023';
    end if;
    insert into sideline.organisations (name, kind, association)
    values (p_name, p_kind, p_association) returning id into new_id;
    insert into sideline.organisation_admins values (new_id, p_admin);
    return new_id;
end;
$$;

create function sideline.set_subscription_term(
    p_organisation uuid, p_starts_on date, p_team_allowance integer, p_coach_allowance integer,
    p_grace_days integer default 0, p_post_expiry_mode text default 'read_only'
)
returns void language plpgsql security definer set search_path = '' as $$
declare
    end_date date := (p_starts_on + interval '12 months')::date;
begin
    perform sideline_private.lock_organisation(p_organisation);
    if end_date <= sideline_private.utc_today() then
        raise exception 'Historical terms cannot be written' using errcode = '23514';
    end if;
    if exists (
        select from sideline.subscription_terms
        where organisation_id = p_organisation and starts_on <> p_starts_on
          and starts_on < end_date and ends_on > p_starts_on
    ) then raise exception 'Subscription terms overlap' using errcode = '23514'; end if;
    if (select count(*) from sideline.teams where organisation_id = p_organisation and state = 'active') > p_team_allowance then
        raise exception 'Active teams exceed proposed allowance' using errcode = '23514';
    end if;
    if exists (
        select from sideline.teams t join sideline.team_coaches c on c.team_id = t.id
        where t.organisation_id = p_organisation and c.revoked_at is null
        group by t.id having count(*) > p_coach_allowance
    ) then raise exception 'Assigned coaches exceed proposed allowance' using errcode = '23514'; end if;
    insert into sideline.subscription_terms (organisation_id, starts_on, team_allowance, coach_allowance, grace_days, post_expiry_mode)
    values (p_organisation, p_starts_on, p_team_allowance, p_coach_allowance, p_grace_days, p_post_expiry_mode)
    on conflict (organisation_id, starts_on) do update set
        team_allowance = excluded.team_allowance, coach_allowance = excluded.coach_allowance,
        grace_days = excluded.grace_days, post_expiry_mode = excluded.post_expiry_mode;
end;
$$;

create function sideline.create_team(p_organisation uuid, p_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
    new_id uuid;
begin
    if not sideline_private.is_admin(p_organisation) then
        raise exception 'Organisation administrator required' using errcode = '42501';
    end if;
    insert into sideline.teams (organisation_id, name) values (p_organisation, p_name) returning id into new_id;
    return new_id;
end;
$$;

create function sideline.set_team_active(p_team uuid, p_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
    scope sideline.teams;
    term sideline.subscription_terms;
    allowance integer;
begin
    if not sideline_private.team_admin(p_team) then
        raise exception 'Organisation administrator required' using errcode = '42501';
    end if;
    select * into scope from sideline.teams where id = p_team;
    perform sideline_private.lock_organisation(scope.organisation_id);
    select * into scope from sideline.teams where id = p_team;
    if p_active then
        term := sideline_private.require_term(scope.organisation_id);
        if scope.state = 'active' then return; end if;
        -- Scheduled lower limits are reserved now so renewal cannot silently
        -- leave more active teams than the purchased allowance.
        select least(term.team_allowance, min(team_allowance)) into allowance
        from sideline.subscription_terms
        where organisation_id = scope.organisation_id and starts_on > sideline_private.utc_today();
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

create function sideline.invite_coach(p_team uuid, p_email text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
    scope sideline.teams;
    new_id uuid;
    email_address text := lower(btrim(p_email));
begin
    if not sideline_private.team_admin(p_team) then
        raise exception 'Organisation administrator required' using errcode = '42501';
    end if;
    select * into scope from sideline.teams where id = p_team;
    perform sideline_private.lock_organisation(scope.organisation_id);
    perform sideline_private.require_term(scope.organisation_id);
    if not exists (select from sideline.teams where id = p_team and state = 'active') then
        raise exception 'Active team required' using errcode = '23514';
    end if;
    update sideline.coach_invitations set revoked_at = clock_timestamp()
    where team_id = p_team and email = email_address and accepted_at is null and revoked_at is null;
    insert into sideline.coach_invitations (team_id, email, created_by, expires_at)
    values (p_team, email_address, auth.uid(), clock_timestamp() + interval '7 days') returning id into new_id;
    return new_id;
end;
$$;

create function sideline.revoke_coach_invitation(p_invitation uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
    scope sideline.teams;
begin
    select t.* into scope from sideline.coach_invitations i join sideline.teams t on t.id = i.team_id
    where i.id = p_invitation;
    if not sideline_private.is_admin(scope.organisation_id) then
        raise exception 'Organisation administrator required' using errcode = '42501';
    end if;
    perform sideline_private.lock_organisation(scope.organisation_id);
    update sideline.coach_invitations set revoked_at = clock_timestamp()
    where id = p_invitation and accepted_at is null and revoked_at is null;
end;
$$;

create function sideline.accept_coach_invitation(p_invitation uuid)
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
       or not exists (
           select from auth.users where id = caller and email_confirmed_at is not null and lower(email) = invitation.email
       ) then
        raise exception 'Invitation unavailable' using errcode = '42501';
    end if;
    if not exists (select from sideline.teams where id = scope.id and state = 'active') then
        raise exception 'Active team required' using errcode = '23514';
    end if;
    term := sideline_private.require_term(scope.organisation_id);
    select least(term.coach_allowance, min(coach_allowance)) into allowance
    from sideline.subscription_terms
    where organisation_id = scope.organisation_id and starts_on > sideline_private.utc_today();
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

create function sideline.revoke_coach(p_team uuid, p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
    scope sideline.teams;
begin
    if not sideline_private.team_admin(p_team) then
        raise exception 'Organisation administrator required' using errcode = '42501';
    end if;
    select * into scope from sideline.teams where id = p_team;
    perform sideline_private.lock_organisation(scope.organisation_id);
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

create function sideline.create_match(p_team uuid, p_match uuid, p_season uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
    scope sideline.teams;
begin
    if not sideline_private.is_coach(p_team) then
        raise exception 'Team assignment required' using errcode = '42501';
    end if;
    select * into scope from sideline.teams where id = p_team;
    perform sideline_private.lock_organisation(scope.organisation_id);
    if not sideline_private.is_coach(p_team) then
        raise exception 'Team assignment required' using errcode = '42501';
    end if;
    if not exists (select from sideline.teams where id = p_team and state = 'active') then
        raise exception 'Active team required' using errcode = '23514';
    end if;
    perform sideline_private.require_term(scope.organisation_id);
    insert into sideline.matches (team_id, id, season_id) values (p_team, p_match, p_season);
    return p_match;
end;
$$;

create function sideline.claim_recording(p_team uuid, p_match uuid, p_device uuid)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
    scope sideline.teams;
    holder sideline.recording_ownership;
    caller uuid := auth.uid();
begin
    if not sideline_private.is_coach(p_team) then
        raise exception 'Team assignment required' using errcode = '42501';
    end if;
    select * into scope from sideline.teams where id = p_team;
    perform sideline_private.lock_organisation(scope.organisation_id);
    if not sideline_private.is_coach(p_team) then
        raise exception 'Team assignment required' using errcode = '42501';
    end if;
    if not exists (select from sideline.teams where id = p_team and state = 'active') then
        raise exception 'Active team required' using errcode = '23514';
    end if;
    perform sideline_private.require_term(scope.organisation_id);
    select * into holder from sideline.recording_ownership where team_id = p_team;
    if holder.released_at is null and holder.team_id is not null then
        if holder.match_id = p_match and holder.device_id = p_device and holder.coach_id = caller then
            return holder.generation;
        end if;
        raise exception 'Team already has an active recorder' using errcode = '23514';
    end if;
    if exists (
        select from sideline.matches where team_id = p_team and id = p_match and recording_started_at is not null
    ) then raise exception 'Previously recorded match requires recovery' using errcode = '23514'; end if;
    insert into sideline.recording_ownership (team_id, match_id, coach_id, device_id, generation, claimed_at)
    values (p_team, p_match, caller, p_device, 1, clock_timestamp())
    on conflict (team_id) do update set match_id = excluded.match_id, coach_id = excluded.coach_id,
        device_id = excluded.device_id, generation = sideline.recording_ownership.generation + 1,
        claimed_at = excluded.claimed_at, released_at = null
    returning generation into holder.generation;
    update sideline.matches set recording_started_at = clock_timestamp() where team_id = p_team and id = p_match;
    return holder.generation;
end;
$$;

-- Phase 2A exposes no upload path. A future write must check this tuple under
-- the same serialisation rule as ownership changes and commit with the write.
create function sideline.recording_is_current(p_team uuid, p_match uuid, p_device uuid, p_generation bigint)
returns boolean language sql stable security definer set search_path = '' as $$
    select sideline_private.is_coach(p_team) and exists (
        select from sideline.recording_ownership r
        join sideline.teams t on t.id = r.team_id
        cross join lateral sideline_private.latest_term(t.organisation_id) s
        where r.team_id = p_team and r.match_id = p_match and r.device_id = p_device
          and r.generation = p_generation and r.coach_id = (select auth.uid()) and r.released_at is null
          and t.state = 'active' and sideline_private.utc_today() < s.ends_on + s.grace_days
    );
$$;

alter table sideline.organisations enable row level security;
alter table sideline.organisation_admins enable row level security;
alter table sideline.teams enable row level security;
alter table sideline.subscription_terms enable row level security;
alter table sideline.team_coaches enable row level security;
alter table sideline.coach_invitations enable row level security;
alter table sideline.team_seasons enable row level security;
alter table sideline.players enable row level security;
alter table sideline.squads enable row level security;
alter table sideline.squad_players enable row level security;
alter table sideline.matches enable row level security;
alter table sideline.recording_ownership enable row level security;

create policy organisations_read on sideline.organisations for select to authenticated
    using (sideline_private.can_see_organisation(id));
create policy organisation_admins_read on sideline.organisation_admins for select to authenticated
    using (sideline_private.is_admin(organisation_id));
create policy teams_read on sideline.teams for select to authenticated
    using (sideline_private.is_admin(organisation_id) or sideline_private.can_read_team(id));
create policy subscription_terms_read on sideline.subscription_terms for select to authenticated
    using (sideline_private.is_admin(organisation_id));
create policy team_coaches_read on sideline.team_coaches for select to authenticated
    using (sideline_private.team_admin(team_id) or (
        user_id = (select auth.uid()) and revoked_at is null and sideline_private.can_read_team(team_id)
    ));
create policy invitations_read on sideline.coach_invitations for select to authenticated
    using (sideline_private.team_admin(team_id));
create policy team_seasons_read on sideline.team_seasons for select to authenticated
    using (sideline_private.can_read_team(team_id));
create policy players_read on sideline.players for select to authenticated
    using (sideline_private.can_read_team(team_id));
create policy squads_read on sideline.squads for select to authenticated
    using (sideline_private.can_read_team(team_id));
create policy squad_players_read on sideline.squad_players for select to authenticated
    using (sideline_private.can_read_team(team_id));
create policy matches_read on sideline.matches for select to authenticated
    using (sideline_private.can_read_team(team_id));
create policy recording_read on sideline.recording_ownership for select to authenticated
    using (coach_id = (select auth.uid()) and sideline_private.can_read_team(team_id));

revoke all on schema sideline, sideline_private from public, anon, authenticated, service_role;
revoke all on all tables in schema sideline from public, anon, authenticated, service_role;
revoke all on all functions in schema sideline, sideline_private from public, anon, authenticated, service_role;
grant usage on schema sideline to authenticated, service_role;
grant select (id, name, kind, association) on sideline.organisations to authenticated;
grant select on sideline.organisation_admins, sideline.teams, sideline.subscription_terms,
    sideline.team_coaches, sideline.coach_invitations, sideline.team_seasons, sideline.players,
    sideline.squads, sideline.squad_players, sideline.matches, sideline.recording_ownership to authenticated;

-- Private helpers referenced by RLS can be executed, but the private schema
-- is not exposed and its other functions have no API role grants.
grant execute on function sideline_private.is_admin(uuid), sideline_private.can_read_team(uuid),
    sideline_private.can_see_organisation(uuid), sideline_private.team_admin(uuid) to authenticated;
grant execute on function sideline.create_team(uuid, text), sideline.set_team_active(uuid, boolean),
    sideline.invite_coach(uuid, text), sideline.revoke_coach_invitation(uuid),
    sideline.accept_coach_invitation(uuid), sideline.revoke_coach(uuid, uuid),
    sideline.create_match(uuid, uuid, uuid), sideline.claim_recording(uuid, uuid, uuid),
    sideline.recording_is_current(uuid, uuid, uuid, bigint) to authenticated;
grant execute on function sideline.provision_organisation(text, text, text, uuid),
    sideline.set_subscription_term(uuid, date, integer, integer, integer, text) to service_role;

commit;
