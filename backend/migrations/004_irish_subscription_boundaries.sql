begin;

-- ends_on is the exclusive calendar anniversary used by the original RPCs.
-- Keep the promised instants for every existing term, including future ones.
alter table sideline.subscription_terms add column starts_at timestamptz, add column expires_at timestamptz;
update sideline.subscription_terms set starts_at = starts_on::timestamp at time zone 'UTC',
    expires_at = ends_on::timestamp at time zone 'UTC';
alter table sideline.subscription_terms alter column starts_at set not null,
    alter column expires_at set not null,
    add constraint subscription_positive_window check (starts_at < expires_at);

create function sideline_private.read_time()
returns timestamptz language sql stable set search_path = '' as $$ select statement_timestamp() $$;

create function sideline_private.write_time()
returns timestamptz language sql volatile set search_path = '' as $$ select clock_timestamp() $$;

create function sideline_private.term_at(p_organisation uuid, p_at timestamptz)
returns sideline.subscription_terms language sql stable set search_path = '' as $$
    select s.* from sideline.subscription_terms s
    where s.organisation_id = p_organisation and s.starts_at <= p_at
    order by starts_on desc limit 1;
$$;

create or replace function sideline_private.latest_term(p_organisation uuid)
returns sideline.subscription_terms language sql stable security definer set search_path = '' as $$
    select * from sideline_private.term_at(p_organisation, sideline_private.read_time());
$$;

create function sideline_private.require_term_at(p_organisation uuid, p_at timestamptz)
returns sideline.subscription_terms language plpgsql set search_path = '' as $$
declare
    term sideline.subscription_terms := sideline_private.term_at(p_organisation, p_at);
begin
    if term.starts_on is null or p_at >= term.expires_at then
        raise exception 'No current subscription entitlement' using errcode = '23514';
    end if;
    return term;
end;
$$;

create or replace function sideline_private.require_term(p_organisation uuid)
returns sideline.subscription_terms language sql volatile set search_path = '' as $$
    select * from sideline_private.require_term_at(p_organisation, sideline_private.write_time());
$$;

create or replace function sideline_private.can_read_team(p_team uuid)
returns boolean language sql stable security definer set search_path = '' as $$
    select sideline_private.is_coach(p_team) and exists (
        select from sideline.teams t
        cross join lateral sideline_private.latest_term(t.organisation_id) s
        where t.id = p_team and s.starts_on is not null
    );
$$;

-- The three trusted RPCs take the organisation write lock before reading or
-- changing a term. Use the stored instants for capacity-only updates. A
-- contiguous renewal following a legacy term begins at its promised cutoff.
create function sideline_private.save_term(
    p_organisation uuid, p_start date, p_months integer, p_kind text,
    p_teams integer, p_coaches integer, p_at timestamptz
)
returns date language plpgsql set search_path = '' as $$
declare
    previous sideline.subscription_terms;
    anniversary date := (p_start + make_interval(months => p_months))::date;
    activation timestamptz;
    cutoff timestamptz := anniversary::timestamp at time zone 'Europe/Dublin';
begin
    select * into previous from sideline.subscription_terms
    where organisation_id = p_organisation and starts_on = p_start;
    if previous.starts_on is null then
        if p_start < (p_at at time zone 'Europe/Dublin')::date then
            raise exception 'New terms cannot be backdated' using errcode = '23514';
        end if;
        select expires_at into activation from sideline.subscription_terms
        where organisation_id = p_organisation and ends_on = p_start;
        activation := coalesce(activation, p_start::timestamp at time zone 'Europe/Dublin');
    else
        if previous.expires_at <= p_at then
            raise exception 'Historical terms cannot be written' using errcode = '23514';
        end if;
        activation := previous.starts_at;
        if previous.ends_on = anniversary then cutoff := previous.expires_at; end if;
    end if;

    if exists (
        select from sideline.subscription_terms where organisation_id = p_organisation and starts_on <> p_start
        and ((starts_on < anniversary and ends_on > p_start)
             or (starts_on = anniversary and starts_at <> cutoff))
    ) then raise exception 'Terms overlap or have incompatible adjacent cutoffs' using errcode = '23514'; end if;
    if (select count(*) from sideline.teams where organisation_id = p_organisation and state = 'active') > p_teams then
        raise exception 'Active teams exceed proposed allowance' using errcode = '23514';
    end if;
    if exists (
        select from sideline.teams t join sideline.team_coaches c on c.team_id = t.id
        where t.organisation_id = p_organisation and c.revoked_at is null
        group by t.id having count(*) > p_coaches
    ) then raise exception 'Assigned coaches exceed proposed allowance' using errcode = '23514'; end if;
    insert into sideline.subscription_terms
        (organisation_id, starts_on, starts_at, ends_on, expires_at, term_kind, duration_months, team_allowance, coach_allowance)
    values (p_organisation, p_start, activation, anniversary, cutoff, p_kind, p_months, p_teams, p_coaches)
    on conflict (organisation_id, starts_on) do update set
        ends_on = excluded.ends_on, expires_at = excluded.expires_at, duration_months = excluded.duration_months,
        team_allowance = excluded.team_allowance, coach_allowance = excluded.coach_allowance;
    return anniversary;
