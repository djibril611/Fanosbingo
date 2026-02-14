/*
  # Improve Transaction Reference Extraction

  ## Problem
  The extract_reference_from_sms function is too greedy and extracts phone numbers
  as transaction references, causing unique constraint violations.

  ## Solution
  Update the function to:
  - Look for explicit transaction keywords (Transaction number, Reference, Ref, etc.)
  - Only match alphanumeric codes (not just numbers)
  - Exclude phone number patterns
  - Be more specific about what constitutes a valid transaction reference

  ## Security
  - No RLS changes
*/

CREATE OR REPLACE FUNCTION extract_reference_from_sms(sms_text text)
RETURNS text AS $$
DECLARE
  ref_match text;
BEGIN
  -- Try to find transaction reference after keywords
  -- Pattern: "Transaction number: ABC123" or "Ref: XYZ789" or "Reference: TEST123"
  ref_match := substring(sms_text FROM '(?i)(?:transaction\s+(?:number|no|id|ref)|reference|ref)[:\s]+([A-Z0-9]{6,})');
  
  IF ref_match IS NOT NULL THEN
    RETURN ref_match;
  END IF;
  
  -- Try pattern without keyword but must have letters AND numbers (not just numbers)
  -- This excludes phone numbers which are only digits
  ref_match := substring(sms_text FROM '(?<![0-9])([A-Z]+[0-9]{5,}|[0-9]{2,}[A-Z]+[0-9]+)(?![0-9])');
  
  RETURN ref_match;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION extract_reference_from_sms(text) IS
'Extracts transaction reference from SMS, avoiding phone numbers by requiring transaction keywords or alphanumeric mix';