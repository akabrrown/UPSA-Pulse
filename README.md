# UPSA Pulse

Location-gated, pseudonymous campus feed for verified UPSA students across Main Campus, Hostels, Private Hostels, and Vacation Lounge.

---

## Architecture & Security Highlights

- **Two-Schema Isolation (`private` vs `feed`):** All tables reside in `private` with Row Level Security enabled and all privileges revoked from `public`, `anon`, and `authenticated`. Clients only invoke `SECURITY DEFINER` RPC functions in `feed` (`supabase/migrations/001`–`026`).
- **Zero Identity or Coordinate Leakage:** `author_id`, `user_id`, `email`, and `device_hash` are never returned in any `feed.*` function or API payload. GPS coordinates are tested against the campus polygon (`ST_Covers`) with a `<= 150 m` accuracy threshold and immediately discarded; only `zone_id` and a 15-minute `zone_verified_until` timestamp are stored.
- **Per-Thread Aliases & Geometric Glyphs:** Row-locked per-thread aliases (`OP` = `0`, `Student 1..n`) paired with deterministic thread-local geometric glyphs (`diamond`, `triangle`, `square`, `hexagon`, `circle`, `octagon`) prevent cross-thread user correlation.
- **Hybrid Safety & Moderation:** Pre-screen regex/keyword holds (`phone_number_doxxing`, `exam_leak`, `self_harm`), self-harm support card pointing to the UPSA Guidance and Counselling Unit, auto-hide at `-5` net score or `2` priority / `5` standard distinct reports, conflict-of-interest guard preventing moderators from moderating threads they participated in, and append-only `moderation_actions` & `audit_logs`.

---

## Commands

```bash
npm run dev        # Start local Next.js 15 development server
npm test           # Run Vitest unit, SQL schema invariant, and HTTP integration suites
npm run typecheck  # Run strict TypeScript check (tsc --noEmit)
npm run lint       # Run ESLint with zero warnings tolerance
npm run build      # Build production Next.js bundle
npm run test:e2e   # Run Playwright mobile E2E tests
```

