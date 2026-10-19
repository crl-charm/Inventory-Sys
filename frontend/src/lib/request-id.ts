/**
 * RFC 4122 version-4 id for idempotency keys, safe outside secure contexts.
 *
 * `crypto.randomUUID()` only exists in secure contexts (HTTPS, or localhost),
 * so it is missing when the shop uses the app over the LAN
 * (`http://192.168.68.102:3000`) - calling it there crashes the page.
 * `crypto.getRandomValues()` has no such restriction, so the fallback builds
 * the v4 id by hand; the last resort needs no Web Crypto at all.
 */
export function newRequestId(): string {
  const cryptoObj = globalThis.crypto as Crypto | undefined;

  if (typeof cryptoObj?.randomUUID === "function") {
    return cryptoObj.randomUUID();
  }

  const bytes = new Uint8Array(16);
  if (cryptoObj?.getRandomValues) {
    cryptoObj.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }

  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40; // version 4
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80; // variant 10xx

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
