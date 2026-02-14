import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface ManualVerificationRequest {
  submissionId: string;
  action: 'accept' | 'reject';
  bankSmsId?: string;
  rejectionReason?: string;
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

    const { submissionId, action, bankSmsId, rejectionReason }: ManualVerificationRequest = await req.json();

    if (!submissionId || !action) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: submissionId and action' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: submission, error: fetchError } = await supabase
      .from('user_sms_submissions')
      .select('*')
      .eq('id', submissionId)
      .single();

    if (fetchError || !submission) {
      return new Response(
        JSON.stringify({ error: 'Submission not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (submission.status !== 'pending') {
      return new Response(
        JSON.stringify({ error: 'Submission is not pending' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'accept') {
      if (!bankSmsId) {
        return new Response(
          JSON.stringify({ error: 'Bank SMS ID is required for acceptance' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: bankSms, error: bankSmsError } = await supabase
        .from('bank_sms_messages')
        .select('*')
        .eq('id', bankSmsId)
        .maybeSingle();

      if (bankSmsError || !bankSms) {
        return new Response(
          JSON.stringify({ error: 'Bank SMS not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (bankSms.claimed_by_user_id) {
        return new Response(
          JSON.stringify({ error: 'This bank SMS has already been claimed' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { error: updateSubmissionError } = await supabase
        .from('user_sms_submissions')
        .update({
          status: 'matched',
          matched_sms_id: bankSmsId,
          processed_at: new Date().toISOString(),
        })
        .eq('id', submissionId);

      if (updateSubmissionError) {
        throw updateSubmissionError;
      }

      const { error: updateBankSmsError } = await supabase
        .from('bank_sms_messages')
        .update({
          claimed_by_user_id: submission.telegram_user_id,
          claimed_at: new Date().toISOString(),
        })
        .eq('id', bankSmsId);

      if (updateBankSmsError) {
        throw updateBankSmsError;
      }

      const { data: user, error: userError } = await supabase
        .from('telegram_users')
        .select('balance, total_deposited')
        .eq('telegram_user_id', submission.telegram_user_id)
        .maybeSingle();

      if (userError || !user) {
        throw new Error('User not found');
      }

      const depositAmount = bankSms.amount || 0;
      const newBalance = (user.balance || 0) + depositAmount;
      const newTotalDeposited = (user.total_deposited || 0) + depositAmount;

      const { error: creditError } = await supabase
        .from('telegram_users')
        .update({
          balance: newBalance,
          total_deposited: newTotalDeposited,
        })
        .eq('telegram_user_id', submission.telegram_user_id);

      if (creditError) {
        throw creditError;
      }

      try {
        const notifyUrl = `${supabaseUrl}/functions/v1/telegram-notify`;
        await fetch(notifyUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            chatId: submission.telegram_user_id,
            message: `✅ <b>Deposit Verified!</b>\n\n💰 Amount: <b>${depositAmount.toFixed(2)} ETB</b>\n💳 New Balance: <b>${newBalance.toFixed(2)} ETB</b>\n\nYour deposit has been manually verified and credited to your account. You can now use it to play bingo!`,
            parseMode: 'HTML',
          }),
        });
      } catch (notifyError) {
        console.error('Failed to send Telegram notification:', notifyError);
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Submission accepted and user credited',
          amount: depositAmount,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } else if (action === 'reject') {
      const reason = rejectionReason || 'Manually rejected by admin';

      const { error: rejectError } = await supabase
        .from('user_sms_submissions')
        .update({
          status: 'rejected',
          rejection_reason: reason,
          processed_at: new Date().toISOString(),
        })
        .eq('id', submissionId);

      if (rejectError) {
        throw rejectError;
      }

      try {
        const notifyUrl = `${supabaseUrl}/functions/v1/telegram-notify`;
        await fetch(notifyUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            chatId: submission.telegram_user_id,
            message: `❌ <b>Deposit Verification Failed</b>\n\n<b>Reason:</b> ${reason}\n\nPlease make sure you:\n• Paste the complete SMS text\n• Include the transaction reference number\n• Submit within a few minutes of sending money\n\nIf you believe this is an error, please contact support.`,
            parseMode: 'HTML',
          }),
        });
      } catch (notifyError) {
        console.error('Failed to send Telegram notification:', notifyError);
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Submission rejected',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action. Must be "accept" or "reject"' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in manual SMS verification:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
