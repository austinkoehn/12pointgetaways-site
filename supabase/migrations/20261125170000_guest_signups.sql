-- Guest signups from the 12pointgetaways.com footer ("Get direct-booking deals").
-- Run once in the koehn-ops Supabase project (SQL editor). Creates new objects only; no existing table is touched.
--
--   public.guest_signups                  the guest list (RLS on, no policies, no anon/authenticated grants)
--   signup_api.upsert_guest_signup(...)   SECURITY DEFINER upsert; the only thing the website can call
--   role guest_signup_writer              NOLOGIN here. Give it a password separately (see docs/signup.md);
--                                         it can only EXECUTE the function, it cannot read or change the table.
--
-- Rows land with status 'new' (parked). Nothing here sends texts or emails or enrolls anyone in a campaign.

begin;

create table if not exists public.guest_signups (
  id                 uuid primary key default gen_random_uuid(),
  email              text not null,
  phone              text,
  email_consent      boolean not null default false,
  email_consent_text text,
  email_consented_at timestamptz,
  sms_consent        boolean not null default false,
  sms_consent_text   text,
  sms_consented_at   timestamptz,
  source_path        text,
  user_agent         text,
  status             text not null default 'new',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint guest_signups_email_lower check (email = lower(btrim(email)) and length(email) between 3 and 254 and position('@' in email) > 1),
  constraint guest_signups_email_unique unique (email),
  constraint guest_signups_phone_e164 check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$'),
  constraint guest_signups_email_consent_proof check (not email_consent or (email_consent_text is not null and email_consented_at is not null)),
  constraint guest_signups_sms_consent_proof check (not sms_consent or (phone is not null and sms_consent_text is not null and sms_consented_at is not null)),
  constraint guest_signups_status_not_blank check (length(btrim(status)) > 0)
);

comment on table public.guest_signups is
  'Footer signups from 12pointgetaways.com. Written only through signup_api.upsert_guest_signup. status new = parked, no outreach has started.';

alter table public.guest_signups enable row level security;
-- No policies on purpose: anon and authenticated can never read or write rows.
revoke all on table public.guest_signups from public, anon, authenticated;

-- A schema PostgREST does not expose, so the function is not reachable through the Supabase REST API.
create schema if not exists signup_api;
revoke all on schema signup_api from public;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'guest_signup_writer') then
    create role guest_signup_writer nologin noinherit connection limit 5;
  end if;
end $$;
alter role guest_signup_writer set statement_timeout = '5s';
grant usage on schema signup_api to guest_signup_writer;

create or replace function signup_api.upsert_guest_signup(
  p_email              text,
  p_phone              text,
  p_email_consent      boolean,
  p_email_consent_text text,
  p_sms_consent        boolean,
  p_sms_consent_text   text,
  p_source_path        text,
  p_user_agent         text
) returns table (signup_id uuid, was_created boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
  v_email_ok boolean := coalesce(p_email_consent, false);
  v_sms_ok boolean := coalesce(p_sms_consent, false);
begin
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 254 then
    raise exception 'invalid email' using errcode = '22023';
  end if;
  if v_phone is not null and v_phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'invalid phone' using errcode = '22023';
  end if;
  if v_sms_ok and (v_phone is null or nullif(btrim(coalesce(p_sms_consent_text, '')), '') is null) then
    raise exception 'sms consent needs a phone and the consent text' using errcode = '22023';
  end if;
  if v_email_ok and nullif(btrim(coalesce(p_email_consent_text, '')), '') is null then
    raise exception 'email consent needs the consent text' using errcode = '22023';
  end if;
  if not v_email_ok and not v_sms_ok then
    raise exception 'at least one consent is required' using errcode = '22023';
  end if;

  return query
  insert into public.guest_signups as g (
    email, phone,
    email_consent, email_consent_text, email_consented_at,
    sms_consent, sms_consent_text, sms_consented_at,
    source_path, user_agent, status
  ) values (
    v_email, v_phone,
    v_email_ok, case when v_email_ok then p_email_consent_text end, case when v_email_ok then now() end,
    v_sms_ok, case when v_sms_ok then p_sms_consent_text end, case when v_sms_ok then now() end,
    left(p_source_path, 300), left(p_user_agent, 512), 'new'
  )
  on conflict (email) do update set
    -- An explicit opt-in adds (or re-confirms) consent. An unticked box never removes an existing consent.
    email_consent      = g.email_consent or excluded.email_consent,
    email_consent_text = case when excluded.email_consent then excluded.email_consent_text else g.email_consent_text end,
    email_consented_at = case when excluded.email_consent then excluded.email_consented_at else g.email_consented_at end,
    sms_consent        = g.sms_consent or excluded.sms_consent,
    sms_consent_text   = case when excluded.sms_consent then excluded.sms_consent_text else g.sms_consent_text end,
    sms_consented_at   = case when excluded.sms_consent then excluded.sms_consented_at else g.sms_consented_at end,
    -- Phone: a text opt-in sets the number it was given for. Without a text opt-in a new number is saved only
    -- when the row has no text consent, so an existing consent never moves to a number it wasn't given for.
    phone = case
      when excluded.sms_consent then excluded.phone
      when excluded.phone is null then g.phone
      when g.sms_consent then g.phone
      else excluded.phone
    end,
    source_path = coalesce(excluded.source_path, g.source_path),
    user_agent  = coalesce(excluded.user_agent, g.user_agent),
    -- status is left alone on repeat signups (a person may already be past 'new').
    updated_at  = now()
  returning g.id, (g.xmax = 0);
end;
$$;

comment on function signup_api.upsert_guest_signup(text, text, boolean, text, boolean, text, text, text) is
  'Footer signup upsert on lowercased email. Adds consent, never removes it. New rows status new (parked).';

revoke all on function signup_api.upsert_guest_signup(text, text, boolean, text, boolean, text, text, text) from public, anon, authenticated;
grant execute on function signup_api.upsert_guest_signup(text, text, boolean, text, boolean, text, text, text) to guest_signup_writer;

commit;
