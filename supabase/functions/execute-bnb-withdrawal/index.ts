import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { ethers } from "npm:ethers@6";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ExecuteRequest {
  telegramUserId?: number;
  walletAddress?: string;
  amountBnb?: number;
  signature?: string;
  nonce?: string;
  withdrawalId?: string;
}

const CONTRACT_ABI = [
  "function withdrawTo(address payable recipient, uint256 amount) external",
];

function getSetting(
  settings: Array<{ id: string; value: string }>,
  key: string
): string | undefined {
  return settings.find((s) => s.id === key)?.value;
}

async function loadSettings(supabaseClient: ReturnType<typeof createClient>) {
  const { data: settings } = await supabaseClient
    .from("settings")
    .select("id, value")
    .in("id", [
      "deposit_contract_address",
      "deposit_contract_private_key",
      "deposit_bsc_rpc_url",
    ]);

  if (!settings || settings.length === 0) {
    return { error: "Contract settings not configured" };
  }

  const contractAddress = getSetting(settings, "deposit_contract_address");
  const privateKey = getSetting(settings, "deposit_contract_private_key");
  const rpcUrl = getSetting(settings, "deposit_bsc_rpc_url");

  const missing = [];
  if (!contractAddress) missing.push("contract address");
  if (!privateKey) missing.push("private key");
  if (!rpcUrl) missing.push("RPC URL");

  if (missing.length > 0) {
    return { error: `Missing config: ${missing.join(", ")}` };
  }

  return { contractAddress: contractAddress!, privateKey: privateKey!, rpcUrl: rpcUrl! };
}

async function executeOnChain(
  contractAddress: string,
  privateKey: string,
  rpcUrl: string,
  walletAddress: string,
  amountBnb: number
) {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);
  const contract = new ethers.Contract(contractAddress, CONTRACT_ABI, wallet);

  const amountWei = ethers.parseEther(amountBnb.toString());

  // Balance check disabled - let the contract handle insufficient funds
  // The smart contract's withdrawTo will revert if funds are insufficient

  const tx = await contract.withdrawTo(walletAddress, amountWei, {
    gasLimit: 100000,
  });

  return { tx };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body: ExecuteRequest = await req.json();

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    let withdrawalId: string;
    let walletAddress: string;
    let amountBnb: number;

    if (body.withdrawalId) {
      const { data: existing } = await supabaseClient
        .from("bnb_withdrawal_requests")
        .select("*")
        .eq("id", body.withdrawalId)
        .eq("status", "pending")
        .maybeSingle();

      if (!existing) {
        return new Response(
          JSON.stringify({ success: false, error: "Withdrawal not found or not pending" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      withdrawalId = existing.id;
      walletAddress = existing.wallet_address;
      amountBnb = existing.amount_bnb;
    } else {
      if (!body.telegramUserId || !body.walletAddress || !body.amountBnb || !body.signature || !body.nonce) {
        throw new Error("Missing required fields");
      }

      if (!ethers.isAddress(body.walletAddress)) {
        throw new Error("Invalid wallet address");
      }

      const { data: result, error: processError } = await supabaseClient.rpc(
        "process_bnb_withdrawal_request",
        {
          p_telegram_user_id: body.telegramUserId,
          p_wallet_address: body.walletAddress,
          p_amount_bnb: body.amountBnb,
          p_signature: body.signature,
          p_nonce: body.nonce,
        }
      );

      if (processError) {
        throw new Error(`Failed to process withdrawal: ${processError.message}`);
      }

      if (!result.success && result.code) {
        return new Response(
          JSON.stringify({ success: false, error: result.reason, code: result.code, data: result }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      withdrawalId = result.withdrawal_id;
      walletAddress = body.walletAddress;
      amountBnb = body.amountBnb;
    }

    const config = await loadSettings(supabaseClient);
    if ("error" in config) {
      await supabaseClient.rpc("refund_bnb_withdrawal", {
        p_withdrawal_id: withdrawalId,
        p_error_message: config.error,
      });
      throw new Error(config.error);
    }

    await supabaseClient
      .from("bnb_withdrawal_requests")
      .update({ status: "processing", processed_at: new Date().toISOString() })
      .eq("id", withdrawalId);

    try {
      const result = await executeOnChain(
        config.contractAddress,
        config.privateKey,
        config.rpcUrl,
        walletAddress,
        amountBnb
      );

      if ("error" in result) {
        await supabaseClient.rpc("refund_bnb_withdrawal", {
          p_withdrawal_id: withdrawalId,
          p_error_message: result.error,
        });

        return new Response(
          JSON.stringify({ success: false, error: result.error, code: result.code }),
          { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { tx } = result;

      await supabaseClient
        .from("bnb_withdrawal_requests")
        .update({ transaction_hash: tx.hash })
        .eq("id", withdrawalId);

      try {
        const receipt = await tx.wait(1);

        if (receipt && receipt.status === 1) {
          await supabaseClient.rpc("complete_bnb_withdrawal", {
            p_withdrawal_id: withdrawalId,
            p_transaction_hash: tx.hash,
          });

          return new Response(
            JSON.stringify({ success: true, transactionHash: tx.hash, withdrawalId }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        } else {
          await supabaseClient.rpc("refund_bnb_withdrawal", {
            p_withdrawal_id: withdrawalId,
            p_error_message: `Transaction reverted. Hash: ${tx.hash}`,
          });

          return new Response(
            JSON.stringify({ success: false, error: "Transaction reverted on chain", transactionHash: tx.hash }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } catch (_confirmError: unknown) {
        console.error("Confirmation timeout (tx may still succeed):", _confirmError);

        return new Response(
          JSON.stringify({
            success: true,
            transactionHash: tx.hash,
            withdrawalId,
            message: "Transaction sent, awaiting confirmation.",
            pending: true,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } catch (blockchainError: unknown) {
      console.error("Blockchain error:", blockchainError);
      const msg = blockchainError instanceof Error ? blockchainError.message : String(blockchainError);

      await supabaseClient.rpc("refund_bnb_withdrawal", {
        p_withdrawal_id: withdrawalId,
        p_error_message: `Blockchain error: ${msg.slice(0, 200)}`,
      });

      return new Response(
        JSON.stringify({ success: false, error: msg }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (error: unknown) {
    console.error("Error:", error);

    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
