import { useCallback, useRef, useState } from 'react';
import { RequestBatcher } from '../utils/networkOptimization';

interface CellMark {
  col: number;
  row: number;
}

export function useBatchedCellMarking(
  onMarkCells: (cells: CellMark[]) => Promise<void>,
  batchDelayMs = 300
) {
  const batcherRef = useRef(new RequestBatcher(batchDelayMs, 10));
  const batchRef = useRef<CellMark[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const addCellMark = useCallback(
    async (col: number, row: number) => {
      batchRef.current.push({ col, row });

      const batchId = `batch-${Math.random().toString(36).substr(2, 9)}`;

      await batcherRef.current.add(batchId, async () => {
        if (batchRef.current.length > 0) {
          setIsProcessing(true);
          try {
            const cellsToMark = [...batchRef.current];
            batchRef.current = [];
            await onMarkCells(cellsToMark);
          } finally {
            setIsProcessing(false);
          }
        }
      });
    },
    [onMarkCells]
  );

  const flushBatch = useCallback(async () => {
    await batcherRef.current.flush();
  }, []);

  return {
    addCellMark,
    flushBatch,
    isProcessing,
    pendingCells: batchRef.current.length,
  };
}
