import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { playerId, col, row, isBatch, telegramUserId } = await req.json();

    if (!playerId || !telegramUserId) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: playerId, telegramUserId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: player } = await supabase
      .from('players')
      .select('id, marked_cells, game_id, telegram_user_id')
      .eq('id', playerId)
      .maybeSingle();

    if (!player) {
      return new Response(
        JSON.stringify({ error: 'Player not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (player.telegram_user_id !== telegramUserId) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: cannot modify another player card' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: game } = await supabase
      .from('games')
      .select('status')
      .eq('id', player.game_id)
      .maybeSingle();

    if (!game || game.status !== 'playing') {
      return new Response(
        JSON.stringify({ error: 'Game is not in playing state' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const markedCells = player.marked_cells as boolean[][];
    markedCells[col][row] = !markedCells[col][row];

    const { error: updateError } = await supabase
      .from('players')
      .update({ marked_cells: markedCells })
      .eq('id', playerId);

    if (updateError) {
      console.error('Update error:', updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to mark cell' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        marked: markedCells[col][row],
        isBatch: isBatch || false
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});