import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

let supabaseClient: ReturnType<typeof createClient> | null = null;

function getSupabaseClient() {
  if (!supabaseClient) {
    supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      {
        auth: { persistSession: false },
        db: { schema: 'public' },
      }
    );
  }
  return supabaseClient;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = getSupabaseClient();
    const { gameId, cardNumber, telegramUserId, playerName, telegramUsername, telegramFirstName, telegramLastName, cardLayout: providedLayout } = await req.json();

    if (!telegramUserId || telegramUserId <= 0) {
      return new Response(
        JSON.stringify({
          error: 'User ID required',
          error_code: 'USER_REQUIRED',
          message: 'Please connect your wallet first.'
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let card: number[][];

    // Use provided layout if available, otherwise fetch from database
    if (providedLayout && Array.isArray(providedLayout)) {
      card = providedLayout;
    } else {
      const { data: cardLayout, error: layoutError } = await supabase
        .rpc('get_or_create_card_layout', { p_card_number: cardNumber });

      if (layoutError || !cardLayout) {
        return new Response(
          JSON.stringify({ error: layoutError?.message || 'Failed to get card layout' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      card = cardLayout as number[][];
    }

    const markedCells = Array(5).fill(null).map(() => Array(5).fill(false));
    markedCells[2][2] = true;

    const { data: result, error: rpcError } = await supabase
      .rpc('select_card_atomic', {
        p_game_id: gameId,
        p_card_number: cardNumber,
        p_telegram_user_id: telegramUserId,
        p_player_name: playerName,
        p_card: card,
        p_card_numbers: card,
        p_marked_cells: markedCells,
        p_telegram_username: telegramUsername || null,
        p_telegram_first_name: telegramFirstName || null,
        p_telegram_last_name: telegramLastName || null
      });

    if (rpcError) {
      return new Response(
        JSON.stringify({ error: rpcError.message || 'Failed to select card' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!result.success) {
      let statusCode = 400;
      
      if (result.error_code === 'SELECTION_CLOSED') {
        statusCode = 423;
      } else if (result.error_code === 'CARD_TAKEN') {
        statusCode = 409;
      } else if (result.error_code === 'INSUFFICIENT_BALANCE') {
        statusCode = 402;
      } else if (result.error_code === 'INTERNAL_ERROR') {
        statusCode = 500;
      }

      return new Response(
        JSON.stringify({
          error: result.error,
          error_code: result.error_code,
          ...(result.closed_at && { closed_at: result.closed_at }),
          ...(result.current_time && { current_time: result.current_time }),
          ...(result.required && { required: result.required }),
          ...(result.available && { available: result.available })
        }),
        { status: statusCode, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        playerId: result.player_id,
        cardNumber: result.card_number,
        card: card,
        selection_closed_at: result.selection_closed_at,
        starts_at: result.starts_at
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});