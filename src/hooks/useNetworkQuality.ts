import { useEffect, useState, useCallback } from 'react';
import { NetworkQualityMonitor, NetworkQuality } from '../utils/networkOptimization';

let globalMonitor: NetworkQualityMonitor | null = null;

function getGlobalMonitor(): NetworkQualityMonitor {
  if (!globalMonitor) {
    globalMonitor = new NetworkQualityMonitor();
  }
  return globalMonitor;
}

export function useNetworkQuality() {
  const [quality, setQuality] = useState<NetworkQuality>({
    latency: 0,
    bandwidth: 'medium',
    isOnline: navigator.onLine,
    isGoodConnection: true,
  });

  const [showNetworkWarning, setShowNetworkWarning] = useState(false);

  useEffect(() => {
    const monitor = getGlobalMonitor();

    const handleQualityChange = (newQuality: NetworkQuality) => {
      setQuality(newQuality);
      setShowNetworkWarning(!newQuality.isGoodConnection);
    };

    monitor.measureLatency();

    const interval = setInterval(() => {
      monitor.measureLatency();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  const isLowBandwidth = useCallback(() => {
    return getGlobalMonitor().isLowBandwidth();
  }, []);

  const isHighLatency = useCallback(() => {
    return getGlobalMonitor().isHighLatency();
  }, []);

  const shouldBatch = useCallback(() => {
    return getGlobalMonitor().shouldBatch();
  }, []);

  const shouldReducePolling = useCallback(() => {
    return getGlobalMonitor().shouldReducePolling();
  }, []);

  return {
    quality,
    showNetworkWarning,
    isLowBandwidth,
    isHighLatency,
    shouldBatch,
    shouldReducePolling,
  };
}
