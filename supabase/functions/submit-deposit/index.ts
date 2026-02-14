import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { transactionHash, telegramUserId } = await req.json();

    if (!transactionHash || !telegramUserId) {
      throw new Error("Transaction hash and telegram user ID are required");
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Get settings
    const { data: settings } = await supabaseClient
      .from("settings")
      .select("id, value")
      .in("id", [
        "deposit_contract_address",
        "deposit_bsc_rpc_url",
        "deposit_conversion_rate",
        "deposit_required_confirmations",
      ]);

    if (!settings || settings.length === 0) {
      throw new Error("Deposit settings not configured");
    }

    const contractAddress = settings.find(
      (s) => s.id === "deposit_contract_address"
    )?.value;
    const rpcUrl = settings.find((s) => s.id === "deposit_bsc_rpc_url")?.value;
    const requiredConfirmations = parseInt(
      settings.find((s) => s.id === "deposit_required_confirmations")?.value ||
        "3"
    );

    if (!contractAddress || contractAddress === "") {
      throw new Error("Contract address not configured");
    }

    // Check if transaction already exists
    const { data: existing } = await supabaseClient
      .from("deposit_transactions")
      .select("*")
      .eq("transaction_hash", transactionHash)
      .maybeSingle();

    if (existing) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "Transaction already recorded",
          transaction: existing,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Fetch transaction receipt from blockchain
    const receiptResponse = await fetch(rpcUrl!, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_getTransactionReceipt",
        params: [transactionHash],
        id: 1,
      }),
    });

    const receiptData = await receiptResponse.json();
    const receipt = receiptData.result;

    if (!receipt) {
      throw new Error("Transaction not found on blockchain");
    }

    if (receipt.status !== "0x1") {
      throw new Error("Transaction failed on blockchain");
    }

    // Verify transaction is to our contract
    if (receipt.to.toLowerCase() !== contractAddress.toLowerCase()) {
      throw new Error("Transaction is not to the deposit contract");
    }

    // Get current block number
    const currentBlockResponse = await fetch(rpcUrl!, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_blockNumber",
        params: [],
        id: 1,
      }),
    });

    const currentBlockData = await currentBlockResponse.json();
    const currentBlock = parseInt(currentBlockData.result, 16);
    const blockNumber = parseInt(receipt.blockNumber, 16);
    const confirmations = currentBlock - blockNumber;

    // Find Deposit event in logs
    const depositEventSignature =
      "0x8752a472e571a816aea92eec8dae9baf628e840f4929fbcc2d155e6233ff68a7";

    const depositLog = receipt.logs.find(
      (log: any) =>
        log.topics[0] === depositEventSignature &&
        log.address.toLowerCase() === contractAddress.toLowerCase()
    );

    if (!depositLog) {
      throw new Error("No deposit event found in transaction");
    }

    // Extract data from log
    const depositor = "0x" + depositLog.topics[1].slice(26);
    const data = depositLog.data.slice(2);

    // Parse data
    const amount = BigInt("0x" + data.slice(0, 64));
    const userIdOffset = parseInt(data.slice(64, 128), 16) * 2;
    const userIdLength = parseInt(data.slice(userIdOffset, userIdOffset + 64), 16) * 2;
    const userId = Buffer.from(
      data.slice(userIdOffset + 64, userIdOffset + 64 + userIdLength),
      "hex"
    ).toString("utf8");
    const gameCredits = BigInt("0x" + data.slice(128, 192));

    // Verify user ID matches
    if (userId !== telegramUserId.toString()) {
      throw new Error("Transaction user ID does not match your account");
    }

    // Convert amounts
    const amountBnb = Number(amount) / 1e18;
    const gameCreditsNum = Number(gameCredits);

    // Determine status
    const status =
      confirmations >= requiredConfirmations ? "confirmed" : "pending";

    // Insert transaction
    const { data: newTransaction, error: insertError } = await supabaseClient
      .from("deposit_transactions")
      .insert({
        transaction_hash: transactionHash,
        wallet_address: depositor.toLowerCase(),
        telegram_user_id: parseInt(userId),
        amount_bnb: amountBnb,
        amount_credits: gameCreditsNum,
        status,
        block_number: blockNumber,
        confirmations,
      })
      .select()
      .single();

    if (insertError) {
      throw insertError;
    }

    return new Response(
      JSON.stringify({
        success: true,
        message:
          status === "confirmed"
            ? "Deposit confirmed and credited to your account"
            : `Deposit pending (${confirmations}/${requiredConfirmations} confirmations)`,
        transaction: newTransaction,
        confirmations,
        requiredConfirmations,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error submitting deposit:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
