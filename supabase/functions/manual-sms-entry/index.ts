import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ManualSMSPayload {
  adminKey: string;
  sender: string;
  message: string;
  timestamp?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        {
          status: 405,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const payload: ManualSMSPayload = await req.json();

    if (!payload.adminKey || !payload.sender || !payload.message) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: adminKey, sender, message" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const validAdminKey = Deno.env.get("ADMIN_KEY");
    if (!validAdminKey || payload.adminKey !== validAdminKey) {
      return new Response(
        JSON.stringify({ error: "Invalid admin key" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: existingMsg } = await supabaseClient
      .from("bank_sms_messages")
      .select("id")
      .eq("message_text", payload.message)
      .gte("received_at", fiveMinutesAgo)
      .maybeSingle();

    if (existingMsg) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "Duplicate SMS ignored (already exists)",
          duplicate: true 
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
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
        console.log("Invalid timestamp format, using server time:", payload.timestamp);
      }
    }

    const { data: smsData, error: insertError } = await supabaseClient
      .from("bank_sms_messages")
      .insert({
        sender: payload.sender,
        message_text: payload.message,
        received_at: receivedAt,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error inserting SMS:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to store SMS", details: insertError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log("Manual SMS stored successfully:", smsData.id);

    return new Response(
      JSON.stringify({
        success: true,
        message: "SMS added successfully",
        sms_id: smsData.id,
        parsed_amount: smsData.amount,
        parsed_transaction: smsData.transaction_number,
        parsed_sender_phone: smsData.sender_phone,
        parsed_sender_name: smsData.sender_name,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
