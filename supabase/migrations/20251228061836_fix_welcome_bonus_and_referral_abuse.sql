/*
  # Fix Welcome Bonus and Referral Abuse

  ## Summary
  Removes automatic welcome bonuses and fixes referral exploit:
  - Default balance changed from 10 ETB to 0 ETB
  - Welcome bonus removed (was exploited via bot farming)
  - Referral bonus made contingent on actual deposit
  - Self-referral prevention added
  
  ## Changes
  
  1. telegram_users default balance: 10 → 0 ETB
  2. disable_referral function: Remove automatic welcome/referral bonuses
  3. Add self-referral prevention
  4. Referral bonuses only after actual deposit
  
  ## Security Impact
  - Prevents 33-account bot farm exploitation (was worth ~990 ETB)
  - Forces users to deposit real money before playing
  - Closes referral loop exploits
*/

-- Change default balance from 10 to 0 ETB
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'telegram_users' AND column_name = 'balance'
  ) THEN
    ALTER TABLE telegram_users ALTER COLUMN balance SET DEFAULT 0;
  END IF;
END $$;

-- Recreate the new_user_referral trigger without automatic bonuses
DROP TRIGGER IF EXISTS trigger_new_user_referral ON telegram_users;
DROP FUNCTION IF EXISTS process_new_user_referral() CASCADE;

CREATE OR REPLACE FUNCTION process_new_user_referral()
RETURNS TRIGGER AS $$
DECLARE
  referrer_telegram_id bigint;
BEGIN
  -- Prevent self-referral
  IF NEW.referred_by = NEW.telegram_user_id THEN
    NEW.referred_by = NULL;
    RETURN NEW;
  END IF;

  -- If no referrer, just return
  IF NEW.referred_by IS NULL THEN
    RETURN NEW;
  END IF;

  -- Verify referrer exists
  IF NOT EXISTS (
    SELECT 1 FROM telegram_users 
    WHERE telegram_user_id = NEW.referred_by
  ) THEN
    NEW.referred_by = NULL;
    RETURN NEW;
  END IF;

  -- Check if this referral was already counted
  IF EXISTS(
    SELECT 1 FROM referral_bonuses 
    WHERE referrer_id = NEW.referred_by 
    AND referred_id = NEW.telegram_user_id
  ) THEN
    RETURN NEW;
  END IF;

  -- Record the referral relationship but NO automatic bonus
  -- Bonus will be given only after first deposit via edge function
  INSERT INTO referral_bonuses (referrer_id, referred_id, bonus_amount)
  VALUES (NEW.referred_by, NEW.telegram_user_id, 0)
  ON CONFLICT (referrer_id, referred_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trigger_new_user_referral
AFTER INSERT ON telegram_users
FOR EACH ROW
EXECUTE FUNCTION process_new_user_referral();

-- Note: Referral bonuses will be distributed when users make their first real deposit
-- This is enforced in the edge function logic, not in the database trigger
