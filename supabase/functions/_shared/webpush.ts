/**
 * Minimal, dependency-free Web Push for Deno / Supabase Edge Functions.
 *
 *  - VAPID authentication (RFC 8292): ES256-signed JWT
 *  - Payload encryption (RFC 8291 / RFC 8188): aes128gcm, single record
 *
 * Only Web Crypto is used, so nothing has to be installed or kept up to date.
 */

// Byte array type that type-checks on both older and newer TypeScript
// (newer TS makes Uint8Array generic over its buffer type).
const newBytes = (n: number) => new Uint8Array(n);
export type Bytes = ReturnType<typeof newBytes>;

// ── base64url helpers ─────────────────────────────────────────────
export function b64urlEncode(bytes: Bytes): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64urlDecode(str: string): Bytes {
  const s = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const bin = atob(s + pad);
  const out = newBytes(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function concat(...parts: Bytes[]): Bytes {
  const out = newBytes(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

const enc = new TextEncoder();

async function hmac(key: Bytes, data: Bytes): Promise<Bytes> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
}

// ── VAPID ─────────────────────────────────────────────────────────
export interface VapidKeys {
  publicKey: string;   // base64url, uncompressed P-256 point (65 bytes)
  privateKey: string;  // base64url, raw scalar d (32 bytes)
  subject: string;     // "mailto:..." or "https://..."
}

async function importVapidSigningKey(keys: VapidKeys): Promise<CryptoKey> {
  const pub = b64urlDecode(keys.publicKey);
  if (pub.length !== 65 || pub[0] !== 0x04) throw new Error('VAPID public key must be an uncompressed P-256 point');
  const jwk: JsonWebKey = {
    kty: 'EC', crv: 'P-256',
    x: b64urlEncode(pub.slice(1, 33)),
    y: b64urlEncode(pub.slice(33, 65)),
    d: keys.privateKey,
    ext: false,
  };
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
}

/** Build the `Authorization: vapid t=…, k=…` header value for one endpoint. */
export async function vapidAuthorization(endpoint: string, keys: VapidKeys, nowSec = Math.floor(Date.now() / 1000)): Promise<string> {
  const aud = new URL(endpoint).origin;
  const header = b64urlEncode(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64urlEncode(enc.encode(JSON.stringify({ aud, exp: nowSec + 12 * 3600, sub: keys.subject })));
  const unsigned = `${header}.${claims}`;
  const key = await importVapidSigningKey(keys);
  // Web Crypto returns the IEEE P1363 (r||s) form, which is what JWS ES256 expects.
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(unsigned)));
  return `vapid t=${unsigned}.${b64urlEncode(sig)}, k=${keys.publicKey}`;
}

// ── Payload encryption (RFC 8291) ─────────────────────────────────
export interface PushSubscriptionKeys {
  p256dh: string; // base64url user-agent public key
  auth: string;   // base64url 16-byte auth secret
}

/**
 * Encrypt a payload for one subscription. `testOverrides` exists only so the
 * RFC 8291 example can be reproduced exactly in tests.
 */
export async function encryptPayload(
  payload: Bytes,
  sub: PushSubscriptionKeys,
  testOverrides?: { salt?: Bytes; asKeyPair?: CryptoKeyPair },
): Promise<Bytes> {
  const uaPublic = b64urlDecode(sub.p256dh);
  const authSecret = b64urlDecode(sub.auth);

  const asKeys = testOverrides?.asKeyPair ??
    await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair;
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', asKeys.publicKey));

  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, asKeys.privateKey, 256));

  // IKM = HKDF(auth_secret, ecdh_secret, "WebPush: info\0" || ua_public || as_public, 32)
  const prkKey = await hmac(authSecret, ecdhSecret);
  const keyInfo = concat(enc.encode('WebPush: info\0'), uaPublic, asPublic, new Uint8Array([1]));
  const ikm = (await hmac(prkKey, keyInfo)).slice(0, 32);

  const salt = testOverrides?.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, concat(enc.encode('Content-Encoding: aes128gcm\0'), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, concat(enc.encode('Content-Encoding: nonce\0'), new Uint8Array([1])))).slice(0, 12);

  // Single record: plaintext followed by the 0x02 "last record" delimiter
  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce }, aesKey, concat(payload, new Uint8Array([2]))));

  const rs = 4096;
  const header = concat(salt, new Uint8Array([(rs >>> 24) & 255, (rs >>> 16) & 255, (rs >>> 8) & 255, rs & 255]),
                        new Uint8Array([asPublic.length]), asPublic);
  return concat(header, ciphertext);
}

// ── Send ──────────────────────────────────────────────────────────
export interface StoredSubscription extends PushSubscriptionKeys { endpoint: string }

export interface SendResult {
  ok: boolean;
  status: number;
  gone: boolean;      // subscription expired/unsubscribed → delete it
  body?: string;
}

export async function sendWebPush(
  sub: StoredSubscription,
  payload: Record<string, unknown>,
  keys: VapidKeys,
  opts: { ttl?: number; urgency?: 'very-low' | 'low' | 'normal' | 'high'; topic?: string } = {},
): Promise<SendResult> {
  const endpoint = new URL(sub.endpoint);
  if (endpoint.protocol !== 'https:') throw new Error('Push endpoint must be https');

  const body = await encryptPayload(enc.encode(JSON.stringify(payload)), sub);
  const headers: Record<string, string> = {
    'Authorization': await vapidAuthorization(sub.endpoint, keys),
    'Content-Encoding': 'aes128gcm',
    'Content-Type': 'application/octet-stream',
    'TTL': String(opts.ttl ?? 24 * 3600),
    'Urgency': opts.urgency ?? 'high',
  };
  // Topic lets a newer message replace an undelivered older one (max 32 url-safe chars)
  if (opts.topic) headers['Topic'] = opts.topic.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32);

  const res = await fetch(sub.endpoint, { method: 'POST', headers, body });
  const text = res.ok ? undefined : (await res.text()).slice(0, 300);
  return { ok: res.ok, status: res.status, gone: res.status === 404 || res.status === 410, body: text };
}
