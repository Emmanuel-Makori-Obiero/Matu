
CREATE OR REPLACE FUNCTION public.get_trip_taken_seats(_trip_id uuid)
RETURNS TABLE(seat_number integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT b.seat_number FROM public.bookings b
  WHERE b.trip_id = _trip_id
    AND b.seat_number IS NOT NULL
    AND b.status IN ('reserved','boarded');
$function$;

REVOKE EXECUTE ON FUNCTION public.get_trip_taken_seats(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_trip_taken_seats(uuid) TO authenticated;
