import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { RealtimeChannel } from '@supabase/supabase-js';

interface ConnectionState {
  isConnected: boolean;
  isReconnecting: boolean;
  reconnectAttempts: number;
  lastHeartbeat: number | null;
}

interface ConnectionManagerOptions {
  heartbeatInterval?: number;
  maxReconnectAttempts?: number;
  onReconnect?: () => void;
  onDisconnect?: () => void;
}

export function useConnectionManager(
  channelName: string,
  options: ConnectionManagerOptions = {}
) {
  const {
    heartbeatInterval = 30000,
    maxReconnectAttempts = 5,
    onReconnect,
    onDisconnect
  } = options;

  const [connectionState, setConnectionState] = useState<ConnectionState>({
    isConnected: true,
    isReconnecting: false,
    reconnectAttempts: 0,
    lastHeartbeat: null
  });

  const channelRef = useRef<RealtimeChannel | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isSubscribedRef = useRef(false);

  const clearTimers = useCallback(() => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  const performHeartbeat = useCallback(async () => {
    try {
      const start = Date.now();
      const { error } = await supabase.rpc('get_server_timestamp_ms');

      if (error) throw error;

      setConnectionState(prev => ({
        ...prev,
        isConnected: true,
        isReconnecting: false,
        reconnectAttempts: 0,
        lastHeartbeat: Date.now() - start
      }));
    } catch {
      handleConnectionLost();
    }
  }, []);

  const handleConnectionLost = useCallback(() => {
    setConnectionState(prev => {
      if (prev.reconnectAttempts >= maxReconnectAttempts) {
        onDisconnect?.();
        return { ...prev, isConnected: false, isReconnecting: false };
      }

      const nextAttempt = prev.reconnectAttempts + 1;
      const backoffDelay = Math.min(1000 * Math.pow(2, nextAttempt - 1), 30000);

      reconnectTimeoutRef.current = setTimeout(() => {
        attemptReconnect();
      }, backoffDelay);

      return {
        ...prev,
        isConnected: false,
        isReconnecting: true,
        reconnectAttempts: nextAttempt
      };
    });
  }, [maxReconnectAttempts, onDisconnect]);

  const attemptReconnect = useCallback(async () => {
    try {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }

      const channel = supabase.channel(channelName);

      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setConnectionState({
            isConnected: true,
            isReconnecting: false,
            reconnectAttempts: 0,
            lastHeartbeat: null
          });
          onReconnect?.();
          isSubscribedRef.current = true;
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          handleConnectionLost();
        }
      });

      channelRef.current = channel;
    } catch {
      handleConnectionLost();
    }
  }, [channelName, handleConnectionLost, onReconnect]);

  const forceReconnect = useCallback(() => {
    setConnectionState(prev => ({ ...prev, reconnectAttempts: 0 }));
    attemptReconnect();
  }, [attemptReconnect]);

  useEffect(() => {
    const handleOnline = () => {
      if (!connectionState.isConnected) {
        forceReconnect();
      }
    };

    const handleOffline = () => {
      setConnectionState(prev => ({
        ...prev,
        isConnected: false,
        isReconnecting: false
      }));
      onDisconnect?.();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [connectionState.isConnected, forceReconnect, onDisconnect]);

  useEffect(() => {
    heartbeatIntervalRef.current = setInterval(performHeartbeat, heartbeatInterval);
    performHeartbeat();

    return () => {
      clearTimers();
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [heartbeatInterval, performHeartbeat, clearTimers]);

  return {
    ...connectionState,
    forceReconnect
  };
}
