# AGENT_CONTEXT — PartyTime v4

Full project state for any AI assistant joining this codebase. Read this before doing anything.

---

## What PartyTime Is

A collaborative jukebox app. One person hosts (Spotify Premium), everyone else joins via a 6-character lobby code to search, queue, and vote on songs. Music plays on the host's device through Spotify's native SDK.

**Two layers:**
- **B2C (consumer):** Free, ephemeral lobbies that die after 24 hours
- **B2B (venue):** Permanent lobbies tied to a URL slug (`partytime.app/mollys-pub`) with analytics dashboard. TouchTunes killer — no coins, no per-play fees.

---

## Who You're Working For

Jay DeShong, founder. Non-technical — directs product and design, AI builds. Talk in product language, not code. No function names or line numbers in messages to him.

---

## CRITICAL RULES FOR AI SESSIONS

**1. Always start on `main`.** First action of every new session:
```
git fetch origin
git checkout main
git pull
```
Do NOT create a new branch unless Jay explicitly asks for one. Work directly on main by default. The repo has suffered from branch sprawl — every past AI session spun up its own branch and never merged, leading to diverged work and lost features. Prevent this.

**2. If you must branch, merge back immediately.** Don't leave a feature branch sitting unmerged. If the work takes multiple sessions, rebase on main between each session so you don't drift.

**3. Check `git log main..origin/main --oneline` before starting any task.** Make sure you're not about to build on top of a stale baseline.

---

## Tech Stack

| Layer | Tech | Folder |
|-------|------|--------|
| Mobile app | React Native / Expo SDK 54 (dev builds only) | `mobile/` |
| Server | Express + Socket.IO on Node | `server/` |
| Database | Supabase Postgres | hosted |
| Playback | Custom Expo native module wrapping Spotify iOS + Android SDKs | `mobile/modules/spotify-app-remote/` |
| Web client | React + Vite + Tailwind | `client/` |
| Hosting | Render (API), Vercel (web) | |

**Key IDs:**
- Spotify Client ID: `18f1b52ab93b4c6480b1599b64d9be5b`
- Bundle ID: `com.jasondeshong.partytime`

---

## What Works (as of 2026-04-15)

**B2C (shippable):**
- Spotify OAuth (iOS, Android, Web)
- Lobby create/join/leave with cold-start rejoin
- Real-time queue via Socket.IO (add, vote, skip, auto-advance)
- Native Spotify playback on host's device
- Song search, liked songs, playlists, playlist tracks
- Save-to-library from queue
- 80% downvote auto-remove
- 30-min cooldown on recently played songs
- Guest mode (no Spotify required)
- Guest Spotify connect (library access without playback control)
- Settings screen

**B2B (backend + frontend live, needs real-world testing):**
- Venue CRUD (`POST/GET/PUT/DELETE /api/venues`)
- Permanent venue lobbies (excluded from 24h cleanup)
- Venue join page at `partytime.app/:slug` — auto-resolves venue, drops visitors into lobby
- Analytics dashboard at `partytime.app/:slug/analytics` — 6 metrics (overview, peak hours, participation, top songs, genre breakdown, recent plays)
- Analytics event tracking (user_joined, user_left, song_added, song_played, vote_cast, song_skipped) — wired into all Socket.IO events

**Security & reliability:**
- Host-only skip/remove enforcement (host tracked by userName, persists across disconnects)
- Rate limiting: 30/min search, 10/min auth, 60/min global per IP
- RLS lockdown: server uses `SUPABASE_SERVICE_ROLE_KEY`, anon is read-only on lobbies/queue, denied on venues/analytics
- Mobile Socket.IO auto-reconnection with exponential backoff, auto-rejoin lobby, "Reconnecting..." banner

---

## What's Not Built Yet

- Email verification for venue ownership (anyone can create a venue right now)
- Venue owner auth (dashboard is publicly accessible by slug)
- Mobile deep link support for venue URLs (partytime://mollys-pub)
- App icon PNG from the Sirius logo
- Push notifications
- PWA install prompts
- Billing for venues (Stripe or similar)

---

## Current Blockers / Needs Attention

1. **`SUPABASE_SERVICE_ROLE_KEY` must be set on Render** — RLS is locked down, so without this key the server can't write. Check Render env vars before debugging any "can't save" errors.
2. **RLS policies have been swapped** — the wide-open policies were dropped and replaced with read-only anon policies. If any client was hitting Supabase directly, it will fail now (it shouldn't — everything goes through the server).
3. **Analytics events use Spotify track genres, which Spotify doesn't expose by default.** The genre chart will always show "unknown" until we either hit the Spotify artists API per track or switch to audio-feature-based classification. Low priority.
4. **No test coverage anywhere.** Tests aren't blocking shipping but should be added before scaling.

---

## Brand & Design

Egyptian-inspired, not Egyptian-themed. Symbols are hidden geometry, not decoration.

- **Palette:** Obsidian `#080808` (bg), Amber `#D4884A` (accent), Papyrus `#F0ECE4` (text). Dark mode only.
- **Fonts:** Instrument Serif (display), Space Mono (labels), system font (UI)
- **GlassCard** is the universal container. BlurView was permanently removed (rendered on top of content). Never re-add it.
- **Logo:** Sirius — two overlapping diamonds forming an 8-pointed star with play triangle at center
- **Full brand guide:** `brand/partytime-brand-guide.html`

---

## Conventions

- **No navigation library** — App.js / App.jsx conditionally renders screens
- **No global state library** — local hooks + Socket.IO events + AsyncStorage/sessionStorage
- **Two terminals for dev:** server (`node src/index.js` from `server/`), Metro (`npx expo start` from `mobile/`)
- **Dev builds only** — Expo Go won't work due to custom native module
- **ES Modules** everywhere — `"type": "module"` in both package.jsons
- **Socket events:** kebab-case (`join-lobby`, `queue-updated`, `now-playing`, `permission-error`)
- **API routes:** `/api/` prefix. Spotify proxy `/api/spotify/*`, auth `/api/auth/*`, venues `/api/venues/*`, analytics `/api/venues/:id/analytics/*`

---

## Critical Memories

- **BlurView is permanently removed.** expo-blur's native layer renders on top of React Native children regardless of zIndex. GlassCard uses computed rgba overlays instead.
- **Spotify SDKs are NOT on package managers.** The config plugin downloads them from GitHub. If EAS builds fail with "pod not found," check the plugin download step.
- **`isGuest` was split into `isHost` + `hasToken`.** `isHost` = playback control. `hasToken` = library access. A guest can connect Spotify for library access without becoming host.
- **Host is tracked by userName, not socket.id.** First to join claims host. Reconnecting with the same name reclaims host. Host is NOT auto-transferred when the host disconnects — the role holds for them.
- **`server/src/index.js` is a ~1070-line monolith.** Surgical edits only. Never rewrite the whole file.

---

## Suggested Next Steps (Ranked)

1. **Test the full B2B flow end-to-end.** Create a real venue, visit `partytime.app/:slug` on a phone, queue songs, watch analytics populate.
2. **Add venue owner auth** — right now anyone can create a venue, and anyone who knows the slug can see the dashboard. Likely needs email magic link via Supabase Auth.
3. **Mobile deep linking** — `partytime://mollys-pub` opens the app and joins the venue lobby directly.
4. **Billing** — Stripe subscription for venues ($X/mo). Non-paying venues could fall back to ephemeral.
5. **Push notifications** — venue owner gets notified when their lobby is active / specific events happen.
6. **Test coverage** — at minimum, integration tests for venue CRUD and analytics event recording.
