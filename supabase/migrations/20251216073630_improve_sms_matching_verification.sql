/*
  # Improve SMS Matching Verification

  ## Overview
  Enhances the SMS matching logic to be more secure by adding transaction reference
  verification and stricter matching criteria to prevent fake deposit attempts.

  ## Changes

  ### 1. Enhanced Matching Logic
  - Require transaction reference match when available
  - Add amount tolerance of ±0.01 to handle rounding
  - Prioritize matches with matching transaction references
  - Reduce time window from 48 hours to 24 hours
  
  ### 2. Security Improvements
  - Users must provide SMS with transaction reference for high-value deposits (>100 ETB)
  - Reject submissions that don't match any bank SMS
  - Add verification status tracking

  ## Security Notes
  - Makes it much harder to fake deposits
  - Transaction references are unique per transaction
  - Users can't guess valid transaction references
  - Tighter time windows reduce attack surface
*/

-- Update the matching function with stronger verification
CREATE OR REPLACE FUNCTION match_user_sms()
RETURNS trigger AS $$
DECLARE
  matched_bank_sms bank_sms_messages%ROWTYPE;
  time_window interval := interval '24 hours';
  amount_tolerance numeric := 0.01;
BEGIN
  -- Extract amount and reference from user's SMS
  NEW.amount := extract_amount_from_sms(NEW.sms_text);
  NEW.reference_number := extract_reference_from_sms(NEW.sms_text);
  
  -- Try to find matching bank SMS with strong verification
  SELECT * INTO matched_bank_sms
  FROM bank_sms_messages
  WHERE claimed_by_user_id IS NULL
    -- Must be within time window
    AND received_at >= NEW.created_at - time_window
    AND received_at <= NEW.created_at + interval '5 minutes'
    -- Amount must match (with small tolerance for rounding)
    AND amount IS NOT NULL
    AND NEW.amount IS NOT NULL
    AND ABS(amount - NEW.amount) <= amount_tolerance
    -- If user provided a reference and bank SMS has a reference, they must match
    AND (
      NEW.reference_number IS NULL 
      OR transaction_number IS NULL 
      OR transaction_number = NEW.reference_number
    )
  ORDER BY 
    -- Prioritize exact transaction reference matches
    CASE 
      WHEN NEW.reference_number IS NOT NULL 
           AND transaction_number IS NOT NULL 
           AND transaction_number = NEW.reference_number 
      THEN 0 
      ELSE 1 
    END,
    -- Then exact amount matches
    CASE WHEN ABS(amount - NEW.amount) < 0.01 THEN 0 ELSE 1 END,
    -- Then by time proximity
    ABS(EXTRACT(EPOCH FROM (received_at - NEW.created_at)))
  LIMIT 1;
  
  -- Validate the match
  IF matched_bank_sms.id IS NOT NULL THEN
    -- For high-value transactions (>100 ETB), require transaction reference match
    IF NEW.amount > 100 AND (
      NEW.reference_number IS NULL 
      OR matched_bank_sms.transaction_number IS NULL 
      OR NEW.reference_number != matched_bank_sms.transaction_number
    ) THEN
      -- Don't match high-value without reference verification
      NEW.status := 'rejected';
      NEW.rejection_reason := 'High-value deposits require transaction reference verification. Please include the full SMS with transaction number.';
      NEW.processed_at := now();
    ELSE
      -- Valid match
      NEW.matched_sms_id := matched_bank_sms.id;
      NEW.status := 'matched';
      NEW.processed_at := now();
      
      -- Mark bank SMS as claimed
      UPDATE bank_sms_messages
      SET claimed_by_user_id = NEW.telegram_user_id,
          claimed_at = now()
      WHERE id = matched_bank_sms.id;
    END IF;
  ELSE
    -- No match found - reject after 30 seconds
    -- (gives time for SMS to arrive if user submitted before bank SMS was received)
    IF NEW.created_at < now() - interval '30 seconds' THEN
      NEW.status := 'rejected';
      NEW.rejection_reason := 'No matching deposit found. Please ensure the SMS is correct and try again in a few moments.';
      NEW.processed_at := now();
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add a scheduled function to expire old pending submissions
CREATE OR REPLACE FUNCTION expire_old_pending_sms()
RETURNS void AS $$
BEGIN
  UPDATE user_sms_submissions
  SET status = 'expired',
      rejection_reason = 'No matching deposit found within the time window.',
      processed_at = now()
  WHERE status = 'pending'
    AND created_at < now() - interval '10 minutes';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comment explaining the security model
COMMENT ON FUNCTION match_user_sms() IS 
'Matches user SMS submissions with bank SMS using amount, timestamp, and transaction reference verification. High-value deposits (>100 ETB) require transaction reference match for security.';
