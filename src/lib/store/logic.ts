/**
 * Store rules that need no database: variants from options, tax and shipping, cart cookie, addresses.
 * Pure and shared, so they are unit tested and used by the cart, the checkout and the admin alike.
 * Amounts are integers in minor units.
 */

// ---------- options and variants ----------

export interface OptionDef {
  name: string;
  values: string[];
}

export const MAX_OPTIONS = 3;
export const MAX_VARIANTS = 100;

/** Trims names and values, drops empty and repeated ones. Keeps at most three options. */
export function cleanOptions(raw: unknown): OptionDef[] {
  const rows = Array.isArray(raw) ? raw : [];
  const seen = new Set<string>();
  const out: OptionDef[] = [];
  for (const row of rows as { name?: unknown; values?: unknown }[]) {
    const name = String(row?.name ?? '').trim().slice(0, 40);
    if (!name || seen.has(name.toLowerCase())) continue;
    const values = [...new Set((Array.isArray(row?.values) ? row.values : []).map((v) => String(v).trim().slice(0, 40)).filter(Boolean))];
    if (values.length === 0) continue;
    seen.add(name.toLowerCase());
    out.push({ name, values: values.slice(0, 30) });
  }
  return out.slice(0, MAX_OPTIONS);
}

export interface VariantSpec {
  key: string;
  label: string;
  values: Record<string, string>;
}

/** "Size=M|Color=Red", in option order. The empty key belongs to a product without options. */
export const variantKey = (options: readonly OptionDef[], values: Record<string, string>): string => options.map((o) => `${o.name}=${values[o.name] ?? ''}`).join('|');

/** Every combination of the options. Throws a plain message when there would be too many. */
export function expandVariants(options: readonly OptionDef[]): VariantSpec[] {
  if (options.length === 0) return [{ key: '', label: 'Default', values: {} }];
  const total = options.reduce((n, o) => n * o.values.length, 1);
  if (total > MAX_VARIANTS) throw new Error(`These options make ${total} variants. The most a product can have is ${MAX_VARIANTS}. Remove a value or an option.`);
  let combos: Record<string, string>[] = [{}];
  for (const option of options) combos = combos.flatMap((c) => option.values.map((v) => ({ ...c, [option.name]: v })));
  return combos.map((values) => ({ key: variantKey(options, values), label: options.map((o) => values[o.name]).join(' / '), values }));
}

// ---------- tax ----------

export interface TaxClass {
  id: string;
  name: string;
  ratePct: number;
}
export interface TaxOverride {
  classId: string;
  /** Two letters, or empty for everywhere. */
  country: string;
  ratePct: number;
}

/** The rate for a tax class where the buyer is: a country override first, then the class rate, else nothing. */
export function taxRateFor(classes: readonly TaxClass[], overrides: readonly TaxOverride[], classId: string, country: string): number {
  const code = country.trim().toUpperCase();
  const exact = overrides.find((o) => o.classId === classId && o.country.trim().toUpperCase() === code && code !== '');
  if (exact) return exact.ratePct;
  const wide = overrides.find((o) => o.classId === classId && o.country.trim() === '');
  if (wide) return wide.ratePct;
  return classes.find((c) => c.id === classId)?.ratePct ?? 0;
}

export interface StoreTotals {
  subtotal: number;
  shipping: number;
  tax: number;
  total: number;
  /** Tax of each line, in the order given, and of shipping. */
  lineTax: number[];
  shippingTax: number;
}

const taxOf = (amount: number, ratePct: number, inclusive: boolean): number => {
  const rate = Math.max(0, ratePct) / 100;
  if (rate === 0 || amount <= 0) return 0;
  return inclusive ? Math.round(amount - amount / (1 + rate)) : Math.round(amount * rate);
};

/** Tax per line and on shipping. With inclusive prices the tax is inside the prices; otherwise it is added. */
export function computeStoreTotals(input: { lines: readonly { amount: number; ratePct: number }[]; shipping: number; shippingRatePct: number; inclusive: boolean }): StoreTotals {
  const lineTax = input.lines.map((l) => taxOf(l.amount, l.ratePct, input.inclusive));
  const shippingTax = taxOf(input.shipping, input.shippingRatePct, input.inclusive);
  const subtotal = input.lines.reduce((n, l) => n + l.amount, 0);
  const tax = lineTax.reduce((n, t) => n + t, 0) + shippingTax;
  const total = input.inclusive ? subtotal + input.shipping : subtotal + input.shipping + tax;
  return { subtotal, shipping: input.shipping, tax, total, lineTax, shippingTax };
}

// ---------- shipping ----------

export type ShippingKind = 'flat' | 'weight' | 'per_item' | 'free';

