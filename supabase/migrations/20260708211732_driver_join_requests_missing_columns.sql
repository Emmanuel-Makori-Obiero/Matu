-- Adds columns the driver registration form (drive.trip.tsx) has always sent but were
-- never actually created on this table. Fixes TS2322 "Type is not assignable to type
-- 'never'" errors and the underlying missing data.
ALTER TABLE public.driver_join_requests
  ADD COLUMN IF NOT EXISTS id_number text,
  ADD COLUMN IF NOT EXISTS license_number text,
  ADD COLUMN IF NOT EXISTS brings_own_vehicle boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS vehicle_plate text;
