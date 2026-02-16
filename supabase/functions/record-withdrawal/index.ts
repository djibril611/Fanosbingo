import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface RecordRequest {
  telegramUserId: number;
  walletAddress: string;
  amountBnb: number;
  transactionHash: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body: RecordRequest = await req.json();

    if (
      !body.telegramUserId ||
      !body.walletAddress ||
      !body.amountBnb ||
      !body.transactionHash
    ) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (
      !body.transactionHash.startsWith("0x") ||
      body.transactionHash.length < 10
    ) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid transaction hash" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: existing } = await supabaseClient
      .from("bnb_withdrawal_requests")
      .select("id")
      .eq("transaction_hash", body.transactionHash)
      .maybeSingle();

    if (existing) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "Withdrawal already recorded",
          withdrawal_id: existing.id,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { data, error } = await supabaseClient.rpc(
      "record_user_withdrawal",
      {
        p_telegram_user_id: body.telegramUserId,
        p_wallet_address: body.walletAddress,
        p_amount_bnb: body.amountBnb,
        p_transaction_hash: body.transactionHash,
      }
    );

    if (error) throw error;

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
