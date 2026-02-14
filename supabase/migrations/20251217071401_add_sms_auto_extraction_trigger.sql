/*
  # Add Automatic SMS Field Extraction

  ## Problem
  SMS messages are inserted without extracting amount, transaction number, 
  sender name, and sender phone. This causes manual verification to fail
  with "0 ETB credited" errors.

  ## Solution
  Create a trigger that automatically extracts all fields when SMS is inserted:
  - Amount (using fixed extract_amount_from_sms function)
  - Transaction number
  - Sender name and phone

  ## New Functions
  - extract_sender_phone_from_sms() - Extracts phone numbers
  - extract_sender_name_from_sms() - Extracts sender names
  - auto_extract_bank_sms_fields() - Trigger function that calls all extractors

  ## Changes
  - Add BEFORE INSERT trigger on bank_sms_messages table
  - Works for both manual entry and automatic forwarding

  ## Security
  - No RLS changes needed
  - Functions are IMMUTABLE for performance
*/

-- Extract sender phone from Ethiopian SMS formats
CREATE OR REPLACE FUNCTION extract_sender_phone_from_sms(sms_text text)
RETURNS text AS $$
DECLARE
  phone_match text;
BEGIN
  -- Try patterns like "from John Doe 0912345678" or "from John Doe +251912345678"
  phone_match := substring(sms_text FROM '(?i)from\s+[^0-9]+([+]?251)?([0-9]{9,10})');
  
  IF phone_match IS NULL THEN
    -- Try pattern: "(0912345678)" or "0912345678"
    phone_match := substring(sms_text FROM '\(?([0-9]{10})\)?');
  END IF;
  
  IF phone_match IS NOT NULL THEN
    -- Clean up the phone number
    phone_match := regexp_replace(phone_match, '[^0-9+]', '', 'g');
    RETURN phone_match;
  END IF;
  
  RETURN NULL;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Extract sender name from Ethiopian SMS formats
CREATE OR REPLACE FUNCTION extract_sender_name_from_sms(sms_text text)
RETURNS text AS $$
DECLARE
  name_match text;
BEGIN
  -- Try pattern: "from John Doe 0912345678" or "from John Doe (0912345678)"
  name_match := substring(sms_text FROM '(?i)from\s+([A-Za-z\s]+)(?:\s+[0-9(+]|$)');
  
  IF name_match IS NOT NULL THEN
    -- Trim whitespace
    RETURN trim(name_match);
  END IF;
  
  RETURN NULL;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Trigger function to auto-extract all fields from bank SMS
CREATE OR REPLACE FUNCTION auto_extract_bank_sms_fields()
RETURNS TRIGGER AS $$
BEGIN
  -- Only extract if message_text is not a placeholder
  IF NEW.message_text IS NOT NULL AND 
     NEW.message_text != '{message}' AND 
     NEW.message_text != '' THEN
    
    -- Extract amount if not already set
    IF NEW.amount IS NULL THEN
      NEW.amount := extract_amount_from_sms(NEW.message_text);
    END IF;
    
    -- Extract transaction number if not already set
    IF NEW.transaction_number IS NULL THEN
      NEW.transaction_number := extract_reference_from_sms(NEW.message_text);
    END IF;
    
    -- Extract sender phone if not already set
    IF NEW.sender_phone IS NULL THEN
      NEW.sender_phone := extract_sender_phone_from_sms(NEW.message_text);
    END IF;
    
    -- Extract sender name if not already set
    IF NEW.sender_name IS NULL THEN
      NEW.sender_name := extract_sender_name_from_sms(NEW.message_text);
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if it exists (for re-running migration)
DROP TRIGGER IF EXISTS trigger_auto_extract_bank_sms_fields ON bank_sms_messages;

-- Create trigger to run before insert
CREATE TRIGGER trigger_auto_extract_bank_sms_fields
  BEFORE INSERT ON bank_sms_messages
  FOR EACH ROW
  EXECUTE FUNCTION auto_extract_bank_sms_fields();

-- Add comment
COMMENT ON TRIGGER trigger_auto_extract_bank_sms_fields ON bank_sms_messages IS
'Automatically extracts amount, transaction number, sender name, and sender phone from SMS text on insert';