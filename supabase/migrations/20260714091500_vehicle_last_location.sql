-- Vehicles previously only had a location while an active trip was broadcasting
-- (trips.current_lat/lng). That meant the SACCO fleet map only ever showed vehicles
-- currently on a trip — idle/parked vehicles were invisible. Add a last-known
-- location on the vehicle itself, updated on every GPS ping during a trip, so the
-- fleet map can show every vehicle: live ones from the active trip, idle ones from
-- wherever they were last seen.
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS last_lat double precision,
  ADD COLUMN IF NOT EXISTS last_lng double precision,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;
