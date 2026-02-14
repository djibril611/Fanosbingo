import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface SMSPayload {
  sender: string;
  message: string;
  timestamp?: string;
  api_key: string;
}

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

    if (req.method !== 'POST' && req.method !== 'GET') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        {
          status: 405,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    let payload: SMSPayload;
    const contentType = req.headers.get('content-type') || '';

    if (req.method === 'GET') {
      const url = new URL(req.url);
      payload = {
        sender: url.searchParams.get('sender') || '',
        message: url.searchParams.get('message') || '',
        timestamp: url.searchParams.get('timestamp') || undefined,
        api_key: url.searchParams.get('api_key') || '',
      };
    } else if (contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await req.formData();
      payload = {
        sender: formData.get('sender')?.toString() || '',
        message: formData.get('message')?.toString() || '',
        timestamp: formData.get('timestamp')?.toString() || undefined,
        api_key: formData.get('api_key')?.toString() || '',
      };
    } else {
      payload = await req.json();
    }

    if (!payload.sender || !payload.message || !payload.api_key) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: sender, message, api_key' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { data: settingsData, error: settingsError } = await supabase
      .from('settings')
      .select('value')
      .eq('id', 'sms_api_key')
      .maybeSingle();

    if (settingsError || !settingsData) {
      console.error('Error fetching API key:', settingsError);
      return new Response(
        JSON.stringify({ error: 'Invalid API key configuration' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (payload.api_key !== settingsData.value) {
      return new Response(
        JSON.stringify({ error: 'Invalid API key' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const messageHash = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(payload.message)
    );
    const hashArray = Array.from(new Uint8Array(messageHash));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: existingMsg } = await supabase
      .from('bank_sms_messages')
      .select('id')
      .eq('message_text', payload.message)
      .gte('received_at', fiveMinutesAgo)
      .maybeSingle();

    if (existingMsg) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Duplicate SMS ignored (already received)',
          duplicate: true 
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    let receivedAt = new Date().toISOString();
    if (payload.timestamp) {
      try {
        const parsedDate = new Date(payload.timestamp);
        if (!isNaN(parsedDate.getTime())) {
          receivedAt = parsedDate.toISOString();
        }
      } catch (e) {
        console.log('Invalid timestamp format, using server time:', payload.timestamp);
      }
    }

    const { data: smsData, error: insertError } = await supabase
      .from('bank_sms_messages')
      .insert({
        sender: payload.sender,
        message_text: payload.message,
        received_at: receivedAt,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error inserting SMS:', insertError);
      return new Response(
        JSON.stringify({ error: 'Failed to store SMS', details: insertError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log('SMS stored successfully:', smsData.id);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'SMS received and stored successfully',
        sms_id: smsData.id,
        parsed_amount: smsData.amount,
        parsed_transaction: smsData.transaction_number,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});