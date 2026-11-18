begin;

-- Retain the Phase 2A RPC signature, but enforce the approved policy for
-- existing and future terms, including calls by the trusted server role.
update sideline.subscription_terms set grace_days = 0, post_expiry_mode = 'read_only'
where grace_days <> 0 or post_expiry_mode <> 'read_only';
alter table sideline.subscription_terms
    add constraint subscription_no_grace check (grace_days = 0),
    add constraint subscription_expired_read_only check (post_expiry_mode = 'read_only');

alter table sideline.matches add column recording_finished_at timestamptz,
    add constraint match_finish_follows_claim check (
        recording_finished_at is null or
        (recording_started_at is not null and recording_finished_at >= recording_started_at)
    );

create function sideline_private.utc_write_date()
returns date language sql volatile set search_path = '' as $$
    select (clock_timestamp() at time zone 'UTC')::date;
$$;

create or replace function sideline_private.require_term(p_organisation uuid)
returns sideline.subscription_terms language plpgsql set search_path = '' as $$
declare
    today date := sideline_private.utc_write_date();
    term sideline.subscription_terms;
begin
    -- Callers take the organisation lock before reaching this check. Use
    -- the clock now so a request waiting over midnight cannot start late.
    select * into term from sideline.subscription_terms
    where organisation_id = p_organisation and starts_on <= today
    order by starts_on desc limit 1;
    if term.starts_on is null or today >= term.ends_on then
        raise exception 'No current subscription entitlement' using errcode = '23514';
    end if;
    return term;
end;
$$;

create or replace function sideline_private.can_read_team(p_team uuid)
returns boolean language sql stable security definer set search_path = '' as $$
    select sideline_private.is_coach(p_team) and exists (
        select from sideline.teams t
        cross join lateral sideline_private.latest_term(t.organisation_id) s
        where t.id = p_team
    );
$$;

create or replace function sideline.recording_is_current(p_team uuid, p_match uuid, p_device uuid, p_generation bigint)
returns boolean language sql stable security definer set search_path = '' as $$
    select sideline_private.is_coach(p_team) and exists (
        select from sideline.recording_ownership r
        join sideline.teams t on t.id = r.team_id
        where r.team_id = p_team and r.match_id = p_match and r.device_id = p_device
          and r.generation = p_generation and r.coach_id = (select auth.uid()) and r.released_at is null
          and t.state = 'active'
    );
$$;

create or replace function sideline.claim_recording(p_team uuid, p_match uuid, p_device uuid)
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
    select * into holder from sideline.recording_ownership where team_id = p_team;
    if holder.team_id is not null and holder.released_at is null and
       holder.match_id = p_match and holder.device_id = p_device and holder.coach_id = caller then
        -- Retrying the existing tuple does not start a match, including after expiry.
        return holder.generation;
    end if;
    perform sideline_private.require_term(scope.organisation_id);
    if holder.team_id is not null and holder.released_at is null then
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

create function sideline.finish_recording(p_team uuid, p_match uuid, p_device uuid, p_generation bigint)
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
    finished_at := clock_timestamp();
    update sideline.matches set recording_finished_at = finished_at
    where team_id = p_team and id = p_match;
    update sideline.recording_ownership set released_at = finished_at where team_id = p_team;
end;
$$;

create function sideline_private.has_contiguous_renewal(p_organisation uuid, p_ends_on date)
returns boolean language sql stable security definer set search_path = '' as $$
    select exists (
        select from sideline.subscription_terms where organisation_id = p_organisation and starts_on = p_ends_on
    );
$$;

create function sideline.subscription_status(p_organisation uuid)
returns table (expires_at timestamptz, can_start_matches boolean, final_warning_today boolean)
language sql stable security definer set search_path = '' as $$
    select s.ends_on::timestamp at time zone 'UTC',
           sideline_private.utc_today() < s.ends_on,
           sideline_private.utc_today() = s.ends_on
               and not sideline_private.has_contiguous_renewal(p_organisation, s.ends_on)
    from sideline_private.latest_term(p_organisation) s
    where sideline_private.can_see_organisation(p_organisation);
$$;

create table sideline.subscription_reminders (
    organisation_id uuid not null,
    term_starts_on date not null,
    recipient_id uuid not null references auth.users,
    days_before integer not null check (days_before in (30, 14, 7, 1, 0)),
    due_on date not null,
    primary key (organisation_id, term_starts_on, recipient_id, days_before),
    foreign key (organisation_id, term_starts_on) references sideline.subscription_terms
);
create index subscription_reminders_due_idx on sideline.subscription_reminders (organisation_id, due_on);

create function sideline_private.reminder_recipients(p_organisation uuid)
returns setof uuid language sql stable security definer set search_path = '' as $$
    select a.user_id from sideline.organisation_admins a
    join auth.users u on u.id = a.user_id
    where a.organisation_id = p_organisation and u.email is not null and u.email_confirmed_at is not null
    union
    select c.user_id from sideline.team_coaches c
    join sideline.teams t on t.id = c.team_id
    join auth.users u on u.id = c.user_id
    where t.organisation_id = p_organisation and t.state = 'active' and c.revoked_at is null
      and u.email is not null and u.email_confirmed_at is not null;
$$;

create function sideline.schedule_subscription_reminders(p_organisation uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare
    term sideline.subscription_terms;
    inserted integer;
begin
    perform sideline_private.lock_organisation(p_organisation);
    term := sideline_private.latest_term(p_organisation);
    if term.starts_on is null or sideline_private.has_contiguous_renewal(p_organisation, term.ends_on) then
        return 0;
    end if;
    insert into sideline.subscription_reminders (organisation_id, term_starts_on, recipient_id, days_before, due_on)
    select p_organisation, term.starts_on, recipient, milestone, term.ends_on - milestone
    from sideline_private.reminder_recipients(p_organisation) as recipients(recipient)
    cross join (values (30), (14), (7), (1), (0)) as milestones(milestone)
    where term.ends_on - milestone >= greatest(term.starts_on, sideline_private.utc_today())
    on conflict do nothing;
    get diagnostics inserted = row_count;
    return inserted;
end;
$$;

-- Delivery is not part of this phase. A later dispatcher must use the
-- composite key as its delivery idempotency key and recheck eligibility.
create function sideline.due_subscription_reminders(p_organisation uuid)
returns setof sideline.subscription_reminders language sql stable security definer set search_path = '' as $$
    select r.* from sideline.subscription_reminders r
    join sideline_private.latest_term(p_organisation) s on s.starts_on = r.term_starts_on
    where r.organisation_id = p_organisation and r.due_on = sideline_private.utc_today()
      and not sideline_private.has_contiguous_renewal(p_organisation, s.ends_on)
      and r.recipient_id in (select sideline_private.reminder_recipients(p_organisation));
$$;

alter table sideline.subscription_reminders enable row level security;
revoke all on sideline.subscription_reminders from public, anon, authenticated, service_role;
revoke all on function sideline_private.utc_write_date(), sideline_private.has_contiguous_renewal(uuid, date),
    sideline_private.reminder_recipients(uuid),
    sideline.finish_recording(uuid, uuid, uuid, bigint), sideline.subscription_status(uuid),
    sideline.schedule_subscription_reminders(uuid), sideline.due_subscription_reminders(uuid)
    from public, anon, authenticated, service_role;
grant execute on function sideline.finish_recording(uuid, uuid, uuid, bigint), sideline.subscription_status(uuid) to authenticated;
grant execute on function sideline.schedule_subscription_reminders(uuid), sideline.due_subscription_reminders(uuid) to service_role;

commit;
