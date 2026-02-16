import { useState, useEffect } from 'react';
import { DollarSign, RefreshCw, ExternalLink, TrendingUp, CheckCircle, Clock, XCircle, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface DepositTransaction {
  id: string;
  transaction_hash: string;
  wallet_address: string;
  telegram_user_id: number;
  amount_bnb: number;
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
  totalBNB: number;
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
    totalBNB: 0,
    totalCredits: 0,
    pendingCount: 0,
    processedCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [monitoring, setMonitoring] = useState(false);
  const [contractAddress, setContractAddress] = useState('');
  const [conversionRate, setConversionRate] = useState('');
  const [minimumDeposit, setMinimumDeposit] = useState('');
  const [chainId, setChainId] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState('');

  useEffect(() => {
    loadData();
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const { data } = await supabase
        .from('settings')
        .select('id, value')
        .in('id', [
          'deposit_contract_address',
          'deposit_conversion_rate',
          'deposit_minimum_bnb',
          'deposit_contract_chain_id',
        ]);

      if (data) {
        data.forEach((setting) => {
          if (setting.id === 'deposit_contract_address') setContractAddress(setting.value);
          if (setting.id === 'deposit_conversion_rate') setConversionRate(setting.value);
          if (setting.id === 'deposit_minimum_bnb') setMinimumDeposit(setting.value);
          if (setting.id === 'deposit_contract_chain_id') setChainId(setting.value);
        });
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  };

  const saveSettings = async () => {
    if (!adminKey) {
      setSettingsMessage('Admin key is required to save settings');
      return;
    }

    setSavingSettings(true);
    setSettingsMessage('');

    try {
      const settings = [
        { key: 'deposit_contract_address', value: contractAddress },
        { key: 'deposit_conversion_rate', value: conversionRate },
        { key: 'deposit_minimum_bnb', value: minimumDeposit },
        { key: 'deposit_contract_chain_id', value: chainId },
      ];

      for (const setting of settings) {
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/update-settings`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({
              key: setting.key,
              value: setting.value,
              adminKey: adminKey,
            }),
          }
        );

        if (!response.ok) {
          const result = await response.json();
          setSettingsMessage(`Failed to save ${setting.key}: ${result.error || 'Unknown error'}`);
          setSavingSettings(false);
          return;
        }
      }

      setSettingsMessage('Settings saved successfully');
      await loadSettings();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setSettingsMessage(`Error saving settings: ${errorMessage}`);
      console.error('Error:', error);
    } finally {
      setSavingSettings(false);
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);

      const { data: txData } = await supabase
        .from('deposit_transactions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (txData) {
        setTransactions(txData);

        const totalBNB = txData.reduce((sum, tx) => sum + Number(tx.amount_bnb), 0);
        const totalCredits = txData.reduce((sum, tx) => sum + Number(tx.amount_credits), 0);
        const pendingCount = txData.filter((tx) => tx.status === 'pending' || tx.status === 'confirmed').length;
        const processedCount = txData.filter((tx) => tx.status === 'processed').length;

        setStats({
          totalDeposits: txData.length,
          totalBNB,
          totalCredits,
          pendingCount,
          processedCount,
        });
      }
    } catch (error) {
      console.error('Error loading deposit data:', error);
    } finally {
      setLoading(false);
    }
  };

  const monitorDeposits = async () => {
    setMonitoring(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/monitor-deposits`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
        }
      );

      if (response.ok) {
        await loadData();
      }
    } catch (error) {
      console.error('Error monitoring deposits:', error);
    } finally {
      setMonitoring(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'processed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded">
            <CheckCircle className="w-3 h-3" />
            Processed
          </span>
        );
      case 'confirmed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded">
            <Clock className="w-3 h-3" />
            Confirmed
          </span>
        );
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-yellow-100 text-yellow-800 text-xs font-medium rounded">
            <Clock className="w-3 h-3" />
            Pending
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-800 text-xs font-medium rounded">
            <XCircle className="w-3 h-3" />
            Failed
          </span>
        );
      default:
        return null;
    }
  };

  const explorerUrl = 'https://bscscan.com';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-green-100 rounded-full p-3">
            <DollarSign className="w-6 h-6 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900">Deposit Management</h2>
        </div>
        <button
          onClick={monitorDeposits}
          disabled={monitoring}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg transition"
        >
          <RefreshCw className={`w-4 h-4 ${monitoring ? 'animate-spin' : ''}`} />
          {monitoring ? 'Scanning Blockchain...' : 'Check for New Deposits'}
        </button>
      </div>

      {!contractAddress && (
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
          <div className="flex">
            <AlertCircle className="w-5 h-5 text-yellow-400" />
            <div className="ml-3">
              <p className="text-sm text-yellow-700 font-medium">
                Contract address not configured. Please set the deposit contract address in settings below.
              </p>
            </div>
          </div>
        </div>
      )}

      {contractAddress && stats.totalDeposits === 0 && (
        <div className="bg-blue-50 border-l-4 border-blue-400 p-4">
          <div className="flex">
            <AlertCircle className="w-5 h-5 text-blue-400" />
            <div className="ml-3">
              <p className="text-sm text-blue-700 font-medium">
                No deposits detected yet. Click "Check for New Deposits" to scan the blockchain for incoming transactions.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white rounded-lg shadow-md p-4 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm">Total Deposits</p>
              <p className="text-2xl font-bold text-gray-900">{stats.totalDeposits}</p>
            </div>
            <TrendingUp className="w-8 h-8 text-blue-600" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-4 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm">Total BNB</p>
              <p className="text-2xl font-bold text-gray-900">{stats.totalBNB.toFixed(4)}</p>
            </div>
            <DollarSign className="w-8 h-8 text-yellow-600" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-4 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm">Total Credits</p>
              <p className="text-2xl font-bold text-gray-900">{stats.totalCredits.toLocaleString()}</p>
            </div>
            <DollarSign className="w-8 h-8 text-green-600" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-4 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm">Pending</p>
              <p className="text-2xl font-bold text-yellow-600">{stats.pendingCount}</p>
            </div>
            <Clock className="w-8 h-8 text-yellow-600" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-4 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm">Processed</p>
              <p className="text-2xl font-bold text-green-600">{stats.processedCount}</p>
            </div>
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Deposit Settings</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-gray-700 font-medium mb-2">Contract Address</label>
            <input
              type="text"
              value={contractAddress}
              onChange={(e) => setContractAddress(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="0x..."
            />
          </div>
          <div>
            <label className="block text-gray-700 font-medium mb-2">Chain ID (56=BSC Mainnet)</label>
            <input
              type="text"
              value={chainId}
              onChange={(e) => setChainId(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="56"
            />
          </div>
          <div>
            <label className="block text-gray-700 font-medium mb-2">Conversion Rate (1 BNB = X Credits)</label>
            <input
              type="text"
              value={conversionRate}
              onChange={(e) => setConversionRate(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="100000"
            />
          </div>
          <div>
            <label className="block text-gray-700 font-medium mb-2">Minimum Deposit (BNB)</label>
            <input
              type="text"
              value={minimumDeposit}
              onChange={(e) => setMinimumDeposit(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="0.001"
            />
          </div>
        </div>
        {settingsMessage && (
          <div className={`mt-4 p-3 rounded-lg text-sm ${
            settingsMessage.includes('success')
              ? 'bg-green-50 text-green-800 border border-green-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}>
            {settingsMessage}
          </div>
        )}
        <button
          onClick={saveSettings}
          disabled={savingSettings}
          className="mt-4 px-6 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition"
        >
          {savingSettings ? 'Saving...' : 'Save Settings'}
        </button>
      </div>

      <div className="bg-white rounded-lg shadow-md border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Recent Transactions</h3>
        </div>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-6 text-center text-gray-600">Loading...</div>
          ) : transactions.length === 0 ? (
            <div className="p-6 text-center text-gray-500">No transactions yet</div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    User ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Amount BNB
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Credits
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Transaction
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {transactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(tx.status)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {tx.telegram_user_id}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-mono">
                      {tx.amount_bnb}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-semibold">
                      {tx.amount_credits.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <a
                        href={`${explorerUrl}/tx/${tx.transaction_hash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-700 inline-flex items-center gap-1"
                      >
                        <span className="font-mono">
                          {tx.transaction_hash.slice(0, 10)}...
                        </span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(tx.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
