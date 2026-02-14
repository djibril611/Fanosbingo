import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { ethers } from "npm:ethers@6";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
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
      throw new Error("Settings not configured");
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

    if (!privateKey || !rpcUrl || !contractAddress) {
      throw new Error(
        "Private key, contract address, or RPC URL not configured"
      );
    }

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);

    const [walletBalance, contractBalance] = await Promise.all([
      provider.getBalance(wallet.address),
      provider.getBalance(contractAddress),
    ]);

    const walletBnb = ethers.formatEther(walletBalance);
    const contractBnb = ethers.formatEther(contractBalance);
    const totalBnb = ethers.formatEther(walletBalance + contractBalance);

    return new Response(
      JSON.stringify({
        success: true,
        walletAddress: wallet.address,
        contractAddress,
        walletBalanceBnb: walletBnb,
        contractBalanceBnb: contractBnb,
        totalAvailableBnb: totalBnb,
        network: "BSC Mainnet (Chain ID: 56)",
        message: `Contract: ${contractBnb} BNB | Wallet: ${walletBnb} BNB | Total: ${totalBnb} BNB`,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: unknown) {
    console.error("Error:", error);
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
