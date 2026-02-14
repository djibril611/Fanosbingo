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

    const { gameId, adminKey } = await req.json();
    const validAdminKey = Deno.env.get('ADMIN_KEY');

    if (!gameId || !adminKey) {
      return new Response(
        JSON.stringify({ error: 'gameId and adminKey are required' }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    }

    if (!validAdminKey || adminKey !== validAdminKey) {
      return new Response(
        JSON.stringify({ error: 'Invalid admin key' }),
        {
          status: 401,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    }

    const { data: game, error: gameError } = await supabase
      .from('games')
      .select('*')
      .eq('id', gameId)
      .maybeSingle();

    if (gameError || !game) {
      return new Response(
        JSON.stringify({ error: 'Game not found' }),
        {
          status: 404,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    }

    if (game.status === 'finished') {
      return new Response(
        JSON.stringify({ message: 'Game already finished', game }),
        {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    }

    const calledNumbers = game.called_numbers || [];

    if (calledNumbers.length >= 75) {
      const finishedAt = new Date();
      const returnToLobbyAt = new Date(finishedAt.getTime() + 7000);

      const { error: updateError } = await supabase
        .from('games')
        .update({
          status: 'finished',
          finished_at: finishedAt.toISOString(),
          return_to_lobby_at: returnToLobbyAt.toISOString()
        })
        .eq('id', gameId);

      if (updateError) {
        throw updateError;
      }

      return new Response(
        JSON.stringify({
          message: 'Game force-finished successfully',
          calledNumbers: calledNumbers.length
        }),
        {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    }

    return new Response(
      JSON.stringify({
        message: 'Game does not need to be finished yet',
        calledNumbers: calledNumbers.length,
        status: game.status
      }),
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