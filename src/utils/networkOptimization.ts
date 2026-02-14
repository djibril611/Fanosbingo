export interface NetworkQuality {
  latency: number;
  bandwidth: 'slow' | 'medium' | 'fast';
  isOnline: boolean;
  isGoodConnection: boolean;
}

export class NetworkQualityMonitor {
  private latencies: number[] = [];
  private maxSamples = 10;
  private quality: NetworkQuality = {
    latency: 0,
    bandwidth: 'medium',
    isOnline: navigator.onLine,
    isGoodConnection: true,
  };

  constructor(private onQualityChange?: (quality: NetworkQuality) => void) {
    this.setupListeners();
  }

  private setupListeners() {
    window.addEventListener('online', () => this.updateQuality());
    window.addEventListener('offline', () => this.updateQuality());

    if ('connection' in navigator) {
      (navigator as any).connection?.addEventListener('change', () => this.updateQuality());
    }
  }

  async measureLatency(): Promise<number> {
    const start = Date.now();
    try {
      const response = await fetch('/', { method: 'HEAD', cache: 'no-store' });
      const latency = Date.now() - start;

      this.latencies.push(latency);
      if (this.latencies.length > this.maxSamples) {
        this.latencies.shift();
      }

      this.updateQuality();
      return latency;
    } catch {
      return 5000;
    }
  }

  private updateQuality() {
    const avgLatency = this.latencies.length > 0
      ? this.latencies.reduce((a, b) => a + b) / this.latencies.length
      : 0;

    const effectiveType = (navigator as any).connection?.effectiveType || '4g';

    let bandwidth: 'slow' | 'medium' | 'fast' = 'medium';
    if (effectiveType === 'slow-2g' || effectiveType === '2g') {
      bandwidth = 'slow';
    } else if (effectiveType === '3g') {
      bandwidth = 'medium';
    } else {
      bandwidth = 'fast';
    }

    const isGoodConnection = avgLatency < 500 && bandwidth !== 'slow' && navigator.onLine;

    this.quality = {
      latency: Math.round(avgLatency),
      bandwidth,
      isOnline: navigator.onLine,
      isGoodConnection,
    };

    this.onQualityChange?.(this.quality);
  }

  getQuality(): NetworkQuality {
    return this.quality;
  }

  isLowBandwidth(): boolean {
    return this.quality.bandwidth === 'slow';
  }

  isHighLatency(): boolean {
    return this.quality.latency > 1000;
  }

  shouldBatch(): boolean {
    return !this.quality.isGoodConnection;
  }

  shouldReducePolling(): boolean {
    return this.quality.bandwidth === 'slow' || this.quality.latency > 500;
  }
}

export class RequestBatcher {
  private queue: Array<{ id: string; fn: () => Promise<any> }> = [];
  private processing = false;
  private flushInterval: number = 100;
  private maxBatchSize: number = 5;
  private debounceTimer: NodeJS.Timeout | null = null;

  constructor(flushInterval = 100, maxBatchSize = 5) {
    this.flushInterval = flushInterval;
    this.maxBatchSize = maxBatchSize;
  }

  async add(id: string, fn: () => Promise<any>): Promise<any> {
    const existing = this.queue.find(item => item.id === id);
    if (existing) {
      return; // Deduplicate
    }

    this.queue.push({ id, fn });

    if (this.queue.length >= this.maxBatchSize) {
      await this.flush();
    } else {
      this.scheduleFlush();
    }
  }

  private scheduleFlush() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => this.flush(), this.flushInterval);
  }

  async flush(): Promise<void> {
    if (this.processing || this.queue.length === 0) return;

    this.processing = true;
    const batch = this.queue.splice(0, this.maxBatchSize);

    try {
      await Promise.all(batch.map(item => item.fn()));
    } finally {
      this.processing = false;
      if (this.queue.length > 0) {
        this.scheduleFlush();
      }
    }
  }

  clear() {
    this.queue = [];
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
  }
}

export class DeltaTracker {
  private previousState: Record<string, any> = {};

  getDelta(key: string, newState: any): any {
    const previous = this.previousState[key];
    const delta: any = {};

    if (!previous) {
      this.previousState[key] = JSON.parse(JSON.stringify(newState));
      return newState;
    }

    for (const field in newState) {
      if (JSON.stringify(previous[field]) !== JSON.stringify(newState[field])) {
        delta[field] = newState[field];
      }
    }

    this.previousState[key] = JSON.parse(JSON.stringify(newState));
    return delta;
  }

  getMarkedCellsDelta(previousCells: boolean[][], newCells: boolean[][]): Array<{ col: number; row: number; marked: boolean }> {
    const changes: Array<{ col: number; row: number; marked: boolean }> = [];

    for (let col = 0; col < 5; col++) {
      for (let row = 0; row < 5; row++) {
        if (previousCells[col][row] !== newCells[col][row]) {
          changes.push({ col, row, marked: newCells[col][row] });
        }
      }
    }

    return changes;
  }

  reset(key?: string) {
    if (key) {
      delete this.previousState[key];
    } else {
      this.previousState = {};
    }
  }
}

export function compressPayload(data: any): string {
  return JSON.stringify(data);
}

export function decompressPayload(data: string): any {
  return JSON.parse(data);
}
