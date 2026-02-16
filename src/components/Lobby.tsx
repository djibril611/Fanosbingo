import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAccount } from 'wagmi';
import { supabase, Game } from '../lib/supabase';
import { TelegramUser } from '../utils/telegram';
import { ToastContainer, ToastData } from './ToastContainer';
import { getCachedLayouts, setCachedLayouts } from '../utils/cardLayoutCache';
import WalletConnect from './WalletConnect';
import { WalletDepositModal } from './WalletDepositModal';
import { BnbWithdrawalModal } from './BnbWithdrawalModal';
import { Sun, Moon, Wallet, Timer, Hash, Trophy, Coins } from 'lucide-react';
import { formatBnb } from '../utils/formatBalance';

interface LobbyProps {
  onJoinGame: (gameId: string, selectedNumber: number, telegramUser: TelegramUser, cardLayout?: number[][]) => void;
  onSpectateGame: (gameId: string) => void;
  telegramUser: TelegramUser | null;
}

interface RegisteredUser {
  telegram_user_id: number;
  balance: number;
  deposited_balance: number;
  won_balance: number;
  telegram_username?: string;
  telegram_first_name: string;
  referral_code?: string;
  total_referrals?: number;
}

interface PlayerInfo {
  selected_number: number;
  name: string;
  telegram_user_id: number;
  id: string;
}

