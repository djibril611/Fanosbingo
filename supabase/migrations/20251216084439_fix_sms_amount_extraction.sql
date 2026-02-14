/*
  # Fix SMS Amount Extraction

  ## Problem
  The current regex pattern doesn't properly extract amounts from Ethiopian bank SMS messages.
  Pattern: '(?:ETB|Birr|KES|Ksh|KSH)?\s*([0-9,]+\.?[0-9]*)'
  
  Issues:
  - Makes currency prefix optional, so matches ANY number in the text
  - PostgreSQL substring() doesn't support capturing groups the same way
  - Doesn't account for common Ethiopian SMS formats

  ## Solution
  - Make currency prefix required
  - Look for "received" context to ensure we get the right amount
  - Support multiple Ethiopian bank formats (Telebirr, CBE, BOA, etc.)
  - Handle both "ETB X" and "Birr X" formats
  
  ## Security
  - No RLS changes
*/

CREATE OR REPLACE FUNCTION extract_amount_from_sms(sms_text text)
RETURNS numeric AS $$
DECLARE
  amount_match text;
  cleaned_amount text;
BEGIN
  -- Try pattern: "received ETB 100.00" or "received Birr 100"
  amount_match := substring(sms_text FROM '(?i)received\s+(?:ETB|Birr)\s+([0-9,]+\.?[0-9]*)');
  
  IF amount_match IS NULL THEN
    -- Try pattern: "ETB 100.00 from" or "Birr 100 from"
    amount_match := substring(sms_text FROM '(?i)(?:ETB|Birr)\s+([0-9,]+\.?[0-9]*)\s+from');
  END IF;
  
  IF amount_match IS NULL THEN
    -- Try pattern: "ETB 100.00" or "Birr 100" (more general, first occurrence)
    amount_match := substring(sms_text FROM '(?i)(?:ETB|Birr)\s+([0-9,]+\.?[0-9]*)');
  END IF;
  
  IF amount_match IS NOT NULL THEN
    -- Remove commas and convert to numeric
    cleaned_amount := replace(amount_match, ',', '');
    RETURN cleaned_amount::numeric;
  END IF;
  
  RETURN NULL;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END;
$$ LANGUAGE plpgsql IMMUTABLE;