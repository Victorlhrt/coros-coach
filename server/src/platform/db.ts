import postgres from 'postgres'
import { config } from '../config.js'
import { DEFAULT_VARIANTS } from './onboarding-defaults.js'

/** Base de la plateforme multi-utilisateur (Postgres Railway dédié, `PLATFORM_DATABASE_URL`). */
export const db = postgres(config.platformDatabaseUrl, { max: 10, idle_timeout: 30, onnotice: () => {} })

export type UserRole = 'runner' | 'admin'
export type UserStatus = 'waitlist' | 'active' | 'suspended'

export async function migratePlatform() {
  await db`
    create table if not exists users (
      id uuid primary key default gen_random_uuid(),
      email text not null unique,
      name text not null,
      password_hash text not null,
      role text not null default 'runner' check (role in ('runner', 'admin')),
      status text not null default 'active' check (status in ('waitlist', 'active', 'suspended')),
      product_updates boolean not null default false,
      source text not null default 'direct',
      onboarding_variant text,
      notes text,
      created_at timestamptz not null default now(),
      last_login_at timestamptz
    )`
  await db`
    create table if not exists user_sessions (
      token_hash text primary key,
      user_id uuid not null references users(id) on delete cascade,
      expires_at timestamptz not null,
      created_at timestamptz not null default now()
    )`
  await db`
    create table if not exists onboarding_variants (
      id text primary key,
      name text not null,
      description text not null default '',
      status text not null default 'draft' check (status in ('draft', 'live', 'archived')),
      weight int not null default 50 check (weight between 0 and 100),
      steps jsonb not null default '[]',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )`
  await db`
    create table if not exists onboarding_sessions (
      id uuid primary key default gen_random_uuid(),
      variant_id text not null references onboarding_variants(id) on delete cascade,
      user_id uuid references users(id) on delete set null,
      answers jsonb not null default '{}',
      step_reached int not null default 0,
      is_preview boolean not null default false,
      completed_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )`
  await db`
    create table if not exists plans (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references users(id) on delete cascade,
      onboarding_session_id uuid references onboarding_sessions(id) on delete set null,
      title text not null,
      goal_distance text not null,
      goal_date date,
      level text,
      weeks int,
      sessions_per_week int,
      status text not null default 'requested' check (status in ('requested', 'generating', 'active', 'completed', 'archived', 'failed')),
      model text,
      data jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )`
  await db`
    create table if not exists audit_log (
      id bigserial primary key,
      actor_id uuid references users(id) on delete set null,
      action text not null,
      target text,
      details jsonb not null default '{}',
      created_at timestamptz not null default now()
    )`
  await db`
    create table if not exists app_settings (
      key text primary key,
      value jsonb not null,
      updated_at timestamptz not null default now()
    )`
  await db`
    create table if not exists password_resets (
      token_hash text primary key,
      user_id uuid not null references users(id) on delete cascade,
      expires_at timestamptz not null,
      used_at timestamptz,
      created_at timestamptz not null default now()
    )`
  await db`
    create table if not exists email_log (
      id bigserial primary key,
      recipient text not null,
      template text not null,
      subject text not null,
      status text not null check (status in ('sent', 'failed', 'skipped')),
      provider_id text,
      error text,
      created_at timestamptz not null default now()
    )`
  // Accès sur invitation : codes (illimités ou à usage limité) et liste d'attente avec parrainage.
  await db`
    create table if not exists invite_codes (
      code text primary key,
      label text not null default '',
      owner_user_id uuid references users(id) on delete cascade,
      max_uses int,
      uses int not null default 0,
      active boolean not null default true,
      created_at timestamptz not null default now()
    )`
  await db`
    create table if not exists waitlist (
      id uuid primary key default gen_random_uuid(),
      email text not null unique,
      first_name text not null default '',
      ref_code text not null unique,
      referred_by text,
      referrals int not null default 0,
      invite_code text references invite_codes(code) on delete set null,
      invited_at timestamptz,
      created_at timestamptz not null default now()
    )`
  await db`alter table onboarding_sessions add column if not exists invite_code text`
  // État du coach (plan, séances, ressentis, réglages) de chaque coureur, un document JSON versionné.
  await db`
    create table if not exists coach_state (
      user_id uuid primary key references users(id) on delete cascade,
      version int not null default 0,
      data jsonb,
      updated_at timestamptz not null default now()
    )`
  // Connexions aux montres (OAuth côté serveur), rattachées au parcours puis au compte.
  await db`
    create table if not exists wearable_connections (
      id uuid primary key default gen_random_uuid(),
      provider text not null,
      onboarding_session_id uuid references onboarding_sessions(id) on delete set null,
      user_id uuid references users(id) on delete cascade,
      tokens jsonb not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )`
  await db`create unique index if not exists wearable_connections_session_idx on wearable_connections (provider, onboarding_session_id)`
  await db`
    create table if not exists oauth_pending (
      state text primary key,
      provider text not null,
      onboarding_session_id uuid not null,
      verifier text,
      created_at timestamptz not null default now()
    )`
  await db`delete from oauth_pending where created_at < now() - interval '1 hour'`
  // Leads : nom et e-mail saisis à la première étape de l'onboarding, avant toute inscription (base des relances).
  await db`
    create table if not exists leads (
      id uuid primary key default gen_random_uuid(),
      email text not null unique,
      first_name text not null default '',
      last_name text not null default '',
      city text,
      source text not null default 'onboarding',
      invite_code text,
      onboarding_session_id uuid references onboarding_sessions(id) on delete set null,
      step_reached int not null default 0,
      last_step text,
      completed_at timestamptz,
      user_id uuid references users(id) on delete set null,
      photo_url text,
      web_profile jsonb,
      web_profile_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )`
  await db`create index if not exists leads_created_idx on leads (created_at desc)`
  await db`create index if not exists leads_session_idx on leads (onboarding_session_id)`
  // Classements : totaux de course par jour (poussés par l'app depuis COROS) et amitiés entre coureurs.
  await db`
    create table if not exists run_days (
      user_id uuid not null references users(id) on delete cascade,
      day date not null,
      meters int not null default 0,
      seconds int not null default 0,
      runs int not null default 0,
      updated_at timestamptz not null default now(),
      primary key (user_id, day)
    )`
  await db`create index if not exists run_days_day_idx on run_days (day)`
  await db`
    create table if not exists friendships (
      requester_id uuid not null references users(id) on delete cascade,
      addressee_id uuid not null references users(id) on delete cascade,
      status text not null default 'pending' check (status in ('pending', 'accepted')),
      created_at timestamptz not null default now(),
      accepted_at timestamptz,
      primary key (requester_id, addressee_id),
      check (requester_id <> addressee_id)
    )`
  await db`create unique index if not exists friendships_pair_idx on friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id))`
  await db`create index if not exists friendships_addressee_idx on friendships (addressee_id, status)`
  await db`insert into invite_codes (code, label, max_uses) values ('victor43', 'Code de Victor (illimité)', null) on conflict (code) do nothing`
  await db`create index if not exists users_created_idx on users (created_at)`
  await db`create index if not exists onboarding_sessions_variant_idx on onboarding_sessions (variant_id, created_at)`
  await db`create index if not exists plans_user_idx on plans (user_id, created_at)`
  await db`create index if not exists audit_created_idx on audit_log (created_at desc)`

  // Parcours de départ, créés une seule fois : on peut ensuite les modifier ou les archiver depuis le back office.
  for (const v of DEFAULT_VARIANTS) {
    await db`
      insert into onboarding_variants (id, name, description, status, weight, steps)
      values (${v.id}, ${v.name}, ${v.description}, ${v.status}, ${v.weight}, ${db.json(v.steps)})
      on conflict (id) do nothing`
  }
  await db`insert into app_settings (key, value) values ('signup_mode', ${db.json('open')}) on conflict (key) do nothing`
  await db`delete from user_sessions where expires_at < now()`
  await db`delete from password_resets where expires_at < now() - interval '1 day'`
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const [row] = await db<{ value: T }[]>`select value from app_settings where key = ${key}`
  return row ? row.value : fallback
}

export async function audit(actorId: string | null, action: string, target: string | null, details: Record<string, unknown> = {}) {
  await db`insert into audit_log (actor_id, action, target, details) values (${actorId}, ${action}, ${target}, ${db.json(details as never)})`
}
