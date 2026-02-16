import { useEffect, useState } from 'react';
import { useAccount, useDisconnect } from 'wagmi';
import { Wallet, LogOut, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { modal } from '../lib/walletConfig';

interface WalletConnectProps {
  telegramUserId: number;
  onWalletConnected?: (address: string) => void;
}

export default function WalletConnect({ telegramUserId, onWalletConnected }: WalletConnectProps) {
  const { address, isConnected, isConnecting } = useAccount();
  const { disconnect } = useDisconnect();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isConnected && address) {
      saveWalletAddress(address);
    }
  }, [isConnected, address]);

  const saveWalletAddress = async (walletAddress: string) => {
    setIsSaving(true);
    setError(null);

    try {
      if (telegramUserId > 0) {
        const { error: updateError } = await supabase
          .from('telegram_users')
          .update({
            wallet_address: walletAddress,
            wallet_connected_at: new Date().toISOString(),
            last_active_at: new Date().toISOString()
          })
          .eq('telegram_user_id', telegramUserId);

        if (updateError) {
          console.error('Error saving wallet address:', updateError);
          setError('Failed to save wallet address');
          return;
        }
      }

      onWalletConnected?.(walletAddress);
    } catch (err) {
      console.error('Error:', err);
      setError('Failed to connect wallet');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      if (telegramUserId > 0) {
        await supabase
          .from('telegram_users')
          .update({
            wallet_address: null,
            last_active_at: new Date().toISOString()
          })
          .eq('telegram_user_id', telegramUserId);
      }

      disconnect();
    } catch (err) {
      console.error('Error disconnecting wallet:', err);
    }
  };

  const openWalletModal = () => {
    if (modal) {
      modal.open();
    }
  };

  if (isConnecting || isSaving) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span>Connecting...</span>
      </div>
    );
  }

  if (isConnected && address) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg">
          <Wallet className="w-5 h-5" />
          <span className="font-mono text-sm">
            {address.slice(0, 6)}...{address.slice(-4)}
          </span>
          <button
            onClick={handleDisconnect}
            className="ml-2 p-1 hover:bg-green-700 rounded transition-colors"
            title="Disconnect Wallet"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
        {error && (
          <p className="text-red-500 text-sm">{error}</p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={openWalletModal}
        className="flex items-center justify-center gap-2 px-6 py-3 bg-yellow-500 hover:bg-yellow-600 text-black font-semibold rounded-lg transition-colors shadow-lg"
      >
        <Wallet className="w-5 h-5" />
        <span>Connect BNB Wallet</span>
      </button>
      {error && (
        <p className="text-red-500 text-sm">{error}</p>
      )}
      <p className="text-xs text-gray-400 text-center">
        {telegramUserId > 0 ? 'Connect your wallet to deposit BNB and play' : 'Connect your wallet to make deposits & withdrawals'}
      </p>
    </div>
  );
}
