/*
  # Add Batch Card Layouts Function

  1. New Functions
    - `get_card_layouts_batch(card_numbers integer[])` - Returns multiple card layouts in a single query
    - Optimized for fetching 50-100 cards at once
    
  2. Performance
    - Uses array input to batch queries
    - Returns JSONB array for efficient transfer
    - Indexed lookup on card_number column
    
  3. Impact
    - Reduces 50 individual queries to 1 batch query
    - Significant reduction in connection overhead
    - Faster lobby loading for all users
*/

CREATE OR REPLACE FUNCTION get_card_layouts_batch(p_card_numbers integer[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_layouts jsonb := '[]'::jsonb;
  v_card_number integer;
  v_layout jsonb;
BEGIN
  SELECT jsonb_agg(
    jsonb_build_object(
      'card_number', cl.card_number,
      'layout', cl.layout
    )
    ORDER BY cl.card_number
  )
  INTO v_result
  FROM card_layouts cl
  WHERE cl.card_number = ANY(p_card_numbers);

  IF v_result IS NULL THEN
    v_result := '[]'::jsonb;
  END IF;

  RETURN v_result;
END;
$$;

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
  FROM card_layouts
  ORDER BY card_number;

  IF v_result IS NULL THEN
    v_result := '{}'::jsonb;
  END IF;

  RETURN v_result;
END;
$$;
