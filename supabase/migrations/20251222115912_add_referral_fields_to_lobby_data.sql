/*
  # Add Referral Fields to Lobby Data Function

  1. Updates
    - Modify `get_lobby_data_instant` function to include referral_code and total_referrals in user data
*/

CREATE OR REPLACE FUNCTION get_lobby_data_instant(user_telegram_id bigint DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  result json;
  game_data json;
  user_data json;
  taken_nums bigint[];
  players_data json;
  server_time bigint;
BEGIN
  server_time := FLOOR(EXTRACT(EPOCH FROM now() AT TIME ZONE 'UTC') * 1000);

  SELECT json_build_object(
    'id', g.id,
    'game_number', g.game_number,
    'status', g.status,
    'total_pot', g.total_pot,
    'stake_amount', g.stake_amount,
    'winner_prize', g.winner_prize,
    'starts_at', FLOOR(EXTRACT(EPOCH FROM g.starts_at AT TIME ZONE 'UTC') * 1000)
  )
  INTO game_data
  FROM games g
  WHERE g.status IN ('waiting', 'playing')
  ORDER BY g.created_at DESC
  LIMIT 1;

  IF game_data IS NOT NULL THEN
    SELECT array_agg(p.selected_number)
    INTO taken_nums
    FROM players p
    WHERE p.game_id = (game_data->>'id')::uuid;

    SELECT json_agg(
      json_build_object(
        'id', p.id,
        'selected_number', p.selected_number,
        'name', p.name,
        'telegram_user_id', p.telegram_user_id
      )
    )
    INTO players_data
    FROM players p
    WHERE p.game_id = (game_data->>'id')::uuid;
  END IF;

  IF user_telegram_id IS NOT NULL THEN
    SELECT json_build_object(
      'telegram_user_id', u.telegram_user_id,
      'balance', u.balance,
      'deposited_balance', u.deposited_balance,
      'won_balance', u.won_balance,
      'telegram_username', u.telegram_username,
      'telegram_first_name', u.telegram_first_name,
      'referral_code', u.referral_code,
      'total_referrals', u.total_referrals
    )
    INTO user_data
    FROM telegram_users u
    WHERE u.telegram_user_id = user_telegram_id;
  END IF;

  result := json_build_object(
    'game', game_data,
    'takenNumbers', COALESCE(taken_nums, ARRAY[]::bigint[]),
    'players', COALESCE(players_data, '[]'::json),
    'user', user_data,
    'serverTime', server_time
  );

  RETURN result;
END;
$$;
