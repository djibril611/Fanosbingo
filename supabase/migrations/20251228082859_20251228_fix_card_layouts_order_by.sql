/*
  # Fix card layouts ORDER BY issue

  1. Problem
    - `get_all_card_layouts()` function has ORDER BY outside of the aggregate function
    - This causes: "column \"card_layouts.card_number\" must appear in the GROUP BY clause or be used in an aggregate function"
    
  2. Solution
    - Remove ORDER BY from SELECT since jsonb_object_agg doesn't need ordering
    - The ORDER BY in jsonb_agg for get_card_layouts_batch is incorrect syntax (UNION)
*/

CREATE OR REPLACE FUNCTION get_all_card_layouts()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_object_agg(
    card_number::text,
    layout
  )
  INTO v_result
  FROM card_layouts;

  IF v_result IS NULL THEN
    v_result := '{}'::jsonb;
  END IF;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION get_card_layouts_batch(p_card_numbers integer[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_agg(
    jsonb_build_object(
      'card_number', cl.card_number,
      'layout', cl.layout
    )
  )
  INTO v_result
  FROM card_layouts cl
  WHERE cl.card_number = ANY(p_card_numbers)
  ORDER BY cl.card_number;

  IF v_result IS NULL THEN
    v_result := '[]'::jsonb;
  END IF;

  RETURN v_result;
END;
$$;
