import 'server-only';
import { createClient } from '@supabase/supabase-js';
export function databaseProvider() {
  const provider =
    process.env.DATABASE_PROVIDER || (process.env.SEATABLE_API_TOKEN ? 'seatable' : 'supabase');
  if (!['seatable', 'supabase'].includes(provider)) throw new Error('INVALID_DATABASE_PROVIDER');
  return provider;
}
export function databaseConfigured() {
  if (databaseProvider() === 'seatable') return Boolean(process.env.SEATABLE_API_TOKEN);
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}
export function db() {
  if (databaseProvider() !== 'supabase' || !databaseConfigured())
    throw new Error('DATABASE_NOT_CONFIGURED');
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10000) }),
    },
  });
}
