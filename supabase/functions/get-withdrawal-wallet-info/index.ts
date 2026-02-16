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
      .in("id", ["deposit_contract_address", "deposit_bsc_rpc_url"]);

    if (!settings || settings.length === 0) {
      throw new Error("Settings not configured");
    }

    const contractAddress = settings.find(
      (s: { id: string }) => s.id === "deposit_contract_address"
    )?.value;
    const rpcUrl = settings.find(
      (s: { id: string }) => s.id === "deposit_bsc_rpc_url"
    )?.value;

    if (!rpcUrl || !contractAddress) {
      throw new Error("Contract address or RPC URL not configured");
    }

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const contractBalance = await provider.getBalance(contractAddress);
    const contractBnb = ethers.formatEther(contractBalance);

    return new Response(
      JSON.stringify({
        success: true,
        contractAddress,
        contractBalanceBnb: contractBnb,
        network: "BSC Mainnet (Chain ID: 56)",
        message: `Contract: ${contractBnb} BNB`,
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
