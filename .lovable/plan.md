# Matu — Build Plan

Matatu/bus hailing app for Kenya. Uber-like, but routes and fares are driver-defined and adaptive. Three roles: **passenger**, **driver/conductor**, **SACCO admin**.

I'll ship in 4 phases so each one is testable. After each phase you preview, give feedback, and we move on.

---

## Phase 1 — Foundation (this phase)

**Goal:** a beautiful, branded app you can sign into as any of the three roles, with the database ready for everything else.

- Enable **Lovable Cloud** (auth + database + realtime)
- Brand & design system in `src/styles.css`
  - Matu identity: warm Kenyan-inspired palette (deep green, matatu yellow accent, charcoal), Outfit + Inter fonts, rounded cards, mobile-first
  - Custom button/card variants — no hardcoded colors in components
- Auth screens: email/password + Google sign-in, with a **role picker** on signup (Passenger / Driver / SACCO Admin)
- Database schema (with RLS):
  - `profiles` (name, phone, avatar)
  - `user_roles` (separate table, enum role) — secure pattern, no privilege escalation
  - `saccos` (name, registration #, owner)
  - `vehicles` (sacco_id, plate, capacity, type)
  - `routes` (name, origin, destination, sacco_id nullable) — seeded with Nairobi favourites: CBD–Rongai, CBD–Kasarani, CBD–Eastleigh, CBD–Ngong, CBD–Westlands, CBD–Kikuyu
  - `stages` (route_id, name, lat, lng, order_index) — drivers can append custom stages
  - `trips` (vehicle_id, driver_id, route_id, status, fare, current_lat, current_lng, current_stage_id)
  - `bookings` (trip_id, passenger_id, seat_number, pickup_stage, dropoff_stage, status)
  - `alerts` (trip_id, passenger_id, type: 'near_pickup' | 'near_dropoff', sent_at)
- Landing page introducing Matu + sign-in CTA
- Role-aware redirect after login (passenger → `/ride`, driver → `/drive`, sacco → `/fleet`) — pages exist but are skeleton placeholders for Phase 2+

## Phase 2 — Passenger dashboard

- Google Maps integration (uses the Lovable-managed Google Maps connector — no API key from you needed on `*.lovable.app`)
- Browse seeded routes, view live matatus on map (realtime subscription to `trips.current_lat/lng`)
- Pick a trip → see fare, vehicle, stages → **book a seat** (live seat map based on capacity − active bookings)
- Set pickup + dropoff stages; receive **"bus near you"** alert when driver's GPS is within ~300m of pickup, and **"approaching your stop"** alert near dropoff
- "I want to alight" button → notifies driver/conductor

## Phase 3 — Driver/Conductor dashboard

- Start trip: pick vehicle (assigned by their SACCO, or self-registered if independent), pick route
- **Adaptive fare**: driver proposes, conductor confirms (single-driver mode: just set it)
- Live GPS broadcast (browser Geolocation → realtime updates to `trips`)
- Tap "arrived at stage" to update `current_stage_id` (works even with weak GPS)
- **Add custom stage on the fly** (long-press map or "Add stage here" button) — persists to that route
- See live booking list + alight requests + seat occupancy
- Proximity alerts auto-fire to passengers (edge logic in a server function triggered by GPS updates)

## Phase 4 — SACCO dashboard

- Register SACCO, invite drivers (by phone/email)
- Add/edit vehicles, assign drivers to vehicles
- Define SACCO-owned routes (in addition to seeded ones)
- Fleet view: live map of all SACCO vehicles, today's trip count, revenue summary
- Driver list with status (online/offline/on-trip)

## Deferred (per your message)

- **M-Pesa Daraja escrow** — wired in later once SACCOs are using the system. Schema will reserve `payments` and `escrow_transactions` tables in Phase 1 so we don't need a migration later.
- Ratings/reviews, in-app chat, push notifications (browser notifications only in v1)

---

## Technical notes

- **Stack:** TanStack Start + Lovable Cloud (Supabase under the hood) + Google Maps connector + Tailwind v4 design tokens
- **Realtime:** Supabase realtime channels on `trips` (location) and `bookings` (seat availability)
- **Security:** `user_roles` in a separate table with a `has_role()` security-definer function — never check role from client storage. RLS on every table.
- **Routes layout:**
  ```text
  /                  → landing
  /auth              → sign in/up + role pick
  /_authenticated/
    ride/*           → passenger
    drive/*          → driver
    fleet/*          → sacco
  ```

## What I need from you to start Phase 1

1. **Go-ahead on the plan** (or tell me what to change).
2. Approve enabling **Lovable Cloud** — needed for auth, database, realtime.

Once you approve, I'll build Phase 1 end-to-end and you'll be able to sign up as each role and see the empty dashboards. Then we move to Phase 2.