end;
$$;

create or replace function sideline.set_subscription_term(
    p_organisation uuid, p_starts_on date, p_team_allowance integer, p_coach_allowance integer,
    p_grace_days integer default 0, p_post_expiry_mode text default 'read_only'
)
returns void language plpgsql security definer set search_path = '' as $$
begin
    perform sideline_private.lock_organisation(p_organisation);
    if p_grace_days is distinct from 0 or p_post_expiry_mode is distinct from 'read_only' then
        raise exception 'Terms require no grace and read-only expiry' using errcode = '23514';
    end if;
    if exists (select from sideline.subscription_terms where organisation_id = p_organisation
               and starts_on = p_starts_on and term_kind = 'pilot') then
        raise exception 'Pilot term requires a pilot operation' using errcode = '23514';
    end if;
    perform sideline_private.save_term(p_organisation, p_starts_on, 12, 'standard',
        p_team_allowance, p_coach_allowance, sideline_private.write_time());
end;
$$;

create or replace function sideline.issue_pilot_term(
    p_organisation uuid, p_starts_on date, p_team_allowance integer, p_coach_allowance integer,
    p_duration_months integer default 6
)
returns date language plpgsql security definer set search_path = '' as $$
begin
    perform sideline_private.lock_organisation(p_organisation);
    if exists (select from sideline.subscription_terms where organisation_id = p_organisation and starts_on = p_starts_on) then
        raise exception 'Term already exists' using errcode = '23505';
    end if;
    return sideline_private.save_term(p_organisation, p_starts_on, p_duration_months, 'pilot',
        p_team_allowance, p_coach_allowance, sideline_private.write_time());
end;
$$;

create or replace function sideline.extend_pilot_term(
    p_organisation uuid, p_starts_on date, p_expected_ends_on date, p_additional_months integer
)
returns date language plpgsql security definer set search_path = '' as $$
declare
    observed timestamptz;
    term sideline.subscription_terms;
begin
    perform sideline_private.lock_organisation(p_organisation);
    observed := sideline_private.write_time();
    select * into term from sideline.subscription_terms where organisation_id = p_organisation and starts_on = p_starts_on;
    if term.term_kind is distinct from 'pilot' or term.expires_at <= observed then
        raise exception 'Unexpired pilot term required' using errcode = '23514';
    end if;
    if p_expected_ends_on is distinct from term.ends_on then
        raise exception 'Pilot expiry changed; refresh before extending' using errcode = '23514';
    end if;
    if p_additional_months is null or p_additional_months <= 0 then
        raise exception 'Pilot extension must add calendar months' using errcode = '23514';
    end if;
    return sideline_private.save_term(p_organisation, p_starts_on, term.duration_months + p_additional_months,
        'pilot', term.team_allowance, term.coach_allowance, observed);
end;
$$;

create or replace function sideline.subscription_status(p_organisation uuid)
returns table (expires_at timestamptz, can_start_matches boolean, final_warning_today boolean)
language sql stable security definer set search_path = '' as $$
    select s.expires_at, sideline_private.read_time() < s.expires_at,
           (sideline_private.read_time() at time zone 'Europe/Dublin')::date = s.ends_on - 1
               and not sideline_private.has_contiguous_renewal(p_organisation, s.ends_on)
    from sideline_private.latest_term(p_organisation) s
    where s.starts_on is not null and sideline_private.can_see_organisation(p_organisation);
$$;

-- Keep old schedule rows for audit. Include the due date in the identity so
-- the corrected dates can be scheduled independently and only they can be due.
alter table sideline.subscription_reminders drop constraint reminder_matches_expiry,
    drop constraint subscription_reminders_pkey,
    add primary key (organisation_id, term_starts_on, term_ends_on, recipient_id, days_before, due_on),
    add constraint reminder_due_window check (due_on + days_before in (term_ends_on, term_ends_on - 1));

