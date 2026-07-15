# Matu

Matu is a matatu (Kenyan public transport) booking and tracking app. Passengers book
seats and track their vehicle live; drivers run trips and manage bookings; sacco
admins manage their fleet, drivers, and commission.

Built with TanStack Start (React 19 + Vite), Supabase (Postgres + Auth + Edge
Functions), Mapbox/Leaflet for maps, and M-Pesa (Safaricom Daraja) for payments.

---

## 1. How the app is organized

```
src/
  routes/
    auth.tsx                        sign in / sign up
    index.tsx                       landing page
    _authenticated/
      route.tsx                     auth guard — redirects signed-out users to /auth
      ride.index.tsx                passenger: browse routes, book a seat
      ride.$routeId.tsx             passenger: pick stage, pay, confirm booking
      ride.track.tsx                passenger: list of live trips to track
      ride.track.$bookingId.tsx     passenger: live map of their booked vehicle
      ride.history.tsx              passenger: past bookings
      drive.index.tsx               driver: start/manage a trip
      drive.trip.tsx                driver: active trip screen (location, bookings)
      fleet.index.tsx               sacco admin: list of saccos/fleets
      fleet.$saccoId.tsx            sacco admin: vehicles, drivers, join requests, stages
      wallet.tsx                    wallet balance, top-up, withdrawal (passenger/driver/sacco)
      complaints.tsx                submit a complaint (app issue or trip issue)
      platform-admin.tsx            platform_admin only: cross-sacco vehicle suspension,
                                     complaint resolution queue
      account.tsx                   profile + role management, alert sound picker
  components/matu/                  app-specific UI (maps, AI assistant, etc.)
  integrations/supabase/            Supabase client + generated types
  lib/                              ETA/traffic helpers, utilities

supabase/
  migrations/                       every schema change, in order, timestamped
  functions/                        Edge Functions (Deno) — see section 4
  config.toml                       local Supabase CLI config
```

Roles (`public.app_role`): `passenger`, `driver`, `conductor`, `sacco_admin`,
`platform_admin`. A user's role(s) live in `user_roles`, checked via the `has_role()`
Postgres function used throughout RLS policies. `platform_admin` is **not**
self-service — nobody can claim it through the app; it's granted manually with a
one-off SQL insert (see section 5) and is intentionally excluded from the app's
`AppRole` picker/type in `src/lib/matu-auth.ts`.

---

## 2. Running it locally

### Prerequisites

- Node 20+
- A Supabase project (or the Supabase CLI for local development)
- A Mapbox token (for `RouteMap`) — Leaflet is used as a fallback/alternative in some views
- Safaricom Daraja sandbox credentials (see section 4) if you want to test payments

### Setup

```bash
npm install
```

Create a `.env` file in the project root (never commit this — it's already in
`.gitignore`):

```
VITE_SUPABASE_URL=https://<your-project>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<your publishable/anon key>
VITE_MAPBOX_TOKEN=<your mapbox token>
```

Run the dev server:

```bash
npm run dev
```

Other scripts:

```bash
npm run build       # production build
npm run preview     # preview the production build
npm run lint        # eslint
npm run format      # prettier
```

### Database

Every schema change should be a file in `supabase/migrations/`, applied in filename
(timestamp) order. If you're using the Supabase CLI locally:

```bash
supabase db reset            # rebuilds local DB from all migrations, in order
supabase db push              # pushes local migrations to your linked project
```

**Important habit going forward:** if you ever add or change a table via the Supabase
Studio SQL editor directly, immediately copy that SQL into a new file under
`supabase/migrations/` with the same timestamp-prefix naming convention as the others
(`YYYYMMDDHHMMSS_description.sql`). If it isn't in a migration file, it doesn't really
exist as far as the codebase is concerned — nobody else (including a fresh Supabase
project, or you in six months) can reproduce it.

### Edge Functions

Deploy with the Supabase CLI:

```bash
supabase functions deploy mpesa-stk-push
supabase functions deploy mpesa-callback
supabase functions deploy mpesa-b2c-payout
supabase functions deploy mpesa-b2c-result
supabase functions deploy voice-agent
supabase functions deploy voice-webhook
supabase functions deploy send-complaint-email
```

Set their secrets (Project Settings → Edge Functions → Secrets, or via CLI):

