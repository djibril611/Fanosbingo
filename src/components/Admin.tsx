import { useState, useEffect } from 'react';
import { supabase, Game, Player } from '../lib/supabase';
import { Shield, XCircle, Users, Clock, Trophy, Settings, DollarSign, TrendingUp, CircleUser as UserCircle, Wallet, ArrowDownToLine } from 'lucide-react';
import { DepositManagement } from './DepositManagement';
import { BnbWithdrawalManagement } from './BnbWithdrawalManagement';
import { formatBnb } from '../utils/formatBalance';

interface UserSpending {
  id: string;
  telegram_user_id: number;
  telegram_username: string | null;
  telegram_first_name: string;
  telegram_last_name: string | null;
  balance: number;
  total_spent: number;
  total_won: number;
  win_count: number;
  games_played: number;
  created_at: string;
  last_active_at: string;
  wallet_address: string | null;
  total_bnb_deposited: number;
  deposit_count: number;
  last_deposit_date: string | null;
}

export function Admin() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [accessKey, setAccessKey] = useState('');
  const [games, setGames] = useState<Game[]>([]);
  const [playersByGame, setPlayersByGame] = useState<Record<string, Player[]>>({});
  const [currentPage, setCurrentPage] = useState<'dashboard' | 'users' | 'deposits' | 'withdrawals' | 'settings'>('dashboard');
  const [users, setUsers] = useState<UserSpending[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [telegramToken, setTelegramToken] = useState('');
  const [telegramBotUsername, setTelegramBotUsername] = useState('');
  const [supportContact, setSupportContact] = useState('');
  const [userInstructions, setUserInstructions] = useState('');
  const [commissionRate, setCommissionRate] = useState('20');
  const [gameUrl, setGameUrl] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isSettingWebhook, setIsSettingWebhook] = useState(false);
  const [statistics, setStatistics] = useState({
    totalUsers: 0,
    totalGamesPlayed: 0,
    totalRevenue: 0,
    houseCut: 0,
    activeGames: 0,
  });
  const [recentActivity, setRecentActivity] = useState<Array<{date: string, revenue: number, games: number}>>([]);

  useEffect(() => {
    if (isAuthenticated) {
      loadGames();
      loadSettings();
      loadStatistics();

      const gamesChannel = supabase
        .channel('admin-games')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'games' },
          () => {
            loadGames();
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'players' },
          () => {
            loadGames();
          }
        )
        .subscribe();

      const settingsChannel = supabase
        .channel('admin-settings')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'settings' },
          () => {
            loadSettings();
          }
        )
        .subscribe();

      const pollInterval = setInterval(() => {
        loadGames();
        loadStatistics();
      }, 3000);

      return () => {
        supabase.removeChannel(gamesChannel);
        supabase.removeChannel(settingsChannel);
        clearInterval(pollInterval);
      };
    }
  }, [isAuthenticated]);

  const loadGames = async () => {
    const { data: playingGames } = await supabase
      .from('games')
      .select('*')
      .eq('status', 'playing')
      .order('created_at', { ascending: false })
      .limit(1);

    const { data: waitingGames } = await supabase
      .from('games')
      .select('*')
      .eq('status', 'waiting')
      .order('created_at', { ascending: false })
      .limit(1);

    const filteredGames = [];
    if (playingGames && playingGames.length > 0) {
      filteredGames.push(playingGames[0]);
    }
    if (waitingGames && waitingGames.length > 0) {
      filteredGames.push(waitingGames[0]);
    }

    if (filteredGames.length > 0) {
      setGames(filteredGames);

      const playersMap: Record<string, Player[]> = {};
      for (const game of filteredGames) {
        const { data: playersData } = await supabase
          .from('players')
          .select('*')
          .eq('game_id', game.id)
          .order('joined_at', { ascending: true });

        if (playersData) {
          playersMap[game.id] = playersData;
        }
      }
      setPlayersByGame(playersMap);
    }
  };

  const loadSettings = async () => {
    const { data: tokenData } = await supabase
      .from('settings')
      .select('value')
      .eq('id', 'telegram_bot_token')
      .maybeSingle();

    if (tokenData) {
      setTelegramToken(tokenData.value);
    }

    const { data: botUsernameData } = await supabase
      .from('settings')
      .select('value')
      .eq('id', 'telegram_bot_username')
      .maybeSingle();

    if (botUsernameData) {
      setTelegramBotUsername(botUsernameData.value);
    }

    const { data: supportData } = await supabase
      .from('settings')
      .select('value')
      .eq('id', 'support_contact')
      .maybeSingle();

    if (supportData) {
      setSupportContact(supportData.value);
    }

    const { data: instructionsData } = await supabase
      .from('settings')
      .select('value')
      .eq('id', 'user_instructions')
      .maybeSingle();

    if (instructionsData) {
      setUserInstructions(instructionsData.value);
    }

    const { data: commissionData } = await supabase
      .from('settings')
      .select('value')
      .eq('id', 'commission_rate')
      .maybeSingle();

    if (commissionData) {
      setCommissionRate(commissionData.value);
    }

    const { data: gameUrlData } = await supabase
      .from('settings')
      .select('value')
      .eq('id', 'game_url')
      .maybeSingle();

    if (gameUrlData) {
      setGameUrl(gameUrlData.value);
    }
  };

  const loadStatistics = async () => {
    const { count: totalUsers } = await supabase
      .from('telegram_users')
      .select('*', { count: 'exact', head: true });

    const { data: finishedGames } = await supabase
      .from('games')
      .select('total_pot, winner_prize, finished_at')
      .eq('status', 'finished')
      .order('finished_at', { ascending: false });

    const { count: activeGames } = await supabase
      .from('games')
      .select('*', { count: 'exact', head: true })
      .in('status', ['waiting', 'playing']);

    const totalRevenue = finishedGames?.reduce((sum, game) => sum + (game.total_pot || 0), 0) || 0;
    const totalPrizesPaid = finishedGames?.reduce((sum, game) => sum + (game.winner_prize || 0), 0) || 0;
    const houseCut = totalRevenue - totalPrizesPaid;

    setStatistics({
      totalUsers: totalUsers || 0,
      totalGamesPlayed: finishedGames?.length || 0,
      totalRevenue,
      houseCut,
      activeGames: activeGames || 0,
    });

    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (6 - i));
      return date.toISOString().split('T')[0];
    });

    const activityByDate = last7Days.map(date => {
      const gamesOnDate = finishedGames?.filter(game =>
        game.finished_at && game.finished_at.split('T')[0] === date
      ) || [];

      const revenue = gamesOnDate.reduce((sum, game) => sum + (game.total_pot || 0), 0);

      return {
        date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        revenue,
        games: gamesOnDate.length,
      };
    });

    setRecentActivity(activityByDate);
  };

  const loadUsers = async () => {
    setIsLoadingUsers(true);
    try {
      const { data: telegramUsers } = await supabase
        .from('telegram_users')
        .select('*')
        .order('created_at', { ascending: false });

      if (telegramUsers) {
        const usersWithSpending = await Promise.all(
          telegramUsers.map(async (user) => {
            const { data: playerGames } = await supabase
              .from('players')
              .select('game_id, stake_paid')
              .eq('telegram_user_id', user.telegram_user_id)
              .eq('stake_paid', true);

            const { data: gameStakes } = await supabase
              .from('games')
              .select('id, stake_amount')
              .in('id', playerGames?.map(p => p.game_id) || []);

            const totalSpent = gameStakes?.reduce((sum, game) => sum + (game.stake_amount || 0), 0) || 0;

            const { data: deposits } = await supabase
              .from('deposit_transactions')
              .select('wallet_address, amount_bnb, processed_at')
              .eq('telegram_user_id', user.telegram_user_id)
              .eq('status', 'processed')
              .order('processed_at', { ascending: false });

            const totalBnbDeposited = deposits?.reduce((sum, deposit) => sum + Number(deposit.amount_bnb || 0), 0) || 0;
            const depositCount = deposits?.length || 0;
            const lastDepositDate = deposits?.[0]?.processed_at || null;
            const walletAddress = deposits?.[0]?.wallet_address || null;

            return {
              ...user,
              total_spent: user.total_spent || totalSpent,
              total_won: user.total_won || 0,
              win_count: user.win_count || 0,
              games_played: playerGames?.length || 0,
              wallet_address: walletAddress,
              total_bnb_deposited: totalBnbDeposited,
              deposit_count: depositCount,
              last_deposit_date: lastDepositDate,
            };
          })
        );

        setUsers(usersWithSpending);
      }
    } catch (error) {
      console.error('Error loading users:', error);
    } finally {
      setIsLoadingUsers(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!telegramToken.trim()) {
      alert('Please enter a valid Telegram bot token');
      return;
    }

    if (!telegramBotUsername.trim()) {
      alert('Please enter a valid Telegram bot username');
      return;
    }

    setIsSaving(true);
    try {
      const settingsToSave = [
        { key: 'telegram_bot_token', value: telegramToken },
        { key: 'telegram_bot_username', value: telegramBotUsername },
        { key: 'support_contact', value: supportContact },
        { key: 'user_instructions', value: userInstructions },
        { key: 'commission_rate', value: commissionRate },
        { key: 'game_url', value: gameUrl },
      ];

      for (const setting of settingsToSave) {
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/update-settings`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              key: setting.key,
              value: setting.value,
              adminKey: accessKey,
            }),
          }
        );

        if (!response.ok) {
          const result = await response.json();
          alert(`Error saving ${setting.key}: ${result.error || 'Unknown error'}`);
          setIsSaving(false);
          return;
        }
      }

      alert('Settings updated successfully!');
      await loadSettings();
      setCurrentPage('dashboard');
    } catch (error) {
      console.error('Save settings error:', error);
      alert(`Failed to update settings: ${error instanceof Error ? error.message : 'Network error. Please check your connection and try again.'}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSetupWebhook = async () => {
    setIsSettingWebhook(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/setup-telegram-webhook`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            adminKey: accessKey,
          }),
        }
      );

      const result = await response.json();

      if (response.ok) {
        alert(`Webhook set up successfully!\nURL: ${result.webhookUrl}`);
      } else {
        alert(`Error setting webhook: ${result.error || 'Unknown error'}`);
      }
    } catch (error) {
      alert('Failed to set up webhook. Please try again.');
      console.error(error);
    } finally {
      setIsSettingWebhook(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessKey.trim()) {
      alert('Please enter an access key');
      return;
    }

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/update-settings`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            key: 'test',
            value: 'test',
            adminKey: accessKey,
          }),
        }
      );

      if (response.status === 401) {
        alert('Invalid access key');
      } else {
        setIsAuthenticated(true);
      }
    } catch (error) {
      alert('Failed to verify access key. Please try again.');
      console.error(error);
    }
  };

  const handleEndGame = async (gameId: string) => {
    if (!confirm('Are you sure you want to end this game?')) return;

    await supabase
      .from('games')
      .update({
        status: 'finished',
        finished_at: new Date().toISOString(),
      })
      .eq('id', gameId);

    await supabase.rpc('create_game_with_server_time', {
      countdown_seconds: 25,
      stake_amount_param: 10
    });
  };

  return !isAuthenticated ? (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full">
        <div className="flex justify-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-slate-600 rounded-full">
            <Shield className="w-8 h-8 text-white" />
          </div>
        </div>
        <h1 className="text-3xl font-bold text-gray-900 text-center mb-2">Admin Panel</h1>
        <p className="text-gray-600 text-center mb-6">Enter your access key to continue</p>
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label htmlFor="access-key" className="block text-sm font-medium text-gray-700 mb-2">
              Access Key
            </label>
            <input
              id="access-key"
              type="password"
              value={accessKey}
              onChange={(e) => setAccessKey(e.target.value)}
              placeholder="Enter admin key"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-transparent outline-none transition"
              required
            />
          </div>
          <button
            type="submit"
            className="w-full bg-slate-600 hover:bg-slate-700 text-white font-semibold py-3 px-6 rounded-lg transition"
          >
            Login
          </button>
        </form>
      </div>
    </div>
  ) : (
    <div className="min-h-screen bg-slate-50 p-3 sm:p-4">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 p-4 sm:p-5 mb-5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center">
                <Shield className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900 tracking-tight">Admin Panel</h1>
                <p className="text-xs text-slate-400">Manage your platform</p>
              </div>
            </div>
            <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1 overflow-x-auto w-full sm:w-auto scrollbar-hide">
              {([
                { key: 'dashboard', label: 'Dashboard', icon: Shield },
                { key: 'users', label: 'Users', icon: UserCircle },
                { key: 'deposits', label: 'Deposits', icon: Wallet },
                { key: 'withdrawals', label: 'Withdrawals', icon: ArrowDownToLine },
                { key: 'settings', label: 'Settings', icon: Settings },
              ] as const).map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => {
                    setCurrentPage(key);
                    if (key === 'users' && users.length === 0) loadUsers();
                  }}
                  className={`flex items-center gap-1.5 font-medium py-2 px-3 rounded-lg text-sm transition-all whitespace-nowrap ${
                    currentPage === key
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="hidden sm:inline">{label}</span>
                </button>
              ))}
              <div className="w-px h-6 bg-slate-200 mx-1 flex-shrink-0" />
              <button
                onClick={() => setIsAuthenticated(false)}
                className="text-slate-400 hover:text-red-500 font-medium text-sm px-2 py-2 transition-colors whitespace-nowrap"
              >
                Logout
              </button>
            </div>
          </div>
        </div>

        {currentPage === 'dashboard' && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
              {[
                { label: 'Total Users', value: statistics.totalUsers, icon: Users, color: 'blue' },
                { label: 'Games Played', value: statistics.totalGamesPlayed, icon: Trophy, color: 'emerald' },
                { label: 'Total Revenue', value: `${formatBnb(statistics.totalRevenue)}`, suffix: ' BNB', icon: DollarSign, color: 'amber' },
                { label: 'House Cut', value: `${formatBnb(statistics.houseCut)}`, suffix: ' BNB', icon: TrendingUp, color: 'teal' },
                { label: 'Active Games', value: statistics.activeGames, icon: Clock, color: 'rose' },
              ].map(({ label, value, suffix, icon: Icon, color }) => (
                <div key={label} className="bg-white rounded-xl border border-slate-200/60 p-5 hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">{label}</p>
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center bg-${color}-50`}>
                      <Icon className={`w-4 h-4 text-${color}-500`} />
                    </div>
                  </div>
                  <p className="text-2xl font-bold text-gray-900 stat-value">{value}{suffix || ''}</p>
                </div>
              ))}
            </div>
          </>
        )}

        {currentPage === 'users' && (
          <div className="bg-white rounded-2xl shadow-xl p-6 mb-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900">Registered Users</h2>
              <div className="flex items-center gap-3">
                <button
                  onClick={loadUsers}
                  disabled={isLoadingUsers}
                  className="text-sm bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition disabled:opacity-50"
                >
                  {isLoadingUsers ? 'Refreshing...' : 'Refresh'}
                </button>
                <button
                  onClick={() => setCurrentPage('dashboard')}
                  className="text-sm text-gray-600 hover:text-gray-800 font-medium"
                >
                  Back
                </button>
              </div>
            </div>

            {isLoadingUsers && users.length === 0 ? (
              <div className="text-center text-gray-500 py-8">
                Loading users...
              </div>
            ) : users.length === 0 ? (
              <div className="text-center text-gray-500 py-8">
                No registered users yet
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50">
                      <th className="text-left py-3 px-4 font-semibold text-gray-700 text-sm">User ID</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700 text-sm">Name</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700 text-sm">Username</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700 text-sm">Wallet Address</th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-700 text-sm">Balance</th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-700 text-sm">BNB Deposited</th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-700 text-sm">Deposit Count</th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-700 text-sm">Total Spent</th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-700 text-sm">Total Won</th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-700 text-sm">Win Count</th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-700 text-sm">Games Played</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700 text-sm">Last Deposit</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700 text-sm">Joined</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {users.map((user) => {
                      const fullName = [user.telegram_first_name, user.telegram_last_name]
                        .filter(Boolean)
                        .join(' ');

                      return (
                        <tr key={user.id} className="hover:bg-gray-50 transition">
                          <td className="py-3 px-4 text-sm text-gray-600 font-mono">
                            {user.telegram_user_id}
                          </td>
                          <td className="py-3 px-4 text-sm font-medium text-gray-900">
                            {fullName}
                          </td>
                          <td className="py-3 px-4 text-sm text-gray-600">
                            {user.telegram_username ? `@${user.telegram_username}` : '-'}
                          </td>
                          <td className="py-3 px-4 text-sm text-gray-600 font-mono">
                            {user.wallet_address ? (
                              <span title={user.wallet_address}>
                                {user.wallet_address.slice(0, 6)}...{user.wallet_address.slice(-4)}
                              </span>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-sm text-right">
                            <span className="font-semibold text-green-600">
                              {formatBnb(user.balance)} BNB
                            </span>
                          </td>
                          <td className="py-3 px-4 text-sm text-right">
                            <span className="font-semibold text-yellow-600">
                              {user.total_bnb_deposited.toFixed(4)} BNB
                            </span>
                          </td>
                          <td className="py-3 px-4 text-sm text-right">
                            <span className="font-semibold text-blue-600">
                              {user.deposit_count}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-sm text-right">
                            <span className="font-semibold text-red-600">
                              {formatBnb(user.total_spent)} BNB
                            </span>
                          </td>
                          <td className="py-3 px-4 text-sm text-right">
                            <span className="font-semibold text-green-600">
                              {formatBnb(user.total_won)} BNB
                            </span>
                          </td>
                          <td className="py-3 px-4 text-sm text-right">
                            <span className="font-semibold text-blue-600">
                              {user.win_count}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-sm text-right text-gray-700">
                            {user.games_played}
                          </td>
                          <td className="py-3 px-4 text-sm text-gray-600">
                            {user.last_deposit_date ? new Date(user.last_deposit_date).toLocaleDateString() : '-'}
                          </td>
                          <td className="py-3 px-4 text-sm text-gray-600">
                            {new Date(user.created_at).toLocaleDateString()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                <div className="mt-4 pt-4 border-t border-gray-200">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                    <div className="text-gray-600">
                      Total Users: <span className="font-semibold text-gray-900">{users.length}</span>
                    </div>
                    <div className="text-gray-600">
                      Total BNB Deposited: <span className="font-semibold text-yellow-600">
                        {users.reduce((sum, user) => sum + user.total_bnb_deposited, 0).toFixed(4)} BNB
                      </span>
                    </div>
                    <div className="text-gray-600">
                      Total Deposits: <span className="font-semibold text-blue-600">
                        {users.reduce((sum, user) => sum + user.deposit_count, 0)}
                      </span>
                    </div>
                    <div className="text-gray-600">
                      Total Spending: <span className="font-semibold text-red-600">
                        {formatBnb(users.reduce((sum, user) => sum + user.total_spent, 0))} BNB
                      </span>
                    </div>
                    <div className="text-gray-600">
                      Total Winnings: <span className="font-semibold text-green-600">
                        {formatBnb(users.reduce((sum, user) => sum + user.total_won, 0))} BNB
                      </span>
                    </div>
                    <div className="text-gray-600">
                      Total Balance: <span className="font-semibold text-green-600">
                        {formatBnb(users.reduce((sum, user) => sum + user.balance, 0))} BNB
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {currentPage === 'deposits' && (
          <>
            <div className="bg-white rounded-2xl shadow-xl p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold text-gray-900">BNB Deposit Management</h2>
                <button
                  onClick={() => setCurrentPage('dashboard')}
                  className="text-sm text-gray-600 hover:text-gray-800 font-medium"
                >
                  Back to Dashboard
                </button>
              </div>
            </div>
            <DepositManagement adminKey={accessKey} />
          </>
        )}

        {currentPage === 'withdrawals' && (
          <>
            <div className="bg-white rounded-2xl shadow-xl p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold text-gray-900">BNB Withdrawal Management</h2>
                <button
                  onClick={() => setCurrentPage('dashboard')}
                  className="text-sm text-gray-600 hover:text-gray-800 font-medium"
                >
                  Back to Dashboard
                </button>
              </div>
            </div>
            <BnbWithdrawalManagement adminKey={accessKey} />
          </>
        )}

        {currentPage === 'settings' && (
          <div className="bg-white rounded-2xl shadow-xl p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold text-gray-900">Telegram Bot Settings</h2>
              <button
                onClick={() => setCurrentPage('dashboard')}
                className="text-sm text-gray-600 hover:text-gray-800 font-medium"
              >
                Back to Dashboard
              </button>
            </div>
            <div className="space-y-6">
              <div>
                <label htmlFor="telegram-token" className="block text-sm font-medium text-gray-700 mb-2">
                  Telegram Bot Token
                </label>
                <input
                  id="telegram-token"
                  type="text"
                  value={telegramToken}
                  onChange={(e) => setTelegramToken(e.target.value)}
                  placeholder="Enter Telegram bot token"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-transparent outline-none transition font-mono text-sm"
                />
                <p className="text-sm text-gray-500 mt-2">
                  Get your bot token from @BotFather on Telegram
                </p>
              </div>

              <div>
                <label htmlFor="telegram-bot-username" className="block text-sm font-medium text-gray-700 mb-2">
                  Telegram Bot Username
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-gray-500">@</span>
                  <input
                    id="telegram-bot-username"
                    type="text"
                    value={telegramBotUsername}
                    onChange={(e) => setTelegramBotUsername(e.target.value)}
                    placeholder="your_bot_username"
                    className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-transparent outline-none transition font-mono text-sm"
                  />
                </div>
                <p className="text-sm text-gray-500 mt-2">
                  Your bot's username (without the @) - used for generating referral links
                </p>
              </div>

              <div>
                <label htmlFor="support-contact" className="block text-sm font-medium text-gray-700 mb-2">
                  Support Contact Message
                </label>
                <textarea
                  id="support-contact"
                  value={supportContact}
                  onChange={(e) => setSupportContact(e.target.value)}
                  placeholder="Enter support contact info"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-transparent outline-none transition text-sm"
                  rows={3}
                />
              </div>

              <div>
                <label htmlFor="user-instructions" className="block text-sm font-medium text-gray-700 mb-2">
                  User Instructions (/instructions command)
                </label>
                <textarea
                  id="user-instructions"
                  value={userInstructions}
                  onChange={(e) => setUserInstructions(e.target.value)}
                  placeholder="Enter instructions that users will see when they use the /instructions command..."
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-transparent outline-none transition text-sm"
                  rows={6}
                />
              </div>

              <div>
                <label htmlFor="commission-rate" className="block text-sm font-medium text-gray-700 mb-2">
                  Commission Rate (%)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="commission-rate"
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    value={commissionRate}
                    onChange={(e) => setCommissionRate(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-transparent outline-none transition font-mono text-sm"
                  />
                  <span className="text-gray-600 font-medium">%</span>
                </div>
                <p className="text-sm text-gray-500 mt-2">
                  Percentage of each game pot that goes to the house (platform cut)
                </p>
              </div>

              <div>
                <label htmlFor="game-url" className="block text-sm font-medium text-gray-700 mb-2">
                  Game Web App URL
                </label>
                <input
                  id="game-url"
                  type="url"
                  value={gameUrl}
                  onChange={(e) => setGameUrl(e.target.value)}
                  placeholder="https://your-game-domain.com/"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-transparent outline-none transition font-mono text-sm"
                />
                <p className="text-sm text-gray-500 mt-2">
                  The URL of the web app that opens when users click the Play button in Telegram
                </p>
              </div>

              <div className="border-t pt-4">
                <h3 className="font-semibold text-gray-900 mb-3">Webhook Setup</h3>
                <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                  <div>
                    <p className="text-sm font-medium text-gray-700 mb-2">Webhook URL:</p>
                    <div className="bg-white border border-gray-300 rounded px-3 py-2 font-mono text-xs break-all">
                      {import.meta.env.VITE_SUPABASE_URL}/functions/v1/telegram-bot-webhook
                    </div>
                  </div>
                  <div>
                    <button
                      onClick={handleSetupWebhook}
                      disabled={isSettingWebhook || !telegramToken}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                    >
                      {isSettingWebhook ? 'Setting up webhook...' : 'Auto-Setup Webhook'}
                    </button>
                    <p className="text-xs text-gray-500 mt-2">
                      Click to automatically configure the Telegram webhook. Make sure you've saved the bot token first.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleSaveSettings}
                  disabled={isSaving}
                  className="bg-slate-600 hover:bg-slate-700 text-white font-semibold py-2 px-6 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSaving ? 'Saving...' : 'Save Settings'}
                </button>
                <button
                  onClick={() => setCurrentPage('dashboard')}
                  className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold py-2 px-6 rounded-lg transition"
                >
                  Back to Dashboard
                </button>
              </div>
            </div>
          </div>
        )}

        {currentPage === 'dashboard' && (
          <div className="space-y-6">
            {games.length === 0 ? (
              <div className="bg-white rounded-2xl shadow-xl p-12 text-center">
                <p className="text-gray-500 text-lg">No active games</p>
              </div>
            ) : (
              games.map((game) => {
              const players = playersByGame[game.id] || [];
              const activePlayers = players.filter(p => !p.is_disqualified);
              const isActiveGame = game.status === 'playing';

              return (
                <div key={game.id} className={`bg-white rounded-2xl shadow-xl p-6 ${isActiveGame ? 'ring-4 ring-green-400' : ''}`}>
                  <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h2 className="text-2xl font-bold text-gray-900">
                          Game #{game.game_number}
                        </h2>
                        <span
                          className={`px-3 py-1 rounded-full text-sm font-semibold ${
                            isActiveGame
                              ? 'bg-green-100 text-green-800 animate-pulse'
                              : 'bg-yellow-100 text-yellow-800'
                          }`}
                        >
                          {isActiveGame ? 'LIVE' : 'Waiting'}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-gray-600 mb-3">
                        <div className="flex items-center gap-1">
                          <Users className="w-4 h-4" />
                          <span>{activePlayers.length} active players</span>
                        </div>
                        {isActiveGame && (
                          <div className="flex items-center gap-1">
                            <Trophy className="w-4 h-4" />
                            <span>{game.called_numbers.length} numbers called</span>
                          </div>
                        )}
                        {game.status === 'waiting' && (
                          <div className="flex items-center gap-1">
                            <Clock className="w-4 h-4" />
                            <span>Starts {new Date(game.starts_at).toLocaleTimeString()}</span>
                          </div>
                        )}
                      </div>

                      {isActiveGame && game.called_numbers.length > 0 && (
                        <div className="mb-3">
                          <div className="text-xs text-gray-600 mb-2">Last 10 Called Numbers:</div>
                          <div className="flex flex-wrap gap-2">
                            {game.called_numbers.slice(-10).reverse().map((num, idx) => (
                              <div
                                key={idx}
                                className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold ${
                                  idx === 0
                                    ? 'bg-green-600 text-white text-lg scale-110 ring-2 ring-green-400'
                                    : 'bg-gray-100 text-gray-700 text-sm'
                                }`}
                              >
                                {num}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="flex flex-wrap gap-3">
                        <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2">
                          <div className="text-xs text-gray-600">Total Pot</div>
                          <div className="text-lg font-bold text-green-600">{formatBnb(game.total_pot)} BNB</div>
                        </div>
                        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2">
                          <div className="text-xs text-gray-600">Winner Prize (80%)</div>
                          <div className="text-lg font-bold text-blue-600">{formatBnb(game.winner_prize)} BNB</div>
                        </div>
                        <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-2">
                          <div className="text-xs text-gray-600">Stake Per Player</div>
                          <div className="text-lg font-bold text-gray-600">{formatBnb(game.stake_amount)} BNB</div>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => handleEndGame(game.id)}
                      className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-6 rounded-lg transition"
                    >
                      <XCircle className="w-5 h-5" />
                      End Game
                    </button>
                  </div>

                  {players.length > 0 && (
                    <div className="bg-gray-50 rounded-lg p-4">
                      <h3 className="font-semibold text-gray-900 mb-3">
                        Players ({activePlayers.length} active{players.some(p => p.is_disqualified) ? `, ${players.filter(p => p.is_disqualified).length} disqualified` : ''})
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                        {players.map((player) => (
                          <div
                            key={player.id}
                            className={`p-3 rounded-lg ${
                              player.is_disqualified
                                ? 'bg-red-50 border border-red-200'
                                : 'bg-white border border-gray-200'
                            }`}
                          >
                            <div className={`font-medium ${
                              player.is_disqualified ? 'text-red-600 line-through' : 'text-gray-900'
                            }`}>
                              {player.name}
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              #{player.selected_number}
                              {player.is_disqualified && ' - Disqualified'}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
          </div>
        )}
      </div>
    </div>
  );
}
