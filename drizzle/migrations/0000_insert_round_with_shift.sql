CREATE OR REPLACE FUNCTION public.insert_round_with_shift(_round jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _season uuid := (_round->>'season_id')::uuid;
  _num int := (_round->>'round_number')::int;
  _new_id uuid;
  r record;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Shift from highest to lowest to avoid UNIQUE (season_id, round_number) collisions.
  -- Only rounds of the same season, only round_number changes (dates/ids untouched).
  FOR r IN
    SELECT id, round_number FROM public.rounds
    WHERE season_id = _season AND round_number >= _num
    ORDER BY round_number DESC
  LOOP
    UPDATE public.rounds SET round_number = r.round_number + 1 WHERE id = r.id;
  END LOOP;

  INSERT INTO public.rounds (
    name, round_number, date, end_date, club, course, sponsor,
    is_master, master_coefficient, status, season_id,
    course_par, course_handicap, course_handicap_women
  ) VALUES (
    _round->>'name', _num, (_round->>'date')::date,
    NULLIF(_round->>'end_date','')::date,
    _round->>'club', _round->>'course', _round->>'sponsor',
    COALESCE((_round->>'is_master')::boolean, false),
    COALESCE((_round->>'master_coefficient')::numeric, 1.0),
    COALESCE((_round->>'status')::round_status, 'draft'),
    _season,
    _round->'course_par', _round->'course_handicap', _round->'course_handicap_women'
  ) RETURNING id INTO _new_id;

  RETURN _new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.insert_round_with_shift(jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.insert_round_with_shift(jsonb) TO authenticated, service_role;