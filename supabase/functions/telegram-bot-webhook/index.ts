import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
}

interface TelegramMessage {
  message_id: number;
  from: TelegramUser;
  chat: {
    id: number;
    type: string;
  };
  text?: string;
}

interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

async function sendTelegramMessage(
  botToken: string,
  chatId: number,
  text: string,
  replyMarkup?: any
) {
  const telegramUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;

  const body: any = {
    chat_id: chatId,
    text: text,
    parse_mode: "HTML",
  };

  if (replyMarkup) {
    body.reply_markup = replyMarkup;
  }

  const response = await fetch(telegramUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  return response.json();
}

async function answerCallbackQuery(
  botToken: string,
  callbackQueryId: string,
  text?: string
) {
  const telegramUrl = `https://api.telegram.org/bot${botToken}/answerCallbackQuery`;

  const body: any = {
    callback_query_id: callbackQueryId,
  };

  if (text) {
    body.text = text;
  }

  const response = await fetch(telegramUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
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

    const { data: settingData } = await supabaseClient
      .from("settings")
      .select("value")
      .eq("id", "telegram_bot_token")
      .single();

    const botToken = settingData?.value || Deno.env.get("TELEGRAM_BOT_TOKEN");

    if (!botToken) {
      return new Response(
        JSON.stringify({ error: "Bot token not configured" }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const update: TelegramUpdate = await req.json();

    if (update.callback_query) {
      const callbackQuery = update.callback_query;
      const chatId = callbackQuery.message?.chat.id;
      const user = callbackQuery.from;
      const data = callbackQuery.data;

      let handled = false;

      if (chatId && data && data.startsWith("transfer_type:")) {
        handled = true;
        const balanceType = data.replace("transfer_type:", "");

        const { data: existingUser } = await supabaseClient
          .from("telegram_users")
          .select("won_balance, deposited_balance")
          .eq("telegram_user_id", user.id)
          .maybeSingle();

        const selectedBalance = balanceType === "won" ? existingUser?.won_balance : existingUser?.deposited_balance;

        if (!selectedBalance || selectedBalance < 10) {
          await sendTelegramMessage(
            botToken,
            chatId,
            `❌ Insufficient ${balanceType} balance. Minimum 10 ETB required.\n\nUse /transfer to try again.`
          );
          await supabaseClient
            .from("user_state")
            .delete()
            .eq("telegram_user_id", user.id);
          await answerCallbackQuery(botToken, callbackQuery.id, "Insufficient balance");
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        await supabaseClient
          .from("user_state")
          .upsert({
            telegram_user_id: user.id,
            current_action: "transfer_username",
            state_data: { balance_type: balanceType },
            updated_at: new Date().toISOString(),
          });

        await sendTelegramMessage(
          botToken,
          chatId,
          `✅ Selected: <b>${balanceType === 'won' ? 'Won' : 'Deposited'} Balance</b> (${selectedBalance} ETB)\n\n👤 Please enter the recipient's Telegram username:\n\nExample: @username`
        );

        await answerCallbackQuery(botToken, callbackQuery.id);
      }

      if (!handled) {
        console.log(`Unhandled callback query: ${data}`);
        await answerCallbackQuery(botToken, callbackQuery.id, "Action not recognized");
        if (chatId) {
          await sendTelegramMessage(
            botToken,
            chatId,
            "❌ Unknown action. Please try again or use /start for help."
          );
        }
      }

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      });
    }

    if (!update.message || !update.message.text) {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      });
    }

    const message = update.message;
    const chatId = message.chat.id;
    const text = message.text;
    const user = message.from;

    const { data: userState } = await supabaseClient
      .from("user_state")
      .select("*")
      .eq("telegram_user_id", user.id)
      .maybeSingle();

    if (userState && userState.current_action && userState.current_action.startsWith("transfer_")) {
      const action = userState.current_action;
      const stateData = userState.state_data || {};

      if (action === "transfer_username") {
        let username = text.trim();
        if (username.startsWith("@")) {
          username = username.substring(1);
        }

        if (username.length < 3) {
          await sendTelegramMessage(
            botToken,
            chatId,
            "❌ Invalid username. Please enter a valid Telegram username.\n\nExample: @username"
          );
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const { data: recipient } = await supabaseClient
          .from("telegram_users")
          .select("telegram_user_id, telegram_username, telegram_first_name")
          .ilike("telegram_username", username)
          .maybeSingle();

        if (!recipient) {
          await sendTelegramMessage(
            botToken,
            chatId,
            `❌ User @${username} not found or not registered.\n\nPlease make sure the user is registered in the bot first.\n\nTry again or use /transfer to cancel.`
          );
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        if (recipient.telegram_user_id === user.id) {
          await sendTelegramMessage(
            botToken,
            chatId,
            "❌ You cannot transfer to yourself.\n\nPlease enter a different username."
          );
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        await supabaseClient
          .from("user_state")
          .upsert({
            telegram_user_id: user.id,
            current_action: "transfer_amount",
            state_data: {
              ...stateData,
              recipient_id: recipient.telegram_user_id,
              recipient_username: recipient.telegram_username,
              recipient_name: recipient.telegram_first_name
            },
            updated_at: new Date().toISOString(),
          });

        await sendTelegramMessage(
          botToken,
          chatId,
          `✅ Recipient: <b>@${recipient.telegram_username}</b> (${recipient.telegram_first_name})\n\n💰 How much would you like to transfer?\n\nPlease enter the amount in ETB:\n\nExample: 50`
        );
      } else if (action === "transfer_amount") {
        const amount = parseInt(text);

        if (isNaN(amount) || amount <= 0) {
          await sendTelegramMessage(
            botToken,
            chatId,
            "❌ Invalid amount. Please enter a valid number.\n\nExample: 50"
          );
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        if (amount < 10) {
          await sendTelegramMessage(
            botToken,
            chatId,
            "❌ Minimum transfer amount is <b>10 ETB</b>.\n\nPlease enter an amount of 10 ETB or more."
          );
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const balanceType = stateData.balance_type || 'won';

        const { data: transferResult } = await supabaseClient.rpc(
          "transfer_balance",
          {
            from_telegram_id: user.id,
            transfer_amount: amount,
            to_telegram_id: stateData.recipient_id,
            balance_type_param: balanceType,
          }
        );

        await supabaseClient
          .from("user_state")
          .delete()
          .eq("telegram_user_id", user.id);

        if (transferResult && transferResult.success) {
          const { data: updatedUser } = await supabaseClient
            .from("telegram_users")
            .select("balance, won_balance, deposited_balance")
            .eq("telegram_user_id", user.id)
            .single();

          await sendTelegramMessage(
            botToken,
            chatId,
            `✅ <b>Transfer Successful!</b>\n\n💰 Amount: <b>${amount} ETB</b>\n📝 From: <b>${balanceType === 'won' ? 'Won' : 'Deposited'} Balance</b>\n👤 Recipient: @${stateData.recipient_username}\n\n💵 Your new balance: <b>${updatedUser.balance} ETB</b>\n🏆 Won balance: <b>${updatedUser.won_balance} ETB</b>\n💵 Deposited balance: <b>${updatedUser.deposited_balance} ETB</b>\n\nThe recipient has been notified.`
          );

          await sendTelegramMessage(
            botToken,
            stateData.recipient_id,
            `🎁 <b>You received a transfer!</b>\n\n💰 Amount: <b>${amount} ETB</b>\n👤 From: ${user.first_name}${user.username ? ` (@${user.username})` : ''}\n\nThe amount has been added to your deposited balance. Check /balance for details.`
          );
        } else {
          const errorMsg = transferResult?.error || "Unknown error";
          await sendTelegramMessage(
            botToken,
            chatId,
            `❌ Transfer failed: ${errorMsg}\n\nPlease try again or contact support.`
          );
        }

        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      });
    }

    if (text.startsWith("/start") || text.startsWith("/register")) {
      await supabaseClient
        .from("user_state")
        .delete()
        .eq("telegram_user_id", user.id);

      const referralCode = text.startsWith("/start ") ? text.split(" ")[1] : null;

      const { data: existingUser } = await supabaseClient
        .from("telegram_users")
        .select("*")
        .eq("telegram_user_id", user.id)
        .maybeSingle();

      let userData;
      let isNewUser = false;
      let referralBonus = 0;

      if (!existingUser) {
        const { data: newUser, error } = await supabaseClient
          .from("telegram_users")
          .insert({
            telegram_user_id: user.id,
            telegram_username: user.username,
            telegram_first_name: user.first_name,
            telegram_last_name: user.last_name,
            balance: 10,
            deposited_balance: 10,
            last_active_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (error) {
          console.error("Error creating user:", error);
          await sendTelegramMessage(
            botToken,
            chatId,
            "Sorry, there was an error registering your account. Please try again."
          );
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          });
        }

        userData = newUser;
        isNewUser = true;

        if (referralCode) {
          const { data: bonusResult } = await supabaseClient.rpc(
            "handle_referral_bonus",
            {
              new_user_telegram_id: user.id,
              referrer_code: referralCode,
            }
          );

          if (bonusResult && bonusResult.success) {
            referralBonus = bonusResult.new_user_bonus;

            const { data: updatedUser } = await supabaseClient
              .from("telegram_users")
              .select("balance, deposited_balance")
              .eq("telegram_user_id", user.id)
              .single();

            userData = { ...userData, ...updatedUser };
          }
        }
      } else {
        await supabaseClient
          .from("telegram_users")
          .update({ last_active_at: new Date().toISOString() })
          .eq("telegram_user_id", user.id);

        userData = existingUser;
      }

      if (text.startsWith("/register")) {
        if (isNewUser) {
          const totalBonus = 10 + referralBonus;
          let message = `✅ You are now registered!\n\n💰 Welcome bonus: <b>10 ETB</b>`;
          if (referralBonus > 0) {
            message += `\n🎁 Referral bonus: <b>${referralBonus} ETB</b>`;
            message += `\n\n💵 Total received: <b>${totalBonus} ETB</b>`;
          }
          message += `\n\nClick /play to start the game.`;

          await sendTelegramMessage(botToken, chatId, message);
        } else {
          await sendTelegramMessage(
            botToken,
            chatId,
            `You are already registered. Click /play to start the game.`
          );
        }
      } else {
        let welcomeMessage;
        if (isNewUser) {
          const totalBonus = 10 + referralBonus;
          welcomeMessage = `🎉 Welcome to Multiplayer Bingo, ${user.first_name}!\n\n💰 Welcome bonus: <b>10 ETB</b>`;
          if (referralBonus > 0) {
            welcomeMessage += `\n🎁 Referral bonus: <b>${referralBonus} ETB</b>`;
            welcomeMessage += `\n\n💵 Total balance: <b>${totalBonus} ETB</b>`;
          }
          welcomeMessage += `\n\n🎮 Tap the button below to start playing!`;
        } else {
          welcomeMessage = `👋 Welcome back, ${user.first_name}!\n\n💰 Your balance: <b>${userData.balance} ETB</b>\n\n🎮 Ready to play? Tap the button below!`;
        }

        const { data: gameUrlData } = await supabaseClient
          .from("settings")
          .select("value")
          .eq("id", "game_url")
          .maybeSingle();

        const appUrl = gameUrlData?.value || "https://multiplayer-bingo-we-5btk.bolt.host/";

        await sendTelegramMessage(
          botToken,
          chatId,
          welcomeMessage,
          {
            inline_keyboard: [
              [
                {
                  text: "🎮 Play Bingo",
                  web_app: { url: appUrl },
                },
              ],
            ],
          }
        );
      }
    } else if (text.startsWith("/play")) {
      await supabaseClient
        .from("user_state")
        .delete()
        .eq("telegram_user_id", user.id);

      const { data: existingUser } = await supabaseClient
        .from("telegram_users")
        .select("*")
        .eq("telegram_user_id", user.id)
        .maybeSingle();

      if (!existingUser) {
        await sendTelegramMessage(
          botToken,
          chatId,
          "Please register first by using /register"
        );
      } else {
        await supabaseClient
          .from("telegram_users")
          .update({ last_active_at: new Date().toISOString() })
          .eq("telegram_user_id", user.id);

        const { data: gameUrlData } = await supabaseClient
          .from("settings")
          .select("value")
          .eq("id", "game_url")
          .maybeSingle();

        const appUrl = gameUrlData?.value || "https://multiplayer-bingo-we-5btk.bolt.host/";

        await sendTelegramMessage(
          botToken,
          chatId,
          `🍀 Best of luck on your gaming adventure! 🎮`,
          {
            inline_keyboard: [
              [
                {
                  text: "🎮 Play-10",
                  web_app: { url: appUrl },
                },
              ],
            ],
          }
        );
      }
    } else if (text.startsWith("/balance")) {
      await supabaseClient
        .from("user_state")
        .delete()
        .eq("telegram_user_id", user.id);

      const { data: existingUser } = await supabaseClient
        .from("telegram_users")
        .select("*")
        .eq("telegram_user_id", user.id)
        .maybeSingle();

      if (!existingUser) {
        await sendTelegramMessage(
          botToken,
          chatId,
          "Please register first by using /register"
        );
      } else {
        await supabaseClient
          .from("telegram_users")
          .update({ last_active_at: new Date().toISOString() })
          .eq("telegram_user_id", user.id);

        const { data: pendingWithdrawals } = await supabaseClient
          .from("withdrawal_requests")
          .select("amount")
          .eq("telegram_user_id", user.id)
          .in("status", ["pending", "processing"]);

        const pendingAmount = pendingWithdrawals?.reduce((sum: number, w: any) => sum + Number(w.amount), 0) || 0;
        const availableWonBalance = Number(existingUser.won_balance || 0) - pendingAmount;

        let balanceMessage = `💰 <b>Your Balance</b>\n\n`;
        balanceMessage += `🎮 Total balance: <b>${existingUser.balance} ETB</b>\n`;
        balanceMessage += `🏆 Won balance: <b>${existingUser.won_balance || 0} ETB</b>\n`;
        balanceMessage += `💵 Deposited balance: <b>${existingUser.deposited_balance || 0} ETB</b>`;

        if (pendingAmount > 0) {
          balanceMessage += `\n\n⏳ Pending withdrawals: <b>${pendingAmount} ETB</b>\n✅ Available for withdrawal: <b>${availableWonBalance} ETB</b>`;
        } else {
          balanceMessage += `\n\n✅ Available for withdrawal: <b>${availableWonBalance} ETB</b>`;
        }

        balanceMessage += `\n\n⚠️ <i>Note: Only won balance can be withdrawn. Deposited money can only be used to play games.</i>`;

        await sendTelegramMessage(
          botToken,
          chatId,
          balanceMessage
        );
      }
    } else if (text.startsWith("/invite")) {
      await supabaseClient
        .from("user_state")
        .delete()
        .eq("telegram_user_id", user.id);

      const { data: existingUser } = await supabaseClient
        .from("telegram_users")
        .select("referral_code, total_referrals")
        .eq("telegram_user_id", user.id)
        .maybeSingle();

      if (!existingUser) {
        await sendTelegramMessage(
          botToken,
          chatId,
          "Please register first by using /register"
        );
      } else {
        const { data: botUsernameData } = await supabaseClient
          .from("settings")
          .select("value")
          .eq("id", "telegram_bot_username")
          .maybeSingle();

        const botUsername = botUsernameData?.value || Deno.env.get("TELEGRAM_BOT_USERNAME") || "your_bot";
        const inviteLink = `https://t.me/${botUsername}?start=${existingUser.referral_code}`;

        await sendTelegramMessage(
          botToken,
          chatId,
          `🎁 <b>Invite Friends & Earn!</b>\n\n💰 Get <b>5 ETB</b> for every friend who joins using your link!\n🎁 Your friend also gets <b>10 ETB</b> welcome bonus!\n\n🔗 <b>Your Referral Link:</b>\n<code>${inviteLink}</code>\n\n📊 Total referrals: <b>${existingUser.total_referrals || 0}</b>\n💵 Total earned: <b>${(existingUser.total_referrals || 0) * 5} ETB</b>\n\n📤 Share this link with your friends and start earning!`
        );
      }
    } else if (text.startsWith("/instructions")) {
      await supabaseClient
        .from("user_state")
        .delete()
        .eq("telegram_user_id", user.id);

      const { data: existingUser } = await supabaseClient
        .from("telegram_users")
        .select("*")
        .eq("telegram_user_id", user.id)
        .maybeSingle();

      if (!existingUser) {
        await sendTelegramMessage(
          botToken,
          chatId,
          "Please register first by using /register"
        );
      } else {
        const { data: instructionsData } = await supabaseClient
          .from("settings")
          .select("value")
          .eq("id", "user_instructions")
          .maybeSingle();

        const instructions = instructionsData?.value || "📖 No instructions have been set yet. Please contact support.";

        await sendTelegramMessage(
          botToken,
          chatId,
          `📖 <b>Instructions</b>\n\n${instructions}`
        );
      }
    } else if (text.startsWith("/transfer")) {
      await supabaseClient
        .from("user_state")
        .delete()
        .eq("telegram_user_id", user.id);

      const { data: existingUser } = await supabaseClient
        .from("telegram_users")
        .select("*")
        .eq("telegram_user_id", user.id)
        .maybeSingle();

      if (!existingUser) {
        await sendTelegramMessage(
          botToken,
          chatId,
          "Please register first by using /register"
        );
      } else {
        await sendTelegramMessage(
          botToken,
          chatId,
          `💸 <b>Transfer Balance</b>\n\n💰 Your balances:\n🏆 Won balance: <b>${existingUser.won_balance || 0} ETB</b> (withdrawable)\n💵 Deposited balance: <b>${existingUser.deposited_balance || 0} ETB</b> (play only)\n\n📝 <b>Select which balance to transfer:</b>`,
          {
            inline_keyboard: [
              [
                { text: `🏆 Won Balance (${existingUser.won_balance || 0} ETB)`, callback_data: "transfer_type:won" }
              ],
              [
                { text: `💵 Deposited Balance (${existingUser.deposited_balance || 0} ETB)`, callback_data: "transfer_type:deposited" }
              ]
            ]
          }
        );
      }
    } else {
      const { data: existingUser } = await supabaseClient
        .from("telegram_users")
        .select("*")
        .eq("telegram_user_id", user.id)
        .maybeSingle();

      if (!existingUser) {
        await sendTelegramMessage(
          botToken,
          chatId,
          "Please register first by using /register"
        );
      } else {
        const smsKeywords = /\b(ETB|Birr|KES|Ksh|KSH|received|confirmed|transaction|mpesa|M-PESA|deposited|credited|from|account|transfer|payment|CBE|telebirr)\b/i;

        if (smsKeywords.test(text)) {
          const { data: submission, error } = await supabaseClient
            .from("user_sms_submissions")
            .insert({
              telegram_user_id: user.id,
              sms_text: text,
            })
            .select()
            .single();

          if (error) {
            console.error("Error submitting SMS:", error);
            await sendTelegramMessage(
              botToken,
              chatId,
              "❌ Sorry, there was an error processing your SMS. Please try again or contact support."
            );
          } else if (submission.status === "matched") {
            const { data: updatedUser } = await supabaseClient
              .from("telegram_users")
              .select("balance")
              .eq("telegram_user_id", user.id)
              .single();

            await sendTelegramMessage(
              botToken,
              chatId,
              `✅ Deposit Verified!\n\n💰 Amount: <b>${submission.amount} ETB</b>\n💳 Your new balance: <b>${updatedUser.balance} ETB</b>\n\nThank you for your deposit! You can start playing now.`
            );
          } else {
            await sendTelegramMessage(
              botToken,
              chatId,
              `⏳ SMS Received!\n\nWe're processing your deposit. This usually takes a few moments.\n\n💡 If we received the bank SMS, your account will be credited automatically.\n\nYou'll get a confirmation message once the deposit is verified.\n\nℹ️ Amount detected: <b>${submission.amount || 'N/A'} ETB</b>`
            );
          }
        } else {
          await sendTelegramMessage(
            botToken,
            chatId,
            `ℹ️ Available Commands:\n\n/start - Start the bot\n/register - Register your account\n/play - Open the game\n/balance - Check your balance\n/transfer - Transfer balance to another user\n/invite - Get your referral link & earn rewards\n/instructions - View game instructions`
          );
        }
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    console.error("Error processing webhook:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
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