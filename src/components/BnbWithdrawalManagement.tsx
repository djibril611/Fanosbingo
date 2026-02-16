import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import {
  ExternalLink, Clock, CheckCircle, XCircle, RefreshCw,
  TrendingDown, AlertCircle, RotateCcw, Check, Wallet,
  Copy, ArrowDownCircle, Shield
} from 'lucide-react';

interface WithdrawalRequest {
  id: string;
  telegram_user_id: number;
  wallet_address: string;
  amount_credits: number;
  amount_bnb: number;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'refunded';
  source: string;
  transaction_hash: string | null;
  error_message: string | null;
  created_at: string;
  processed_at: string | null;
  completed_at: string | null;
}

interface WithdrawalStats {
  total_withdrawn_today: number;
  total_withdrawn_week: number;
  total_withdrawn_all_time: number;
  pending_count: number;
  pending_amount: number;
  failed_today: number;
  completed_today: number;
  user_withdrawals_today: number;
  admin_withdrawals_today: number;
}

interface WalletInfo {
  contractAddress: string;
  contractBalanceBnb: string;
}

interface BnbWithdrawalManagementProps {
  adminKey?: string;
}

type FilterType = 'all' | 'pending' | 'processing' | 'completed' | 'failed' | 'refunded';

const STATUS_CONFIG: Record<string, { bg: string; text: string }> = {
  pending: { bg: 'bg-amber-50', text: 'text-amber-700' },
  processing: { bg: 'bg-sky-50', text: 'text-sky-700' },
  completed: { bg: 'bg-emerald-50', text: 'text-emerald-700' },
  failed: { bg: 'bg-red-50', text: 'text-red-700' },
  refunded: { bg: 'bg-orange-50', text: 'text-orange-700' },
};

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function BnbWithdrawalManagement({ adminKey }: BnbWithdrawalManagementProps) {
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [stats, setStats] = useState<WithdrawalStats | null>(null);
  const [walletInfo, setWalletInfo] = useState<WalletInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('all');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [completeModal, setCompleteModal] = useState<{ id: string; wallet: string; amount: number } | null>(null);
  const [txHashInput, setTxHashInput] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');
  const [copiedAddress, setCopiedAddress] = useState(false);

  const loadWithdrawals = useCallback(async () => {
    setIsLoading(true);
    try {
      let query = supabase
        .from('bnb_withdrawal_requests')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (filter !== 'all') {
        query = query.eq('status', filter);
      }

      const { data, error } = await query;
      if (error) throw error;
      setWithdrawals(data || []);
    } catch (error) {
      console.error('Error loading withdrawals:', error);
    } finally {
      setIsLoading(false);
    }
  }, [filter]);

  const loadStats = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc('get_bnb_withdrawal_stats');
      if (error) throw error;
      setStats(data);
    } catch (error) {
      console.error('Error loading withdrawal stats:', error);
    }
  }, []);

  const loadWalletInfo = useCallback(async () => {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-withdrawal-wallet-info`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        }
      );
      const result = await response.json();
      if (result.success) {
        setWalletInfo({
          contractAddress: result.contractAddress,
          contractBalanceBnb: result.contractBalanceBnb,
        });
      }
    } catch (error) {
      console.error('Error loading wallet info:', error);
    }
  }, []);

  useEffect(() => {
    loadWithdrawals();
    loadStats();
    loadWalletInfo();

    const channel = supabase
      .channel('admin-bnb-withdrawals')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bnb_withdrawal_requests' },
        () => {
          loadWithdrawals();
          loadStats();
        }
      )
      .subscribe();

    const walletInterval = setInterval(loadWalletInfo, 30000);

    return () => {
      channel.unsubscribe();
      clearInterval(walletInterval);
    };
  }, [filter, loadWithdrawals, loadStats, loadWalletInfo]);

  const handleRefund = async (withdrawalId: string) => {
    if (!adminKey) return;

    setActionLoading(withdrawalId);
    setActionError('');
    setActionSuccess('');

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-bnb-withdrawal`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            withdrawal_id: withdrawalId,
            action: 'refund',
            admin_key: adminKey,
            reason: 'Refunded by admin',
          }),
        }
      );

      const result = await response.json();
      if (!response.ok || result.error) {
        throw new Error(result.error || 'Failed to refund');
      }

      setActionSuccess('Credits refunded to user');
      loadWithdrawals();
      loadStats();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setActionError(`Refund failed: ${msg}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleComplete = async () => {
    if (!adminKey || !completeModal) return;

    if (!txHashInput.trim()) {
      setActionError('Transaction hash is required');
      return;
    }

    setActionLoading(completeModal.id);
    setActionError('');

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-bnb-withdrawal`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            withdrawal_id: completeModal.id,
            action: 'complete',
            admin_key: adminKey,
            transaction_hash: txHashInput.trim(),
          }),
        }
      );

      const result = await response.json();
      if (!response.ok || result.error) {
        throw new Error(result.error || 'Failed to complete');
      }

      setCompleteModal(null);
      setTxHashInput('');
      setActionSuccess('Withdrawal marked as completed');
      loadWithdrawals();
      loadStats();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setActionError(`Complete failed: ${msg}`);
    } finally {
      setActionLoading(null);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedAddress(true);
    setTimeout(() => setCopiedAddress(false), 2000);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending': return <Clock className="w-3.5 h-3.5" />;
      case 'processing': return <RefreshCw className="w-3.5 h-3.5 animate-spin" />;
      case 'completed': return <CheckCircle className="w-3.5 h-3.5" />;
      case 'failed': return <XCircle className="w-3.5 h-3.5" />;
      case 'refunded': return <AlertCircle className="w-3.5 h-3.5" />;
      default: return null;
    }
  };

  const canRefund = (status: string) => ['pending', 'processing', 'failed'].includes(status);
  const canComplete = (status: string) => ['pending', 'processing'].includes(status);

  const contractBalance = walletInfo ? parseFloat(walletInfo.contractBalanceBnb) : 0;
  const isLowBalance = contractBalance < 1;

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200/60 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 bg-emerald-100 rounded-lg flex items-center justify-center flex-shrink-0">
            <Shield className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-emerald-900">Decentralized Withdrawals Active</p>
            <p className="text-xs text-emerald-700 mt-0.5 leading-relaxed">
              Users withdraw directly from the smart contract by signing transactions with their own wallets.
              The admin wallet is not used for payouts. This dashboard is read-only monitoring.
            </p>
          </div>
        </div>
      </div>

      {walletInfo && (
        <div className={`rounded-xl bg-white border p-5 transition-all hover:shadow-md ${
          isLowBalance ? 'border-l-4 border-l-red-400 border-t-slate-200/60 border-r-slate-200/60 border-b-slate-200/60' : 'border-slate-200/60'
        }`}>
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2.5 mb-2">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isLowBalance ? 'bg-red-50' : 'bg-emerald-50'}`}>
                  <Wallet className={`w-4 h-4 ${isLowBalance ? 'text-red-500' : 'text-emerald-600'}`} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-800">Contract Treasury</p>
                  {isLowBalance && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-red-600 font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-subtlePulse" />
                      Low balance
                    </span>
                  )}
                </div>
              </div>
              <p className={`text-3xl font-bold stat-value ${isLowBalance ? 'text-red-700' : 'text-gray-900'}`}>
                {parseFloat(walletInfo.contractBalanceBnb).toFixed(4)} <span className="text-base font-semibold text-slate-400">BNB</span>
              </p>
              <div className="flex items-center gap-2 mt-3">
                <span className="text-xs text-slate-400 font-mono bg-slate-50 px-2 py-0.5 rounded">
                  {walletInfo.contractAddress.slice(0, 8)}...{walletInfo.contractAddress.slice(-6)}
                </span>
                <button
                  onClick={() => copyToClipboard(walletInfo.contractAddress)}
                  className="text-slate-300 hover:text-slate-500 transition-colors"
                  title="Copy contract address"
                >
                  {copiedAddress ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
                <a
                  href={`https://bscscan.com/address/${walletInfo.contractAddress}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-slate-300 hover:text-blue-500 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
            {isLowBalance && (
              <div className="bg-red-50 rounded-lg px-3 py-2 text-right">
                <p className="text-[11px] text-red-600 font-medium leading-relaxed">Fund contract to<br />enable withdrawals</p>
              </div>
            )}
          </div>
        </div>
      )}

      {walletInfo && isLowBalance && (
        <div className="bg-gradient-to-br from-red-50 to-amber-50/30 border-2 border-red-200/60 rounded-xl p-5">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <ArrowDownCircle className="w-6 h-6 text-red-600" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-red-900 mb-2">Contract Needs Funding</h3>
              <p className="text-sm text-red-700 mb-4 leading-relaxed">
                The contract has {contractBalance.toFixed(4)} BNB remaining.
                Users will not be able to withdraw until the contract is funded.
                Send BNB directly to the contract address.
              </p>
              <div className="bg-white/80 rounded-lg border border-red-200/40 p-4 space-y-3">
                <div>
                  <p className="text-xs font-semibold text-red-900 uppercase tracking-wider mb-1.5">Contract Address</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 px-3 py-2 bg-red-50/50 border border-red-200/40 rounded-lg text-red-900 font-mono text-xs break-all">
                      {walletInfo.contractAddress}
                    </code>
                    <button
                      onClick={() => copyToClipboard(walletInfo.contractAddress)}
                      className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors flex items-center gap-1.5 text-xs font-semibold flex-shrink-0"
                    >
                      {copiedAddress ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      {copiedAddress ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>
                <a
                  href={`https://bscscan.com/address/${walletInfo.contractAddress}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-red-600 hover:text-red-700 text-sm font-semibold transition-colors"
                >
                  <span>View on BSCScan</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'Today', value: stats.total_withdrawn_today.toFixed(4), sub: `BNB / ${stats.completed_today} txns`, dot: 'bg-teal-400' },
            { label: 'This Week', value: stats.total_withdrawn_week.toFixed(4), sub: 'BNB withdrawn', dot: 'bg-blue-400' },
            { label: 'All Time', value: stats.total_withdrawn_all_time.toFixed(4), sub: 'BNB withdrawn', dot: 'bg-slate-400' },
            { label: 'User Withdrawals', value: String(stats.user_withdrawals_today || 0), sub: 'direct today', dot: 'bg-emerald-400' },
          ].map(({ label, value, sub, dot }) => (
            <div key={label} className="bg-white rounded-xl border border-slate-200/60 p-4 hover:shadow-sm transition-shadow">
              <div className="flex items-center gap-1.5 mb-1">
                <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
                <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">{label}</p>
              </div>
              <p className="text-xl font-bold text-gray-900 stat-value">{value}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>
            </div>
          ))}
        </div>
      )}

      {actionError && (
        <div className="bg-white border border-red-200/60 border-l-4 border-l-red-400 rounded-xl p-4 flex items-start gap-3 animate-slideDown">
          <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-red-700 text-sm font-medium flex-1">{actionError}</p>
          <button onClick={() => setActionError('')} className="text-slate-300 hover:text-slate-500 transition-colors">
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}

      {actionSuccess && (
        <div className="bg-white border border-emerald-200/60 border-l-4 border-l-emerald-400 rounded-xl p-4 flex items-start gap-3 animate-slideDown">
          <CheckCircle className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
          <p className="text-emerald-700 text-sm font-medium flex-1">{actionSuccess}</p>
          <button onClick={() => setActionSuccess('')} className="text-slate-300 hover:text-slate-500 transition-colors">
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}

      {completeModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-slideUp">
            <div className="bg-slate-50 border-b border-slate-100 px-6 py-4">
              <h3 className="text-lg font-bold text-gray-900">Complete Withdrawal</h3>
              <p className="text-xs text-slate-400 mt-0.5">Enter the transaction hash for manual completion</p>
            </div>
            <div className="p-6">
              <div className="bg-slate-50 rounded-xl p-4 mb-5">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">Wallet</p>
                    <p className="font-mono text-xs text-slate-600 break-all">{completeModal.wallet}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">Amount</p>
                    <p className="font-bold text-gray-900 stat-value">{completeModal.amount.toFixed(4)} BNB</p>
                  </div>
                </div>
              </div>
              <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Transaction Hash</label>
              <input
                type="text"
                value={txHashInput}
                onChange={(e) => setTxHashInput(e.target.value)}
                placeholder="0x..."
                className="w-full pl-4 pr-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 font-mono text-sm transition-all outline-none"
              />
              <div className="flex gap-3 mt-5">
                <button
                  onClick={() => { setCompleteModal(null); setTxHashInput(''); setActionError(''); }}
                  className="flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-sm font-medium transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleComplete}
                  disabled={actionLoading === completeModal.id || !txHashInput.trim()}
                  className="flex-1 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl text-sm font-medium transition flex items-center justify-center gap-2"
                >
                  {actionLoading === completeModal.id ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  Confirm
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200/60 overflow-hidden">
        <div className="p-5 border-b border-slate-100">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center">
                <ArrowDownCircle className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900 tracking-tight">Withdrawal History</h2>
                <p className="text-xs text-slate-400">{withdrawals.length} records</p>
              </div>
            </div>

            <button
              onClick={() => { loadWithdrawals(); loadStats(); loadWalletInfo(); }}
              className="w-9 h-9 flex items-center justify-center hover:bg-slate-100 rounded-xl transition-colors"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4 text-slate-400" />
            </button>
          </div>

          <div className="flex gap-1 mt-4 overflow-x-auto pb-1 bg-slate-100 rounded-xl p-1">
            {(['all', 'pending', 'processing', 'completed', 'failed', 'refunded'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setFilter(status)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                  filter === status
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {status.charAt(0).toUpperCase() + status.slice(1)}
                {status === 'pending' && stats && stats.pending_count > 0 && (
                  <span className="ml-1.5 bg-amber-100 text-amber-700 text-[10px] px-1.5 py-0.5 rounded-full font-semibold">
                    {stats.pending_count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <RefreshCw className="w-5 h-5 animate-spin text-slate-300" />
          </div>
        ) : withdrawals.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <TrendingDown className="w-6 h-6 text-slate-300" />
            </div>
            <p className="text-slate-400 text-sm">No withdrawal records found</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {withdrawals.map((withdrawal) => {
              const config = STATUS_CONFIG[withdrawal.status] || STATUS_CONFIG.pending;
              const isActionTarget = actionLoading === withdrawal.id;
              const isUserWithdrawal = withdrawal.source === 'user';

              return (
                <div
                  key={withdrawal.id}
                  className={`p-4 hover:bg-slate-50/50 transition-all ${isActionTarget ? 'bg-blue-50/20' : ''}`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                    <div className="flex-1 min-w-0 overflow-hidden">
                      <div className="flex items-center gap-2 flex-wrap mb-1.5">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold ${config.bg} ${config.text}`}>
                          {getStatusIcon(withdrawal.status)}
                          {withdrawal.status.toUpperCase()}
                        </span>
                        <span className="text-lg font-bold text-gray-900 stat-value">
                          {withdrawal.amount_bnb.toFixed(4)} BNB
                        </span>
                        {isUserWithdrawal && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-50 text-emerald-700">
                            <Shield className="w-3 h-3" />
                            USER
                          </span>
                        )}
                        {!isUserWithdrawal && withdrawal.source === 'admin' && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 text-slate-500">
                            LEGACY
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 sm:gap-3 text-xs text-slate-500 mb-1 flex-wrap">
                        <span className="inline-flex items-center gap-1">User: <span className="font-mono font-medium text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded">{withdrawal.telegram_user_id}</span></span>
                        <a
                          href={`https://bscscan.com/address/${withdrawal.wallet_address}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-blue-500 hover:text-blue-700 truncate bg-blue-50 px-1.5 py-0.5 rounded transition-colors"
                        >
                          {withdrawal.wallet_address.slice(0, 6)}...{withdrawal.wallet_address.slice(-4)}
                        </a>
                      </div>

                      <div className="flex items-center gap-3 text-[11px] text-slate-400 flex-wrap">
                        <span className="flex-shrink-0">{timeAgo(withdrawal.created_at)}</span>
                        {withdrawal.transaction_hash && (
                          <a
                            href={`https://bscscan.com/tx/${withdrawal.transaction_hash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-blue-500 hover:text-blue-700 font-medium flex-shrink-0 transition-colors"
                          >
                            <span className="font-mono">{withdrawal.transaction_hash.slice(0, 10)}...</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                      {withdrawal.error_message && (
                        <p className="text-red-500 text-xs mt-1.5 break-words line-clamp-2 bg-red-50 rounded px-2 py-1" title={withdrawal.error_message}>
                          {withdrawal.error_message}
                        </p>
                      )}
                    </div>

                    {adminKey && (
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {canComplete(withdrawal.status) && (
                          <button
                            onClick={() => setCompleteModal({ id: withdrawal.id, wallet: withdrawal.wallet_address, amount: withdrawal.amount_bnb })}
                            disabled={isActionTarget}
                            className="px-2.5 py-1.5 border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-600 rounded-lg text-xs font-medium transition-all disabled:opacity-50"
                            title="Complete with TX hash"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {canRefund(withdrawal.status) && (
                          <button
                            onClick={() => handleRefund(withdrawal.id)}
                            disabled={isActionTarget}
                            className="px-2.5 py-1.5 border border-orange-200 hover:border-orange-300 hover:bg-orange-50 text-orange-600 rounded-lg text-xs font-medium transition-all disabled:opacity-50"
                            title="Refund credits"
                          >
                            {isActionTarget ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <RotateCcw className="w-3.5 h-3.5" />
                            )}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
