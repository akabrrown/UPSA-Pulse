import { z } from 'zod';

const DEFAULT_VAPID_PUBLIC_KEY =
  'BHRqzwDaaMY5Y6R-WORpk6rLRYqQDUgbkoOhFuMWA5qqQdk6mB0CM_t3wCcKbBErTpkTabvJP4PmslDVXrECyWs';
const DEFAULT_VAPID_PRIVATE_KEY =
  'vzN2i086pGCkQzX1KHOIX7YeAgDd6_HyoMAnxdmcQ4k';

const clientEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().default('https://example.supabase.co'),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).default('local-anon-key'),
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().min(1).default(DEFAULT_VAPID_PUBLIC_KEY),
});

const serverEnvSchema = clientEnvSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).default('local-service-role-key'),
  DEVICE_HASH_PEPPER: z.string().min(16).default('upsa-pulse-default-local-dev-pepper-2026'),
  UPSTASH_REDIS_REST_URL: z.string().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
  ARCJET_KEY: z.string().optional(),
  VAPID_PUBLIC_KEY: z.string().default(DEFAULT_VAPID_PUBLIC_KEY),
  VAPID_PRIVATE_KEY: z.string().default(DEFAULT_VAPID_PRIVATE_KEY),
  VAPID_SUBJECT: z.string().default('mailto:akayeteb@gmail.com'),
  SENTRY_DSN: z.string().optional(),
  UPSA_INDEX_VERIFICATION_API_KEY: z.string().optional(),
  UPSA_INDEX_VERIFICATION_API_URL: z.string().optional(),
  UPSA_INDEX_VERIFICATION_PROXY_URL: z.string().optional(),
  ENABLE_UNMASK_WORKFLOW: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});

export function getClientEnv() {
  return clientEnvSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
  });
}

export function getServerEnv() {
  return serverEnvSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    DEVICE_HASH_PEPPER: process.env.DEVICE_HASH_PEPPER,
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
    ARCJET_KEY: process.env.ARCJET_KEY,
    VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY,
    VAPID_SUBJECT: process.env.VAPID_SUBJECT,
    SENTRY_DSN: process.env.SENTRY_DSN,
    UPSA_INDEX_VERIFICATION_API_KEY: process.env.UPSA_INDEX_VERIFICATION_API_KEY,
    UPSA_INDEX_VERIFICATION_API_URL: process.env.UPSA_INDEX_VERIFICATION_API_URL,
    UPSA_INDEX_VERIFICATION_PROXY_URL: process.env.UPSA_INDEX_VERIFICATION_PROXY_URL,
    ENABLE_UNMASK_WORKFLOW: process.env.ENABLE_UNMASK_WORKFLOW,
  });
}

