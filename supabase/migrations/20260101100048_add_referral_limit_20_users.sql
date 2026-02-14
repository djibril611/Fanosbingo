/*
  # Add 20-Person Referral Limit

  Limits each user to referring a maximum of 20 people.

  1. Changes
    - Update handle_referral_bonus function to check referral limit
    - Prevent bonus distribution if referrer has already referred 20 users

  2. Security
    - Check enforced at database level
    - Returns error code for UI to handle
*/

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
  referral_count integer;
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

  -- Check referral limit: max 20 users
  SELECT total_referrals INTO referral_count
  FROM telegram_users
  WHERE telegram_user_id = referrer_telegram_id;

  IF referral_count >= 20 THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Referrer has reached maximum referral limit of 20 users'
    );
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

  -- Give 10 ETB to new user (welcome bonus)
  UPDATE telegram_users
  SET deposited_balance = deposited_balance + 10
  WHERE telegram_user_id = new_user_telegram_id;

  -- Give 10 ETB to referrer (referral bonus)
  UPDATE telegram_users
  SET deposited_balance = deposited_balance + 10,
      total_referrals = total_referrals + 1
  WHERE telegram_user_id = referrer_telegram_id;

  -- Record referral bonus
  INSERT INTO referral_bonuses (referrer_id, referred_id, bonus_amount)
  VALUES (referrer_telegram_id, new_user_telegram_id, 10);

  -- Record welcome bonus transfer
  INSERT INTO balance_transfers (from_user_id, to_user_id, amount, transfer_type, notes)
  VALUES (NULL, new_user_telegram_id, 10, 'welcome_bonus', 'Welcome bonus via referral');

  -- Record referral bonus transfer
  INSERT INTO balance_transfers (from_user_id, to_user_id, amount, transfer_type, notes)
  VALUES (NULL, referrer_telegram_id, 10, 'referral_bonus', 'Referral bonus for inviting user');

  result := json_build_object(
    'success', true,
    'referrer_bonus', 10,
    'new_user_bonus', 10
  );

  RETURN result;
END;
$$;