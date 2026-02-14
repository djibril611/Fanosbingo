/*
  # Add Commission Rate Setting

  Allows admin to control the commission/house cut percentage taken from game pots.
  Default is 20% commission.
*/

INSERT INTO settings (id, value, description, updated_at, updated_by)
VALUES ('commission_rate', '20', 'Percentage of game pot taken as house commission (0-100)', now(), 'system')
ON CONFLICT (id) DO NOTHING;
