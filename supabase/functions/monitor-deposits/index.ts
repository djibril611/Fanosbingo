import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface DepositEvent {
  depositor: string;
  amount: string;
  userId: string;
  gameCredits: string;
  timestamp: string;
  transactionHash: string;
  blockNumber: number;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
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
      throw new Error("Contract address not set");
    }

    // Get the latest block we've processed
    const { data: lastTransaction } = await supabaseClient
      .from("deposit_transactions")
      .select("block_number")
      .order("block_number", { ascending: false })
      .limit(1)
      .single();

    const fromBlock = lastTransaction?.block_number
      ? lastTransaction.block_number + 1
      : "latest";

    // Fetch current block number
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

    // Fetch deposit events from the contract
    // Event signature: Deposit(address indexed depositor, uint256 amount, string userId, uint256 gameCredits, uint256 timestamp)
    const depositEventSignature =
      "0x8752a472e571a816aea92eec8dae9baf628e840f4929fbcc2d155e6233ff68a7";

    const logsResponse = await fetch(rpcUrl!, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_getLogs",
        params: [
          {
            fromBlock: fromBlock === "latest" ? "latest" : `0x${fromBlock.toString(16)}`,
            toBlock: "latest",
            address: contractAddress,
            topics: [depositEventSignature],
          },
        ],
        id: 1,
      }),
    });

    const logsData = await logsResponse.json();
    const logs = logsData.result || [];

    const newTransactions = [];

    // Process each log
    for (const log of logs) {
      try {
        const blockNumber = parseInt(log.blockNumber, 16);
        const confirmations = currentBlock - blockNumber;

        // Extract data from log
        const depositor = "0x" + log.topics[1].slice(26); // Remove leading zeros
        const transactionHash = log.transactionHash;

        // Decode non-indexed parameters (amount, userId, gameCredits, timestamp)
        const data = log.data.slice(2); // Remove 0x

        // Parse data (each parameter is 32 bytes in hex)
        const amount = BigInt("0x" + data.slice(0, 64));
        const userIdOffset = parseInt(data.slice(64, 128), 16) * 2;
        const userIdLength = parseInt(data.slice(userIdOffset, userIdOffset + 64), 16) * 2;
        const userId = Buffer.from(
          data.slice(userIdOffset + 64, userIdOffset + 64 + userIdLength),
          "hex"
        ).toString("utf8");
        const gameCredits = BigInt("0x" + data.slice(128, 192));

        // Convert amounts from wei to BNB
        const amountBnb = Number(amount) / 1e18;
        const gameCreditsNum = Number(gameCredits);

        // Check if transaction already exists
        const { data: existing } = await supabaseClient
          .from("deposit_transactions")
          .select("id")
          .eq("transaction_hash", transactionHash)
          .maybeSingle();

        if (existing) {
          // Update confirmations
          await supabaseClient
            .from("deposit_transactions")
            .update({
              confirmations,
              status:
                confirmations >= requiredConfirmations ? "confirmed" : "pending",
            })
            .eq("transaction_hash", transactionHash);
        } else {
          // Insert new transaction
          const status =
            confirmations >= requiredConfirmations ? "confirmed" : "pending";

          const { error: insertError } = await supabaseClient
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
            });

          if (insertError) {
            console.error("Error inserting transaction:", insertError);
          } else {
            newTransactions.push({
              transactionHash,
              depositor,
              userId,
              amount: amountBnb,
              credits: gameCreditsNum,
              confirmations,
              status,
            });
          }
        }
      } catch (err) {
        console.error("Error processing log:", err);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        processedLogs: logs.length,
        newTransactions: newTransactions.length,
        transactions: newTransactions,
        currentBlock,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error monitoring deposits:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