export interface ShippingRateDef {
  zone: string;
  /** Two-letter codes, or * for every other country. */
  countries: string[];
  name: string;
  kind: ShippingKind;
  price: number;
  /** Extra per kilogram, for kind "weight". */
  perKg: number;
  /** Shipping is free from this subtotal, when set above zero. */
  freeOver: number | null;
}
export interface ShippingRate extends ShippingRateDef {
  id: string;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Gives each rate a stable id made from its zone and name, so a cart can refer to it. */
export function withRateIds(defs: readonly ShippingRateDef[]): ShippingRate[] {
  const used = new Map<string, number>();
  return defs.map((d) => {
    const base = `${slug(d.zone) || 'zone'}:${slug(d.name) || 'rate'}`;
    const n = (used.get(base) ?? 0) + 1;
    used.set(base, n);
    return { ...d, id: n === 1 ? base : `${base}-${n}` };
  });
}

/** The rates for a country: zones that name the country win over the "rest of the world" zones. */
export function ratesFor(rates: readonly ShippingRate[], country: string): ShippingRate[] {
  const code = country.trim().toUpperCase();
  if (!code) return [];
  const specific = rates.filter((r) => r.countries.some((c) => c.trim().toUpperCase() === code));
  if (specific.length) return specific;
  return rates.filter((r) => r.countries.some((c) => c.trim() === '*'));
}

export function shippingCost(rate: ShippingRate, basket: { subtotal: number; weightGrams: number; units: number }): number {
  if (rate.kind === 'free') return 0;
  if (rate.freeOver && rate.freeOver > 0 && basket.subtotal >= rate.freeOver) return 0;
  if (rate.kind === 'per_item') return rate.price * basket.units;
  if (rate.kind === 'weight') return rate.price + Math.round((rate.perKg * basket.weightGrams) / 1000);
  return rate.price;
}

// ---------- cart ----------

export interface CartLine {
  /** Variant id. */
  v: string;
  q: number;
}

export const MAX_CART_LINES = 40;
export const MAX_QUANTITY = 99;

/** Reads the cart cookie. Anything that is not a clean list of {v, q} is ignored, never trusted. */
export function parseCart(raw: string | undefined | null): CartLine[] {
  if (!raw) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  const merged = new Map<string, number>();
  for (const row of data) {
    const v = typeof row?.v === 'string' ? row.v : '';
    const q = Number(row?.q);
    if (!/^[A-Za-z0-9-]{8,64}$/.test(v) || !Number.isInteger(q) || q < 1) continue;
    merged.set(v, Math.min(MAX_QUANTITY, (merged.get(v) ?? 0) + q));
    if (merged.size >= MAX_CART_LINES) break;
  }
  return [...merged].map(([v, q]) => ({ v, q }));
}

export const serializeCart = (lines: readonly CartLine[]): string => JSON.stringify(lines.map((l) => ({ v: l.v, q: l.q })));

export function addToCart(lines: readonly CartLine[], variantId: string, quantity: number): CartLine[] {
  const q = Math.min(MAX_QUANTITY, Math.max(1, Math.floor(quantity)));
  const found = lines.find((l) => l.v === variantId);
  if (found) return lines.map((l) => (l.v === variantId ? { v: l.v, q: Math.min(MAX_QUANTITY, l.q + q) } : l));
  return [...lines, { v: variantId, q }].slice(0, MAX_CART_LINES);
}

/** Sets a quantity; zero removes the line. */
export function setQuantity(lines: readonly CartLine[], variantId: string, quantity: number): CartLine[] {
  const q = Math.min(MAX_QUANTITY, Math.floor(quantity));
  if (!(q >= 1)) return lines.filter((l) => l.v !== variantId);
  return lines.map((l) => (l.v === variantId ? { v: l.v, q } : l));
}

// ---------- addresses ----------

export interface Address {
  name: string;
  line1: string;
  line2: string;
  city: string;
  region: string;
  postal: string;
  country: string;
  phone: string;
}

export const ISO_COUNTRIES = 'AD AE AF AG AI AL AM AO AR AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BM BN BO BR BS BT BW BY BZ CA CD CF CG CH CI CL CM CN CO CR CU CV CY CZ DE DJ DK DM DO DZ EC EE EG ER ES ET FI FJ FO FR GA GB GD GE GH GI GL GM GN GR GT GY HK HN HR HT HU ID IE IL IN IQ IR IS IT JM JO JP KE KG KH KR KW KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MG MK ML MM MN MO MR MT MU MV MW MX MY MZ NA NE NG NI NL NO NP NZ OM PA PE PG PH PK PL PR PS PT PY QA RO RS RU RW SA SB SC SD SE SG SI SK SL SM SN SO SR SS SV SY SZ TG TH TJ TL TM TN TO TR TT TW TZ UA UG US UY UZ VA VC VE VN VU WS XK YE ZA ZM ZW'.split(' ');

export function countryName(code: string, locale = 'en'): string {
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

const text = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);

/** Checks a delivery address. Returns the clean address or the problems keyed by field. */
export function checkAddress(raw: unknown): { ok: true; address: Address } | { ok: false; errors: Record<string, string> } {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const address: Address = { name: text(r.name, 120), line1: text(r.line1, 160), line2: text(r.line2, 160), city: text(r.city, 100), region: text(r.region, 100), postal: text(r.postal, 20), country: text(r.country, 2).toUpperCase(), phone: text(r.phone, 40) };
  const errors: Record<string, string> = {};
  if (!address.name) errors.name = 'Enter the name of the person receiving the parcel.';
  if (!address.line1) errors.line1 = 'Enter the street address.';
  if (!address.city) errors.city = 'Enter the city or town.';
  if (!ISO_COUNTRIES.includes(address.country)) errors.country = 'Choose a country.';
  if (address.phone.replace(/\D/g, '').length < 6) errors.phone = 'Enter a phone number the courier can call.';
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, address };
}

// ---------- stock wording ----------

export type StockState = 'in' | 'low' | 'out';

export function stockState(input: { trackStock: boolean; stock: number; lowStockAt: number }): StockState {
  if (!input.trackStock) return 'in';
  if (input.stock <= 0) return 'out';
  return input.lowStockAt > 0 && input.stock <= input.lowStockAt ? 'low' : 'in';
}
