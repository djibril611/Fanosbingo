/*
  # Pre-generate All 400 Card Layouts

  1. Purpose
    - Generate all card layouts upfront to eliminate on-demand generation
    - Removes write operations during gameplay
    - Enables static caching and batch fetching
    
  2. Implementation
    - Calls get_or_create_card_layout for cards 1-400
    - Each card layout is deterministic based on card number
    - Idempotent: can be run multiple times safely
    
  3. Impact
    - All card layouts available immediately
    - No database writes during card selection
    - Enables CDN caching of layouts
*/

DO $$
DECLARE
  i integer;
  v_layout jsonb;
BEGIN
  FOR i IN 1..400 LOOP
    SELECT public.get_or_create_card_layout(i) INTO v_layout;
  END LOOP;
  
  RAISE NOTICE 'Pre-generated % card layouts', 400;
END $$;
