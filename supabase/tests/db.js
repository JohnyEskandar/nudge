// A throwaway Postgres (PGlite, real Postgres compiled to WebAssembly) with just enough of
// Supabase stubbed in to run this repo's migrations: the auth schema, auth.uid() read
// from the same JWT claim setting PostgREST uses, and the anon / authenticated roles.
//
// It never touches the real project. The cron migration is skipped because pg_cron,
// pg_net and Vault do not exist here; nothing else depends on it.

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'

const MIGRATIONS = join(import.meta.dirname, '..', 'migrations')
const SKIP = new Set(['20260712004134_cron.sql'])

const STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema public, auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`

export async function freshDb() {
  const db = new PGlite()
  await db.exec(STUB)
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
    if (SKIP.has(file)) continue
    // gen_random_uuid() is built in from Postgres 13; PGlite ships without pgcrypto.
    const sql = readFileSync(join(MIGRATIONS, file), 'utf8').replace(
      /create extension if not exists "pgcrypto";/,
      '',
    )
    try {
      await db.exec(sql)
    } catch (err) {
      throw new Error(`${file}: ${err.message}`)
    }
  }
  return db
}

/** Run `fn` as a signed-in user, the way PostgREST would. */
export async function asUser(db, userId, fn) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${userId}', false);`)
  try {
    return await fn()
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`)
  }
}
