import { memo, useMemo } from 'react';

interface BingoCardProps {
  card: number[][];
  markedCells: boolean[][];
  onCellClick: (col: number, row: number) => void;
  calledNumbers: number[];
  disabled?: boolean;
  isDarkMode?: boolean;
}

const letters = ['B', 'I', 'N', 'G', 'O'];
const headerColors = [
  'bg-yellow-500',
  'bg-green-600',
  'bg-blue-600',
  'bg-red-600',
  'bg-blue-700'
];

export const BingoCard = memo(function BingoCard({ card, markedCells, onCellClick, calledNumbers, disabled = false, isDarkMode = false }: BingoCardProps) {
  // Memoize the cell rendering to avoid recalculating on every render
  const cells = useMemo(() => {
    return Array.from({ length: 5 }, (_, rowIndex) =>
      card.map((column, colIndex) => {
        const number = column[rowIndex];
        const isMarked = markedCells[colIndex][rowIndex];
        const isFree = colIndex === 2 && rowIndex === 2;

        return {
          key: `${colIndex}-${rowIndex}`,
          colIndex,
          rowIndex,
          number,
          isMarked,
          isFree,
        };
      })
    ).flat();
  }, [card, markedCells]);

  return (
    <div className={`rounded-xl shadow-lg p-2 sm:p-3 lg:p-4 transition-colors duration-300 ${isDarkMode ? 'bg-gray-700 border border-gray-600' : 'bg-white'}`}>
      <div className="grid grid-cols-5 gap-1 sm:gap-1.5 lg:gap-2 mb-1 sm:mb-1.5 lg:mb-2">
        {letters.map((letter, index) => (
          <div
            key={letter}
            className={`h-8 sm:h-10 lg:h-12 flex items-center justify-center ${headerColors[index]} text-white font-bold text-base sm:text-lg lg:text-xl rounded-lg`}
          >
            {letter}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-5 gap-1 sm:gap-1.5 lg:gap-2">
        {cells.map((cell) => (
          <button
            key={cell.key}
            onClick={() => !disabled && onCellClick(cell.colIndex, cell.rowIndex)}
            disabled={disabled}
            className={`
              h-12 sm:h-14 lg:h-16 flex items-center justify-center text-base sm:text-lg lg:text-xl font-bold rounded-lg transition-all border-2
              ${cell.isMarked
                ? 'bg-green-600 text-white border-green-700 shadow-lg'
                : cell.isFree
                ? 'bg-green-600 text-white border-green-700'
                : disabled
                ? isDarkMode ? 'bg-gray-600 text-gray-400 border-gray-500 cursor-not-allowed' : 'bg-white text-gray-400 border-gray-200 cursor-not-allowed'
                : isDarkMode ? 'bg-gray-600 text-white border-gray-500 hover:border-blue-400 active:border-blue-500 cursor-pointer touch-manipulation' : 'bg-white text-gray-900 border-gray-300 hover:border-blue-400 active:border-blue-500 cursor-pointer touch-manipulation'
              }
            `}
          >
            {cell.isFree ? '★' : cell.number}
          </button>
        ))}
      </div>
    </div>
  );
});
