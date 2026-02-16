import { useState, useEffect } from 'react';
import {
  X, Wallet, AlertCircle, CheckCircle, Loader2,
  ExternalLink, ArrowRight, ArrowDown, Shield, Clock, Info
} from 'lucide-react';
import { useAccount, useWriteContract, useReadContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseEther, formatEther } from 'viem';
import { supabase } from '../lib/supabase';
import { DEPOSIT_CONTRACT_ABI } from '../lib/walletConfig';

interface BnbWithdrawalModalProps {
  isOpen: boolean;
  onClose: () => void;
  telegramUserId: number;
  wonBalance: number;
  onSuccess?: () => void;
}

type Step = 'claim' | 'withdraw';

export function BnbWithdrawalModal({
  isOpen,
  onClose,
  telegramUserId,
  wonBalance,
  onSuccess
}: BnbWithdrawalModalProps) {
  const { address, isConnected } = useAccount();
  const { writeContractAsync, data: hash, isPending, error: writeError } = useWriteContract();

  const [contractAddress, setContractAddress] = useState<string>('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [creditsToRate, setCreditsToRate] = useState(1000);
  const [onChainCredits, setOnChainCredits] = useState<bigint>(0n);
  const [activeStep, setActiveStep] = useState<Step>('claim');
  const [recentHistory, setRecentHistory] = useState<Array<{
    id: string;
    amount_bnb: number;
    status: string;
    created_at: string;
    transaction_hash: string | null;
  }>>([]);
  const [contractBalance, setContractBalance] = useState<bigint>(0n);
  const [recordingWithdrawal, setRecordingWithdrawal] = useState(false);

  const { data: creditsData, refetch: refetchCredits } = useReadContract({
    address: contractAddress as `0x${string}`,
    abi: DEPOSIT_CONTRACT_ABI,
    functionName: 'credits',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address && !!contractAddress && isOpen,
      refetchInterval: 5000,
    }
  });

  const { data: contractBalanceData, refetch: refetchContractBalance } = useReadContract({
    address: contractAddress as `0x${string}`,
    abi: DEPOSIT_CONTRACT_ABI,
    functionName: 'getContractBalance',
    query: {
      enabled: !!contractAddress && isOpen,
      refetchInterval: 10000,
    }
  });

  const { data: remainingLimitsData } = useReadContract({
    address: contractAddress as `0x${string}`,
    abi: DEPOSIT_CONTRACT_ABI,
    functionName: 'getRemainingLimits',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address && !!contractAddress && isOpen,
      refetchInterval: 10000,
    }
  });

  const { data: minWithdrawData } = useReadContract({
    address: contractAddress as `0x${string}`,
    abi: DEPOSIT_CONTRACT_ABI,
    functionName: 'minWithdraw',
    query: {
      enabled: !!contractAddress && isOpen,
    }
  });

  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });

  useEffect(() => {
    if (isOpen) {
      loadContractAddress();
      loadConversionRate();
      loadRecentHistory();
      setAmount('');
      setError('');
      setSuccess('');
      setIsLoading(false);
      setIsClaiming(false);
      setRecordingWithdrawal(false);
    } else {
      setError('');
      setSuccess('');
      setIsLoading(false);
      setIsClaiming(false);
      setRecordingWithdrawal(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (creditsData !== undefined) {
      setOnChainCredits(creditsData as bigint);
    }
  }, [creditsData]);

  useEffect(() => {
    if (contractBalanceData !== undefined) {
      setContractBalance(contractBalanceData as bigint);
    }
  }, [contractBalanceData]);

  useEffect(() => {
    if (onChainCredits > 0n && wonBalance <= 0) {
      setActiveStep('withdraw');
    } else {
      setActiveStep('claim');
    }
  }, [onChainCredits, wonBalance]);

  useEffect(() => {
    if (isConfirmed && hash && !recordingWithdrawal) {
      setRecordingWithdrawal(true);
      recordWithdrawalToDatabase(hash);
    }
  }, [isConfirmed, hash]);

  useEffect(() => {
    if (writeError) {
      const msg = writeError.message || 'Transaction failed';
      if (msg.includes('User rejected') || msg.includes('user rejected')) {
        setError('Transaction cancelled');
      } else if (msg.includes('insufficient funds')) {
        setError('Insufficient BNB for gas fees (~0.001 BNB required)');
      } else if (msg.includes('Daily limit')) {
        setError('Daily withdrawal limit exceeded');
      } else if (msg.includes('Weekly limit')) {
        setError('Weekly withdrawal limit exceeded');
      } else if (msg.includes('Below minimum')) {
        setError('Amount below minimum withdrawal');
      } else if (msg.includes('Insufficient credits')) {
        setError('Insufficient on-chain credits');
      } else if (msg.includes('Insufficient contract')) {
        setError('Contract balance too low. Try again later.');
      } else {
        setError(msg.length > 120 ? msg.slice(0, 120) + '...' : msg);
      }
      setIsLoading(false);
    }
  }, [writeError]);

  const recordWithdrawalToDatabase = async (txHash: string) => {
    try {
      const amountBnb = Number(amount);
      await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/record-withdrawal`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            telegramUserId,
            walletAddress: address,
            amountBnb,
            transactionHash: txHash,
          }),
        }
      );
    } catch (err) {
      console.error('Failed to record withdrawal:', err);
    }

    setSuccess('BNB sent to your wallet!');
    setIsLoading(false);
    loadRecentHistory();
    refetchCredits();
    refetchContractBalance();

    setTimeout(() => {
      if (onSuccess) onSuccess();
      onClose();
    }, 3000);
  };

  const loadContractAddress = async () => {
    try {
      const { data } = await supabase
        .from('settings')
        .select('value')
        .eq('id', 'deposit_contract_address')
        .maybeSingle();
      if (data?.value) setContractAddress(data.value);
    } catch (err) {
      console.error('Error loading contract address:', err);
    }
  };

  const loadConversionRate = async () => {
    try {
      const { data } = await supabase
        .from('settings')
        .select('value')
        .eq('id', 'withdrawal_credits_to_bnb_rate')
        .maybeSingle();
      if (data?.value) setCreditsToRate(parseFloat(data.value));
    } catch (err) {
      console.error('Error loading rate:', err);
    }
  };

  const loadRecentHistory = async () => {
    try {
      const { data } = await supabase
        .from('bnb_withdrawal_requests')
        .select('id, amount_bnb, status, created_at, transaction_hash')
        .eq('telegram_user_id', telegramUserId)
        .order('created_at', { ascending: false })
        .limit(3);
      if (data) setRecentHistory(data);
    } catch (err) {
      console.error('Error loading history:', err);
    }
  };

  const handleClaimWinnings = async () => {
    setError('');
    setSuccess('');
    setIsClaiming(true);

    try {
      if (!isConnected || !address) {
        setError('Please connect your wallet first');
        return;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60000);

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/claim-winnings-to-contract`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            telegramUserId,
            walletAddress: address,
          }),
          signal: controller.signal,
        }
      );

      clearTimeout(timeout);

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to claim winnings');
      }

      setSuccess(`Claimed ${result.amountClaimedBnb.toFixed(4)} BNB to contract!`);
      refetchCredits();
      if (onSuccess) onSuccess();

      setTimeout(() => {
        setSuccess('');
        setActiveStep('withdraw');
      }, 2000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setIsClaiming(false);
    }
  };

  const getAvailableBnb = () => Number(formatEther(onChainCredits));

  const handleWithdraw = async () => {
    setError('');
    setSuccess('');

    if (!isConnected || !address) {
      setError('Please connect your wallet first');
      return;
    }

    if (!contractAddress) {
      setError('Contract address not configured');
      return;
    }

    const amountNum = Number(amount);
    if (!amount || isNaN(amountNum) || amountNum <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    const minBnb = minWithdrawData ? Number(formatEther(minWithdrawData as bigint)) : 0.01;
    if (amountNum < minBnb) {
      setError(`Minimum withdrawal is ${minBnb} BNB`);
      return;
    }

    const amountWei = parseEther(amount);
    if (onChainCredits < amountWei) {
      setError('Insufficient on-chain credits');
      return;
    }

    setIsLoading(true);

    try {
      await writeContractAsync({
        address: contractAddress as `0x${string}`,
        abi: DEPOSIT_CONTRACT_ABI,
        functionName: 'withdraw',
        args: [amountWei],
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('User rejected') || msg.includes('user rejected')) {
        setError('Transaction cancelled');
      } else if (msg.includes('insufficient funds')) {
        setError('Insufficient BNB for gas fees (~0.001 BNB required)');
      } else {
        setError(msg.length > 120 ? msg.slice(0, 120) + '...' : msg);
      }
      setIsLoading(false);
    }
  };

  const setMaxAmount = () => {
    const available = getAvailableBnb();
    const limits = getRemainingLimitsBnb();
    const maxAllowed = Math.min(available, limits.daily, limits.weekly);
    setAmount(maxAllowed > 0 ? maxAllowed.toFixed(4) : '0');
  };

  const getRemainingLimitsBnb = () => {
    if (!remainingLimitsData) return { daily: 5, weekly: 10 };
    const [dailyRemaining, weeklyRemaining] = remainingLimitsData as [bigint, bigint];
    return {
      daily: Number(formatEther(dailyRemaining)),
      weekly: Number(formatEther(weeklyRemaining)),
    };
  };

  if (!isOpen) return null;

  const wonBalanceBnb = wonBalance / creditsToRate;
  const onChainBnb = getAvailableBnb();
  const hasWonBalance = wonBalance > 0;
  const hasOnChain = onChainCredits > 0n;
  const contractBalanceBnb = Number(formatEther(contractBalance));
  const hasLowContractBalance = contractBalanceBnb < 1 && contractBalanceBnb > 0;
  const limits = getRemainingLimitsBnb();
  const minBnb = minWithdrawData ? Number(formatEther(minWithdrawData as bigint)) : 0.01;

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      pending: 'bg-amber-500/20 text-amber-300',
      processing: 'bg-sky-500/20 text-sky-300',
      completed: 'bg-emerald-500/20 text-emerald-300',
      failed: 'bg-red-500/20 text-red-300',
      refunded: 'bg-orange-500/20 text-orange-300',
    };
    return map[status] || 'bg-gray-500/20 text-gray-300';
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-2xl shadow-2xl max-w-md w-full border border-gray-800/60 overflow-hidden animate-slideUp">
        <div className="flex items-center justify-between p-5 border-b border-gray-800/60 bg-gradient-to-r from-gray-900 to-gray-850">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-yellow-500/20 to-amber-500/10 rounded-xl flex items-center justify-center border border-yellow-500/20">
              <Wallet className="w-5 h-5 text-yellow-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight">Withdraw BNB</h2>
              <p className="text-[11px] text-gray-500">Decentralized - you sign all transactions</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center hover:bg-gray-800 rounded-lg transition-colors"
          >
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <div className="p-5 max-h-[75vh] overflow-y-auto">
          {!isConnected ? (
            <div className="bg-amber-500/10 border border-amber-500/15 rounded-xl p-6 text-center">
              <div className="w-14 h-14 bg-amber-500/10 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <Wallet className="w-7 h-7 text-amber-400" />
              </div>
              <p className="text-amber-400 font-semibold mb-1">Wallet Not Connected</p>
              <p className="text-gray-500 text-sm">Connect your wallet to withdraw BNB winnings</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex bg-gray-800/50 rounded-xl p-1 gap-1">
                <button
                  onClick={() => setActiveStep('claim')}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                    activeStep === 'claim'
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/15'
                      : 'text-gray-400 hover:text-gray-300'
                  }`}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <span className={`w-5 h-5 rounded-full text-xs flex items-center justify-center font-bold ${
                      activeStep === 'claim' ? 'bg-white/20' : 'bg-gray-700'
                    }`}>1</span>
                    Claim
                  </span>
                </button>
                <button
                  onClick={() => setActiveStep('withdraw')}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                    activeStep === 'withdraw'
                      ? 'bg-gradient-to-r from-yellow-500 to-amber-500 text-gray-900 shadow-lg shadow-yellow-500/15'
                      : 'text-gray-400 hover:text-gray-300'
                  }`}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <span className={`w-5 h-5 rounded-full text-xs flex items-center justify-center font-bold ${
                      activeStep === 'withdraw' ? 'bg-black/20' : 'bg-gray-700'
                    }`}>2</span>
                    Withdraw
                  </span>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className={`rounded-xl p-3.5 border transition-all ${
                  hasWonBalance ? 'bg-blue-500/8 border-blue-500/15 shadow-sm shadow-blue-500/5' : 'bg-gray-800/30 border-gray-700/30'
                }`}>
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider font-medium mb-1">Winnings</p>
                  <p className={`text-xl font-bold stat-value ${hasWonBalance ? 'text-blue-400' : 'text-gray-600'}`}>
                    {wonBalanceBnb.toFixed(4)}
                  </p>
                  <p className="text-[10px] text-gray-500 mt-0.5">BNB ({wonBalance.toLocaleString()} cr)</p>
                </div>
                <div className={`rounded-xl p-3.5 border transition-all ${
                  hasOnChain ? 'bg-emerald-500/8 border-emerald-500/15 shadow-sm shadow-emerald-500/5' : 'bg-gray-800/30 border-gray-700/30'
                }`}>
                  <div className="flex items-center gap-1 mb-1">
                    <p className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">Ready</p>
                    {hasOnChain && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-subtlePulse" />}
                  </div>
                  <p className={`text-xl font-bold stat-value ${hasOnChain ? 'text-emerald-400' : 'text-gray-600'}`}>
                    {onChainBnb.toFixed(4)}
                  </p>
                  <p className="text-[10px] text-gray-500 mt-0.5">BNB (withdrawable)</p>
                </div>
              </div>

              {activeStep === 'claim' ? (
                <div className="space-y-4">
                  <div className="bg-gray-800/30 rounded-xl p-4 border border-gray-700/30">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-8 h-8 bg-blue-500/10 rounded-lg flex items-center justify-center border border-blue-500/15">
                        <ArrowDown className="w-4 h-4 text-blue-400" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-white">Claim Winnings to Contract</p>
                        <p className="text-[11px] text-gray-500">System pays the gas fee for you</p>
                      </div>
                    </div>

                    {hasWonBalance ? (
                      <>
                        <div className="flex items-center justify-between bg-gray-900/40 rounded-lg p-3 mb-3 border border-gray-800/50">
                          <span className="text-gray-400 text-sm">Amount to claim</span>
                          <span className="text-blue-400 font-bold text-lg stat-value">{wonBalanceBnb.toFixed(4)} BNB</span>
                        </div>

                        <button
                          onClick={handleClaimWinnings}
                          disabled={isClaiming}
                          className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 text-white font-semibold rounded-xl transition-all disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-blue-500/10"
                        >
                          {isClaiming ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Claiming...
                            </>
                          ) : (
                            <>
                              <Shield className="w-4 h-4" />
                              Claim to Contract
                              <ArrowRight className="w-4 h-4" />
                            </>
                          )}
                        </button>
                      </>
                    ) : (
                      <div className="text-center py-4">
                        <p className="text-gray-500 text-sm">No winnings to claim right now</p>
                        {hasOnChain && (
                          <button
                            onClick={() => setActiveStep('withdraw')}
                            className="mt-2 text-yellow-400 text-sm font-medium hover:text-yellow-300 transition-colors inline-flex items-center gap-1"
                          >
                            Go to Withdraw <ArrowRight className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="bg-blue-500/5 border border-blue-500/8 rounded-xl p-3">
                    <div className="flex gap-2.5">
                      <Shield className="w-4 h-4 text-blue-400/70 flex-shrink-0 mt-0.5" />
                      <p className="text-blue-300/60 text-xs leading-relaxed">
                        Claiming moves your database winnings to the smart contract.
                        The system pays gas so you don't need BNB to claim.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-gray-800/30 rounded-xl p-4 border border-gray-700/30">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-8 h-8 bg-yellow-500/10 rounded-lg flex items-center justify-center border border-yellow-500/15">
                        <Wallet className="w-4 h-4 text-yellow-400" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-white">Withdraw to Your Wallet</p>
                        <p className="text-[11px] text-gray-500">You sign this transaction directly</p>
                      </div>
                    </div>

                    {hasOnChain ? (
                      <>
                        <div className="mb-3">
                          <label className="block text-[10px] font-medium text-gray-500 uppercase tracking-wider mb-1.5">Amount (BNB)</label>
                          <div className="flex gap-2">
                            <div className="flex-1 relative">
                              <input
                                type="number"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                placeholder={`Min: ${minBnb} BNB`}
                                step="0.001"
                                min={minBnb}
                                className="w-full px-3.5 py-2.5 bg-gray-900/50 border border-gray-700/50 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-yellow-500/30 focus:border-yellow-500/30 text-sm transition-all"
                              />
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-gray-600 font-medium">BNB</span>
                            </div>
                            <button
                              onClick={setMaxAmount}
                              className="px-3 py-2.5 bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 font-semibold rounded-xl transition-colors text-xs border border-yellow-500/15"
                            >
                              MAX
                            </button>
                          </div>
                        </div>

                        <div className="space-y-2 mb-3">
                          <div className="flex items-center justify-between bg-gray-900/40 rounded-lg p-3 border border-gray-800/50">
                            <span className="text-gray-400 text-[11px]">Available on-chain</span>
                            <span className="text-emerald-400 font-semibold stat-value">{onChainBnb.toFixed(4)} BNB</span>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="bg-gray-900/40 rounded-lg p-2.5 border border-gray-800/50">
                              <p className="text-[10px] text-gray-500 mb-0.5">Daily remaining</p>
                              <p className="text-sm font-semibold text-gray-300 stat-value">{limits.daily.toFixed(2)} BNB</p>
                            </div>
                            <div className="bg-gray-900/40 rounded-lg p-2.5 border border-gray-800/50">
                              <p className="text-[10px] text-gray-500 mb-0.5">Weekly remaining</p>
                              <p className="text-sm font-semibold text-gray-300 stat-value">{limits.weekly.toFixed(2)} BNB</p>
                            </div>
                          </div>
                        </div>

                        {hasLowContractBalance && (
                          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 mb-3">
                            <div className="flex items-start gap-2">
                              <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                              <div>
                                <p className="text-amber-400 text-xs font-semibold mb-1">Low Contract Balance</p>
                                <p className="text-amber-300/70 text-[11px] leading-relaxed">
                                  Contract balance: {contractBalanceBnb.toFixed(4)} BNB. Large withdrawals may fail.
                                </p>
                              </div>
                            </div>
                          </div>
                        )}

                        <button
                          onClick={handleWithdraw}
                          disabled={isLoading || isPending || isConfirming || !amount || Number(amount) <= 0}
                          className="w-full py-3 bg-gradient-to-r from-yellow-500 to-amber-500 hover:from-yellow-400 hover:to-amber-400 disabled:from-gray-700 disabled:to-gray-700 text-white disabled:text-gray-500 font-semibold rounded-xl transition-all disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-yellow-500/10"
                        >
                          {isLoading || isPending || isConfirming ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              {isConfirming ? 'Confirming...' : 'Sign in Wallet...'}
                            </>
                          ) : (
                            <>
                              <Wallet className="w-4 h-4" />
                              Withdraw {amount ? `${Number(amount).toFixed(4)} BNB` : 'BNB'}
                            </>
                          )}
                        </button>
                      </>
                    ) : (
                      <div className="text-center py-4">
                        <p className="text-gray-500 text-sm mb-2">No on-chain credits available</p>
                        {hasWonBalance && (
                          <button
                            onClick={() => setActiveStep('claim')}
                            className="text-blue-400 text-sm font-medium hover:text-blue-300 transition-colors inline-flex items-center gap-1"
                          >
                            Claim your winnings first <ArrowRight className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="bg-emerald-500/5 border border-emerald-500/8 rounded-xl p-3">
                    <div className="flex gap-2.5">
                      <Info className="w-4 h-4 text-emerald-400/70 flex-shrink-0 mt-0.5" />
                      <p className="text-emerald-300/60 text-xs leading-relaxed">
                        You sign this transaction with your wallet. The smart contract sends BNB directly to you.
                        No admin involvement. Gas fee ~0.001 BNB.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {error && (
                <div className="bg-red-500/8 border border-red-500/15 border-l-2 border-l-red-400 rounded-xl p-3 flex gap-2.5 animate-slideDown">
                  <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                  <p className="text-red-400 text-sm">{error}</p>
                </div>
              )}

              {success && (
                <div className="bg-emerald-500/8 border border-emerald-500/15 border-l-2 border-l-emerald-400 rounded-xl p-3 flex gap-2.5 animate-slideDown">
                  <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-emerald-400 text-sm">{success}</p>
                    {hash && (
                      <a
                        href={`https://bscscan.com/tx/${hash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-emerald-300/70 hover:text-emerald-200 text-xs mt-1 transition-colors"
                      >
                        <span className="font-mono">{hash.slice(0, 12)}...{hash.slice(-6)}</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>
              )}

              {address && (
                <div className="bg-gray-800/20 rounded-xl p-3 border border-gray-800/40">
                  <p className="text-gray-600 text-[10px] uppercase tracking-wider mb-0.5">Your Wallet</p>
                  <p className="text-gray-400 text-xs font-mono break-all">{address}</p>
                </div>
              )}

              {recentHistory.length > 0 && (
                <div>
                  <p className="text-[10px] font-medium text-gray-600 uppercase tracking-wider mb-2">Recent Activity</p>
                  <div className="space-y-1.5">
                    {recentHistory.map((item) => (
                      <div key={item.id} className="flex items-center justify-between bg-gray-800/20 rounded-lg px-3 py-2.5 border border-gray-800/30 hover:bg-gray-800/30 transition-colors">
                        <div className="flex items-center gap-2">
                          <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-semibold ${statusBadge(item.status)}`}>
                            {item.status.toUpperCase()}
                          </span>
                          <span className="text-white text-sm font-medium stat-value">{item.amount_bnb.toFixed(4)} BNB</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-gray-600 text-[11px] flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {new Date(item.created_at).toLocaleDateString()}
                          </span>
                          {item.transaction_hash && (
                            <a
                              href={`https://bscscan.com/tx/${item.transaction_hash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-400/70 hover:text-blue-300 transition-colors"
                            >
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
