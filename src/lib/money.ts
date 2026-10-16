/**
 * Decimal-safe money and quantity arithmetic (spec §13 "Amount precision").
 *
 * Money crosses the wire and is stored as strings with 2 decimals; quantity
 * strings carry up to 3 decimals. All arithmetic here uses BigInt on scaled
 * integers ("centavos" / "thousandths") so there is never a floating-point
 * rounding surprise. JS `number` is used for parsing digits only.
 */

const MONEY_DECIMALS = 2;
const QUANTITY_DECIMALS = 3;
const MONEY_SCALE = 10n ** BigInt(MONEY_DECIMALS); // 100
const QUANTITY_SCALE = 10n ** BigInt(QUANTITY_DECIMALS); // 1000

export const MONEY_PATTERN = /^\d{1,10}(\.\d{1,2})?$/;
export const QUANTITY_PATTERN = /^\d{1,9}(\.\d{1,3})?$/;

/** Parse "1050" | "1050.5" | "1050.50" -> 105050n centavos. Throws on junk. */
export function parseMoneyToCentavos(value: string | number): bigint {
  const text = typeof value === "number" ? value.toFixed(MONEY_DECIMALS) : value.trim();
  if (!MONEY_PATTERN.test(text)) {
    throw new Error(`Invalid money value: "${value}"`);
  }
  const [whole = "0", frac = ""] = text.split(".");
  const fracPadded = (frac + "00").slice(0, MONEY_DECIMALS);
  return BigInt(whole) * MONEY_SCALE + BigInt(fracPadded);
}

/** 105050n -> "1050.50". */
export function centavosToMoneyString(centavos: bigint): string {
  const negative = centavos < 0n;
  const abs = negative ? -centavos : centavos;
  const whole = abs / MONEY_SCALE;
  const frac = abs % MONEY_SCALE;
  return `${negative ? "-" : ""}${whole}.${frac.toString().padStart(MONEY_DECIMALS, "0")}`;
}

/** Parse "3" | "1.5" | "0.250" -> 1500n thousandths. Throws on junk. */
export function parseQuantityToThousandths(value: string | number): bigint {
  const text = typeof value === "number" ? String(value) : value.trim();
  if (!QUANTITY_PATTERN.test(text)) {
    throw new Error(`Invalid quantity value: "${value}"`);
  }
  const [whole = "0", frac = ""] = text.split(".");
  const fracPadded = (frac + "000").slice(0, QUANTITY_DECIMALS);
  return BigInt(whole) * QUANTITY_SCALE + BigInt(fracPadded);
}

/** 1500n -> "1.500"; normalizes to exactly 3 decimals (DB storage form). */
export function thousandthsToQuantityString(thousandths: bigint): string {
  const negative = thousandths < 0n;
  const abs = negative ? -thousandths : thousandths;
  const whole = abs / QUANTITY_SCALE;
  const frac = abs % QUANTITY_SCALE;
  return `${negative ? "-" : ""}${whole}.${frac.toString().padStart(QUANTITY_DECIMALS, "0")}`;
}

/** Compare two quantity strings ("3" vs "2.999"). -1 | 0 | 1. */
export function compareQuantities(a: string, b: string): number {
  const qa = parseQuantityToThousandths(a);
  const qb = parseQuantityToThousandths(b);
  return qa < qb ? -1 : qa > qb ? 1 : 0;
}

/**
 * line_total = round(quantity x price, 2) with half-up rounding, where `price`
 * is the per-unit Final Price actually charged (spec §7.4).
 *
 * quantity is scaled by 10^3, price by 10^2, so the raw product is scaled by
 * 10^5. Dividing by 1000n yields centavos; the remainder decides the
 * half-up rounding of the final centavo.
 */
export function computeLineTotalCentavos(
  quantity: string,
  finalUnitPrice: string
): bigint {
  const q = parseQuantityToThousandths(quantity);
  const p = parseMoneyToCentavos(finalUnitPrice);
  const raw = q * p; // scale: 10^3 * 10^2 = 10^5
  const wholeCentavos = raw / QUANTITY_SCALE;
  const remainder = raw % QUANTITY_SCALE;
  // remainder is in 10^-3 centavos; >= 500 thousandths rounds up (half-up).
  return remainder >= QUANTITY_SCALE / 2n ? wholeCentavos + 1n : wholeCentavos;
}

export function sumCentavos(values: bigint[]): bigint {
  return values.reduce((acc, v) => acc + v, 0n);
}

/** "₱1,050.00" style formatting for display components. Locale-safe. */
export function formatPhp(amount: string | number): string {
  const text =
    typeof amount === "number" ? amount.toFixed(MONEY_DECIMALS) : amount;
  const [whole = "0", frac = "00"] = text.split(".");
  const wholeFormatted = BigInt(whole).toLocaleString("en-PH");
  return `₱${wholeFormatted}.${(frac + "00").slice(0, 2)}`;
}

/** "3" stays "3", "1.500" becomes "1.5" — for display of quantities. */
export function displayQuantity(quantity: string): string {
  return quantity.includes(".")
    ? quantity.replace(/\.?0+$/, "") || "0"
    : quantity;
}

/** Normalize user-typed quantity: "" -> invalid; "03" -> "3"; "1.50" -> "1.5". */
export function normalizeQuantityInput(input: string): string | null {
  const text = input.trim();
  if (!QUANTITY_PATTERN.test(text)) return null;
  const [whole = "0", frac = ""] = text.split(".");
  const normalizedWhole = String(BigInt(whole));
  const trimmedFrac = frac.replace(/0+$/, "");
  return trimmedFrac ? `${normalizedWhole}.${trimmedFrac}` : normalizedWhole;
}

/** Normalize user-typed price to 2-decimal string; null when invalid. */
export function normalizeMoneyInput(input: string): string | null {
  const text = input.trim().replace(/^₱/, "");
  if (!MONEY_PATTERN.test(text)) return null;
  try {
    return centavosToMoneyString(parseMoneyToCentavos(text));
  } catch {
    return null;
  }
}