export function Lobby({ onJoinGame, onSpectateGame, telegramUser }: LobbyProps) {
  const { address: walletAddress, isConnected: isWalletConnected } = useAccount();
  const [selectedNumber, setSelectedNumber] = useState<number | null>(null);
  const [previewCard, setPreviewCard] = useState<number[][] | null>(null);
  const [activeGame, setActiveGame] = useState<Game | null>(null);
  const [takenNumbers, setTakenNumbers] = useState<number[]>([]);
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [countdown, setCountdown] = useState<number>(0);
  const [isJoining, setIsJoining] = useState(false);
  const [registeredUser, setRegisteredUser] = useState<RegisteredUser | null>(null);
  const [isCheckingRegistration, setIsCheckingRegistration] = useState(true);
  const [balanceChanged, setBalanceChanged] = useState(false);
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const [optimisticSelection, setOptimisticSelection] = useState<number | null>(null);
  const [processingNumbers, setProcessingNumbers] = useState<Set<number>>(new Set());
  const [timeOffset, setTimeOffset] = useState<number>(0);
  const [isTimeSynced, setIsTimeSynced] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [cardLayoutCache, setCardLayoutCache] = useState<Map<number, number[][]>>(new Map());
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isWalletDepositModalOpen, setIsWalletDepositModalOpen] = useState(false);
  const [isBnbWithdrawalModalOpen, setIsBnbWithdrawalModalOpen] = useState(false);

  const canPlay = !!telegramUser && !!registeredUser && isWalletConnected;

  const addToast = useCallback((message: string, type: 'success' | 'error' | 'info') => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const syncTimeWithServer = useCallback(async () => {
    try {
      const clientTimeBefore = Date.now();
      const { data: serverTime } = await supabase.rpc('get_server_timestamp_ms');
      const clientTimeAfter = Date.now();

      if (serverTime) {
        const networkLatency = (clientTimeAfter - clientTimeBefore) / 2;
        const adjustedServerTime = serverTime + networkLatency;
        const offset = adjustedServerTime - clientTimeAfter;

        setTimeOffset(offset);
        setIsTimeSynced(true);
      }
    } catch (error) {
      console.error('Failed to sync time with server:', error);
      setIsTimeSynced(false);
    }
  }, []);

  const loadLobbyDataOptimized = useCallback(async () => {
    setIsLoadingData(true);

    try {
      const { data, error } = await supabase.rpc('get_lobby_data_instant', {
        user_telegram_id: telegramUser?.id || null,
        user_wallet_address: (!telegramUser && walletAddress) ? walletAddress : null
      });

      if (error) {
        console.error('[Lobby] Error loading lobby data via RPC:', error);
      }

      if (data) {
        const { game, serverTime, takenNumbers, players: playersList, user } = data;

        if (game) {
          setActiveGame(game);
          setTakenNumbers(takenNumbers || []);
          setPlayers(playersList || []);

          if (serverTime) {
            const clientTime = Date.now();
            const offset = serverTime - clientTime;
            setTimeOffset(offset);
            setIsTimeSynced(true);
          }
        } else {
          await createNewGame();
        }

        if (user) {
          setRegisteredUser(user);
          setIsCheckingRegistration(false);
        } else {
          if (telegramUser?.id) {
            const { data: directUser } = await supabase
              .from('telegram_users')
              .select('telegram_user_id, balance, deposited_balance, won_balance, telegram_username, telegram_first_name, referral_code, total_referrals')
              .eq('telegram_user_id', telegramUser.id)
              .maybeSingle();

            if (directUser) {
              setRegisteredUser(directUser);
            }
          } else if (walletAddress) {
            const { data: walletUser } = await supabase
              .from('telegram_users')
              .select('telegram_user_id, balance, deposited_balance, won_balance, telegram_username, telegram_first_name, referral_code, total_referrals')
              .ilike('wallet_address', walletAddress)
              .maybeSingle();

            if (walletUser) {
              setRegisteredUser(walletUser);
            }
          }
          setIsCheckingRegistration(false);
        }
      } else {
        if (telegramUser?.id) {
          const { data: directUser } = await supabase
            .from('telegram_users')
            .select('telegram_user_id, balance, deposited_balance, won_balance, telegram_username, telegram_first_name, referral_code, total_referrals')
            .eq('telegram_user_id', telegramUser.id)
            .maybeSingle();

          if (directUser) {
            setRegisteredUser(directUser);
          }
        } else if (walletAddress) {
          const { data: walletUser } = await supabase
            .from('telegram_users')
            .select('telegram_user_id, balance, deposited_balance, won_balance, telegram_username, telegram_first_name, referral_code, total_referrals')
            .ilike('wallet_address', walletAddress)
            .maybeSingle();

          if (walletUser) {
            setRegisteredUser(walletUser);
          }
        }

        const { data: gameData } = await supabase
          .from('games')
          .select('*')
          .eq('status', 'waiting')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (gameData) {
          setActiveGame(gameData);

          const { data: playersData } = await supabase
            .from('players')
            .select('id, selected_number, name, telegram_user_id')
            .eq('game_id', gameData.id);

          if (playersData) {
            setPlayers(playersData);
            setTakenNumbers(playersData.map(p => p.selected_number).filter(n => n !== null));
          }
        } else {
          await createNewGame();
        }

        setIsCheckingRegistration(false);
      }
    } catch (error) {
      console.error('[Lobby] Failed to load lobby data:', error);
      setIsTimeSynced(false);
      setIsCheckingRegistration(false);
    } finally {
      setIsLoadingData(false);
    }
  }, [telegramUser, walletAddress]);

  const getSyncedTime = useCallback(() => {
    return Date.now() + timeOffset;
  }, [timeOffset]);

  const fetchCardLayout = useCallback(async (cardNumber: number): Promise<number[][] | null> => {
    if (cardLayoutCache.has(cardNumber)) {
      return cardLayoutCache.get(cardNumber)!;
    }

    try {
      const { data, error } = await supabase.rpc('get_or_create_card_layout', {
        p_card_number: cardNumber
      });

      if (error) {
        return null;
      }

      if (data) {
        const layout = data as number[][];
        setCardLayoutCache(prev => new Map(prev).set(cardNumber, layout));
        return layout;
      }

      return null;
    } catch {
      return null;
    }
  }, [cardLayoutCache]);

  const layoutsLoadedRef = useRef(false);

  const loadAllCardLayouts = useCallback(async () => {
    if (layoutsLoadedRef.current) return;
    layoutsLoadedRef.current = true;

    try {
      const cachedLayouts = await getCachedLayouts();
      if (cachedLayouts && Object.keys(cachedLayouts).length >= 400) {
        const newCache = new Map<number, number[][]>();
        for (const [key, value] of Object.entries(cachedLayouts)) {
          newCache.set(parseInt(key, 10), value);
        }
        setCardLayoutCache(newCache);
        return;
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      const response = await fetch(`${supabaseUrl}/functions/v1/get-card-layouts?all=true`, {
        headers: {
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch card layouts');
      }

      const layouts: Record<string, number[][]> = await response.json();

      const newCache = new Map<number, number[][]>();
      const persistLayouts: Record<number, number[][]> = {};

      for (const [key, value] of Object.entries(layouts)) {
        const cardNum = parseInt(key, 10);
        newCache.set(cardNum, value);
        persistLayouts[cardNum] = value;
      }

      setCardLayoutCache(newCache);
      setCachedLayouts(persistLayouts).catch(() => {});
    } catch {
      layoutsLoadedRef.current = false;
    }
  }, []);

  useEffect(() => {
    syncTimeWithServer();

    const syncInterval = setInterval(() => {
      syncTimeWithServer();
    }, 30000);

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        syncTimeWithServer();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(syncInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [syncTimeWithServer]);

  useEffect(() => {
    loadLobbyDataOptimized();
    loadAllCardLayouts();

    if (!telegramUser) return;

    const userChannel = supabase
      .channel(`user:${telegramUser.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'telegram_users', filter: `telegram_user_id=eq.${telegramUser.id}` },
        (payload) => {
          if (payload.new) {
            setRegisteredUser(payload.new as RegisteredUser);
            setBalanceChanged(true);
            setTimeout(() => setBalanceChanged(false), 2000);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(userChannel);
    };
  }, [telegramUser, loadLobbyDataOptimized, loadAllCardLayouts]);

  useEffect(() => {
    const gameChannel = supabase
      .channel('active-games')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games' },
        (payload) => {
          if (payload.new && (payload.new as Game).status !== (payload.old as Game)?.status) {
            loadLobbyDataOptimized();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(gameChannel);
    };
  }, [loadLobbyDataOptimized]);

  useEffect(() => {
    if (!activeGame) return;

    const playersChannel = supabase
      .channel(`players-${activeGame.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'players',
          filter: `game_id=eq.${activeGame.id}`
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newPlayer = payload.new as PlayerInfo;
            if (newPlayer.selected_number) {
              setPlayers((prev) => [...prev, newPlayer]);
              setTakenNumbers((prev) => [...prev, newPlayer.selected_number]);
              setProcessingNumbers((prev) => {
                const next = new Set(prev);
                next.delete(newPlayer.selected_number);
                return next;
              });
            }
          } else if (payload.eventType === 'DELETE') {
            const deletedPlayer = payload.old as PlayerInfo;
            setPlayers((prev) => prev.filter(p => p.id !== deletedPlayer.id));
            setTakenNumbers((prev) => prev.filter(n => n !== deletedPlayer.selected_number));
          } else if (payload.eventType === 'UPDATE') {
            const updatedPlayer = payload.new as PlayerInfo;
            setPlayers((prev) => prev.map(p => p.id === updatedPlayer.id ? updatedPlayer : p));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(playersChannel);
    };
  }, [activeGame]);

  useEffect(() => {
    if (activeGame) {
      updateCountdown();
      const interval = setInterval(updateCountdown, 1000);
      return () => clearInterval(interval);
    }
  }, [activeGame]);

  useEffect(() => {
    if (selectedNumber && selectedNumber >= 1 && selectedNumber <= 400) {
      const layout = cardLayoutCache.get(selectedNumber);
      if (layout) {
        setPreviewCard(layout);
      } else {
        setIsLoadingPreview(true);
        fetchCardLayout(selectedNumber).then(layout => {
          if (layout) {
            setPreviewCard(layout);
          }
          setIsLoadingPreview(false);
        });
      }
    } else {
      setPreviewCard(null);
    }
  }, [selectedNumber, fetchCardLayout, cardLayoutCache]);

  useEffect(() => {
    if (telegramUser && players.length > 0) {
      const myPlayer = players.find(p => p.telegram_user_id === telegramUser.id);
      if (myPlayer) {
        setSelectedNumber(myPlayer.selected_number);
      }
    }
  }, [players, telegramUser]);

  const updateCountdown = async () => {
    if (!activeGame) return;
    const now = getSyncedTime();
    const startsAt = new Date(activeGame.starts_at).getTime();
    const diff = Math.max(0, Math.floor((startsAt - now) / 1000));
    setCountdown(diff);

    if (diff === 0 && activeGame.status === 'waiting') {
      const { data: players } = await supabase
        .from('players')
        .select('id')
        .eq('game_id', activeGame.id);

      if (players && players.length > 0) {
        await startGame();
      } else {
        const { data: serverTime } = await supabase.rpc('get_server_timestamp_ms');

        if (serverTime) {
          const newStartTimeMs = serverTime + 25000;
          const newStartTime = new Date(newStartTimeMs).toISOString();
          const newSelectionClosedAt = new Date(newStartTimeMs - 5000).toISOString();

          const { data: updatedGame } = await supabase
            .from('games')
            .update({ starts_at: newStartTime, selection_closed_at: newSelectionClosedAt })
            .eq('id', activeGame.id)
            .select()
            .maybeSingle();

          if (updatedGame) {
            setActiveGame(updatedGame);
            const clientTime = Date.now();
            const offset = serverTime - clientTime;
            setTimeOffset(offset);
          }
        }
      }
    }
  };

  const createNewGame = async () => {
    const { data: existingWaiting } = await supabase
      .from('games')
      .select('*')
      .eq('status', 'waiting')
      .maybeSingle();

    if (existingWaiting) {
      setActiveGame(existingWaiting);
      return;
    }

    const { data: result } = await supabase.rpc('create_game_with_server_time', {
      countdown_seconds: 25,
      stake_amount_param: 10
    });

    if (result) {
      const { game, serverTime } = result;
      setActiveGame(game);
      const clientTime = Date.now();
      const offset = serverTime - clientTime;
      setTimeOffset(offset);
      setIsTimeSynced(true);
    }
  };

  const startGame = async () => {
    if (!activeGame) return;
    await supabase
      .from('games')
      .update({ status: 'playing', started_at: new Date().toISOString() })
      .eq('id', activeGame.id)
      .eq('status', 'waiting');
  };

  const handleNumberClick = async (num: number, isRetry = false) => {
    if (!canPlay || !activeGame || activeGame.status !== 'waiting') return;

    if (countdown > 0 && countdown < 3 && !isRetry) {
      addToast('Selection window is about to close!', 'error');
      return;
    }

    const myPlayer = players.find(p => p.telegram_user_id === telegramUser!.id);
    const clickedMyNumber = myPlayer && myPlayer.selected_number === num;
    const clickedOptimisticSelection = optimisticSelection === num;

    if (clickedMyNumber) {
      await handleDeselectNumber(myPlayer.id);
      return;
    }

    if (clickedOptimisticSelection) {
      setOptimisticSelection(null);
      setSelectedNumber(null);
      setProcessingNumbers((prev) => {
        const next = new Set(prev);
        next.delete(num);
        return next;
      });
      addToast(`Card ${num} deselected`, 'info');
      return;
    }

    if (myPlayer && !clickedMyNumber) {
      const oldNumber = myPlayer.selected_number;
      const deselectSuccess = await handleDeselectNumber(myPlayer.id);
      if (!deselectSuccess) return;
      addToast(`Changed from card ${oldNumber} to ${num}`, 'info');
    }

    if (optimisticSelection && optimisticSelection !== num && !myPlayer) {
      setOptimisticSelection(null);
      setSelectedNumber(null);
      setProcessingNumbers((prev) => {
        const next = new Set(prev);
        next.delete(optimisticSelection);
        return next;
      });
    }

    if (processingNumbers.has(num)) {
      addToast('That card is being processed. Please wait.', 'info');
      return;
    }

    setSelectedNumber(num);
    setOptimisticSelection(num);

    const layoutPromise = fetchCardLayout(num);

    setTimeout(() => {
      setProcessingNumbers((prev) => new Set(prev).add(num));
    }, 50);

    try {
      const layout = await layoutPromise;
      await onJoinGame(activeGame.id, num, telegramUser!, layout || undefined);
      setProcessingNumbers((prev) => {
        const next = new Set(prev);
        next.delete(num);
        return next;
      });
      addToast(`Card ${num} secured!`, 'success');
    } catch (error) {
      setOptimisticSelection(null);
      setSelectedNumber(null);
      setProcessingNumbers((prev) => {
        const next = new Set(prev);
        next.delete(num);
        return next;
      });

      const errorMessage = error instanceof Error ? error.message : '';

      if (errorMessage.includes('SELECTION_CLOSED') || errorMessage.includes('Selection window has closed')) {
        addToast('Selection window has closed. Game is starting!', 'error');
      } else if (errorMessage.includes('duplicate') || errorMessage.includes('already been taken') || errorMessage.includes('CARD_TAKEN')) {
        addToast('That card was just taken! Please choose another.', 'info');
      } else if (errorMessage.includes('balance') || errorMessage.includes('INSUFFICIENT_BALANCE')) {
        addToast('Insufficient balance to join this game.', 'error');
      } else if (errorMessage.includes('timeout') || errorMessage.includes('network')) {
        if (!isRetry) {
          addToast('Connection slow, retrying...', 'info');
          setTimeout(() => handleNumberClick(num, true), 500);
        } else {
          addToast('Unable to select card. Please try another or check connection.', 'error');
        }
      } else {
        addToast('Unable to select this card. Please try another.', 'error');
      }
    }
  };

  const handleDeselectNumber = async (playerId: string): Promise<boolean> => {
    if (!activeGame || !telegramUser) return false;

    const player = players.find(p => p.id === playerId);
    const cardNumber = player?.selected_number;
    if (!player || !cardNumber) return false;

    setOptimisticSelection(null);
    setSelectedNumber(null);
    setPreviewCard(null);

    const previousPlayers = [...players];
    const previousTakenNumbers = [...takenNumbers];

    setPlayers((prev) => prev.filter(p => p.id !== playerId));
    setTakenNumbers((prev) => prev.filter(n => n !== cardNumber));

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/deselect-card`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          playerId,
          telegramUserId: telegramUser.id
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to deselect card');
      }

      addToast(`Card ${cardNumber} released`, 'info');
      return true;
    } catch {
      addToast('Unable to deselect card. Please try again.', 'error');
      setPlayers(previousPlayers);
      setTakenNumbers(previousTakenNumbers);
      setSelectedNumber(cardNumber);
      return false;
    }
  };

  const playersByNumber = useMemo(() => {
    const map = new Map<number, PlayerInfo>();
    for (const player of players) {
      if (player.selected_number) {
        map.set(player.selected_number, player);
      }
    }
    return map;
  }, [players]);

  const numberStatusMap = useMemo(() => {
    const map = new Map<number, { status: 'taken' | 'mine' | 'available' | 'processing' | 'optimistic', playerName: string | null }>();

    for (let num = 1; num <= 400; num++) {
      let status: 'taken' | 'mine' | 'available' | 'processing' | 'optimistic' = 'available';
      let playerName: string | null = null;

      if (processingNumbers.has(num)) {
        status = 'processing';
      } else if (optimisticSelection === num) {
        status = 'optimistic';
      } else {
        const player = playersByNumber.get(num);
        if (player) {
          status = telegramUser && player.telegram_user_id === telegramUser.id ? 'mine' : 'taken';
          playerName = player.name;
        }
      }

      map.set(num, { status, playerName });
    }

    return map;
  }, [playersByNumber, telegramUser, processingNumbers, optimisticSelection]);

  const getNumberStatus = useCallback((num: number) => {
    return numberStatusMap.get(num)?.status || 'available';
  }, [numberStatusMap]);

  const getPlayerName = useCallback((num: number) => {
    return numberStatusMap.get(num)?.playerName || null;
  }, [numberStatusMap]);

  const numberGrid = useMemo(() => Array.from({ length: 400 }, (_, i) => i + 1), []);

  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    return saved === 'false' ? false : true;
  });

  useEffect(() => {
    localStorage.setItem('darkMode', String(isDarkMode));
  }, [isDarkMode]);

  const displayName = telegramUser?.first_name || (walletAddress ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}` : 'Player');

  return (
    <div className={`min-h-screen transition-colors duration-300 ${isDarkMode ? 'bg-gradient-to-br from-gray-900 to-gray-800' : 'bg-gradient-to-br from-blue-50 to-indigo-100'} p-2 sm:p-4`}>
      <div className="max-w-4xl mx-auto pt-1">
        <div className={`rounded-2xl mb-2 transition-all duration-300 overflow-hidden ${isDarkMode ? 'bg-gray-800/90 border border-gray-700/40 shadow-lg shadow-black/20' : 'bg-white/95 border border-gray-200/60 shadow-lg shadow-black/5'}`}>
          <div className="flex items-center justify-between px-3 py-2.5 sm:px-4 sm:py-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="min-w-0">
                <p className={`text-sm font-semibold truncate ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                  {displayName}
                </p>
                {isWalletConnected && walletAddress ? (
                  <div className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                    <span className={`text-[11px] font-mono truncate ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
                    </span>
                  </div>
                ) : (
                  <p className={`text-[11px] ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>No wallet</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              {activeGame && countdown > 0 && (
                <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl transition-all ${
                  countdown <= 5
                    ? 'bg-red-500/15 border border-red-500/30 animate-pulse'
                    : isDarkMode ? 'bg-gray-700/60 border border-gray-600/30' : 'bg-gray-100 border border-gray-200/60'
                }`}>
                  <Timer className={`w-3.5 h-3.5 ${
                    countdown <= 5
                      ? 'text-red-400'
                      : isDarkMode ? 'text-gray-400' : 'text-gray-500'
                  }`} />
                  <span className={`text-sm font-bold tabular-nums ${
                    countdown <= 5
                      ? 'text-red-400'
                      : isDarkMode ? 'text-white' : 'text-gray-900'
                  }`}>
                    {countdown}s
                  </span>
                  <span className={`text-[10px] font-medium uppercase ${
                    countdown <= 5
                      ? 'text-red-400/70'
                      : isDarkMode ? 'text-gray-500' : 'text-gray-400'
                  }`}>
                    {countdown <= 5 ? 'closing' : 'start'}
                  </span>
                </div>
              )}

              <button
                onClick={() => setIsDarkMode(!isDarkMode)}
                className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${isDarkMode ? 'bg-gray-700/60 hover:bg-gray-600/60 text-amber-400' : 'bg-gray-100 hover:bg-gray-200 text-slate-600'}`}
              >
                {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className={`flex items-stretch border-t ${isDarkMode ? 'border-gray-700/40 bg-gray-900/30' : 'border-gray-100 bg-gray-50/50'}`}>
            <div className={`flex-1 flex items-center justify-center gap-1.5 py-2 ${isDarkMode ? 'text-orange-400' : 'text-orange-600'}`}>
              <Hash className="w-3.5 h-3.5 opacity-60" />
              <span className="text-base font-bold tabular-nums">{selectedNumber || '--'}</span>
            </div>

            <div className={`w-px ${isDarkMode ? 'bg-gray-700/40' : 'bg-gray-200/80'}`} />

            {registeredUser && (
              <>
                <div className={`flex-1 flex items-center justify-center gap-1.5 py-2 transition-all ${balanceChanged ? 'scale-105' : ''} ${isDarkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>
                  <Coins className="w-3.5 h-3.5 opacity-60" />
                  <span className="text-base font-bold tabular-nums">{formatBnb(registeredUser.deposited_balance + registeredUser.won_balance)}</span>
                </div>
                <div className={`w-px ${isDarkMode ? 'bg-gray-700/40' : 'bg-gray-200/80'}`} />
              </>
            )}

            {registeredUser && registeredUser.won_balance > 0 && (
              <>
                <div className={`flex-1 flex items-center justify-center gap-1.5 py-2 ${isDarkMode ? 'text-yellow-400' : 'text-yellow-600'}`}>
                  <Trophy className="w-3.5 h-3.5 opacity-60" />
                  <span className="text-base font-bold tabular-nums">{formatBnb(registeredUser.won_balance)}</span>
                </div>
                <div className={`w-px ${isDarkMode ? 'bg-gray-700/40' : 'bg-gray-200/80'}`} />
              </>
            )}

            {activeGame && (
              <div className={`flex-1 flex items-center justify-center gap-1.5 py-2 ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>
                <Wallet className="w-3.5 h-3.5 opacity-60" />
                <span className="text-base font-bold tabular-nums">{formatBnb(activeGame.stake_amount)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Connect Wallet Prompt */}
        {!isWalletConnected && (
          <div className={`border-l-4 p-3 mb-3 rounded transition-colors duration-300 ${isDarkMode ? 'bg-yellow-900/20 border-yellow-600 text-yellow-300' : 'bg-yellow-50 border-yellow-400 text-yellow-800'}`}>
            <p className="text-sm font-semibold mb-2">Connect Your BNB Wallet to Play</p>
            <p className="text-xs mb-2 opacity-90">A wallet connection is required to deposit, withdraw, and play games.</p>
            <WalletConnect
              telegramUserId={telegramUser?.id || 0}
              onWalletConnected={() => addToast('Wallet connected!', 'success')}
            />
          </div>
        )}

        {/* Wallet connected, ready to play */}
        {isWalletConnected && registeredUser && (
          <div className={`border-l-4 p-3 mb-3 rounded transition-colors duration-300 ${isDarkMode ? 'bg-emerald-900/20 border-emerald-600 text-emerald-300' : 'bg-emerald-50 border-emerald-400 text-emerald-800'}`}>
            <p className="text-sm font-semibold mb-2">Crypto (BNB) Deposits & Withdrawals</p>
            <p className="text-xs mb-2 opacity-90">Deposit BNB to play or withdraw your winnings ({activeGame ? formatBnb(activeGame.stake_amount) : '0.10'} BNB per game)</p>
            <div className="flex gap-2">
              <button
                onClick={() => setIsWalletDepositModalOpen(true)}
                className="flex-1 py-2 px-4 rounded-lg font-semibold transition-colors bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                Deposit BNB
              </button>
              <button
                onClick={() => setIsBnbWithdrawalModalOpen(true)}
                disabled={!registeredUser.won_balance || registeredUser.won_balance === 0}
                className={`flex-1 py-2 px-4 rounded-lg font-semibold transition-colors ${
                  registeredUser.won_balance > 0
                    ? 'bg-yellow-600 hover:bg-yellow-700 text-white'
                    : isDarkMode ? 'bg-gray-700 text-gray-500 cursor-not-allowed' : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }`}
              >
                Withdraw BNB
              </button>
            </div>
          </div>
        )}

        {/* Loading registration */}
        {isWalletConnected && !registeredUser && isCheckingRegistration && (
          <div className={`border-l-4 p-3 mb-3 rounded transition-colors duration-300 ${isDarkMode ? 'bg-blue-900/20 border-blue-600 text-blue-300' : 'bg-blue-50 border-blue-400 text-blue-800'}`}>
            <p className="text-sm font-medium">Setting up your account...</p>
          </div>
        )}

        {activeGame && countdown > 25 && activeGame.status === 'waiting' && (
          <div className={`border-l-4 p-2 mb-3 rounded transition-colors duration-300 ${isDarkMode ? 'bg-blue-900/20 border-blue-500 text-blue-300' : 'bg-blue-50 border-blue-400 text-blue-800'}`}>
            <p className="text-xs sm:text-sm font-medium">Extra time! Previous game just finished - you have more time to select your card.</p>
          </div>
        )}
        {activeGame && countdown > 0 && countdown <= 5 && activeGame.status === 'waiting' && (
          <div className={`border-l-4 p-3 mb-3 rounded transition-all duration-300 ${countdown <= 3 ? 'animate-pulse' : ''} ${isDarkMode ? 'bg-orange-900/30 border-orange-500 text-orange-200' : 'bg-orange-50 border-orange-500 text-orange-900'}`}>
            <p className="text-sm sm:text-base font-bold">
              Selection closing in {countdown} second{countdown !== 1 ? 's' : ''}!
            </p>
            <p className="text-xs sm:text-sm mt-1 opacity-90">
              Choose your card now or you may miss this game
            </p>
          </div>
        )}

        {/* Number Selection Grid */}
        <div className={`rounded-xl shadow-lg p-3 sm:p-4 mb-3 transition-colors duration-300 ${isDarkMode ? 'bg-gray-800/95 border border-gray-700/50' : 'bg-white border border-gray-100'}`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex gap-2 text-[10px] sm:text-xs">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-green-500"></div>
                <span className={isDarkMode ? 'text-gray-300' : 'text-gray-600'}>Your pick</span>
              </div>
              <div className="flex items-center gap-1">
                <div className={`w-3 h-3 rounded ${isDarkMode ? 'bg-red-500/40' : 'bg-red-100'}`}></div>
                <span className={isDarkMode ? 'text-gray-300' : 'text-gray-600'}>Taken</span>
              </div>
            </div>
            <span className={`text-[10px] sm:text-xs font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-500'}`}>{takenNumbers.length}/400</span>
          </div>

          <div className="grid grid-cols-10 sm:grid-cols-15 md:grid-cols-20 gap-1 max-h-[40vh] overflow-y-auto p-1">
            {numberGrid.map((num) => {
              const status = getNumberStatus(num);
              const playerName = getPlayerName(num);
              const isSelectionClosing = countdown < 3 && countdown > 0;
              const isDisabled = status === 'taken' || status === 'processing' || (activeGame?.status === 'playing') || !canPlay || isSelectionClosing;

              return (
                <button
                  key={num}
                  onClick={() => handleNumberClick(num)}
                  disabled={isDisabled}
                  title={
                    playerName ? `Selected by ${playerName}` :
                    status === 'processing' ? 'Checking...' :
                    status === 'optimistic' ? 'Your selection' : ''
                  }
                  className={`
                    h-8 sm:h-9 flex flex-col items-center justify-center text-xs font-semibold rounded relative
                    select-none touch-manipulation transition-colors duration-150
                    ${status === 'taken'
                      ? isDarkMode ? 'bg-red-900/40 text-red-400 cursor-not-allowed' : 'bg-red-100 text-red-600 cursor-not-allowed'
                      : status === 'mine' || status === 'optimistic'
                      ? 'bg-green-500 text-white ring-2 sm:ring-4 ring-green-400 cursor-pointer active:scale-95 active:ring-green-500'
                      : status === 'processing'
                      ? isDarkMode ? 'bg-yellow-900/40 text-yellow-400 cursor-wait border-2 border-yellow-500' : 'bg-yellow-100 text-yellow-700 cursor-wait border-2 border-yellow-400'
                      : canPlay && activeGame?.status === 'waiting'
                      ? isDarkMode ? 'bg-gray-700 text-gray-200 cursor-pointer active:scale-95 active:bg-blue-700 active:shadow-inner' : 'bg-gray-100 text-gray-800 cursor-pointer active:scale-95 active:bg-blue-200 active:shadow-inner'
                      : isDarkMode ? 'bg-gray-700 text-gray-500 cursor-not-allowed' : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    }
                  `}
                >
                  <span className="font-bold">{num}</span>
                  {status === 'processing' && (
                    <span className="absolute top-0 right-0 w-1.5 h-1.5 m-0.5">
                      <span className="absolute inline-flex h-full w-full rounded-full bg-yellow-500 opacity-75"></span>
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Bingo Card Preview */}
        {selectedNumber && (
          <div className={`rounded-xl shadow-lg p-4 mb-3 max-w-md mx-auto transition-colors duration-300 ${isDarkMode ? 'bg-gray-800/95 border border-gray-700/50' : 'bg-white border border-gray-100'}`}>
            {isLoadingPreview ? (
              <div className="flex items-center justify-center h-64">
                <div className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Loading card layout...</div>
              </div>
            ) : previewCard ? (
              <>
                <div className="grid grid-cols-5 gap-1.5 mb-1.5">
                  {['B', 'I', 'N', 'G', 'O'].map((letter) => (
                    <div
                      key={letter}
                      className="h-8 sm:h-10 flex items-center justify-center bg-blue-600 text-white font-bold text-sm sm:text-base rounded"
                    >
                      {letter}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-5 gap-1.5">
                  {Array.from({ length: 5 }, (_, rowIndex) =>
                    previewCard.map((column, colIndex) => {
                      const number = column[rowIndex];
                      const isFree = colIndex === 2 && rowIndex === 2;
                      return (
                        <div
                          key={`${colIndex}-${rowIndex}`}
                          className={`h-10 sm:h-12 flex items-center justify-center text-xs sm:text-sm font-semibold rounded transition-colors duration-300 ${
                            isFree ? isDarkMode ? 'bg-yellow-500 text-gray-900' : 'bg-yellow-400 text-gray-800' : isDarkMode ? 'bg-gray-700 text-gray-200' : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {isFree ? '\u2605' : number}
                        </div>
                      );
                    })
                  )}
                </div>
                {getNumberStatus(selectedNumber!) === 'mine' && (
                  <div className={`mt-3 rounded-lg p-2 border text-center transition-colors duration-300 ${isDarkMode ? 'bg-green-900/20 border-green-600 text-green-300' : 'bg-green-50 border-green-200 text-gray-700'}`}>
                    <p className="text-[10px] sm:text-xs">Tap same card to deselect or tap another to change</p>
                  </div>
                )}
              </>
            ) : null}
          </div>
        )}

      </div>
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      {telegramUser && (
        <>
          <WalletDepositModal
            isOpen={isWalletDepositModalOpen}
            onClose={() => setIsWalletDepositModalOpen(false)}
            telegramUserId={telegramUser.id}
            onSuccess={() => {
              addToast('Deposit successful! Your balance will be updated shortly.', 'success');
              loadLobbyDataOptimized();
            }}
          />
          <BnbWithdrawalModal
            isOpen={isBnbWithdrawalModalOpen}
            onClose={() => setIsBnbWithdrawalModalOpen(false)}
            telegramUserId={telegramUser.id}
            wonBalance={registeredUser?.won_balance || 0}
            onSuccess={() => {
              addToast('Withdrawal request submitted successfully!', 'success');
              loadLobbyDataOptimized();
            }}
          />
        </>
      )}
    </div>
  );
}
