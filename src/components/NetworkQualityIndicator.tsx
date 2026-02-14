import { useNetworkQuality } from '../hooks/useNetworkQuality';
import { Wifi, WifiOff, Signal, SignalLow, SignalMedium, SignalHigh } from 'lucide-react';

interface NetworkQualityIndicatorProps {
  compact?: boolean;
  isDarkMode?: boolean;
  pendingActions?: number;
  isReconnecting?: boolean;
}

export function NetworkQualityIndicator({
  compact = false,
  isDarkMode = false,
  pendingActions = 0,
  isReconnecting = false
}: NetworkQualityIndicatorProps) {
  const { quality, showNetworkWarning } = useNetworkQuality();

  if (compact) {
    const getStatusColor = () => {
      if (!quality.isOnline || isReconnecting) return 'text-red-500';
      if (quality.latency > 500 || quality.bandwidth === 'slow') return 'text-yellow-500';
      return isDarkMode ? 'text-green-400' : 'text-green-500';
    };

    const getIcon = () => {
      if (!quality.isOnline) return <WifiOff className="w-4 h-4" />;
      if (isReconnecting) return <Wifi className="w-4 h-4 animate-pulse" />;
      if (quality.bandwidth === 'slow') return <SignalLow className="w-4 h-4" />;
      if (quality.bandwidth === 'medium') return <SignalMedium className="w-4 h-4" />;
      return <SignalHigh className="w-4 h-4" />;
    };

    return (
      <div className={`flex items-center gap-1.5 ${getStatusColor()}`}>
        {getIcon()}
        {pendingActions > 0 && (
          <span className="text-xs bg-yellow-500 text-white rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
            {pendingActions}
          </span>
        )}
        {quality.latency > 0 && quality.isOnline && (
          <span className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            {quality.latency}ms
          </span>
        )}
      </div>
    );
  }

  if (!showNetworkWarning && !isReconnecting) {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-80 z-50">
      <div className={`border rounded-lg p-3 shadow-lg ${
        !quality.isOnline
          ? 'bg-red-50 border-red-200'
          : isReconnecting
            ? 'bg-blue-50 border-blue-200'
            : 'bg-yellow-50 border-yellow-200'
      }`}>
        <div className="flex items-start gap-3">
          {!quality.isOnline ? (
            <WifiOff className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          ) : isReconnecting ? (
            <Wifi className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5 animate-pulse" />
          ) : (
            <SignalLow className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
          )}
          <div className="flex-1">
            <p className={`font-semibold text-sm ${
              !quality.isOnline ? 'text-red-900' : isReconnecting ? 'text-blue-900' : 'text-yellow-900'
            }`}>
              {!quality.isOnline ? 'Offline' : isReconnecting ? 'Reconnecting...' : 'Slow Connection'}
            </p>
            <p className={`text-xs mt-1 ${
              !quality.isOnline ? 'text-red-700' : isReconnecting ? 'text-blue-700' : 'text-yellow-700'
            }`}>
              {!quality.isOnline ? (
                <>
                  Actions will sync when connection is restored
                  {pendingActions > 0 && (
                    <span className="block mt-1 font-medium">
                      {pendingActions} pending action{pendingActions !== 1 ? 's' : ''}
                    </span>
                  )}
                </>
              ) : isReconnecting ? (
                'Attempting to restore connection...'
              ) : (
                <>
                  Latency: {quality.latency}ms | Speed: {quality.bandwidth}
                  <br />
                  Game updates may be delayed
                </>
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
