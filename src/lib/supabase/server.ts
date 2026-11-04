import { createClient } from '@supabase/supabase-js';
import { getServerEnv } from '@/lib/env';

/**
 * Server-only Supabase service-role client.
 * Never import this file in client components.
 */
export function createSupabaseServiceClient() {
  const env = getServerEnv();
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

