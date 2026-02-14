import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { from_telegram_id, to_username, amount, balance_type } = await req.json();

    if (!from_telegram_id || !to_username || !amount) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields" }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    if (amount < 10) {
      return new Response(
        JSON.stringify({ success: false, error: "Minimum transfer amount is 10 ETB" }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const balanceTypeToUse = balance_type || 'won';
    if (!['deposited', 'won'].includes(balanceTypeToUse)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid balance type" }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const { data: recipient } = await supabaseClient
      .from("telegram_users")
      .select("telegram_user_id, telegram_username, telegram_first_name")
      .ilike("telegram_username", to_username)
      .maybeSingle();

    if (!recipient) {
      return new Response(
        JSON.stringify({ success: false, error: "Recipient not found" }),
        {
          status: 404,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const { data: result, error } = await supabaseClient.rpc("transfer_balance", {
      from_telegram_id: from_telegram_id,
      transfer_amount: amount,
      to_telegram_id: recipient.telegram_user_id,
      balance_type_param: balanceTypeToUse,
    });

    if (error) {
      return new Response(
        JSON.stringify({ success: false, error: error.message }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    if (result && !result.success) {
      return new Response(
        JSON.stringify(result),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Successfully transferred ${amount} ETB from ${balanceTypeToUse} balance to @${to_username}`,
        recipient_name: recipient.telegram_first_name,
        amount: amount,
        balance_type: balanceTypeToUse,
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});