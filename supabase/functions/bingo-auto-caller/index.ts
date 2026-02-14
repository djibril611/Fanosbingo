import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: activeGames } = await supabase
      .from('games')
      .select('*')
      .eq('status', 'playing');

    if (!activeGames || activeGames.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No active games' }),
        {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    }

    const results = [];

    for (const game of activeGames) {
      const lastCall = game.last_number_called_at ? new Date(game.last_number_called_at).getTime() : 0;
      const now = Date.now();
      const timeSinceLastCall = now - lastCall;

      if (timeSinceLastCall < 3500) {
        continue;
      }

      const calledNumbers = game.called_numbers || [];

      // Check if all 75 numbers have been called
      if (calledNumbers.length >= 75) {
        const finishedAt = new Date();
        const returnToLobbyAt = new Date(finishedAt.getTime() + 7000);

        await supabase
          .from('games')
          .update({
            status: 'finished',
            finished_at: finishedAt.toISOString(),
            return_to_lobby_at: returnToLobbyAt.toISOString()
          })
          .eq('id', game.id);
        results.push({ gameId: game.id, status: 'finished', reason: 'all_numbers_called' });
        continue;
      }

      const remainingNumbers = Array.from({ length: 75 }, (_, i) => i + 1)
        .filter(num => !calledNumbers.includes(num));

      if (remainingNumbers.length === 0) {
        const finishedAt = new Date();
        const returnToLobbyAt = new Date(finishedAt.getTime() + 7000);

        await supabase
          .from('games')
          .update({
            status: 'finished',
            finished_at: finishedAt.toISOString(),
            return_to_lobby_at: returnToLobbyAt.toISOString()
          })
          .eq('id', game.id);
        results.push({ gameId: game.id, status: 'finished' });
        continue;
      }

      const newNumber = remainingNumbers[Math.floor(Math.random() * remainingNumbers.length)];
      const updatedCalledNumbers = [...calledNumbers, newNumber];

      await supabase
        .from('games')
        .update({
          current_number: newNumber,
          called_numbers: updatedCalledNumbers,
          last_number_called_at: new Date().toISOString(),
        })
        .eq('id', game.id);

      results.push({ gameId: game.id, numberCalled: newNumber });
    }

    return new Response(
      JSON.stringify({ results }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }
});