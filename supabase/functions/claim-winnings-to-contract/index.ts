import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { ethers } from "npm:ethers@6";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const CONTRACT_ABI = [
  "function addWinCredits(address user, uint256 amount) external",
  "function credits(address user) external view returns (uint256)",
];

interface ClaimRequest {
  telegramUserId: number;
  walletAddress: string;
  amountBnb?: number;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { telegramUserId, walletAddress, amountBnb }: ClaimRequest = await req.json();

    if (!telegramUserId || !walletAddress) {
      throw new Error("Missing required fields");
    }

    if (!ethers.isAddress(walletAddress)) {
      throw new Error("Invalid wallet address");
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: user } = await supabaseClient
      .from("telegram_users")
      .select("won_balance")
      .eq("telegram_user_id", telegramUserId)
      .maybeSingle();

    if (!user) {
      throw new Error("User not found");
    }

    if (user.won_balance <= 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "No winnings available to claim",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { data: settings } = await supabaseClient
      .from("settings")
      .select("id, value")
      .in("id", [
        "deposit_contract_address",
        "deposit_contract_private_key",
        "deposit_bsc_rpc_url",
        "withdrawal_credits_to_bnb_rate",
      ]);

    if (!settings || settings.length === 0) {
      throw new Error("Contract settings not configured");
    }

    const contractAddress = settings.find(
      (s: { id: string }) => s.id === "deposit_contract_address"
    )?.value;
    const privateKey = settings.find(
      (s: { id: string }) => s.id === "deposit_contract_private_key"
    )?.value;
    const rpcUrl = settings.find(
      (s: { id: string }) => s.id === "deposit_bsc_rpc_url"
    )?.value;
    const creditsToRnbRate = parseFloat(
      settings.find((s: { id: string }) => s.id === "withdrawal_credits_to_bnb_rate")?.value || "1000"
    );

    if (!contractAddress || !privateKey || !rpcUrl) {
      const missing = [];
      if (!contractAddress) missing.push("contract address");
      if (!privateKey) missing.push("private key");
      if (!rpcUrl) missing.push("RPC URL");
      throw new Error(`Missing configuration: ${missing.join(", ")}`);
    }

    const amountToClaimCredits = amountBnb
      ? Math.min(amountBnb * creditsToRnbRate, user.won_balance)
      : user.won_balance;

    const amountToClaimBnb = amountToClaimCredits / creditsToRnbRate;

    if (amountToClaimBnb < 0.1) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Minimum claim amount is 0.1 BNB",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { error: updateError } = await supabaseClient
      .from("telegram_users")
      .update({ won_balance: user.won_balance - amountToClaimCredits })
      .eq("telegram_user_id", telegramUserId)
      .eq("won_balance", user.won_balance);

    if (updateError) {
      throw new Error("Failed to update won_balance. Please try again.");
    }

    try {
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const wallet = new ethers.Wallet(privateKey, provider);
      const contract = new ethers.Contract(contractAddress, CONTRACT_ABI, wallet);

      const amountWei = ethers.parseEther(amountToClaimBnb.toString());

      const tx = await contract.addWinCredits(walletAddress, amountWei, {
        gasLimit: 100000,
      });

      const receipt = await tx.wait(1);

      if (receipt && receipt.status === 1) {
        const newCredits = await contract.credits(walletAddress);

        return new Response(
          JSON.stringify({
            success: true,
            transactionHash: tx.hash,
            amountClaimedBnb: amountToClaimBnb,
            amountClaimedCredits: amountToClaimCredits,
            onChainCredits: ethers.formatEther(newCredits),
            remainingWonBalance: user.won_balance - amountToClaimCredits,
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      } else {
        await supabaseClient
          .from("telegram_users")
          .update({ won_balance: user.won_balance })
          .eq("telegram_user_id", telegramUserId);

        throw new Error("Transaction failed on chain");
      }
    } catch (blockchainError: unknown) {
      await supabaseClient
        .from("telegram_users")
        .update({ won_balance: user.won_balance })
        .eq("telegram_user_id", telegramUserId);

      throw blockchainError;
    }
  } catch (error: unknown) {
    console.error("Error claiming winnings to contract:", error);

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
