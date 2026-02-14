import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { RealtimeChannel } from '@supabase/supabase-js';

interface SubscriptionCallback {
  id: string;
  callback: (payload: any) => void;
}

interface ChannelSubscription {
  channel: RealtimeChannel;
  callbacks: Map<string, (payload: any) => void>;
  subscriptionCount: number;
}

class RealtimeSubscriptionManager {
  private channels: Map<string, ChannelSubscription> = new Map();
  private subscriptionCallbacks: Map<string, SubscriptionCallback[]> = new Map();

  subscribe(
    channelName: string,
    eventConfig: {
      event: string;
      schema: string;
      table: string;
      filter?: string;
    },
    callbackId: string,
    callback: (payload: any) => void
  ): () => void {
    const configKey = this.getConfigKey(eventConfig);

    if (!this.subscriptionCallbacks.has(configKey)) {
      this.subscriptionCallbacks.set(configKey, []);
    }

    this.subscriptionCallbacks.get(configKey)!.push({ id: callbackId, callback });

    if (!this.channels.has(channelName)) {
      const channel = supabase
        .channel(channelName, { config: { broadcast: { self: false } } })
        .on(
          'postgres_changes',
          eventConfig as any,
          (payload: any) => {
            const callbacks = this.subscriptionCallbacks.get(configKey) || [];
            callbacks.forEach(({ callback: cb }) => {
              cb(payload);
            });
          }
        )
        .subscribe();

      this.channels.set(channelName, {
        channel,
        callbacks: new Map(),
        subscriptionCount: 1,
      });
    } else {
      const sub = this.channels.get(channelName)!;
      sub.subscriptionCount += 1;
    }

    return () => {
      const callbacks = this.subscriptionCallbacks.get(configKey) || [];
      const index = callbacks.findIndex((cb) => cb.id === callbackId);
      if (index >= 0) {
        callbacks.splice(index, 1);
      }

      const sub = this.channels.get(channelName);
      if (sub) {
        sub.subscriptionCount -= 1;
        if (sub.subscriptionCount <= 0) {
          supabase.removeChannel(sub.channel);
          this.channels.delete(channelName);
        }
      }
    };
  }

  private getConfigKey(config: any): string {
    return `${config.schema}.${config.table}.${config.filter || '*'}`;
  }

  getChannelCount(): number {
    return this.channels.size;
  }

  unsubscribeAll(): void {
    this.channels.forEach(({ channel }) => {
      supabase.removeChannel(channel);
    });
    this.channels.clear();
    this.subscriptionCallbacks.clear();
  }
}

const globalManager = new RealtimeSubscriptionManager();

export function useOptimizedRealtimeSubscription(
  channelName: string,
  eventConfigs: Array<{
    event: string;
    schema: string;
    table: string;
    filter?: string;
    callback: (payload: any) => void;
  }>
) {
  const callbackIdsRef = useRef<string[]>([]);
  const unsubscribeRef = useRef<Array<() => void>>([]);

  useEffect(() => {
    unsubscribeRef.current = eventConfigs.map((config) => {
      const callbackId = Math.random().toString(36).substr(2, 9);
      callbackIdsRef.current.push(callbackId);

      return globalManager.subscribe(
        channelName,
        {
          event: config.event,
          schema: config.schema,
          table: config.table,
          filter: config.filter,
        },
        callbackId,
        config.callback
      );
    });

    return () => {
      unsubscribeRef.current.forEach((unsub) => unsub());
      callbackIdsRef.current = [];
    };
  }, [channelName, eventConfigs.length]);
}

export function useGameRealtimeUpdates(
  gameId: string,
  callbacks: {
    onGameUpdate: (game: any) => void;
    onPlayersUpdate: () => void;
  }
) {
  const subscriptionId = useRef<string>(Math.random().toString(36).substr(2, 9));

  useOptimizedRealtimeSubscription(
    `game:${gameId}`,
    [
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'games',
        filter: `id=eq.${gameId}`,
        callback: (payload) => {
          if (payload.eventType === 'UPDATE') {
            callbacks.onGameUpdate(payload.new);
          }
        },
      },
      {
        event: '*',
        schema: 'public',
        table: 'players',
        filter: `game_id=eq.${gameId}`,
        callback: () => {
          callbacks.onPlayersUpdate();
        },
      },
    ]
  );
}

export function useLobbyRealtimeUpdates(
  callback: (payload: any) => void
) {
  useOptimizedRealtimeSubscription(
    'lobby',
    [
      {
        event: '*',
        schema: 'public',
        table: 'games',
        callback: (payload) => {
          callback(payload);
        },
      },
    ]
  );
}
