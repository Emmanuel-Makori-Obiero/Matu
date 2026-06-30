
-- ============== ENUMS ==============
CREATE TYPE public.app_role AS ENUM ('passenger', 'driver', 'conductor', 'sacco_admin');
CREATE TYPE public.vehicle_type AS ENUM ('matatu_14', 'matatu_25', 'bus_33', 'bus_51');
CREATE TYPE public.trip_status AS ENUM ('scheduled', 'boarding', 'in_transit', 'completed', 'cancelled');
CREATE TYPE public.booking_status AS ENUM ('reserved', 'confirmed', 'boarded', 'alighted', 'cancelled');
CREATE TYPE public.alert_type AS ENUM ('near_pickup', 'near_dropoff', 'alight_request');
CREATE TYPE public.payment_status AS ENUM ('pending', 'held', 'released', 'refunded', 'failed');

-- ============== PROFILES ==============
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  phone text,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Profiles are viewable by authenticated users" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- ============== USER ROLES (separate table, secure) ==============
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.get_primary_role(_user_id uuid)
RETURNS public.app_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.user_roles WHERE user_id = _user_id
  ORDER BY CASE role
    WHEN 'sacco_admin' THEN 1
    WHEN 'driver' THEN 2
    WHEN 'conductor' THEN 3
    WHEN 'passenger' THEN 4
  END LIMIT 1
$$;

-- Auto-create profile on signup; role assignment happens client-side after sign-in (user picks role on first sign-up)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, phone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'phone'
  );
  -- Default everyone to passenger; additional roles can be added later
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, COALESCE((NEW.raw_user_meta_data->>'role')::public.app_role, 'passenger'))
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============== SACCOS ==============
CREATE TABLE public.saccos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  registration_number text UNIQUE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_phone text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.saccos TO authenticated;
GRANT SELECT ON public.saccos TO anon;
GRANT ALL ON public.saccos TO service_role;
ALTER TABLE public.saccos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view saccos" ON public.saccos FOR SELECT USING (true);
CREATE POLICY "Sacco admins manage own sacco" ON public.saccos FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid() AND public.has_role(auth.uid(), 'sacco_admin'));

-- ============== VEHICLES ==============
CREATE TABLE public.vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sacco_id uuid REFERENCES public.saccos(id) ON DELETE SET NULL,
  driver_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  plate_number text NOT NULL UNIQUE,
  vehicle_type public.vehicle_type NOT NULL DEFAULT 'matatu_14',
  capacity int NOT NULL,
  nickname text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicles TO authenticated;
GRANT SELECT ON public.vehicles TO anon;
GRANT ALL ON public.vehicles TO service_role;
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view vehicles" ON public.vehicles FOR SELECT USING (true);
CREATE POLICY "Sacco owner manages sacco vehicles" ON public.vehicles FOR ALL TO authenticated
  USING (sacco_id IN (SELECT id FROM public.saccos WHERE owner_id = auth.uid()))
  WITH CHECK (sacco_id IN (SELECT id FROM public.saccos WHERE owner_id = auth.uid()));
CREATE POLICY "Drivers update own vehicle" ON public.vehicles FOR UPDATE TO authenticated USING (driver_id = auth.uid());

-- ============== ROUTES & STAGES ==============
CREATE TABLE public.routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  origin text NOT NULL,
  destination text NOT NULL,
  sacco_id uuid REFERENCES public.saccos(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  base_fare numeric(10,2),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.routes TO authenticated;
GRANT SELECT ON public.routes TO anon;
GRANT ALL ON public.routes TO service_role;
ALTER TABLE public.routes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view routes" ON public.routes FOR SELECT USING (true);
CREATE POLICY "Authenticated can create routes" ON public.routes FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "Creator or sacco owner manages route" ON public.routes FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR sacco_id IN (SELECT id FROM public.saccos WHERE owner_id = auth.uid()));

CREATE TABLE public.stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id uuid NOT NULL REFERENCES public.routes(id) ON DELETE CASCADE,
  name text NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  order_index int NOT NULL DEFAULT 0,
  added_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stages TO authenticated;
