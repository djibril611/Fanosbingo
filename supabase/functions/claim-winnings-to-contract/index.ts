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
  withdrawalSource?: 'won' | 'deposited' | 'both';
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { telegramUserId, walletAddress, amountBnb, withdrawalSource = 'both' }: ClaimRequest = await req.json();

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
      .select("won_balance, deposited_balance")
      .eq("telegram_user_id", telegramUserId)
      .maybeSingle();

    if (!user) {
      throw new Error("User not found");
    }

    const availableWonBalance = user.won_balance || 0;
    const availableDepositedBalance = user.deposited_balance || 0;

    if (availableWonBalance <= 0 && availableDepositedBalance <= 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "No balance available to claim",
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

    let wonToWithdraw = 0;
    let depositedToWithdraw = 0;

    if (withdrawalSource === 'won') {
      wonToWithdraw = availableWonBalance;
    } else if (withdrawalSource === 'deposited') {
      depositedToWithdraw = availableDepositedBalance;
    } else {
      wonToWithdraw = availableWonBalance;
      depositedToWithdraw = availableDepositedBalance;
    }

    const totalCreditsToWithdraw = wonToWithdraw + depositedToWithdraw;

    const amountToClaimCredits = amountBnb
      ? Math.min(amountBnb * creditsToRnbRate, totalCreditsToWithdraw)
      : totalCreditsToWithdraw;

    const amountToClaimBnb = amountToClaimCredits / creditsToRnbRate;

    if (amountToClaimBnb < 0.01) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Minimum claim amount is 0.01 BNB",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    let creditsRemaining = amountToClaimCredits;
    let wonDeduction = 0;
    let depositedDeduction = 0;

    if (withdrawalSource === 'won' || withdrawalSource === 'both') {
      wonDeduction = Math.min(creditsRemaining, wonToWithdraw);
      creditsRemaining -= wonDeduction;
    }

    if ((withdrawalSource === 'deposited' || withdrawalSource === 'both') && creditsRemaining > 0) {
      depositedDeduction = Math.min(creditsRemaining, depositedToWithdraw);
    }

    const updates: { won_balance?: number; deposited_balance?: number } = {};
    if (wonDeduction > 0) {
      updates.won_balance = availableWonBalance - wonDeduction;
    }
    if (depositedDeduction > 0) {
      updates.deposited_balance = availableDepositedBalance - depositedDeduction;
    }

    const { error: updateError } = await supabaseClient
      .from("telegram_users")
      .update(updates)
      .eq("telegram_user_id", telegramUserId)
      .eq("won_balance", availableWonBalance)
      .eq("deposited_balance", availableDepositedBalance);

    if (updateError) {
      throw new Error("Failed to update balance. Please try again.");
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
            remainingWonBalance: availableWonBalance - wonDeduction,
            remainingDepositedBalance: availableDepositedBalance - depositedDeduction,
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      } else {
        const rollbackUpdates: { won_balance?: number; deposited_balance?: number } = {};
        if (wonDeduction > 0) rollbackUpdates.won_balance = availableWonBalance;
        if (depositedDeduction > 0) rollbackUpdates.deposited_balance = availableDepositedBalance;

        await supabaseClient
          .from("telegram_users")
          .update(rollbackUpdates)
          .eq("telegram_user_id", telegramUserId);

        throw new Error("Transaction failed on chain");
      }
    } catch (blockchainError: unknown) {
      const rollbackUpdates: { won_balance?: number; deposited_balance?: number } = {};
      if (wonDeduction > 0) rollbackUpdates.won_balance = availableWonBalance;
      if (depositedDeduction > 0) rollbackUpdates.deposited_balance = availableDepositedBalance;

      await supabaseClient
        .from("telegram_users")
        .update(rollbackUpdates)
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
