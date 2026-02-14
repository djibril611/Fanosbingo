/*
  # Fix Integer Overflow in Card Layout Generation

  The seeded random function was causing integer overflow when multiplying large seed values.
  This migration fixes the issue by using bigint for intermediate calculations.

  ## Changes
    - Update generate_seeded_bingo_card function to use bigint for seed calculations
    - Ensure all intermediate values are cast to bigint before arithmetic operations
    - Cast back to integer only after modulo operation
*/

-- Update the card generation function with proper bigint handling
CREATE OR REPLACE FUNCTION generate_seeded_bingo_card(card_number integer)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  card jsonb := '[]'::jsonb;
  col_array jsonb;
  col integer;
  row integer;
  min_num integer;
  max_num integer;
  available_numbers integer[];
  random_value float;
  random_index integer;
  selected_number integer;
  current_seed bigint;  -- Changed to bigint
BEGIN
  -- Initialize seed as bigint
  current_seed := card_number::bigint;
  
  -- Generate each column (5 columns: B, I, N, G, O)
  FOR col IN 0..4 LOOP
    col_array := '[]'::jsonb;
    min_num := col * 15 + 1;
    max_num := col * 15 + 15;
    
    -- Create array of available numbers for this column
    available_numbers := ARRAY(SELECT generate_series(min_num, max_num));
    
    -- Generate 5 rows for this column
    FOR row IN 0..4 LOOP
      -- Center cell is always FREE (0)
      IF col = 2 AND row = 2 THEN
        col_array := col_array || '0'::jsonb;
      ELSE
        -- Get next random value and update seed using bigint arithmetic
        current_seed := ((current_seed * 9301::bigint + 49297::bigint) % 233280::bigint);
        random_value := current_seed::float / 233280.0;
        
        -- Select random number from available numbers
        random_index := floor(random_value * array_length(available_numbers, 1))::integer + 1;
        selected_number := available_numbers[random_index];
        
        -- Add to column
        col_array := col_array || to_jsonb(selected_number);
        
        -- Remove selected number from available numbers
        available_numbers := array_remove(available_numbers, selected_number);
      END IF;
    END LOOP;
    
    -- Add column to card
    card := card || jsonb_build_array(col_array);
  END LOOP;
  
  RETURN card;
END;
$$;