GRANT SELECT ON public.stages TO anon;
GRANT ALL ON public.stages TO service_role;
ALTER TABLE public.stages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view stages" ON public.stages FOR SELECT USING (true);
CREATE POLICY "Authenticated add stages" ON public.stages FOR INSERT TO authenticated WITH CHECK (added_by = auth.uid());

-- ============== TRIPS ==============
CREATE TABLE public.trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  route_id uuid NOT NULL REFERENCES public.routes(id) ON DELETE RESTRICT,
  status public.trip_status NOT NULL DEFAULT 'scheduled',
  fare numeric(10,2) NOT NULL,
  current_lat double precision,
  current_lng double precision,
  current_stage_id uuid REFERENCES public.stages(id) ON DELETE SET NULL,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trips TO authenticated;
GRANT SELECT ON public.trips TO anon;
GRANT ALL ON public.trips TO service_role;
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view active trips" ON public.trips FOR SELECT USING (true);
CREATE POLICY "Driver manages own trips" ON public.trips FOR ALL TO authenticated
  USING (driver_id = auth.uid()) WITH CHECK (driver_id = auth.uid());
CREATE POLICY "Sacco owner views fleet trips" ON public.trips FOR SELECT TO authenticated
  USING (vehicle_id IN (SELECT id FROM public.vehicles WHERE sacco_id IN (SELECT id FROM public.saccos WHERE owner_id = auth.uid())));

