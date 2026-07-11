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
      ride.index.tsx                passenger: browse routes, book a seat
      ride.$routeId.tsx             passenger: pick stage, pay, confirm booking
      ride.track.tsx                passenger: list of live trips to track
      ride.track.$bookingId.tsx     passenger: live map of their booked vehicle
      ride.history.tsx              passenger: past bookings
      drive.index.tsx               driver: start/manage a trip
      drive.trip.tsx                driver: active trip screen (location, bookings)
      fleet.index.tsx               sacco admin: list of saccos/fleets
      fleet.$saccoId.tsx            sacco admin: vehicles, drivers, join requests
      account.tsx                   profile + role management
      complaints.tsx                submit/view complaints
  components/matu/                  app-specific UI (maps, AI assistant, etc.)
  integrations/supabase/            Supabase client + generated types
  lib/                              ETA/traffic helpers, utilities

supabase/
  migrations/                       every schema change, in order, timestamped
  functions/                        Edge Functions (Deno) — see section 4
  config.toml                       local Supabase CLI config
```

Roles (`public.app_role`): `passenger`, `driver`, `conductor`, `sacco_admin`. A user's
role(s) live in `user_roles`, checked via the `has_role()` Postgres function used
throughout RLS policies.

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
```

Set their secrets (Project Settings → Edge Functions → Secrets, or via CLI):
```bash
supabase secrets set MPESA_CONSUMER_KEY=xxx MPESA_CONSUMER_SECRET=xxx MPESA_CALLBACK_SECRET=xxx
```
See section 4 for the full list of required secrets.

---

## 3. Payments: how money moves

There are two separate M-Pesa flows in this app, and it's important to keep them
mentally separate because they use different Daraja APIs, different credentials, and
different go-live processes:

| Flow | Direction | API | Function(s) |
|---|---|---|---|
| Collecting money | passenger → app | STK Push (Lipa na M-Pesa Online) | `mpesa-stk-push`, `mpesa-callback` |
| Paying money out | app → driver/sacco | B2C (Business to Customer) | `mpesa-b2c-payout`, `mpesa-b2c-result` |

**M-Pesa has no concept of "send this specific payment straight to driver X's phone."**
STK Push always deposits into *your* registered Paybill/Till. There is no way around
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
- `bookings`, `alerts` — passenger booking + in-trip notifications
- `payments`, `escrow_transactions` — legacy per-fare M-Pesa payment records (pre-wallet)
- `driver_join_requests`, `sacco_join_requests`, `sacco_subscriptions` — driver/sacco
  onboarding and paid subscriptions
- `wallets`, `wallet_transactions`, `sacco_commission_rates` — the wallet system
  described above

Row-Level Security is enabled on every table. As a rule: passengers can only see their
own bookings/payments/wallet; drivers can see bookings/wallets tied to trips they
drive; sacco admins can see data for saccos they own. Service-role (used only inside
Edge Functions) bypasses RLS — this is intentional and required for the payment
functions, but it's also why those functions must do their own ownership checks in code
rather than relying on RLS to protect them.

---

## 5. Known gaps / next steps

- **Frontend wallet UI is not built yet.** The database and edge functions support
  wallets fully, but there's no top-up screen, wallet balance display, or withdrawal
  screen in `src/routes/` yet — this is the next piece of work.
- **No automated tests.** Given real money moves through this system, adding tests
  around the wallet ledger functions (`pay_fare_from_wallet`, `apply_wallet_transaction`)
  should be a priority before opening it to real users.
- **Both M-Pesa flows are sandbox-only** — see section 3.3 before launch.
