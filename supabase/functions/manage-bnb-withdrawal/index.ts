import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ManageRequest {
  withdrawal_id: string;
  action: "complete" | "refund";
  admin_key: string;
  transaction_hash?: string;
  reason?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const payload: ManageRequest = await req.json();
    const validAdminKey = Deno.env.get("ADMIN_KEY");

    if (!payload.withdrawal_id || !payload.action || !payload.admin_key) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!validAdminKey || payload.admin_key !== validAdminKey) {
      return new Response(
        JSON.stringify({ error: "Invalid admin key" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    if (payload.action === "complete") {
      if (!payload.transaction_hash) {
        return new Response(
          JSON.stringify({ error: "Transaction hash is required to complete" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const { data, error } = await supabaseClient.rpc(
        "complete_bnb_withdrawal",
        {
          p_withdrawal_id: payload.withdrawal_id,
          p_transaction_hash: payload.transaction_hash,
        }
      );

      if (error) throw error;

      if (!data) {
        return new Response(
          JSON.stringify({
            error: "Withdrawal not found or already completed",
          }),
          {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      return new Response(
        JSON.stringify({ success: true, message: "Withdrawal completed" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    } else if (payload.action === "refund") {
      const { data, error } = await supabaseClient.rpc(
        "refund_bnb_withdrawal",
        {
          p_withdrawal_id: payload.withdrawal_id,
          p_error_message: payload.reason || "Refunded by admin",
        }
      );

      if (error) throw error;

      if (!data) {
        return new Response(
          JSON.stringify({
            error: "Withdrawal not found or cannot be refunded",
          }),
          {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      return new Response(
        JSON.stringify({ success: true, message: "Withdrawal refunded" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    } else {
      return new Response(JSON.stringify({ error: "Invalid action" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (error: unknown) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
