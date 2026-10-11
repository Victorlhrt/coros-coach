import postgres from 'postgres'
import { config } from './config.js'

export const sql = postgres(config.databaseUrl, { max: 5, idle_timeout: 30, onnotice: () => {} })

/** Schéma créé au démarrage (application mono-utilisateur, quelques tables). */
export async function migrate() {
  await sql`
    create table if not exists credentials (
      id text primary key,
      public_key bytea not null,
      counter bigint not null default 0,
      transports text[] not null default '{}',
      name text,
      created_at timestamptz not null default now(),
      last_used_at timestamptz
    )`
  await sql`
    create table if not exists sessions (
      token_hash text primary key,
      expires_at timestamptz not null,
      created_at timestamptz not null default now()
    )`
  await sql`
    create table if not exists challenges (
      id text primary key,
      challenge text not null,
      expires_at timestamptz not null
    )`
  await sql`
    create table if not exists app_state (
      id int primary key,
      version int not null,
      data jsonb not null,
      updated_at timestamptz not null default now()
    )`
  await sql`delete from sessions where expires_at < now()`
  await sql`delete from challenges where expires_at < now()`
}
