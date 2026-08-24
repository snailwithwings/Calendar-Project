# Project status

## Completed

- Demo sign-in and persisted local session
- Seeded Chicago Friends Trip with five travelers
- Date-driven responsive week and month calendars with master, personal, and traveler calendar toggles
- Master itinerary events with admin-only/locked member presentation
- Personal event creation with open, invite-only, and private visibility
- Event detail view with attendees, join/leave behavior, capacity messaging, and owner actions
- Trip settings surface, member list, invite link presentation, and dashboard
- Loading and error states with preserved Supabase messages and toast feedback
- Supabase client with persisted Auth sessions and email/password sign-up/sign-in
- `.env.example` and `.gitignore` for safe local configuration
- Relational Postgres migration for profiles, trips, members, events, participants, and invite codes
- RLS policies for trip membership, admin master events, owner personal events, and participation
- Secure `get_trip_events` projection that exposes complete event details to trip members without weakening cross-trip isolation
- Supabase-backed dashboard trip creation, invite-code joining, and empty/loading/error states
- Supabase-backed member/event loading with dynamic calendar toggles
- Admin master-event CRUD and owner personal-event CRUD with verified affected-row checks
- Open-event join/leave persistence, invite acceptance, and attendee rendering
- Invite-only member selection with owner-managed participant persistence
- Trip-timezone conversion at the UTC storage boundary
- Non-blocking overlap warnings for master, owned, and joined events
- Session restoration through Supabase `getSession` and auth-state changes without treating an absent session as an error
- Authenticated profile menu with display name, email, role, and logout
- Real membership-derived traveler sidebar including the authenticated traveler
- UTC event persistence converted through the trip timezone for date-driven navigation
- Stable traveler colors, aligned full-day Week layout, client/database time validation, and per-day overlap columns

## Remaining

- Automated two-account workflow tests
- Optional realtime subscriptions for cross-tab updates without refresh

## Decisions

- React + TypeScript + Vite for a small, fast MVP.
- Trip members may read full personal-event details; privacy controls joining and editing rather than redacting reads.
- Trip-local display timezone is the source of truth; production storage should use UTC plus timezone.
- Week view with overlaid calendars is preferred over a more complex side-by-side layout.
- Supabase is optional at development time so the approved visual demo remains usable without credentials.

## Known issues

- Invite-only invitations are created/updated by the event owner; invited members can accept by changing their participant status to joined.
- Existing Auth users created before the profile trigger was installed require the profile backfill migration.
- Cross-midnight events are rendered as safe day segments in the week view; editing still uses the existing single-date event form.

## Next recommended task

Validate the full auth/RLS workflow with multiple test accounts. Apply `supabase/migrations/20260819000005_event_visibility_reads.sql` after the prior migrations.
