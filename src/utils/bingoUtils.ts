function seededRandom(seed: number): () => number {
  let value = seed;
  return function() {
    value = (value * 9301 + 49297) % 233280;
    return value / 233280;
  };
}

export function generateBingoCard(cardNumber?: number): number[][] {
  const random = cardNumber ? seededRandom(cardNumber) : Math.random;
  const card: number[][] = [];

  for (let col = 0; col < 5; col++) {
    const column: number[] = [];
    const min = col * 15 + 1;
    const max = col * 15 + 15;

    const availableNumbers = Array.from(
      { length: max - min + 1 },
      (_, i) => min + i
    );

    for (let row = 0; row < 5; row++) {
      if (col === 2 && row === 2) {
        column.push(0);
      } else {
        const randomValue = typeof random === 'function' ? random() : random;
        const randomIndex = Math.floor(randomValue * availableNumbers.length);
        column.push(availableNumbers[randomIndex]);
        availableNumbers.splice(randomIndex, 1);
      }
    }

    card.push(column);
  }

  return card;
}

export function checkWin(markedCells: boolean[][], card: number[][], calledNumbers: number[]): boolean {
  const isValidMark = (col: number, row: number): boolean => {
    if (col === 2 && row === 2) return true;
    return calledNumbers.includes(card[col][row]);
  };

  for (let row = 0; row < 5; row++) {
    if (markedCells.every((col, colIdx) => col[row] && isValidMark(colIdx, row))) {
      return true;
    }
  }

  for (let col = 0; col < 5; col++) {
    if (markedCells[col].every((cell, rowIdx) => cell && isValidMark(col, rowIdx))) {
      return true;
    }
  }

  let diagonal1 = true;
  let diagonal2 = true;
  for (let i = 0; i < 5; i++) {
    if (!markedCells[i][i] || !isValidMark(i, i)) diagonal1 = false;
    if (!markedCells[i][4 - i] || !isValidMark(i, 4 - i)) diagonal2 = false;
  }

  const fourCorners =
    markedCells[0][0] && isValidMark(0, 0) &&
    markedCells[4][0] && isValidMark(4, 0) &&
    markedCells[0][4] && isValidMark(0, 4) &&
    markedCells[4][4] && isValidMark(4, 4);

  return diagonal1 || diagonal2 || fourCorners;
}

export function getNextBingoNumber(calledNumbers: number[]): number | null {
  const allNumbers = Array.from({ length: 75 }, (_, i) => i + 1);
  const remainingNumbers = allNumbers.filter(num => !calledNumbers.includes(num));

  if (remainingNumbers.length === 0) return null;

  const randomIndex = Math.floor(Math.random() * remainingNumbers.length);
  return remainingNumbers[randomIndex];
}

export function getBingoLetter(number: number): string {
  if (number >= 1 && number <= 15) return 'B';
  if (number >= 16 && number <= 30) return 'I';
  if (number >= 31 && number <= 45) return 'N';
  if (number >= 46 && number <= 60) return 'G';
  if (number >= 61 && number <= 75) return 'O';
  return '';
}

export type WinningPattern = {
  type: 'row' | 'column' | 'diagonal' | 'fourCorners';
  cells: [number, number][];
  description: string;
};

export function getWinningPattern(markedCells: boolean[][], card: number[][], calledNumbers: number[]): WinningPattern | null {
  const isValidMark = (col: number, row: number): boolean => {
    if (col === 2 && row === 2) return true;
    return calledNumbers.includes(card[col][row]);
  };

  for (let row = 0; row < 5; row++) {
    if (markedCells.every((col, colIdx) => col[row] && isValidMark(colIdx, row))) {
      return {
        type: 'row',
        cells: Array.from({ length: 5 }, (_, col) => [col, row] as [number, number]),
        description: `Row ${row + 1}`
      };
    }
  }

  for (let col = 0; col < 5; col++) {
    if (markedCells[col].every((cell, rowIdx) => cell && isValidMark(col, rowIdx))) {
      const letters = ['B', 'I', 'N', 'G', 'O'];
      return {
        type: 'column',
        cells: Array.from({ length: 5 }, (_, row) => [col, row] as [number, number]),
        description: `${letters[col]} Column`
      };
    }
  }

  let diagonal1 = true;
  let diagonal2 = true;
  for (let i = 0; i < 5; i++) {
    if (!markedCells[i][i] || !isValidMark(i, i)) diagonal1 = false;
    if (!markedCells[i][4 - i] || !isValidMark(i, 4 - i)) diagonal2 = false;
  }

  if (diagonal1) {
    return {
      type: 'diagonal',
      cells: Array.from({ length: 5 }, (_, i) => [i, i] as [number, number]),
      description: 'Diagonal (Top-Left to Bottom-Right)'
    };
  }

  if (diagonal2) {
    return {
      type: 'diagonal',
      cells: Array.from({ length: 5 }, (_, i) => [i, 4 - i] as [number, number]),
      description: 'Diagonal (Top-Right to Bottom-Left)'
    };
  }

  const fourCorners =
    markedCells[0][0] && isValidMark(0, 0) &&
    markedCells[4][0] && isValidMark(4, 0) &&
    markedCells[0][4] && isValidMark(0, 4) &&
    markedCells[4][4] && isValidMark(4, 4);

  if (fourCorners) {
    return {
      type: 'fourCorners',
      cells: [[0, 0], [4, 0], [0, 4], [4, 4]],
      description: 'Four Corners'
    };
  }

  return null;
}

export function convertPatternNumbersToCells(patternNumbers: number[], card: number[][]): [number, number][] {
  const cells: [number, number][] = [];

  for (const patternNum of patternNumbers) {
    if (patternNum === 0) {
      cells.push([2, 2]);
      continue;
    }

    for (let col = 0; col < 5; col++) {
      for (let row = 0; row < 5; row++) {
        if (card[col][row] === patternNum) {
          cells.push([col, row]);
          break;
        }
      }
    }
  }

  return cells;
}
