begin;

alter table sideline.subscription_terms
    add column term_kind text not null default 'standard',
    add column duration_months integer not null default 12,
    add constraint subscription_term_duration check (
        (term_kind = 'standard' and duration_months = 12) or
        (term_kind = 'pilot' and duration_months > 0)
    );

-- Keep the existing column and its stored dates. Replacing a column used by
-- a composite return type can invalidate plans in already-open sessions.
alter table sideline.subscription_terms alter column ends_on drop expression,
    alter column ends_on set not null,
    add constraint subscription_expiry_matches_duration check (
        ends_on = (starts_on + make_interval(months => duration_months))::date
    );

create function sideline_private.validate_term_window(
    p_organisation uuid, p_starts_on date, p_ends_on date, p_today date,
    p_team_allowance integer, p_coach_allowance integer
)
returns void language plpgsql set search_path = '' as $$
begin
    -- All callers already hold the organisation write lock.
    if p_ends_on <= p_today then
        raise exception 'Historical terms cannot be written' using errcode = '23514';
    end if;
    if exists (
        select from sideline.subscription_terms
        where organisation_id = p_organisation and starts_on <> p_starts_on
          and starts_on < p_ends_on and ends_on > p_starts_on
    ) then raise exception 'Subscription terms overlap' using errcode = '23514'; end if;
    if (select count(*) from sideline.teams where organisation_id = p_organisation and state = 'active') > p_team_allowance then
        raise exception 'Active teams exceed proposed allowance' using errcode = '23514';
    end if;
    if exists (
        select from sideline.teams t join sideline.team_coaches c on c.team_id = t.id
        where t.organisation_id = p_organisation and c.revoked_at is null
        group by t.id having count(*) > p_coach_allowance
    ) then raise exception 'Assigned coaches exceed proposed allowance' using errcode = '23514'; end if;
end;
$$;

create or replace function sideline.set_subscription_term(
    p_organisation uuid, p_starts_on date, p_team_allowance integer, p_coach_allowance integer,
    p_grace_days integer default 0, p_post_expiry_mode text default 'read_only'
)
returns void language plpgsql security definer set search_path = '' as $$
declare
    today date;
    existing_kind text;
begin
    perform sideline_private.lock_organisation(p_organisation);
    today := sideline_private.utc_write_date();
    if p_grace_days is distinct from 0 or p_post_expiry_mode is distinct from 'read_only' then
        raise exception 'Terms require no grace and read-only expiry' using errcode = '23514';
    end if;
    select term_kind into existing_kind from sideline.subscription_terms
    where organisation_id = p_organisation and starts_on = p_starts_on;
    if existing_kind = 'pilot' then
        raise exception 'Pilot term requires a pilot operation' using errcode = '23514';
    end if;
    if existing_kind is null and p_starts_on < today then
        raise exception 'New terms cannot be backdated' using errcode = '23514';
    end if;
    perform sideline_private.validate_term_window(p_organisation, p_starts_on,
        (p_starts_on + interval '12 months')::date, today, p_team_allowance, p_coach_allowance);
    insert into sideline.subscription_terms (organisation_id, starts_on, ends_on, team_allowance, coach_allowance)
    values (p_organisation, p_starts_on, (p_starts_on + interval '12 months')::date, p_team_allowance, p_coach_allowance)
    on conflict (organisation_id, starts_on) do update set
        team_allowance = excluded.team_allowance, coach_allowance = excluded.coach_allowance;
end;
$$;

create function sideline.issue_pilot_term(
    p_organisation uuid, p_starts_on date, p_team_allowance integer, p_coach_allowance integer,
    p_duration_months integer default 6
)
returns date language plpgsql security definer set search_path = '' as $$
declare
    today date;
    expiry date;
begin
    perform sideline_private.lock_organisation(p_organisation);
    today := sideline_private.utc_write_date();
    if p_starts_on < today then raise exception 'New terms cannot be backdated' using errcode = '23514'; end if;
    if exists (select from sideline.subscription_terms where organisation_id = p_organisation and starts_on = p_starts_on) then
        raise exception 'Term already exists' using errcode = '23505';
    end if;
    expiry := (p_starts_on + make_interval(months => p_duration_months))::date;
    perform sideline_private.validate_term_window(p_organisation, p_starts_on, expiry,
        today, p_team_allowance, p_coach_allowance);
    insert into sideline.subscription_terms (
        organisation_id, starts_on, ends_on, term_kind, duration_months, team_allowance, coach_allowance
    ) values (p_organisation, p_starts_on, expiry, 'pilot', p_duration_months, p_team_allowance, p_coach_allowance);
    return expiry;
