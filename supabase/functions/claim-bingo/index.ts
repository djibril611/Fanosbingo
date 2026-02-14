import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const CLAIM_WINDOW_MS = 1000;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { playerId } = await req.json();

    if (!playerId) {
      return new Response(
        JSON.stringify({ error: 'Player ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: result, error: rpcError } = await supabase.rpc('atomic_claim_bingo', {
      p_player_id: playerId,
      p_claim_window_ms: CLAIM_WINDOW_MS
    });

    if (rpcError) {
      console.error('RPC error:', rpcError);
      return new Response(
        JSON.stringify({ error: 'Failed to process claim' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (result.error) {
      return new Response(
        JSON.stringify({ error: result.error }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (result.isFirstClaim) {
      setTimeout(async () => {
        try {
          const { data: game } = await supabase
            .from('games')
            .select('id, status, winner_ids, winner_prize, claim_window_start')
            .eq('status', 'playing')
            .not('claim_window_start', 'is', null)
            .maybeSingle();

          if (game) {
            const claimStart = new Date(game.claim_window_start).getTime();
            const now = Date.now();
            if (now - claimStart >= CLAIM_WINDOW_MS) {
              const finalWinnerCount = game.winner_ids?.length || 1;
              const finalPrizeEach = Math.floor((game.winner_prize || 0) / finalWinnerCount);

              const finishedAt = new Date();
              const returnToLobbyAt = new Date(finishedAt.getTime() + 7000);

              await supabase
                .from('games')
                .update({
                  status: 'finished',
                  winner_prize_each: finalPrizeEach,
                  finished_at: finishedAt.toISOString(),
                  return_to_lobby_at: returnToLobbyAt.toISOString()
                })
                .eq('id', game.id)
                .eq('status', 'playing');
            }
          }
        } catch (err) {
          console.error('Error finalizing game after claim window:', err);
        }
      }, CLAIM_WINDOW_MS + 100);
    }

    return new Response(
      JSON.stringify(result),
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