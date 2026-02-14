// Conversion: 1 BNB = 100 credits
const CREDITS_PER_BNB = 100;

export function creditsToBnb(credits: number): number {
  return credits / CREDITS_PER_BNB;
}

export function formatBnb(credits: number, decimals: number = 2): string {
  const bnb = creditsToBnb(credits);
  return bnb.toFixed(decimals);
}
