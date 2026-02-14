import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { WagmiProvider } from 'wagmi';
import { QueryClientProvider } from '@tanstack/react-query';
import { Lobby } from './components/Lobby';
import { GameRoom } from './components/GameRoom';
import { WalletDepositModal } from './components/WalletDepositModal';
import { NetworkQualityIndicator } from './components/NetworkQualityIndicator';
import { supabase } from './lib/supabase';
import { initTelegram, TelegramUser } from './utils/telegram';
import { config, queryClient } from './lib/walletConfig';

// Lazy load Admin component (only loaded when accessing /admin)
const Admin = lazy(() => import('./components/Admin').then(module => ({ default: module.Admin })));

type View = 'lobby' | 'game' | 'admin';

function App() {
  const [view, setView] = useState<View>('lobby');
  const [telegramUser, setTelegramUser] = useState<TelegramUser | null>(null);
  const [gameId, setGameId] = useState<string | null>(() => {
    return localStorage.getItem('gameId');
  });
  const [playerId, setPlayerId] = useState<string | null>(() => {
    return localStorage.getItem('playerId');
  });
  const [gameStarted, setGameStarted] = useState(false);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [userBalance, setUserBalance] = useState(0);

  useEffect(() => {
    const telegramData = initTelegram();
    console.log('[App] Telegram initialization result:', telegramData);
    if (telegramData.user) {
      console.log('[App] Setting telegram user:', {
        id: telegramData.user.id,
        username: telegramData.user.username,
        first_name: telegramData.user.first_name
      });
      setTelegramUser(telegramData.user);
    } else {
      console.warn('[App] No telegram user detected');
    }
  }, []);

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

      if (game?.status === 'playing') {
        setGameStarted(true);
      } else if (game?.status === 'finished') {
        // Allow viewing finished game (for winner display)
        setGameStarted(true);
      } else if (!game) {
        // Only clear if game doesn't exist
        setGameId(null);
        setPlayerId(null);
        setGameStarted(false);
      }
    };

    restoreSession();
  }, []);

  useEffect(() => {
    const checkForActiveGames = async () => {
      // If currently viewing a game (whether playing or finished), don't interfere
      // Let the GameRoom component handle its own lifecycle
      if (gameId && gameStarted) {
        const { data: currentGame } = await supabase
          .from('games')
          .select('status')
          .eq('id', gameId)
          .maybeSingle();

        // If viewing a finished game, don't interfere - GameRoom will handle return to lobby
        if (currentGame?.status === 'finished') {
          return;
        }

        // If viewing a playing game, just keep it as is
        if (currentGame?.status === 'playing') {
          return;
        }

        // Only proceed to check for new games if current game doesn't exist or is waiting
      }

      const { data: playingGames } = await supabase
        .from('games')
        .select('id')
        .eq('status', 'playing')
        .order('created_at', { ascending: false })
        .limit(1);

      if (playingGames && playingGames.length > 0) {
        const activeGameId = playingGames[0].id;

        if (telegramUser) {
          const { data: playerRecord } = await supabase
            .from('players')
            .select('id')
            .eq('game_id', activeGameId)
            .eq('telegram_user_id', telegramUser.id)
            .maybeSingle();

          if (playerRecord) {
            setPlayerId(playerRecord.id);
          } else {
            setPlayerId(null);
          }
        } else {
          setPlayerId(null);
        }

        setGameId(activeGameId);
        setGameStarted(true);
      } else {
        // Check if current game is finished - if so, keep gameStarted=true to allow winner display
        if (gameId) {
          const { data: currentGame } = await supabase
            .from('games')
            .select('status')
            .eq('id', gameId)
            .maybeSingle();

          if (currentGame?.status === 'finished') {
            // Keep gameStarted=true to allow GameRoom to show winners for 10 seconds
            setGameStarted(true);
          } else {
            // No active game and current game is not finished
            setGameStarted(false);
          }
        } else {
          // No gameId, so no game to display
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
        () => {
          checkForActiveGames();
        }
      )
      .subscribe();

    // Reduced polling frequency - realtime subscriptions handle most updates
    // Only poll as backup when tab is visible
    const pollInterval = setInterval(() => {
      if (!document.hidden) {
        checkForActiveGames();
      }
    }, 10000); // Reduced from 3s to 10s

    return () => {
      supabase.removeChannel(activeGameChannel);
      clearInterval(pollInterval);
    };
  }, [telegramUser, gameId, gameStarted]);

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
          // Don't handle 'finished' status here - let GameRoom component control the timing
        }
      )
      .subscribe();

    // Reduced polling as backup - realtime subscription handles most updates
    const pollInterval = setInterval(async () => {
      if (document.hidden) return; // Skip if tab not visible

      const { data: game } = await supabase
        .from('games')
        .select('status')
        .eq('id', gameId)
        .maybeSingle();

      if (game?.status === 'playing' && !gameStarted) {
        setGameStarted(true);
      }
      // Don't handle 'finished' status here - let GameRoom component control the timing
    }, 5000); // Reduced from 2s to 5s

    return () => {
      supabase.removeChannel(playerChannel);
      clearInterval(pollInterval);
    };
  }, [playerId, gameId, gameStarted]);

  const handleJoinGame = async (gameId: string, selectedNumber: number, telegramUser: TelegramUser, cardLayout?: number[][]) => {
    const playerName = telegramUser.username
      ? `@${telegramUser.username}`
      : telegramUser.first_name;

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
        telegramUserId: telegramUser.id,
        playerName,
        telegramUsername: telegramUser.username,
        telegramFirstName: telegramUser.first_name,
        telegramLastName: telegramUser.last_name,
        cardLayout,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      if (result.error === 'Insufficient balance') {
        const { data: userData } = await supabase
          .from('telegram_users')
          .select('deposited_balance, won_balance')
          .eq('telegram_user_id', telegramUser.id)
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
    // Clear all game-related state and localStorage
    localStorage.removeItem('gameId');
    localStorage.removeItem('playerId');
    setGameId(null);
    setPlayerId(null);
    setGameStarted(false);
  }, []);

  const renderContent = () => {
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
          {telegramUser && (
            <WalletDepositModal
              isOpen={showDepositModal}
              onClose={() => setShowDepositModal(false)}
              telegramUserId={telegramUser.id}
              onSuccess={() => setShowDepositModal(false)}
            />
          )}
          <NetworkQualityIndicator />
        </>
      );
    }

    return (
      <>
        <Lobby onJoinGame={handleJoinGame} onSpectateGame={handleSpectateGame} telegramUser={telegramUser} />
        {telegramUser && (
          <WalletDepositModal
            isOpen={showDepositModal}
            onClose={() => setShowDepositModal(false)}
            telegramUserId={telegramUser.id}
            onSuccess={() => setShowDepositModal(false)}
          />
        )}
        <NetworkQualityIndicator />
      </>
    );
  };

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        {renderContent()}
      </QueryClientProvider>
    </WagmiProvider>
  );
}

export default App;
