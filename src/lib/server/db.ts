import 'server-only';
import { createClient } from '@supabase/supabase-js';
export function databaseConfigured() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}
export function db() {
  if (!databaseConfigured()) throw new Error('DATABASE_NOT_CONFIGURED');
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10000) }),
    },
  });
}
