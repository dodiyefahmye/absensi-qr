-- =====================================================================
--  ABSENSI QR — Skema Database Supabase
--  Jalankan SEKALI di Supabase Dashboard → SQL Editor → New query → Run
--  Aman dijalankan ulang (idempotent) untuk memperbarui fungsi/policy.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- 1. TABEL
-- ---------------------------------------------------------------------

create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  email       text,
  created_at  timestamptz not null default now()
);

create table if not exists public.events (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name          text not null,
  description   text,
  organizer     text,
  location      text,
  event_date    date,
  start_time    time,
  end_time      time,
  mode          text not null default 'participant_qr'
                check (mode in ('participant_qr', 'event_qr', 'hybrid')),
  theme         jsonb not null default '{}'::jsonb,
  form_schema   jsonb not null default '[]'::jsonb,
  settings      jsonb not null default '{}'::jsonb,
  categories    jsonb not null default '[]'::jsonb,
  is_active     boolean not null default true,
  is_open       boolean not null default true,
  open_at       timestamptz,
  close_at      timestamptz,
  public_token  text not null unique default encode(extensions.gen_random_bytes(12), 'hex'),
  qr_secret     text not null default encode(extensions.gen_random_bytes(16), 'hex'),
  invite_code   text not null unique default upper(encode(extensions.gen_random_bytes(4), 'hex')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.event_members (
  event_id    uuid not null references public.events(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  role        text not null default 'scanner' check (role in ('owner', 'admin', 'scanner')),
  created_at  timestamptz not null default now(),
  primary key (event_id, user_id)
);

create table if not exists public.participants (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events(id) on delete cascade,
  qr_token    text not null unique default encode(extensions.gen_random_bytes(16), 'hex'),
  name        text not null,
  category    text,
  email       text,
  phone       text,
  data        jsonb not null default '{}'::jsonb,
  self_checkin boolean,           -- null = ikuti aturan acara, true = boleh, false = tidak boleh check-in mandiri
  created_at  timestamptz not null default now()
);

create table if not exists public.attendances (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid not null references public.events(id) on delete cascade,
  participant_id  uuid references public.participants(id) on delete cascade,
  name            text,
  category        text,
  data            jsonb not null default '{}'::jsonb,
  checked_in_at   timestamptz not null default now(),
  scanned_by      uuid references public.profiles(id) on delete set null,
  device_label    text,
  device_id       text,
  source          text not null default 'scan' check (source in ('scan', 'form', 'manual', 'self')),
  client_id       text unique,
  constraint attendances_event_participant_key unique (event_id, participant_id)
);

create table if not exists public.event_templates (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name         text not null,
  mode         text not null default 'participant_qr',
  theme        jsonb not null default '{}'::jsonb,
  form_schema  jsonb not null default '[]'::jsonb,
  settings     jsonb not null default '{}'::jsonb,
  categories   jsonb not null default '[]'::jsonb,
  created_at   timestamptz not null default now()
);

-- Migrasi untuk database yang sudah terpasang sebelumnya (aman dijalankan berulang)
alter table public.participants add column if not exists self_checkin boolean;
alter table public.events drop constraint if exists events_mode_check;
alter table public.events add constraint events_mode_check check (mode in ('participant_qr', 'event_qr', 'hybrid'));
alter table public.attendances drop constraint if exists attendances_source_check;
alter table public.attendances add constraint attendances_source_check check (source in ('scan', 'form', 'manual', 'self'));

-- Daftar email yang boleh membuat acara.
-- KOSONG = semua akun boleh membuat acara. Jika diisi, hanya email di daftar ini yang boleh.
create table if not exists public.pembuat_acara (
  email      text primary key,
  catatan    text,
  created_at timestamptz not null default now()
);

create index if not exists participants_event_idx on public.participants(event_id);
create index if not exists participants_name_idx  on public.participants(event_id, lower(name));
create index if not exists attendances_event_idx  on public.attendances(event_id, checked_in_at desc);
create index if not exists event_members_user_idx on public.event_members(user_id);

-- ---------------------------------------------------------------------
-- 2. FUNGSI BANTU
-- ---------------------------------------------------------------------

create or replace function public.is_event_member(p_event_id uuid, p_roles text[] default null)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.event_members m
    where m.event_id = p_event_id
      and m.user_id = auth.uid()
      and (p_roles is null or m.role = any(p_roles))
  );
$$;

create or replace function public.shares_event_with(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.event_members a
    join public.event_members b on a.event_id = b.event_id
    where a.user_id = auth.uid() and b.user_id = p_user
  );
$$;

create or replace function public.boleh_buat_acara()
returns boolean language sql stable security definer set search_path = public, auth as $$
  select not exists (select 1 from public.pembuat_acara)
      or exists (select 1 from auth.users u
                 join public.pembuat_acara a on lower(a.email) = lower(u.email)
                 where u.id = auth.uid());
$$;

-- Apakah peserta boleh check-in mandiri (mode Campuran)?
--   settings.self_checkin = { enabled, who: all | categories | listed, categories: [...] }
--   participants.self_checkin: null = ikuti aturan, true/false = pengecualian per orang
create or replace function public.can_self_checkin(p public.participants, e public.events)
returns boolean language sql stable as $$
  select e.mode = 'hybrid'
     and coalesce((e.settings->'self_checkin'->>'enabled')::boolean, false)
     and case
           when p.self_checkin is not null then p.self_checkin
           when coalesce(e.settings->'self_checkin'->>'who', 'all') = 'all' then true
           when e.settings->'self_checkin'->>'who' = 'categories'
             then coalesce(e.settings->'self_checkin'->'categories', '[]'::jsonb) ? coalesce(p.category, '')
           else false
         end;
$$;

create or replace function public.event_is_open(e public.events, p_at timestamptz default now())
returns boolean language sql stable as $$
  select e.is_active and e.is_open
     and (e.open_at  is null or p_at >= e.open_at)
     and (e.close_at is null or p_at <= e.close_at);
$$;

-- Kode QR berputar (rotating) berbasis HMAC
create or replace function public.event_code(p_token text, p_secret text, p_window bigint)
returns text language sql immutable set search_path = public, extensions as $$
  select upper(substr(encode(extensions.hmac(p_token || ':' || p_window::text, p_secret, 'sha256'), 'hex'), 1, 8));
$$;

create or replace function public.safe_event_json(e public.events)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'id', e.id, 'name', e.name, 'description', e.description, 'organizer', e.organizer,
    'location', e.location, 'event_date', e.event_date, 'start_time', e.start_time,
    'end_time', e.end_time, 'mode', e.mode, 'theme', e.theme, 'form_schema', e.form_schema,
    'categories', e.categories,
    'settings', jsonb_build_object(
      'rotating_qr', coalesce((e.settings->>'rotating_qr')::boolean, false),
      'success_message', e.settings->>'success_message',
      'self_checkin', e.mode = 'hybrid' and coalesce((e.settings->'self_checkin'->>'enabled')::boolean, false),
      'walkin', e.mode = 'hybrid' and coalesce((e.settings->'walkin'->>'enabled')::boolean, false),
      'walkin_category', coalesce(nullif(e.settings->'walkin'->>'category', ''), 'Tamu tambahan')
    ),
    'is_open', public.event_is_open(e)
  );
$$;

-- ---------------------------------------------------------------------
-- 3. TRIGGER
-- ---------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Profil untuk user yang sudah ada sebelum skema dipasang
insert into public.profiles (id, email, full_name)
select id, email, coalesce(raw_user_meta_data->>'full_name', split_part(email, '@', 1)) from auth.users
on conflict (id) do nothing;

create or replace function public.handle_new_event()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.event_members (event_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (event_id, user_id) do update set role = 'owner';
  return new;
end $$;

drop trigger if exists on_event_created on public.events;
create trigger on_event_created after insert on public.events
  for each row execute function public.handle_new_event();

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists events_touch on public.events;
create trigger events_touch before update on public.events
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- 4. ROW LEVEL SECURITY
-- ---------------------------------------------------------------------

alter table public.profiles        enable row level security;
alter table public.events          enable row level security;
alter table public.event_members   enable row level security;
alter table public.participants    enable row level security;
alter table public.attendances     enable row level security;
alter table public.event_templates enable row level security;
alter table public.pembuat_acara   enable row level security;  -- hanya bisa dikelola dari dashboard Supabase

-- profiles
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_event_with(id));
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- events
drop policy if exists events_select on public.events;
create policy events_select on public.events for select to authenticated
  using (owner_id = auth.uid() or public.is_event_member(id));
drop policy if exists events_insert on public.events;
create policy events_insert on public.events for insert to authenticated
  with check (owner_id = auth.uid() and public.boleh_buat_acara());
drop policy if exists events_update on public.events;
create policy events_update on public.events for update to authenticated
  using (public.is_event_member(id, array['owner','admin']))
  with check (public.is_event_member(id, array['owner','admin']));
drop policy if exists events_delete on public.events;
create policy events_delete on public.events for delete to authenticated
  using (owner_id = auth.uid());

-- event_members
drop policy if exists members_select on public.event_members;
create policy members_select on public.event_members for select to authenticated
  using (public.is_event_member(event_id));
drop policy if exists members_update on public.event_members;
create policy members_update on public.event_members for update to authenticated
  using (public.is_event_member(event_id, array['owner']) and role <> 'owner')
  with check (role in ('admin','scanner'));
drop policy if exists members_delete on public.event_members;
create policy members_delete on public.event_members for delete to authenticated
  using ((public.is_event_member(event_id, array['owner','admin']) and role <> 'owner')
         or (user_id = auth.uid() and role <> 'owner'));

-- participants
drop policy if exists participants_select on public.participants;
create policy participants_select on public.participants for select to authenticated
  using (public.is_event_member(event_id));
drop policy if exists participants_write on public.participants;
create policy participants_write on public.participants for all to authenticated
  using (public.is_event_member(event_id, array['owner','admin']))
  with check (public.is_event_member(event_id, array['owner','admin']));

-- attendances (insert scanner lewat RPC check_in; insert langsung untuk admin)
drop policy if exists attendances_select on public.attendances;
create policy attendances_select on public.attendances for select to authenticated
  using (public.is_event_member(event_id));
drop policy if exists attendances_write on public.attendances;
create policy attendances_write on public.attendances for all to authenticated
  using (public.is_event_member(event_id, array['owner','admin']))
  with check (public.is_event_member(event_id, array['owner','admin']));

-- templates
drop policy if exists templates_all on public.event_templates;
create policy templates_all on public.event_templates for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ---------------------------------------------------------------------
-- 5. RPC (dipanggil dari aplikasi)
-- ---------------------------------------------------------------------

-- 5a. Check-in oleh panitia (scan QR peserta / pilih manual). Atomik & anti-duplikat.
create or replace function public.check_in(
  p_event_id uuid,
  p_qr_token text default null,
  p_participant_id uuid default null,
  p_device_label text default null,
  p_client_id text default null,
  p_checked_at timestamptz default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_event public.events;
  v_p     public.participants;
  v_att   public.attendances;
  v_at    timestamptz := now();
  v_by    text;
begin
  if auth.uid() is null or not public.is_event_member(p_event_id) then
    return jsonb_build_object('status', 'forbidden');
  end if;

  -- waktu scan offline (maks. 24 jam ke belakang)
  if p_checked_at is not null and p_checked_at <= now() and p_checked_at > now() - interval '24 hours' then
    v_at := p_checked_at;
  end if;

  -- idempotent untuk sinkronisasi offline
  if p_client_id is not null then
    select * into v_att from public.attendances where client_id = p_client_id;
    if found then
      select * into v_p from public.participants where id = v_att.participant_id;
      return jsonb_build_object('status', 'ok', 'participant', to_jsonb(v_p), 'attendance', to_jsonb(v_att));
    end if;
  end if;

  select * into v_event from public.events where id = p_event_id;

  if p_participant_id is not null then
    select * into v_p from public.participants where id = p_participant_id and event_id = p_event_id;
  else
    select * into v_p from public.participants where qr_token = p_qr_token and event_id = p_event_id;
  end if;

  if not found then
    if p_qr_token is not null and exists (select 1 from public.participants where qr_token = p_qr_token) then
      return jsonb_build_object('status', 'wrong_event');
    end if;
    return jsonb_build_object('status', 'invalid');
  end if;

  if not public.event_is_open(v_event, v_at) then
    return jsonb_build_object('status', 'closed', 'participant', to_jsonb(v_p));
  end if;

  insert into public.attendances (event_id, participant_id, name, category, data, checked_in_at,
                                  scanned_by, device_label, source, client_id)
  values (p_event_id, v_p.id, v_p.name, v_p.category, v_p.data, v_at, auth.uid(), p_device_label,
          case when p_participant_id is not null then 'manual' else 'scan' end, p_client_id)
  on conflict on constraint attendances_event_participant_key do nothing
  returning * into v_att;

  if not found then
    select * into v_att from public.attendances where event_id = p_event_id and participant_id = v_p.id;
    select full_name into v_by from public.profiles where id = v_att.scanned_by;
    return jsonb_build_object('status', 'duplicate', 'participant', to_jsonb(v_p),
                              'attendance', to_jsonb(v_att), 'scanned_by_name', v_by);
  end if;

  return jsonb_build_object('status', 'ok', 'participant', to_jsonb(v_p), 'attendance', to_jsonb(v_att));
end $$;

-- 5b. Kode QR acara saat ini (untuk layar display, khusus anggota)
create or replace function public.get_event_code(p_event_id uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_event public.events;
  v_rot   int;
  v_win   bigint;
  v_epoch bigint := floor(extract(epoch from now()));
begin
  if not public.is_event_member(p_event_id) then return null; end if;
  select * into v_event from public.events where id = p_event_id;
  v_rot := greatest(coalesce((v_event.settings->>'rotate_seconds')::int, 30), 10);
  v_win := v_epoch / v_rot;
  return jsonb_build_object(
    'token', v_event.public_token,
    'rotating', coalesce((v_event.settings->>'rotating_qr')::boolean, false),
    'code', public.event_code(v_event.public_token, v_event.qr_secret, v_win),
    'expires_in', v_rot - (v_epoch % v_rot),
    'rotate_seconds', v_rot
  );
end $$;

-- 5c. Data acara publik (untuk formulir peserta, tanpa login)
create or replace function public.get_public_event(p_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  select public.safe_event_json(e) from public.events e where e.public_token = p_token and e.is_active;
$$;

-- 5d. Submit formulir publik (mode QR Acara, atau tamu tidak terdaftar di mode Campuran)
create or replace function public.submit_public_attendance(
  p_token text, p_code text, p_data jsonb, p_device_id text default null
) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_event  public.events;
  v_rot    int;
  v_win    bigint;
  v_field  jsonb;
  v_ukey   text;
  v_name   text;
  v_att    public.attendances;
begin
  select * into v_event from public.events where public_token = p_token and is_active;
  if not found or v_event.mode = 'participant_qr' then
    return jsonb_build_object('status', 'invalid');
  end if;
  if v_event.mode = 'hybrid' and not coalesce((v_event.settings->'walkin'->>'enabled')::boolean, false) then
    return jsonb_build_object('status', 'walkin_disabled');
  end if;
  if not public.event_is_open(v_event) then
    return jsonb_build_object('status', 'closed');
  end if;
  if octet_length(coalesce(p_data, '{}'::jsonb)::text) > 1500000 then
    return jsonb_build_object('status', 'too_large');
  end if;

  -- validasi kode QR berputar
  if coalesce((v_event.settings->>'rotating_qr')::boolean, false) then
    v_rot := greatest(coalesce((v_event.settings->>'rotate_seconds')::int, 30), 10);
    v_win := floor(extract(epoch from now()))::bigint / v_rot;
    if upper(coalesce(p_code, '')) not in (
      public.event_code(v_event.public_token, v_event.qr_secret, v_win),
      public.event_code(v_event.public_token, v_event.qr_secret, v_win - 1),
      public.event_code(v_event.public_token, v_event.qr_secret, v_win - 2)
    ) then
      return jsonb_build_object('status', 'expired_code');
    end if;
  end if;

  -- validasi field wajib
  for v_field in select * from jsonb_array_elements(v_event.form_schema) loop
    if coalesce((v_field->>'required')::boolean, false)
       and coalesce(trim(p_data->>(v_field->>'key')), '') in ('', '[]', 'false') then
      return jsonb_build_object('status', 'missing_field', 'field', v_field->>'label');
    end if;
  end loop;

  -- satu kali per perangkat
  if coalesce((v_event.settings->>'one_submit_per_device')::boolean, false) and p_device_id is not null
     and exists (select 1 from public.attendances where event_id = v_event.id and device_id = p_device_id) then
    return jsonb_build_object('status', 'duplicate', 'reason', 'device');
  end if;

  -- field unik (mis. NIP / email)
  v_ukey := nullif(v_event.settings->>'unique_field', '');
  if v_ukey is not null and coalesce(trim(p_data->>v_ukey), '') <> ''
     and exists (select 1 from public.attendances
                 where event_id = v_event.id and lower(trim(data->>v_ukey)) = lower(trim(p_data->>v_ukey))) then
    return jsonb_build_object('status', 'duplicate', 'reason', 'unique_field');
  end if;

  v_name := coalesce(nullif(trim(p_data->>'nama'), ''), 'Tanpa nama');

  insert into public.attendances (event_id, name, category, data, source, device_id, device_label)
  values (v_event.id, left(v_name, 200),
          case when v_event.mode = 'hybrid' then coalesce(nullif(v_event.settings->'walkin'->>'category', ''), 'Tamu tambahan')
               else nullif(p_data->>'kategori', '') end,
          p_data, 'form', p_device_id, 'Formulir')
  returning * into v_att;

  return jsonb_build_object('status', 'ok', 'name', v_att.name, 'checked_in_at', v_att.checked_in_at);
end $$;

-- 5e. E-ticket publik (siapa pun yang memegang token tiket)
--     Hanya data yang dipilih di desain kartu (theme.ticket.fields / photo_field) yang dikirim.
create or replace function public.get_ticket(p_qr_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'participant', jsonb_build_object(
      'name', p.name, 'category', p.category, 'qr_token', p.qr_token,
      'email', case when coalesce(e.theme->'ticket'->'fields', '[]'::jsonb) ? '_email' then p.email end,
      'phone', case when coalesce(e.theme->'ticket'->'fields', '[]'::jsonb) ? '_phone' then p.phone end,
      'data', coalesce((
        select jsonb_object_agg(d.key, d.value) from jsonb_each(p.data) d
        where coalesce(e.theme->'ticket'->'fields', '[]'::jsonb) ? d.key
           or d.key = e.theme->'ticket'->>'photo_field'
      ), '{}'::jsonb)
    ),
    'event', public.safe_event_json(e),
    'self_checkin_allowed', public.can_self_checkin(p, e),
    'checked_in_at', (select a.checked_in_at from public.attendances a
                      where a.event_id = e.id and a.participant_id = p.id)
  )
  from public.participants p join public.events e on e.id = p.event_id
  where p.qr_token = p_qr_token;
$$;

-- 5e2. Check-in mandiri oleh tamu (mode Campuran)
--      Identitas: token e-ticket pribadi. Kehadiran di lokasi: QR/kode berputar dari layar acara.
create or replace function public.self_check_in(
  p_ticket text, p_event_token text default null, p_code text default null, p_device_id text default null
) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_p   public.participants;
  v_e   public.events;
  v_att public.attendances;
  v_rot int;
  v_win bigint;
begin
  select * into v_p from public.participants where qr_token = p_ticket;
  if not found then return jsonb_build_object('status', 'invalid'); end if;
  select * into v_e from public.events where id = v_p.event_id and is_active;
  if not found then return jsonb_build_object('status', 'invalid'); end if;
  if p_event_token is not null and p_event_token <> v_e.public_token then
    return jsonb_build_object('status', 'wrong_event');
  end if;
  if not public.can_self_checkin(v_p, v_e) then
    return jsonb_build_object('status', 'not_allowed', 'name', v_p.name);
  end if;
  if not public.event_is_open(v_e) then
    return jsonb_build_object('status', 'closed');
  end if;

  -- Kode wajib jika QR berputar aktif, atau jika tamu mengetik kode secara manual
  if coalesce((v_e.settings->>'rotating_qr')::boolean, false) or p_event_token is null then
    v_rot := greatest(coalesce((v_e.settings->>'rotate_seconds')::int, 30), 10);
    v_win := floor(extract(epoch from now()))::bigint / v_rot;
    if upper(trim(coalesce(p_code, ''))) not in (
      public.event_code(v_e.public_token, v_e.qr_secret, v_win),
      public.event_code(v_e.public_token, v_e.qr_secret, v_win - 1),
      public.event_code(v_e.public_token, v_e.qr_secret, v_win - 2)
    ) then
      return jsonb_build_object('status', 'expired_code');
    end if;
  end if;

  insert into public.attendances (event_id, participant_id, name, category, data, source, device_id, device_label)
  values (v_e.id, v_p.id, v_p.name, v_p.category, v_p.data, 'self', left(p_device_id, 64), 'Mandiri')
  on conflict on constraint attendances_event_participant_key do nothing
  returning * into v_att;

  if not found then
    select * into v_att from public.attendances where event_id = v_e.id and participant_id = v_p.id;
    return jsonb_build_object('status', 'duplicate', 'name', v_p.name, 'checked_in_at', v_att.checked_in_at, 'source', v_att.source);
  end if;
  return jsonb_build_object('status', 'ok', 'name', v_p.name, 'category', v_p.category, 'checked_in_at', v_att.checked_in_at);
end $$;

-- 5f. Bergabung sebagai operator dengan kode undangan
create or replace function public.join_event(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_event public.events;
begin
  if auth.uid() is null then return jsonb_build_object('status', 'unauthenticated'); end if;
  select * into v_event from public.events where invite_code = upper(trim(p_code)) and is_active;
  if not found then return jsonb_build_object('status', 'invalid'); end if;
  insert into public.event_members (event_id, user_id, role)
  values (v_event.id, auth.uid(), 'scanner')
  on conflict (event_id, user_id) do nothing;
  return jsonb_build_object('status', 'ok', 'event_id', v_event.id, 'name', v_event.name);
end $$;

create or replace function public.regenerate_invite_code(p_event_id uuid)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare v_code text;
begin
  if not public.is_event_member(p_event_id, array['owner','admin']) then raise exception 'forbidden'; end if;
  v_code := upper(encode(extensions.gen_random_bytes(4), 'hex'));
  update public.events set invite_code = v_code where id = p_event_id;
  return v_code;
end $$;

-- 5g. Buat ulang token QR semua peserta (jika QR bocor)
create or replace function public.regenerate_participant_tokens(p_event_id uuid)
returns int language plpgsql security definer set search_path = public, extensions as $$
declare v_n int;
begin
  if not public.is_event_member(p_event_id, array['owner','admin']) then raise exception 'forbidden'; end if;
  update public.participants set qr_token = encode(extensions.gen_random_bytes(16), 'hex') where event_id = p_event_id;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

revoke all on function public.event_code(text, text, bigint) from public, anon, authenticated;
revoke all on function public.check_in(uuid, text, uuid, text, text, timestamptz) from public, anon;
grant execute on function public.check_in(uuid, text, uuid, text, text, timestamptz) to authenticated;
grant execute on function public.get_public_event(text) to anon, authenticated;
grant execute on function public.submit_public_attendance(text, text, jsonb, text) to anon, authenticated;
grant execute on function public.get_ticket(text) to anon, authenticated;
grant execute on function public.self_check_in(text, text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 6. REALTIME
-- ---------------------------------------------------------------------
alter table public.attendances  replica identity full;
alter table public.participants replica identity full;

do $$ begin
  begin alter publication supabase_realtime add table public.attendances;  exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.participants; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.events;       exception when duplicate_object then null; end;
end $$;

-- ---------------------------------------------------------------------
-- 7. STORAGE (logo & banner)
--    Struktur path: <event_id>/logo-xxxx.png  atau  u-<user_id>/xxxx.png
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('event-assets', 'event-assets', true)
on conflict (id) do nothing;

create or replace function public.can_manage_asset_folder(p_folder text)
returns boolean language sql stable security definer set search_path = public as $$
  select p_folder = 'u-' || auth.uid()::text
      or exists (select 1 from public.event_members m
                 where m.event_id::text = p_folder and m.user_id = auth.uid()
                   and m.role in ('owner','admin'));
$$;

drop policy if exists "event-assets read"   on storage.objects;
drop policy if exists "event-assets insert" on storage.objects;
drop policy if exists "event-assets update" on storage.objects;
drop policy if exists "event-assets delete" on storage.objects;

create policy "event-assets read" on storage.objects for select
  using (bucket_id = 'event-assets');
create policy "event-assets insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'event-assets' and public.can_manage_asset_folder((storage.foldername(name))[1]));
create policy "event-assets update" on storage.objects for update to authenticated
  using (bucket_id = 'event-assets' and public.can_manage_asset_folder((storage.foldername(name))[1]));
create policy "event-assets delete" on storage.objects for delete to authenticated
  using (bucket_id = 'event-assets' and public.can_manage_asset_folder((storage.foldername(name))[1]));

-- Selesai ✔
