/*
  # Update SMS Extraction for Ethiopian Banks
  
  ## Overview
  Update the SMS parsing functions to recognize Ethiopian currency (ETB/Birr)
  in addition to Kenyan currency (KES/Ksh).
  
  ## Changes
  - Update extract_amount_from_sms() to recognize ETB and Birr
  - Improve reference extraction for Ethiopian bank formats
  
  ## Security
  - No RLS changes needed
*/

-- Update function to extract amount from SMS (support both Ethiopian and Kenyan formats)
CREATE OR REPLACE FUNCTION extract_amount_from_sms(sms_text text)
RETURNS numeric AS $$
DECLARE
  amount_match text;
BEGIN
  -- Try to find amount patterns like "ETB 1,000.00", "Birr 1000", "KES 1,000.00" or "Ksh 1000"
  amount_match := substring(sms_text FROM '(?:ETB|Birr|KES|Ksh|KSH)?\s*([0-9,]+\.?[0-9]*)');
  
  IF amount_match IS NOT NULL THEN
    -- Remove commas and convert to numeric
    RETURN replace(amount_match, ',', '')::numeric;
  END IF;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
