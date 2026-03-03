import { useState, useEffect } from 'react';
import { DollarSign, RefreshCw, ExternalLink, TrendingUp, CheckCircle, Clock, XCircle, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface DepositTransaction {
  id: string;
  transaction_hash: string;
  wallet_address: string;
  telegram_user_id: number;
  amount_token: number;
  amount_credits: number;
  status: string;
  confirmations: number;
  block_number: number;
  created_at: string;
  processed_at: string | null;
  error_message: string | null;
}

interface DepositStats {
  totalDeposits: number;
  totalToken: number;
  totalCredits: number;
  pendingCount: number;
  processedCount: number;
}

interface DepositManagementProps {
  adminKey?: string;
}

export function DepositManagement({ adminKey }: DepositManagementProps) {
  const [transactions, setTransactions] = useState<DepositTransaction[]>([]);
  const [stats, setStats] = useState<DepositStats>({
    totalDeposits: 0,
    totalToken: 0,
    totalCredits: 0,
    pendingCount: 0,
    processedCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [monitoring, setMonitoring] = useState(false);

  const explorerUrl = 'https://bscscan.com';

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);

    const { data } = await supabase
      .from('deposit_transactions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (data) {
      setTransactions(data);

      const totalToken = data.reduce((sum, tx) => sum + Number(tx.amount_token), 0);
      const totalCredits = data.reduce((sum, tx) => sum + Number(tx.amount_credits), 0);

      setStats({
        totalDeposits: data.length,
        totalToken,
        totalCredits,
        pendingCount: data.filter(tx => tx.status === 'pending').length,
        processedCount: data.filter(tx => tx.status === 'processed').length,
      });
    }

    setLoading(false);
  };

  const monitorDeposits = async () => {
    setMonitoring(true);

    await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/monitor-deposits`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
      }
    );

    await loadData();
    setMonitoring(false);
  };

  const getStatusBadge = (status: string) => {
    if (status === 'processed')
      return <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded">Processed</span>;
    if (status === 'pending')
      return <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded">Pending</span>;
    if (status === 'failed')
      return <span className="px-2 py-1 bg-red-100 text-red-800 text-xs rounded">Failed</span>;
    return null;
  };

  return (
    <div className="space-y-6">

      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">FANOS Deposit Management</h2>
        <button
          onClick={monitorDeposits}
          disabled={monitoring}
          className="px-4 py-2 bg-blue-600 text-white rounded"
        >
          {monitoring ? 'Scanning...' : 'Scan FANOS Deposits'}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white p-4 shadow rounded">
          <p>Total Deposits</p>
          <p className="text-2xl font-bold">{stats.totalDeposits}</p>
        </div>

        <div className="bg-white p-4 shadow rounded">
          <p>Total FANOS</p>
          <p className="text-2xl font-bold">{stats.totalToken.toFixed(4)}</p>
        </div>

        <div className="bg-white p-4 shadow rounded">
          <p>Total Credits</p>
          <p className="text-2xl font-bold">{stats.totalCredits.toLocaleString()}</p>
        </div>
      </div>

      <div className="bg-white shadow rounded">
        {loading ? (
          <div className="p-6 text-center">Loading...</div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th>Status</th>
                <th>User</th>
                <th>FANOS</th>
                <th>Credits</th>
                <th>Tx</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map(tx => (
                <tr key={tx.id}>
                  <td>{getStatusBadge(tx.status)}</td>
                  <td>{tx.telegram_user_id}</td>
                  <td>{tx.amount_token}</td>
                  <td>{tx.amount_credits}</td>
                  <td>
                    <a
                      href={`${explorerUrl}/tx/${tx.transaction_hash}`}
                      target="_blank"
                    >
                      {tx.transaction_hash.slice(0, 10)}...
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

    </div>
  );
}
