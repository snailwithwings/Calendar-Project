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

Apply migrations `20260819000000_initial_schema.sql` through `20260819000011_account_deletion_event_ownership.sql` in order (or run `supabase db push`). The membership migration adds secure `leave_trip` and `promote_trip_admin` RPCs alongside the existing admin-only `delete_trip` behavior. The trip-images migration adds the nullable `trips.banner_image_path` reference, creates the private `trip-images` Storage bucket, and restricts object access to trip members/admins through the existing security-definer membership helpers. The banner-crop migration adds normalized horizontal and vertical focal positions, defaulting to 50/50. The account-deletion migration makes Master-event ownership nullable and uses `ON DELETE SET NULL` so a deleted creator cannot block Auth deletion.

Trip admins can upload, replace, remove, and adjust the crop of JPG, PNG, and WebP trip banners up to 5 MB from Trip settings. The browser stores only the Storage path and crop metadata in Postgres and requests a signed URL for display, so the bucket remains private. Ensure Storage is enabled in the Supabase project and apply the migrations before using banner uploads.

**ACTION REQUIRED:** The local Edge Function is not deployed automatically. Install and authenticate the Supabase CLI, link the project, then deploy the exact function name `delete-account`:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase functions deploy delete-account --no-verify-jwt
```

`--no-verify-jwt` is intentional: this function verifies the caller JWT itself after handling CORS preflight, so authentication errors receive the function's CORS headers.

Supabase-hosted functions normally provide `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` automatically. If the deployed function reports that one is missing, configure only that missing value under **Supabase Dashboard → Edge Functions → Secrets** (the service-role key comes from **Project Settings → API**) and redeploy. Never expose the service-role key in frontend variables or commit it. The function verifies the caller JWT, blocks deletion when they are the sole admin of a trip, reassigns master events to another admin, and removes the caller's personal data before deleting the Auth user.

## Core decisions

- The official master itinerary is visually and behaviorally locked for members.
- All trip members can read full details for master and personal events. Private and invite-only events remain non-joinable except for their owner/invited travelers.
- Trip times are stored as UTC instants and converted to/from the trip timezone at the calendar boundary.
- Trip timezone selectors use labeled IANA choices and persist the raw IANA identifier.
- Members can leave a trip after confirmation; their personal events, participation, and membership are removed while the trip and other travelers remain. A sole admin must promote another admin first.
- Admins can promote same-trip members from Trip settings. Promotion and leaving are enforced by database RPCs, not just the UI.
- Open events can be joined or left immediately. Invite-only and capacity fields are represented in the event model; approval workflows are intentionally out of scope.
- The app uses an overlaid week calendar rather than side-by-side columns to keep mobile behavior clear. Timed events use stable traveler colors and per-day overlap columns.

## Production data path

When Supabase is configured, the authenticated dashboard loads trips from `trip_members`, and the calendar loads members and complete event details through `get_trip_events` for the selected trip. Trip creation, invite-code joining, admin settings, membership management, event CRUD, and event participation all use the Supabase adapter and RLS policies. Share copies only the existing invite code to the clipboard, with a manual-code fallback. Only trip members can read events; open events can be joined, while invite-only participation requires an invitation.

Without Supabase environment variables, the seeded Chicago trip remains available for visual review. Demo mode is not used when the Supabase variables are present.
## Password recovery and trip timezone

Waypoint uses Supabase Auth's `resetPasswordForEmail` flow. The recovery redirect is the current application origin (`window.location.origin`), so add these URLs in **Supabase Dashboard → Authentication → URL Configuration → Redirect URLs**:

- Local development: `http://localhost:5173`
- Production: the deployed Waypoint origin, such as `https://your-production-domain.example`

Set the deployed origin as **Site URL** as well when production is available. The production URL must be added when it is known. No custom reset tokens or application password storage are used. Calendar times, the trip clock, current-time marker, and past-state calculations use each trip's stored IANA timezone.
