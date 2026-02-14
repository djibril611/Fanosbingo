import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface CellMark {
  col: number;
  row: number;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { playerId, cells, requestId } = await req.json() as {
      playerId: string;
      cells: CellMark[];
      requestId?: string;
    };

    if (!playerId || !cells || !Array.isArray(cells) || cells.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Invalid request: playerId and cells array required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (cells.length > 25) {
      return new Response(
        JSON.stringify({ error: 'Too many cells in batch (max 25)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: player } = await supabase
      .from('players')
      .select('id, marked_cells, game_id')
      .eq('id', playerId)
      .maybeSingle();

    if (!player) {
      return new Response(
        JSON.stringify({ error: 'Player not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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

    for (const cell of cells) {
      if (cell.col >= 0 && cell.col < 5 && cell.row >= 0 && cell.row < 5) {
        markedCells[cell.col][cell.row] = !markedCells[cell.col][cell.row];
      }
    }

    const { error: updateError } = await supabase
      .from('players')
      .update({ marked_cells: markedCells })
      .eq('id', playerId);

    if (updateError) {
      console.error('Update error:', updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to mark cells' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        cellsUpdated: cells.length,
        requestId
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