end;
$$;

create function sideline.extend_pilot_term(
    p_organisation uuid, p_starts_on date, p_expected_ends_on date, p_additional_months integer
)
returns date language plpgsql security definer set search_path = '' as $$
declare
    today date;
    term sideline.subscription_terms;
    duration integer;
    expiry date;
begin
    perform sideline_private.lock_organisation(p_organisation);
    today := sideline_private.utc_write_date();
    select * into term from sideline.subscription_terms where organisation_id = p_organisation and starts_on = p_starts_on;
    if term.term_kind is distinct from 'pilot' or term.ends_on <= today then
        raise exception 'Unexpired pilot term required' using errcode = '23514';
    end if;
    if p_expected_ends_on is distinct from term.ends_on then
        raise exception 'Pilot expiry changed; refresh before extending' using errcode = '23514';
    end if;
    if p_additional_months is null or p_additional_months <= 0 then
        raise exception 'Pilot extension must add calendar months' using errcode = '23514';
    end if;
    duration := term.duration_months + p_additional_months;
    expiry := (term.starts_on + make_interval(months => duration))::date;
    perform sideline_private.validate_term_window(p_organisation, term.starts_on, expiry,
        today, term.team_allowance, term.coach_allowance);
    update sideline.subscription_terms set duration_months = duration, ends_on = expiry
    where organisation_id = p_organisation and starts_on = p_starts_on;
    return expiry;
end;
$$;

-- An extension changes the expiry of the same term. Keep old rows as history
-- and give the new schedule its own idempotency key.
alter table sideline.subscription_reminders add column term_ends_on date;
update sideline.subscription_reminders set term_ends_on = due_on + days_before;
alter table sideline.subscription_reminders
    alter column term_ends_on set not null,
    drop constraint subscription_reminders_pkey,
    add primary key (organisation_id, term_starts_on, term_ends_on, recipient_id, days_before),
    add constraint reminder_matches_expiry check (due_on = term_ends_on - days_before);

create or replace function sideline.schedule_subscription_reminders(p_organisation uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare
    today date;
    term sideline.subscription_terms;
    inserted integer;
begin
    perform sideline_private.lock_organisation(p_organisation);
    today := sideline_private.utc_write_date();
    select * into term from sideline.subscription_terms
    where organisation_id = p_organisation and starts_on <= today order by starts_on desc limit 1;
    if term.starts_on is null or sideline_private.has_contiguous_renewal(p_organisation, term.ends_on) then
        return 0;
    end if;
    insert into sideline.subscription_reminders (organisation_id, term_starts_on, term_ends_on, recipient_id, days_before, due_on)
    select p_organisation, term.starts_on, term.ends_on, recipient, milestone, term.ends_on - milestone
    from sideline_private.reminder_recipients(p_organisation) as recipients(recipient)
    cross join (values (30), (14), (7), (1), (0)) as milestones(milestone)
    where term.ends_on - milestone >= greatest(term.starts_on, today)
    on conflict do nothing;
    get diagnostics inserted = row_count;
    return inserted;
end;
$$;

create or replace function sideline.due_subscription_reminders(p_organisation uuid)
returns setof sideline.subscription_reminders language sql stable security definer set search_path = '' as $$
    select r.* from sideline.subscription_reminders r
    join sideline_private.latest_term(p_organisation) s
      on s.starts_on = r.term_starts_on and s.ends_on = r.term_ends_on
    where r.organisation_id = p_organisation and r.due_on = sideline_private.utc_today()
      and not sideline_private.has_contiguous_renewal(p_organisation, s.ends_on)
      and r.recipient_id in (select sideline_private.reminder_recipients(p_organisation));
$$;

-- Phase 2A invitations always used a seven-day lifetime. An earlier invite
-- must not restore an assignment revoked under a different verified address.
alter table sideline.coach_invitations add column issued_at timestamptz;
update sideline.coach_invitations set issued_at = expires_at - interval '7 days';
alter table sideline.coach_invitations alter column issued_at set default clock_timestamp(),
    alter column issued_at set not null;

revoke all on function sideline_private.validate_term_window(uuid, date, date, date, integer, integer),
    sideline.issue_pilot_term(uuid, date, integer, integer, integer),
    sideline.extend_pilot_term(uuid, date, date, integer) from public, anon, authenticated, service_role;
grant execute on function sideline.issue_pilot_term(uuid, date, integer, integer, integer),
    sideline.extend_pilot_term(uuid, date, date, integer) to service_role;

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

commit;
