/**
 * Amounts are integers in minor units (cents). Every supported currency has two decimals, which is what
 * the gateways expect too. Zero-decimal currencies (JPY, KRW) are not supported yet.
 */
export const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP', 'BDT', 'INR', 'AED', 'AUD', 'CAD', 'SGD', 'MYR', 'PKR', 'SAR', 'NZD', 'CHF'] as const;
export type Currency = (typeof SUPPORTED_CURRENCIES)[number];

export const CURRENCY_OPTIONS = SUPPORTED_CURRENCIES.map((c) => ({ value: c, label: c }));

export function isCurrency(value: string): value is Currency {
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(value);
}

/** 1234 becomes "12.34", for gateway APIs that take decimal strings. */
export function toDecimal(minor: number): string {
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(Math.round(minor));
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

export function formatMinor(minor: number, currency: string, locale = 'en'): string {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(minor / 100);
  } catch {
    return `${toDecimal(minor)} ${currency}`;
  }
}

/** Converts using a rate (1 base unit = rate local units), rounding to a whole local minor unit. */
export function convertMinor(minor: number, rate: number): number {
  return Math.round(minor * rate);
}
