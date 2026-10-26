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
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const [row] = await db<{ value: T }[]>`select value from app_settings where key = ${key}`
  return row ? row.value : fallback
}

export async function audit(actorId: string | null, action: string, target: string | null, details: Record<string, unknown> = {}) {
  await db`insert into audit_log (actor_id, action, target, details) values (${actorId}, ${action}, ${target}, ${db.json(details as never)})`
}
