import { useState, useEffect } from 'react';
import { X, Wallet, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { useAccount, useBalance, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseEther, formatEther } from 'viem';

interface WalletDepositModalProps {
  isOpen: boolean;
  onClose: () => void;
  telegramUserId: number;
  onSuccess?: () => void;
}

const CONTRACT_ABI = [
  {
    inputs: [{ name: 'userId', type: 'string' }],
    name: 'deposit',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
] as const;

export function WalletDepositModal({ isOpen, onClose, telegramUserId, onSuccess }: WalletDepositModalProps) {
  const { address } = useAccount();
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [contractAddress, setContractAddress] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data: balance } = useBalance({
    address: address,
  });

  const { writeContract, data: hash, isPending, isError: writeError } = useWriteContract();

  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });

  useEffect(() => {
    if (isOpen) {
      loadContractAddress();
      setAmount('');
      setError('');
    }
  }, [isOpen]);

  useEffect(() => {
    if (isConfirmed && onSuccess) {
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 2000);
    }
  }, [isConfirmed, onSuccess, onClose]);

  const loadContractAddress = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/settings?id=eq.deposit_contract_address&select=value`,
        {
          headers: {
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
            'Content-Type': 'application/json',
          },
        }
      );
      const data = await response.json();
      if (data && data.length > 0) {
        setContractAddress(data[0].value);
      }
    } catch (err) {
      console.error('Error loading contract address:', err);
      setError('Failed to load contract address');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeposit = async () => {
    setError('');

    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    if (Number(amount) < 0.01) {
      setError('Minimum deposit is 0.01 BNB (cost of 1 game)');
      return;
    }

    if (!balance) {
      setError('Unable to check wallet balance');
      return;
    }

    const amountInEther = parseEther(amount);
    const balanceInEther = balance.value;

    if (amountInEther > balanceInEther) {
      setError('Insufficient balance in wallet');
      return;
    }

    if (!contractAddress) {
      setError('Contract address not configured');
      return;
    }

    try {
      writeContract({
        address: contractAddress as `0x${string}`,
        abi: CONTRACT_ABI,
        functionName: 'deposit',
        args: [telegramUserId.toString()],
        value: amountInEther,
      });
    } catch (err) {
      console.error('Error sending transaction:', err);
      setError('Failed to send transaction');
    }
  };

  const setMaxAmount = () => {
    if (balance) {
      const maxAmount = Number(formatEther(balance.value)) - 0.001;
      setAmount(maxAmount > 0 ? maxAmount.toFixed(4) : '0');
    }
  };

  const refreshTransactions = async () => {
    setIsRefreshing(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/monitor-deposits`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.ok) {
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      }
    } catch (err) {
      console.error('Error refreshing transactions:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  if (!isOpen) return null;

  const gameStake = 0.01;
  const gamesAffordable = amount ? Math.floor(Number(amount) / gameStake) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full transform transition-all">
        <div className="p-6">
          <div className="flex items-start justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="bg-yellow-100 rounded-full p-3">
                <Wallet className="w-6 h-6 text-yellow-600" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Deposit BNB</h2>
                <p className="text-sm text-gray-600 mt-1">Add funds to your account</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition"
              disabled={isPending || isConfirming}
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-blue-800">
                    <p className="font-semibold mb-1">Game Cost: 0.01 BNB per game</p>
                    <p className="mb-2">Enter the amount you want to deposit to your account.</p>
                    <p className="text-xs text-blue-700">
                      After sending, click "Check Status" to scan the blockchain and credit your account.
                    </p>
                  </div>
                </div>
              </div>

              {balance && (
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-700 font-medium">Wallet Balance</span>
                    <span className="text-xl font-bold text-gray-900">
                      {Number(formatEther(balance.value)).toFixed(4)} BNB
                    </span>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-gray-700 font-medium mb-2">
                  Deposit Amount (BNB)
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    step="0.001"
                    min="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.01"
                    className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    disabled={isPending || isConfirming}
                  />
                  <button
                    type="button"
                    onClick={setMaxAmount}
                    className="px-4 py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium rounded-lg transition"
                    disabled={isPending || isConfirming}
                  >
                    Max
                  </button>
                </div>
                {amount && Number(amount) >= 0.01 && (
                  <p className="text-sm text-gray-600 mt-2">
                    You can play approximately <span className="font-semibold text-green-600">{gamesAffordable} games</span> with this deposit
                  </p>
                )}
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-800 text-sm flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {writeError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-800 text-sm flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 flex-shrink-0" />
                  <span>Transaction failed. Please try again.</span>
                </div>
              )}

              {isPending && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-yellow-800 text-sm flex items-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Waiting for wallet confirmation...</span>
                </div>
              )}

              {isConfirming && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-blue-800 text-sm flex items-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Transaction pending confirmation...</span>
                </div>
              )}

              {isConfirmed && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-green-800 text-sm flex items-center gap-2">
                  <CheckCircle className="w-5 h-5" />
                  <span>Deposit successful! Credits will be added shortly.</span>
                </div>
              )}

              <button
                onClick={handleDeposit}
                disabled={isPending || isConfirming || isConfirmed || !amount || Number(amount) <= 0}
                className="w-full bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-400 text-white font-semibold py-3 px-6 rounded-lg transition flex items-center justify-center gap-2"
              >
                {isPending || isConfirming ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Processing...
                  </>
                ) : isConfirmed ? (
                  <>
                    <CheckCircle className="w-5 h-5" />
                    Success!
                  </>
                ) : (
                  <>
                    <Wallet className="w-5 h-5" />
                    Deposit {amount || '0'} BNB
                  </>
                )}
              </button>

              <p className="text-xs text-gray-500 text-center">
                Funds will be available immediately after blockchain confirmation
              </p>

              {isConfirmed && (
                <div className="mt-4 space-y-3">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p className="text-sm text-blue-800 font-medium mb-2">Transaction Sent Successfully!</p>
                    <p className="text-xs text-blue-700 mb-3">
                      Your deposit is being processed. It may take a few minutes for your balance to update.
                    </p>
                    <button
                      onClick={refreshTransactions}
                      disabled={isRefreshing}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg transition text-sm font-medium"
                    >
                      <Loader2 className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                      {isRefreshing ? 'Checking Blockchain...' : 'Check Status & Refresh Balance'}
                    </button>
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
