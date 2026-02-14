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

interface CreditRequest {
  telegramUserId: number;
  walletAddress: string;
  amountCredits: number;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { telegramUserId, walletAddress, amountCredits }: CreditRequest = await req.json();

    if (!telegramUserId || !walletAddress || !amountCredits) {
      throw new Error("Missing required fields");
    }

    if (!ethers.isAddress(walletAddress)) {
      throw new Error("Invalid wallet address");
    }

    if (amountCredits <= 0) {
      throw new Error("Amount must be greater than 0");
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: settings } = await supabaseClient
      .from("settings")
      .select("id, value")
      .in("id", [
        "deposit_contract_address",
        "deposit_contract_private_key",
        "deposit_bsc_rpc_url",
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

    if (!contractAddress || !privateKey || !rpcUrl) {
      const missing = [];
      if (!contractAddress) missing.push("contract address");
      if (!privateKey) missing.push("private key");
      if (!rpcUrl) missing.push("RPC URL");
      throw new Error(`Missing configuration: ${missing.join(", ")}`);
    }

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);
    const contract = new ethers.Contract(contractAddress, CONTRACT_ABI, wallet);

    const currentCredits = await contract.credits(walletAddress);

    const tx = await contract.addWinCredits(walletAddress, amountCredits, {
      gasLimit: 100000,
    });

    const receipt = await tx.wait(1);

    if (receipt && receipt.status === 1) {
      const newCredits = await contract.credits(walletAddress);

      return new Response(
        JSON.stringify({
          success: true,
          transactionHash: tx.hash,
          previousCredits: currentCredits.toString(),
          newCredits: newCredits.toString(),
          amountAdded: amountCredits,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    } else {
      throw new Error("Transaction failed on chain");
    }
  } catch (error: unknown) {
    console.error("Error crediting win to contract:", error);

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
