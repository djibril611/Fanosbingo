import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface Game {
  id: string;
  status: 'waiting' | 'playing' | 'finished';
  current_number: number | null;
  called_numbers: number[];
  host_id: string;
  winner_ids: string[];
  winner_prize_each: number;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  starts_at: string;
  game_number: number;
  stake_amount: number;
  total_pot: number;
  winner_prize: number;
  claim_window_start: string | null;
  return_to_lobby_at: string | null;
}

export interface Player {
  id: string;
  game_id: string;
  name: string;
  card: number[][];
  card_numbers: number[][];
  marked_cells: boolean[][];
  is_host: boolean;
  joined_at: string;
  is_connected: boolean;
  selected_number: number;
  is_disqualified: boolean;
  disqualified_at: string | null;
  stake_paid: boolean;
  winning_pattern?: {
    type: string;
    description: string;
    cells: [number, number][];
  } | null;
}
