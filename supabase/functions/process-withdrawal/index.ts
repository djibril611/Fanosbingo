import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ProcessWithdrawalRequest {
  withdrawal_id: string;
  action: "process" | "complete" | "reject";
  admin_key: string;
  rejection_reason?: string;
  admin_notes?: string;
}

async function sendTelegramMessage(
  botToken: string,
  chatId: number,
  text: string
) {
  const telegramUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;

  const response = await fetch(telegramUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      parse_mode: "HTML",
    }),
  });

  return response.json();
}

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

    const payload: ProcessWithdrawalRequest = await req.json();
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

    const { data: withdrawal, error: fetchError } = await supabaseClient
      .from("withdrawal_requests")
      .select("*")
      .eq("id", payload.withdrawal_id)
      .single();

    if (fetchError || !withdrawal) {
      return new Response(
        JSON.stringify({ error: "Withdrawal request not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { data: settingData } = await supabaseClient
      .from("settings")
      .select("value")
      .eq("id", "telegram_bot_token")
      .single();

    const botToken = settingData?.value || Deno.env.get("TELEGRAM_BOT_TOKEN");

    if (payload.action === "process") {
      if (withdrawal.status !== "pending") {
        return new Response(
          JSON.stringify({ error: "Only pending requests can be processed" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const { error: updateError } = await supabaseClient
        .from("withdrawal_requests")
        .update({
          status: "processing",
          processed_by_admin: "admin",
          admin_notes: payload.admin_notes || null,
        })
        .eq("id", payload.withdrawal_id);

      if (updateError) {
        throw updateError;
      }

      if (botToken) {
        await sendTelegramMessage(
          botToken,
          withdrawal.telegram_user_id,
          `⏳ <b>Withdrawal Processing</b>\n\nYour withdrawal request of <b>${withdrawal.amount} ETB</b> is now being processed.\n\nThe money will be transferred to your ${withdrawal.bank_name} account shortly.\n\nRequest ID: ${withdrawal.id.substring(0, 8)}`
        );
      }

      return new Response(
        JSON.stringify({ success: true, message: "Withdrawal marked as processing" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    } else if (payload.action === "complete") {
      if (withdrawal.status !== "processing") {
        return new Response(
          JSON.stringify({ error: "Only processing requests can be completed" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const { data: user, error: userError } = await supabaseClient
        .from("telegram_users")
        .select("won_balance, balance")
        .eq("telegram_user_id", withdrawal.telegram_user_id)
        .single();

      if (userError || !user) {
        return new Response(
          JSON.stringify({ error: "User not found" }),
          {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      if (user.won_balance < withdrawal.amount) {
        return new Response(
          JSON.stringify({ error: "Insufficient won balance. Only winnings can be withdrawn." }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const newWonBalance = Number(user.won_balance) - Number(withdrawal.amount);
      const newBalance = Number(user.balance) - Number(withdrawal.amount);

      const { error: balanceError } = await supabaseClient
        .from("telegram_users")
        .update({
          won_balance: newWonBalance,
          balance: newBalance
        })
        .eq("telegram_user_id", withdrawal.telegram_user_id);

      if (balanceError) {
        throw balanceError;
      }

      const { error: updateError } = await supabaseClient
        .from("withdrawal_requests")
        .update({
          status: "completed",
          processed_at: new Date().toISOString(),
          admin_notes: payload.admin_notes || withdrawal.admin_notes,
        })
        .eq("id", payload.withdrawal_id);

      if (updateError) {
        throw updateError;
      }

      if (botToken) {
        await sendTelegramMessage(
          botToken,
          withdrawal.telegram_user_id,
          `✅ <b>Withdrawal Completed!</b>\n\n💰 Amount: <b>${withdrawal.amount} ETB</b>\n🏦 Bank: ${withdrawal.bank_name}\n📱 Account: ${withdrawal.account_number}\n\n💳 New Won Balance: <b>${newWonBalance} ETB</b>\n💰 Total Balance: <b>${newBalance} ETB</b>\n\nThe money has been transferred to your account. Thank you!\n\nRequest ID: ${withdrawal.id.substring(0, 8)}`
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: "Withdrawal completed",
          new_balance: newBalance,
          new_won_balance: newWonBalance
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    } else if (payload.action === "reject") {
      if (withdrawal.status === "completed") {
        return new Response(
          JSON.stringify({ error: "Cannot reject completed withdrawal" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      if (!payload.rejection_reason) {
        return new Response(
          JSON.stringify({ error: "Rejection reason is required" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const { error: updateError } = await supabaseClient
        .from("withdrawal_requests")
        .update({
          status: "rejected",
          processed_at: new Date().toISOString(),
          processed_by_admin: "admin",
          rejection_reason: payload.rejection_reason,
          admin_notes: payload.admin_notes || withdrawal.admin_notes,
        })
        .eq("id", payload.withdrawal_id);

      if (updateError) {
        throw updateError;
      }

      if (botToken) {
        await sendTelegramMessage(
          botToken,
          withdrawal.telegram_user_id,
          `❌ <b>Withdrawal Request Rejected</b>\n\n💰 Amount: ${withdrawal.amount} ETB\n\n<b>Reason:</b> ${payload.rejection_reason}\n\nYour balance remains unchanged: <b>${(await supabaseClient.from("telegram_users").select("balance").eq("telegram_user_id", withdrawal.telegram_user_id).single()).data?.balance || 0} ETB</b>\n\nIf you have questions, please contact support.\n\nRequest ID: ${withdrawal.id.substring(0, 8)}`
        );
      }

      return new Response(
        JSON.stringify({ success: true, message: "Withdrawal rejected" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    } else {
      return new Response(
        JSON.stringify({ error: "Invalid action" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }
  } catch (error) {
    console.error("Error processing withdrawal:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});