```bash
supabase secrets set MPESA_CONSUMER_KEY=xxx MPESA_CONSUMER_SECRET=xxx MPESA_CALLBACK_SECRET=xxx
supabase secrets set RESEND_API_KEY=xxx
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are auto-injected
into every Edge Function by Supabase — you don't set those yourself.
See section 4 for the full list of required secrets.

---

## 3. Payments: how money moves

There are two separate M-Pesa flows in this app, and it's important to keep them
mentally separate because they use different Daraja APIs, different credentials, and
different go-live processes:

| Flow             | Direction          | API                              | Function(s)                            |
| ---------------- | ------------------ | -------------------------------- | -------------------------------------- |
| Collecting money | passenger → app    | STK Push (Lipa na M-Pesa Online) | `mpesa-stk-push`, `mpesa-callback`     |
| Paying money out | app → driver/sacco | B2C (Business to Customer)       | `mpesa-b2c-payout`, `mpesa-b2c-result` |

**M-Pesa has no concept of "send this specific payment straight to driver X's phone."**
STK Push always deposits into _your_ registered Paybill/Till. There is no way around
this — it's a constraint of the M-Pesa platform, not something Matu's code chooses.
So the flow is:

1. Passenger pays a fare (or tops up their wallet) via STK Push → money lands in
   Matu's own Paybill.
2. Matu credits internal ledger balances (wallets) for the driver and the sacco.
3. When a driver or sacco wants their money as real cash, they request a **withdrawal**,
   which triggers a B2C payment from Matu's Paybill to their personal M-Pesa number.

### 3.1 Wallets

Three wallet types, one shared table design (`public.wallets` + `public.wallet_transactions`):

- **Passenger wallet** — prepaid balance. Top up via STK Push (`purpose: "wallet_topup"`).
  Paying a fare from the wallet (instead of a fresh STK prompt every trip) debits this
  balance via `pay_fare_from_wallet()`.
- **Driver wallet** — credited automatically whenever a fare for a trip they drove is
  paid (their cut, after the sacco's commission). Withdrawn via `mpesa-b2c-payout`.
- **Sacco wallet** — credited with the sacco's commission cut on every fare paid on
  one of their vehicles. Withdrawn via `mpesa-b2c-payout`.

The commission split is configurable per sacco in `sacco_commission_rates`
(`commission_percent`, defaults to 10% sacco / 90% driver if a sacco hasn't set one).

`wallet_transactions` is an **append-only ledger** — every credit/debit is a row, and
`wallets.balance` is only ever changed by the `apply_wallet_transaction()` /
`increment_wallet_balance()` Postgres functions, never updated directly. This means
the current balance can always be explained by replaying the ledger, and any dispute
("why is my balance X?") has an audit trail.

**Paying a fare from wallet, step by step:**

1. Frontend calls `supabase.rpc('pay_fare_from_wallet', { _booking_id, _passenger_id })`.
2. That function reads the booking's fare and the trip's driver/sacco, looks up the
   sacco's commission rate, and in one transaction: debits the passenger wallet, credits
   the driver wallet, credits the sacco wallet, and marks the booking `confirmed`.
3. If the passenger's balance is too low, the debit is rejected by a `CHECK (balance >= 0)`
   constraint on the wallet, the whole function raises, and nothing is applied — so a
   failed payment can never leave wallets in a half-updated state.

**Withdrawing (driver or sacco), step by step:**

1. Driver/sacco admin requests a withdrawal (amount + phone) via `mpesa-b2c-payout`.
2. That function verifies they own the wallet, confirms sufficient balance, **debits the
   wallet immediately** and records a `pending` ledger row, then calls Safaricom's B2C API.
3. Safaricom calls back `mpesa-b2c-result` asynchronously with success or failure.
   - Success → the ledger row is marked `completed`.
   - Failure → the wallet is refunded and the row marked `reversed`, so a failed payout
     never leaves someone permanently short.

### 3.2 Environment variables / secrets needed

**STK Push (collecting money):**

- `MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET` — from your Daraja app
- `MPESA_CALLBACK_SECRET` — any random string you generate yourself; verifies callbacks
  actually came from a payment Matu initiated
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — from your Supabase project

**B2C (paying out to drivers/saccos)** — separate Daraja application from STK Push:

- `MPESA_INITIATOR_NAME` — the API operator username you set up in Daraja for B2C
- `MPESA_INITIATOR_PASSWORD_ENCRYPTED` — your initiator password, encrypted with
  Safaricom's public certificate (see Daraja docs: "Encrypting the Security Credential")
- `MPESA_B2C_SHORTCODE` — your B2C-enabled shortcode

### 3.3 Going to production (both flows are sandbox-only right now)

**Neither STK Push nor B2C should be trusted with real money yet** — both currently
point at `sandbox.safaricom.co.ke` and use Safaricom's public test shortcode/passkey.
The sandbox commonly fires a "success" callback on its own with no real payment
happening, so testing in sandbox will make bookings/top-ups/withdrawals look like they
work even though no money moves.

**STK Push go-live:**

1. Complete Safaricom Daraja's "Go Live" process for Lipa na M-Pesa Online — requires a
   registered Paybill or Till.
2. Get production `Consumer Key`/`Consumer Secret`, shortcode, and passkey.
3. In `mpesa-stk-push/index.ts`: replace `SHORTCODE`/`PASSKEY`, change
   `sandbox.safaricom.co.ke` → `api.safaricom.co.ke`. Update the two secrets.

**B2C go-live** (separate approval, do this after STK Push works in production):

1. Apply for B2C API access on Daraja — requires its own shortcode (can be the same
   business, different product) and an initiator account.
2. Generate the encrypted security credential using Safaricom's production public
   certificate (different certificate than the sandbox one).
3. In `mpesa-b2c-payout/index.ts`: change `sandbox.safaricom.co.ke` →
   `api.safaricom.co.ke`, set the three B2C secrets to production values.

Test both thoroughly with small real amounts before opening withdrawals up to real
drivers/saccos — a bug here means real money either gets stuck or double-paid.

---

## 4. Database schema at a glance

Core tables (see `supabase/migrations/` for the authoritative, timestamped definitions):

- `profiles`, `user_roles` — identity and role assignment
- `saccos`, `vehicles`, `routes`, `stages`, `trips` — fleet and route data
  (`vehicles.suspended` / `suspended_reason` — platform-admin kill switch, see below)
- `bookings`, `alerts`, `favorite_routes` — passenger booking + in-trip notifications
- `payments`, `escrow_transactions` — legacy per-fare M-Pesa payment records (pre-wallet)
- `driver_join_requests`, `sacco_join_requests`, `sacco_subscriptions` — driver/sacco
  onboarding and paid subscriptions
- `wallets`, `wallet_transactions`, `sacco_commission_rates` — the wallet system
  described above
- `complaints` — passenger-submitted app/trip complaints, with a resolution workflow
  (see below)
- `rate_limit_hits` — generic sliding-window counter backing `check_rate_limit()`

Row-Level Security is enabled on every table. As a rule: passengers can only see their
own bookings/payments/wallet; drivers can see bookings/wallets tied to trips they
drive; sacco admins can see data for saccos they own; `platform_admin` sees everything
via additive policies layered on top (they don't narrow anyone else's access).
Service-role (used only inside Edge Functions) bypasses RLS — this is intentional and
required for the payment functions, but it's also why those functions must do their
own ownership checks in code rather than relying on RLS to protect them.

**Heads up — some database objects only exist in the Supabase dashboard, not in a
migration file.** `ping_stage`, for example, was created via Studio's SQL editor and
was never captured in `supabase/migrations/`. This means a fresh clone of this repo,
run through `supabase db reset`, will **not** fully reproduce the live schema. If
you're not sure whether something is in a migration, check with a query like:

```sql
select routine_name from information_schema.routines
where routine_schema = 'public' and routine_name = 'the_function_name';
```

before assuming a migration needs to create it — see the "Important habit" note in
section 2 for the fix going forward.

### 4.1 Platform admin

`platform_admin` is a fourth role, separate from `sacco_admin`, for cross-SACCO
oversight — the person running Matu itself, not any one fleet operator. Granted with:

```sql
insert into user_roles (user_id, role) values ('<uuid>', 'platform_admin');
```

(or by email: `select id, 'platform_admin' from auth.users where email = '...'` as
the source of an `insert ... select`). Once granted, an "Open admin panel" link
appears on the Account page, leading to `/platform-admin`, which currently supports:

- Suspending/reinstating any vehicle platform-wide (`set_vehicle_suspension()`),
  regardless of which SACCO owns it — for use after a safety complaint or incident.
- Viewing and resolving every complaint in the system, not just ones tied to a SACCO
  the admin happens to own.
- Suspending/reinstating or warning any user account, of any role (`admin_set_user_suspension()`,
  `admin_issue_warning()`) — see section 5.
- A full directory of every signed-up user and a cross-SACCO overview of drivers, vehicles,
  wallet balances, and money moved (`admin_list_users()`, `admin_sacco_overview()`) — see
  section 5.

### 4.2 Rate limiting

`check_rate_limit(action, max_count, window_seconds)` is a generic, reusable sliding
window counter (backed by `rate_limit_hits`) that any RPC or trigger can call. It's
currently wired into one place: an `alerts` insert trigger capping passengers at 10
"I'm near pickup" / "let me off" alerts per 5 minutes. Other high-frequency actions
(`ping_stage`, booking creation) aren't rate-limited yet — see section 6.

### 4.3 Complaints

Two kinds, both stored in `complaints`:

- **App issues** (bugs, payments, account problems) — always routed to the developer
  by email, since only the dev can fix those.
- **Travel issues** (driver conduct, vehicle condition) — routed to the driver, the
  SACCO, or both, based on passenger choice, with a fallback if the chosen recipient
  has no contact info on file.

Real emails are sent by the `send-complaint-email` Edge Function via
[Resend](https://resend.com) (needs `RESEND_API_KEY` — see section 2). It looks up
recipient emails server-side under the service role (so nothing can be spoofed from
the browser), escapes all user-typed content before dropping it into HTML, isolates
failures per-recipient so one bad address doesn't block the others, and requires the
caller to be either the complaint's own passenger or a `platform_admin`.

Resolution workflow: `status` moves `open` → `acknowledged` → `resolved` via the
`resolve_complaint(complaint_id, status, note)` RPC, callable only by the driver named
in the complaint, the owning SACCO admin, or a platform admin. The platform admin
panel (`/platform-admin`) is currently the only UI surfacing this queue — SACCO admins
and drivers can see complaints about them via RLS but don't yet have a dedicated
in-app view to act on them (see section 6).

---

## 5. Recent fixes (2026-07-15)

- **"You're offline" banner showing while online.** `useOnlineStatus()` was short-circuiting
  to "offline" whenever `navigator.onLine` read `false`, without ever running the real
  connectivity check it was written to do — and `navigator.onLine` is exactly the value the
  code's own comments call unreliable (wifi↔cellular handoffs, some Android power-saving
  quirks). Fixed in `src/components/matu/OfflineBanner.tsx`: the banner now always trusts the
  live fetch check, never the raw browser flag alone.
- **Place search only returning counties/regions for named buildings** (e.g. "Westside
  Towers"). `PlaceSearch.tsx` queried Mapbox alone with no fallback, so a POI gap in Mapbox's
  Nairobi data left users with only place/neighborhood-level matches. Fixed by adding a
  Nairobi bounding box (stronger than proximity bias alone), `autocomplete`/`fuzzyMatch`, and
  merging in Nominatim (OSM) results the same way `lib/stage-match.ts` already did — so a
  Mapbox miss no longer means "nothing but the county."
- **Platform admin now has full authority**, not just vehicle suspension and complaint
  resolution. New migration `20260715120000_platform_admin_superpowers.sql` adds:
  - **User management** — suspend or reinstate _any_ account (passenger, driver, conductor,
    sacco_admin), or send them a warning message, via `admin_set_user_suspension()` /
    `admin_issue_warning()`. Suspended accounts are flagged with a reason and timestamp.
  - **Full user directory** — `admin_list_users()` lists every signed-up account across every
    role, not just ones with a pending complaint or verification.
  - **Sacco & driver oversight** — `admin_sacco_overview()` shows every SACCO, its owner,
    driver/vehicle counts, current wallet balance, total commission earned, and total fares
    collected, so the admin can see who joined where and how much money has moved.
  - These are additive: they only run for callers holding `platform_admin` and never narrow
    any existing SACCO admin/driver/passenger access.
  - **Not yet wired up:** account suspension is recorded and queryable, but no login/booking
    path checks `profiles.is_suspended` yet (a helper, `assert_not_suspended()`, exists for
    this — see section 6) — enforcing it everywhere real money/bookings happen is next.

---

## 6. Known gaps / next steps

- **`send-complaint-email` is on Resend's free/test tier**, sending from the shared
  `onboarding@resend.dev` address. Verify your own domain in Resend and swap
  `FROM_EMAIL` in the function before this is customer-facing.
- **Drivers and SACCO admins can't act on complaints from their own dashboards yet** —
  `resolve_complaint()` already permits them, but `fleet.$saccoId.tsx` and
  `drive.trip.tsx` don't have a complaints panel wired up. Only `/platform-admin` does.
- **Rate limiting only covers passenger alerts.** `ping_stage` and booking creation
  are unthrottled — and since `ping_stage` lives only in the Supabase dashboard (not a
  migration), it needs its live definition pulled before it can be edited safely.
- **No driver ID/license verification.** `driver_join_requests` stores typed-in ID and
  license numbers as plain text — nothing is uploaded, scanned, or checked against
  NTSA/TLB records. Biggest trust gap before opening this to strangers at scale.
- **No stale/ghost trip detection.** If a driver's phone dies mid-trip, nothing marks
  the trip as stalled or notifies waiting passengers.
- **No automated tests, no CI.** Given real money moves through the wallet system,
  tests around `pay_fare_from_wallet` / `apply_wallet_transaction` should be a
  priority before opening this to real users.
- **No error monitoring** (Sentry or equivalent) — bugs are currently discovered from
  users describing symptoms, not from a dashboard.
- **No privacy policy / ToS page**, despite collecting live GPS, ID numbers, phone
  numbers, and payment info — a real compliance gap under Kenya's Data Protection Act
  2019, not just a nice-to-have.
- **Both M-Pesa flows are sandbox-only** — see section 3.3 before launch.
