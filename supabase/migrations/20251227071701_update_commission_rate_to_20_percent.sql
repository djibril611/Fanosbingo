/*
  # Update Commission Rate Default to 20%
  
  Changes the default commission rate from 25% to 20% to reflect the new business requirement.
  This affects the platform cut on all future games.
*/

UPDATE settings 
SET value = '20'
WHERE id = 'commission_rate';