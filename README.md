# Waypoint

Waypoint is a shared trip calendar for coordinating an official group itinerary alongside each traveler's personal plans.

## Stack

The MVP uses React, TypeScript, Vite, Lucide icons, Supabase Auth, and Supabase Postgres. When Supabase environment variables are absent, the existing seeded demo remains available for UI review. When they are present, authentication uses Supabase Auth with persisted sessions.

## Run locally

```bash
npm install
npm run dev
```

For demo mode, use any email and password. For production mode, copy `.env.example` to `.env.local` and fill in the Supabase project URL and anon/publishable key.

Apply `supabase/migrations/20260819000000_initial_schema.sql` in the Supabase SQL editor or through the Supabase CLI. It creates profiles, trips, membership, events, participants, helper RPCs, and RLS policies. If those migrations were already applied, also apply `supabase/migrations/20260819000001_visibility_timezone_fixes.sql`, `supabase/migrations/20260819000002_event_access_fixes.sql`, `supabase/migrations/20260819000003_backfill_profiles.sql`, `supabase/migrations/20260819000004_event_insert_rls_fix.sql`, and `supabase/migrations/20260819000005_event_visibility_reads.sql`.

The latest calendar and event-visibility pass is delivered by `20260819000005_event_visibility_reads.sql`.

## Core decisions

- The official master itinerary is visually and behaviorally locked for members.
- All trip members can read full details for master and personal events. Private and invite-only events remain non-joinable except for their owner/invited travelers.
- Trip times are stored as UTC instants and converted to/from the trip timezone at the calendar boundary.
- Open events can be joined or left immediately. Invite-only and capacity fields are represented in the event model; approval workflows are intentionally out of scope.
- The app uses an overlaid week calendar rather than side-by-side columns to keep mobile behavior clear. Timed events use stable traveler colors and per-day overlap columns.

## Production data path

When Supabase is configured, the authenticated dashboard loads trips from `trip_members`, and the calendar loads members and complete event details through `get_trip_events` for the selected trip. Trip creation, invite-code joining, admin settings, event CRUD, and event participation all use the Supabase adapter and RLS policies. Only trip members can read events; open events can be joined, while invite-only participation requires an invitation.

Without Supabase environment variables, the seeded Chicago trip remains available for visual review. Demo mode is not used when the Supabase variables are present.