create or replace function sideline.schedule_subscription_reminders(p_organisation uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare
    observed timestamptz;
    term sideline.subscription_terms;
    inserted integer;
begin
    perform sideline_private.lock_organisation(p_organisation);
    observed := sideline_private.write_time();
    term := sideline_private.term_at(p_organisation, observed);
    if term.starts_on is null or sideline_private.has_contiguous_renewal(p_organisation, term.ends_on) then
        return 0;
    end if;
    insert into sideline.subscription_reminders (organisation_id, term_starts_on, term_ends_on, recipient_id, days_before, due_on)
    select p_organisation, term.starts_on, term.ends_on, recipient, milestone, term.ends_on - 1 - milestone
    from sideline_private.reminder_recipients(p_organisation) as recipients(recipient)
    cross join (values (30), (14), (7), (1), (0)) as milestones(milestone)
    where term.ends_on - 1 - milestone >= greatest(term.starts_on, (observed at time zone 'Europe/Dublin')::date)
    on conflict do nothing;
    get diagnostics inserted = row_count;
    return inserted;
end;
$$;

create or replace function sideline.due_subscription_reminders(p_organisation uuid)
returns setof sideline.subscription_reminders language sql stable security definer set search_path = '' as $$
    select r.* from sideline.subscription_reminders r
    join sideline_private.latest_term(p_organisation) s on s.starts_on = r.term_starts_on and s.ends_on = r.term_ends_on
    where r.organisation_id = p_organisation and r.due_on = (sideline_private.read_time() at time zone 'Europe/Dublin')::date
      and r.due_on = s.ends_on - 1 - r.days_before
      and not sideline_private.has_contiguous_renewal(p_organisation, s.ends_on)
      and r.recipient_id in (select sideline_private.reminder_recipients(p_organisation));
$$;

-- Reserve every term after the one actually in force, including at UTC/Dublin handoffs.

create or replace function sideline.set_team_active(p_team uuid, p_active boolean)
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

-- Use the same instant to authorise and timestamp an initial claim.

create or replace function sideline.claim_recording(p_team uuid, p_match uuid, p_device uuid)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
    scope sideline.teams;
    holder sideline.recording_ownership;
    caller uuid := auth.uid();
    started timestamptz;
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
    select * into holder from sideline.recording_ownership where team_id = p_team;
    if holder.team_id is not null and holder.released_at is null and
       holder.match_id = p_match and holder.device_id = p_device and holder.coach_id = caller then
        -- Retrying the existing tuple does not start a match, including after expiry.
        return holder.generation;
    end if;
    started := sideline_private.write_time();
    perform sideline_private.require_term_at(scope.organisation_id, started);
    if holder.team_id is not null and holder.released_at is null then
        raise exception 'Team already has an active recorder' using errcode = '23514';
    end if;
    if exists (
        select from sideline.matches where team_id = p_team and id = p_match and recording_started_at is not null
    ) then raise exception 'Previously recorded match requires recovery' using errcode = '23514'; end if;
    insert into sideline.recording_ownership (team_id, match_id, coach_id, device_id, generation, claimed_at)
    values (p_team, p_match, caller, p_device, 1, started)
    on conflict (team_id) do update set match_id = excluded.match_id, coach_id = excluded.coach_id,
        device_id = excluded.device_id, generation = sideline.recording_ownership.generation + 1,
        claimed_at = excluded.claimed_at, released_at = null
    returning generation into holder.generation;
    update sideline.matches set recording_started_at = started where team_id = p_team and id = p_match;
    return holder.generation;
end;
$$;

create or replace function sideline.finish_recording(p_team uuid, p_match uuid, p_device uuid, p_generation bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare
    scope sideline.teams;
    finished_at timestamptz;
begin
    if not sideline_private.is_coach(p_team) then
        raise exception 'Current recorder required' using errcode = '42501';
    end if;
    select * into scope from sideline.teams where id = p_team;
    perform sideline_private.lock_organisation(scope.organisation_id);
    if not sideline.recording_is_current(p_team, p_match, p_device, p_generation) then
        raise exception 'Current recorder required' using errcode = '42501';
    end if;
    finished_at := sideline_private.write_time();
    update sideline.matches set recording_finished_at = finished_at
    where team_id = p_team and id = p_match;
    update sideline.recording_ownership set released_at = finished_at where team_id = p_team;
end;
$$;

drop function sideline_private.validate_term_window(uuid, date, date, date, integer, integer),
    sideline_private.utc_today(), sideline_private.utc_write_date();

revoke all on function sideline_private.read_time(), sideline_private.write_time(),
    sideline_private.term_at(uuid, timestamptz), sideline_private.require_term_at(uuid, timestamptz),
    sideline_private.save_term(uuid, date, integer, text, integer, integer, timestamptz)
    from public, anon, authenticated, service_role;

commit;