-- ============== BOOKINGS ==============
CREATE TABLE public.bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  passenger_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  seat_number int,
  pickup_stage_id uuid REFERENCES public.stages(id) ON DELETE SET NULL,
  dropoff_stage_id uuid REFERENCES public.stages(id) ON DELETE SET NULL,
  status public.booking_status NOT NULL DEFAULT 'reserved',
  fare_paid numeric(10,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(trip_id, seat_number)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bookings TO authenticated;
GRANT ALL ON public.bookings TO service_role;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Passenger views own bookings" ON public.bookings FOR SELECT TO authenticated USING (passenger_id = auth.uid());
CREATE POLICY "Driver views trip bookings" ON public.bookings FOR SELECT TO authenticated
  USING (trip_id IN (SELECT id FROM public.trips WHERE driver_id = auth.uid()));
CREATE POLICY "Passenger creates own booking" ON public.bookings FOR INSERT TO authenticated WITH CHECK (passenger_id = auth.uid());
CREATE POLICY "Passenger updates own booking" ON public.bookings FOR UPDATE TO authenticated USING (passenger_id = auth.uid());
CREATE POLICY "Driver updates trip bookings" ON public.bookings FOR UPDATE TO authenticated
  USING (trip_id IN (SELECT id FROM public.trips WHERE driver_id = auth.uid()));

-- ============== ALERTS ==============
CREATE TABLE public.alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  passenger_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type public.alert_type NOT NULL,
  message text,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alerts TO authenticated;
GRANT ALL ON public.alerts TO service_role;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Passenger views own alerts" ON public.alerts FOR SELECT TO authenticated USING (passenger_id = auth.uid());
CREATE POLICY "Driver views trip alerts" ON public.alerts FOR SELECT TO authenticated
  USING (trip_id IN (SELECT id FROM public.trips WHERE driver_id = auth.uid()));
CREATE POLICY "Passenger creates alerts on own bookings" ON public.alerts FOR INSERT TO authenticated WITH CHECK (passenger_id = auth.uid());
CREATE POLICY "Driver creates alerts" ON public.alerts FOR INSERT TO authenticated
  WITH CHECK (trip_id IN (SELECT id FROM public.trips WHERE driver_id = auth.uid()));
CREATE POLICY "Passenger marks alerts read" ON public.alerts FOR UPDATE TO authenticated USING (passenger_id = auth.uid());

-- ============== PAYMENTS (reserved for M-Pesa escrow later) ==============
CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid REFERENCES public.bookings(id) ON DELETE CASCADE,
  payer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount numeric(10,2) NOT NULL,
  mpesa_receipt text,
  status public.payment_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Payer views own payments" ON public.payments FOR SELECT TO authenticated USING (payer_id = auth.uid());

CREATE TABLE public.escrow_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  sacco_id uuid REFERENCES public.saccos(id) ON DELETE SET NULL,
  held_amount numeric(10,2) NOT NULL,
  released_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.escrow_transactions TO authenticated;
GRANT ALL ON public.escrow_transactions TO service_role;
ALTER TABLE public.escrow_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Sacco owner views escrow" ON public.escrow_transactions FOR SELECT TO authenticated
  USING (sacco_id IN (SELECT id FROM public.saccos WHERE owner_id = auth.uid()));

-- ============== REALTIME ==============
ALTER PUBLICATION supabase_realtime ADD TABLE public.trips;
ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings;
ALTER PUBLICATION supabase_realtime ADD TABLE public.alerts;

-- ============== SEED NAIROBI ROUTES + STAGES ==============
WITH seeded AS (
  INSERT INTO public.routes (name, origin, destination, base_fare) VALUES
    ('CBD ↔ Rongai',     'Nairobi CBD', 'Rongai',     80),
    ('CBD ↔ Kasarani',   'Nairobi CBD', 'Kasarani',   60),
    ('CBD ↔ Eastleigh',  'Nairobi CBD', 'Eastleigh',  50),
    ('CBD ↔ Ngong',      'Nairobi CBD', 'Ngong',     100),
    ('CBD ↔ Westlands',  'Nairobi CBD', 'Westlands',  50),
    ('CBD ↔ Kikuyu',     'Nairobi CBD', 'Kikuyu',    100)
  RETURNING id, name
)
INSERT INTO public.stages (route_id, name, lat, lng, order_index)
SELECT s.id, x.name, x.lat, x.lng, x.idx FROM seeded s
JOIN (VALUES
  ('CBD ↔ Rongai',    'Railways',         -1.2906, 36.8266, 0),
  ('CBD ↔ Rongai',    'Nyayo Stadium',    -1.3026, 36.8266, 1),
  ('CBD ↔ Rongai',    'T-Mall',           -1.3134, 36.7820, 2),
  ('CBD ↔ Rongai',    'Bomas',            -1.3399, 36.7568, 3),
  ('CBD ↔ Rongai',    'Rongai Stage',     -1.3956, 36.7456, 4),

  ('CBD ↔ Kasarani',  'Ambassadeur',      -1.2841, 36.8262, 0),
  ('CBD ↔ Kasarani',  'Pangani',          -1.2696, 36.8388, 1),
  ('CBD ↔ Kasarani',  'Muthaiga',         -1.2531, 36.8364, 2),
  ('CBD ↔ Kasarani',  'Roasters',         -1.2407, 36.8830, 3),
  ('CBD ↔ Kasarani',  'Kasarani Stage',   -1.2238, 36.8966, 4),

  ('CBD ↔ Eastleigh', 'OTC',              -1.2855, 36.8295, 0),
  ('CBD ↔ Eastleigh', 'Pumwani',          -1.2806, 36.8462, 1),
  ('CBD ↔ Eastleigh', 'Eastleigh 1st Ave',-1.2768, 36.8513, 2),
  ('CBD ↔ Eastleigh', 'Eastleigh BBS',    -1.2748, 36.8580, 3),

  ('CBD ↔ Ngong',     'Railways',         -1.2906, 36.8266, 0),
  ('CBD ↔ Ngong',     'Dagoretti Corner', -1.2933, 36.7437, 1),
  ('CBD ↔ Ngong',     'Karen Shopping',   -1.3194, 36.7100, 2),
  ('CBD ↔ Ngong',     'Ngong Town',       -1.3537, 36.6557, 3),

  ('CBD ↔ Westlands', 'Koja',             -1.2839, 36.8255, 0),
  ('CBD ↔ Westlands', 'University Way',   -1.2799, 36.8200, 1),
  ('CBD ↔ Westlands', 'Sarit Centre',     -1.2632, 36.8030, 2),
  ('CBD ↔ Westlands', 'Westgate',         -1.2570, 36.8020, 3),

  ('CBD ↔ Kikuyu',    'Kencom',           -1.2864, 36.8242, 0),
  ('CBD ↔ Kikuyu',    'Kangemi',          -1.2670, 36.7460, 1),
  ('CBD ↔ Kikuyu',    'Kinoo',            -1.2522, 36.7060, 2),
  ('CBD ↔ Kikuyu',    'Kikuyu Town',      -1.2454, 36.6635, 3)
) AS x(route_name, name, lat, lng, idx)
ON s.name = x.route_name;
