/*
  # Permanent Card Layouts System

  This migration creates a system for permanent, reusable bingo card layouts.
  Once a card number (1-400) is generated, its layout is stored forever and
  reused across all future games by any player who selects that card number.

  ## New Tables
    - `card_layouts`
      - `card_number` (integer, primary key) - Unique card identifier (1-400)
      - `layout` (jsonb) - 5x5 grid stored as array of columns [[col1], [col2], ...]
      - `created_at` (timestamptz) - When this card layout was first generated

  ## New Functions
    - `seeded_random_next(seed integer)` - Replicates frontend seeded random algorithm
    - `generate_seeded_bingo_card(card_number integer)` - Generates deterministic card layout
    - `get_or_create_card_layout(p_card_number integer)` - Gets existing or creates new permanent layout

  ## Security
    - Enable RLS on `card_layouts` table
    - All authenticated users can read card layouts (SELECT)
    - Only system can insert new layouts (via function)
    - Layouts are immutable once created

  ## Performance
    - Primary key index on card_number for instant lookups
    - Card generation happens only once per card number (max 400 times ever)
*/

-- Create card layouts table for permanent storage
CREATE TABLE IF NOT EXISTS card_layouts (
  card_number integer PRIMARY KEY CHECK (card_number >= 1 AND card_number <= 400),
  layout jsonb NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE card_layouts ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read card layouts
CREATE POLICY "Anyone can read card layouts"
  ON card_layouts
  FOR SELECT
  TO authenticated
  USING (true);

-- Create index for performance (though primary key already creates one)
CREATE INDEX IF NOT EXISTS idx_card_layouts_card_number ON card_layouts(card_number);

-- Seeded random number generator (replicates frontend algorithm)
-- This function maintains internal state and returns the next random value
CREATE OR REPLACE FUNCTION seeded_random_next(seed integer)
RETURNS float
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  next_seed integer;
BEGIN
  -- Linear Congruential Generator: (seed * 9301 + 49297) % 233280
  next_seed := ((seed * 9301 + 49297) % 233280);
  RETURN next_seed::float / 233280.0;
END;
$$;

-- Generate a deterministic bingo card layout using seeded random
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
  current_seed integer;
BEGIN
  -- Initialize seed
  current_seed := card_number;
  
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
        -- Get next random value and update seed
        current_seed := ((current_seed * 9301 + 49297) % 233280);
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

-- Get existing card layout or create a new permanent one
CREATE OR REPLACE FUNCTION get_or_create_card_layout(p_card_number integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_layout jsonb;
  new_layout jsonb;
BEGIN
  -- Validate card number
  IF p_card_number < 1 OR p_card_number > 400 THEN
    RAISE EXCEPTION 'Card number must be between 1 and 400';
  END IF;
  
  -- Try to get existing layout
  SELECT layout INTO existing_layout
  FROM card_layouts
  WHERE card_number = p_card_number;
  
  -- If exists, return it
  IF existing_layout IS NOT NULL THEN
    RETURN existing_layout;
  END IF;
  
  -- Generate new layout
  new_layout := generate_seeded_bingo_card(p_card_number);
  
  -- Insert new layout (with conflict handling for race conditions)
  INSERT INTO card_layouts (card_number, layout)
  VALUES (p_card_number, new_layout)
  ON CONFLICT (card_number) DO NOTHING;
  
  -- Return the layout (either newly inserted or inserted by concurrent transaction)
  SELECT layout INTO existing_layout
  FROM card_layouts
  WHERE card_number = p_card_number;
  
  RETURN existing_layout;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_or_create_card_layout(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION generate_seeded_bingo_card(integer) TO authenticated;