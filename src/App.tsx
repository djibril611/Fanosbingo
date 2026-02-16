import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { WagmiProvider } from 'wagmi';
import { QueryClientProvider } from '@tanstack/react-query';
import { useAccount } from 'wagmi';
import { Lobby } from './components/Lobby';
import { GameRoom } from './components/GameRoom';
import { WalletDepositModal } from './components/WalletDepositModal';
import { NetworkQualityIndicator } from './components/NetworkQualityIndicator';
import { supabase } from './lib/supabase';
import { initTelegram, TelegramUser } from './utils/telegram';
import { config, queryClient } from './lib/walletConfig';

const Admin = lazy(() => import('./components/Admin').then(module => ({ default: module.Admin })));

type View = 'lobby' | 'game' | 'admin';

function AppContent() {
  const { address, isConnected } = useAccount();
  const [view, setView] = useState<View>('lobby');
  const [appUser, setAppUser] = useState<TelegramUser | null>(null);
  const [gameId, setGameId] = useState<string | null>(() => localStorage.getItem('gameId'));
  const [playerId, setPlayerId] = useState<string | null>(() => localStorage.getItem('playerId'));
  const [gameStarted, setGameStarted] = useState(false);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [userBalance, setUserBalance] = useState(0);
  const walletRegistered = useRef(false);

  useEffect(() => {
    const telegramData = initTelegram();
    if (telegramData.user) {
      setAppUser(telegramData.user);
    }
  }, []);

  useEffect(() => {
    if (appUser || !isConnected || !address || walletRegistered.current) return;

    const registerWalletUser = async () => {
      try {
        walletRegistered.current = true;
        const { data, error } = await supabase.rpc('get_or_create_wallet_user', {
          p_wallet_address: address,
        });

        if (error || !data?.success) {
          walletRegistered.current = false;
          return;
        }

        const user = data.user;
        setAppUser({
          id: user.telegram_user_id,
          first_name: user.telegram_first_name || `${address.slice(0, 6)}...${address.slice(-4)}`,
          username: user.telegram_username || undefined,
        });
      } catch {
        walletRegistered.current = false;
      }
    };

    registerWalletUser();
  }, [isConnected, address, appUser]);

  useEffect(() => {
    if (!isConnected && !appUser) {
      walletRegistered.current = false;
    }
  }, [isConnected, appUser]);

  useEffect(() => {
    if (gameId) {
      localStorage.setItem('gameId', gameId);
    } else {
      localStorage.removeItem('gameId');
    }
  }, [gameId]);

  useEffect(() => {
    if (playerId) {
      localStorage.setItem('playerId', playerId);
    } else {
      localStorage.removeItem('playerId');
    }
  }, [playerId]);

  useEffect(() => {
    const restoreSession = async () => {
      if (!playerId || !gameId) return;

      const { data: game } = await supabase
        .from('games')
        .select('status')
        .eq('id', gameId)
        .maybeSingle();

      if (game?.status === 'playing' || game?.status === 'finished') {
        setGameStarted(true);
      } else if (!game) {
        setGameId(null);
        setPlayerId(null);
        setGameStarted(false);
      }
    };

    restoreSession();
  }, []);

  useEffect(() => {
    const checkForActiveGames = async () => {
      if (gameId && gameStarted) {
        const { data: currentGame } = await supabase
          .from('games')
          .select('status')
          .eq('id', gameId)
          .maybeSingle();

        if (currentGame?.status === 'finished' || currentGame?.status === 'playing') {
          return;
        }
      }

      const { data: playingGames } = await supabase
        .from('games')
        .select('id')
        .eq('status', 'playing')
        .order('created_at', { ascending: false })
        .limit(1);

      if (playingGames && playingGames.length > 0) {
        const activeGameId = playingGames[0].id;

        if (appUser) {
          const { data: playerRecord } = await supabase
            .from('players')
            .select('id')
            .eq('game_id', activeGameId)
            .eq('telegram_user_id', appUser.id)
            .maybeSingle();

          setPlayerId(playerRecord?.id || null);
        } else {
          setPlayerId(null);
        }

        setGameId(activeGameId);
        setGameStarted(true);
      } else {
        if (gameId) {
          const { data: currentGame } = await supabase
            .from('games')
            .select('status')
            .eq('id', gameId)
            .maybeSingle();

          if (currentGame?.status === 'finished') {
            setGameStarted(true);
          } else {
            setGameStarted(false);
          }
        } else {
          setGameStarted(false);
        }
      }
    };

    checkForActiveGames();

    const activeGameChannel = supabase
      .channel('auto-redirect-games')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'games' },
        () => { checkForActiveGames(); }
      )
      .subscribe();

    const pollInterval = setInterval(() => {
      if (!document.hidden) {
        checkForActiveGames();
      }
    }, 10000);

    return () => {
      supabase.removeChannel(activeGameChannel);
      clearInterval(pollInterval);
    };
  }, [appUser, gameId, gameStarted]);

  useEffect(() => {
    if (!playerId || !gameId) return;

    const playerChannel = supabase
      .channel(`player:${playerId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameId}` },
        (payload) => {
          const updatedGame = payload.new as { status: string };
          if (updatedGame.status === 'playing') {
            setGameStarted(true);
          }
        }
      )
      .subscribe();

    const pollInterval = setInterval(async () => {
      if (document.hidden) return;

      const { data: game } = await supabase
        .from('games')
        .select('status')
        .eq('id', gameId)
        .maybeSingle();

      if (game?.status === 'playing' && !gameStarted) {
        setGameStarted(true);
      }
    }, 5000);

    return () => {
      supabase.removeChannel(playerChannel);
      clearInterval(pollInterval);
    };
  }, [playerId, gameId, gameStarted]);

  const handleJoinGame = async (gameId: string, selectedNumber: number, user: TelegramUser, cardLayout?: number[][]) => {
    const playerName = user.username
      ? `@${user.username}`
      : user.first_name;

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    const response = await fetch(`${supabaseUrl}/functions/v1/select-card`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseAnonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        gameId,
        cardNumber: selectedNumber,
        telegramUserId: user.id,
        playerName,
        telegramUsername: user.username || null,
        telegramFirstName: user.first_name,
        telegramLastName: user.last_name || null,
        cardLayout,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      if (result.error === 'Insufficient balance') {
        const { data: userData } = await supabase
          .from('telegram_users')
          .select('deposited_balance, won_balance')
          .eq('telegram_user_id', user.id)
          .maybeSingle();

        setUserBalance((userData?.deposited_balance || 0) + (userData?.won_balance || 0));
        setShowDepositModal(true);
      }
      throw new Error(result.error || 'Failed to join game');
    }

    setPlayerId(result.playerId);
    setGameId(gameId);
  };

  const handleSpectateGame = (gameId: string) => {
    setGameId(gameId);
    setGameStarted(true);
    setView('game');
  };

  useEffect(() => {
    const checkAdminPath = () => {
      if (window.location.pathname === '/admin') {
        setView('admin');
      }
    };
    checkAdminPath();
    window.addEventListener('popstate', checkAdminPath);
    return () => window.removeEventListener('popstate', checkAdminPath);
  }, []);

  const handleReturnToLobby = useCallback(() => {
    localStorage.removeItem('gameId');
    localStorage.removeItem('playerId');
    setGameId(null);
    setPlayerId(null);
    setGameStarted(false);
  }, []);

  if (view === 'admin') {
    return (
      <>
        <Suspense fallback={<div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center"><div className="text-gray-600">Loading admin panel...</div></div>}>
          <Admin />
        </Suspense>
        <NetworkQualityIndicator />
      </>
    );
  }

  if (gameId && gameStarted) {
    return (
      <>
        <GameRoom gameId={gameId} playerId={playerId} onReturnToLobby={handleReturnToLobby} />
        {appUser && (
          <WalletDepositModal
            isOpen={showDepositModal}
            onClose={() => setShowDepositModal(false)}
            telegramUserId={appUser.id}
            onSuccess={() => setShowDepositModal(false)}
          />
        )}
        <NetworkQualityIndicator />
      </>
    );
  }

  return (
    <>
      <Lobby onJoinGame={handleJoinGame} onSpectateGame={handleSpectateGame} telegramUser={appUser} />
      {appUser && (
        <WalletDepositModal
          isOpen={showDepositModal}
          onClose={() => setShowDepositModal(false)}
          telegramUserId={appUser.id}
          onSuccess={() => setShowDepositModal(false)}
        />
      )}
      <NetworkQualityIndicator />
    </>
  );
}

function App() {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <AppContent />
      </QueryClientProvider>
    </WagmiProvider>
  );
}

export default App;
