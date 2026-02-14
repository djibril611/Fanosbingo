/*
  # Fix referral bonus system

  1. Changes
    - Remove welcome bonus for referred user (no longer receives 10 ETB)
    - Reduce referral bonus from 10 ETB to 5 ETB (only referrer receives)
    - Update default bonus_amount in referral_bonuses table to 5

  2. Impact
    - Only the referrer gets paid (5 ETB per referral)
    - Referred users no longer receive bonus
*/

-- Update default bonus_amount in referral_bonuses table
ALTER TABLE referral_bonuses ALTER COLUMN bonus_amount SET DEFAULT 5;

-- Update the handle_referral_bonus function
CREATE OR REPLACE FUNCTION handle_referral_bonus(
  new_user_telegram_id bigint,
  referrer_code text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  referrer_telegram_id bigint;
  referrer_user_id uuid;
  new_user_id uuid;
  result json;
BEGIN
  -- Find the referrer by referral code
  SELECT telegram_user_id, id INTO referrer_telegram_id, referrer_user_id
  FROM telegram_users
  WHERE referral_code = referrer_code
  LIMIT 1;

  -- If referrer not found, return error
  IF referrer_telegram_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Invalid referral code');
  END IF;

  -- Get new user's id
  SELECT id INTO new_user_id
  FROM telegram_users
  WHERE telegram_user_id = new_user_telegram_id
  LIMIT 1;

  -- Check if bonus already given
  IF EXISTS(SELECT 1 FROM referral_bonuses WHERE referrer_id = referrer_telegram_id AND referred_id = new_user_telegram_id) THEN
    RETURN json_build_object('success', false, 'error', 'Referral bonus already claimed');
  END IF;

  -- Update referred_by field
  UPDATE telegram_users
  SET referred_by = referrer_telegram_id
  WHERE telegram_user_id = new_user_telegram_id;

  -- Give 5 ETB to referrer only (no bonus to referred user)
  UPDATE telegram_users
  SET deposited_balance = deposited_balance + 5,
      total_referrals = total_referrals + 1
  WHERE telegram_user_id = referrer_telegram_id;

  -- Record referral bonus
  INSERT INTO referral_bonuses (referrer_id, referred_id, bonus_amount)
  VALUES (referrer_telegram_id, new_user_telegram_id, 5);

  -- Record referral bonus transfer
  INSERT INTO balance_transfers (from_user_id, to_user_id, amount, transfer_type, notes)
  VALUES (NULL, referrer_telegram_id, 5, 'referral_bonus', 'Referral bonus for inviting user');

  result := json_build_object(
    'success', true,
    'referrer_bonus', 5,
    'new_user_bonus', 0
  );

  RETURN result;
END;
$$;
