// Run: deno test supabase/functions/_shared/webpush.test.ts
import { encryptPayload, b64urlDecode, b64urlEncode, vapidAuthorization } from './webpush.ts';

function assert(cond: unknown, msg: string) { if (!cond) throw new Error(msg); }

// RFC 8291, Appendix A
const V = {
  plaintext: 'When I grow up, I want to be a watermelon',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  uaPub: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  asPub: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  asPriv: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  expected: 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
};

Deno.test('payload encryption reproduces the RFC 8291 example', async () => {
  const p = b64urlDecode(V.asPub);
  const jwk = { kty: 'EC', crv: 'P-256', x: b64urlEncode(p.slice(1, 33)), y: b64urlEncode(p.slice(33)), d: V.asPriv };
  const privateKey = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const publicKey = await crypto.subtle.importKey('raw', p, { name: 'ECDH', namedCurve: 'P-256' }, true, []);
  const out = await encryptPayload(new TextEncoder().encode(V.plaintext), { p256dh: V.uaPub, auth: V.auth },
    { salt: b64urlDecode(V.salt), asKeyPair: { privateKey, publicKey } });
  assert(b64urlEncode(out) === V.expected, 'ciphertext differs from RFC 8291 example');
});

Deno.test('VAPID JWT is signed correctly and scoped to the push service origin', async () => {
  const hdr = await vapidAuthorization('https://fcm.googleapis.com/fcm/send/abc',
    { publicKey: V.asPub, privateKey: V.asPriv, subject: 'mailto:support@afyawork.com' }, 1_800_000_000);
  const [, t, k] = hdr.match(/^vapid t=([^,]+), k=(.+)$/)!;
  assert(k === V.asPub, 'k= must be the public key');
  const [h, c, s] = t.split('.');
  const key = await crypto.subtle.importKey('raw', b64urlDecode(V.asPub), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, b64urlDecode(s), new TextEncoder().encode(`${h}.${c}`));
  assert(ok, 'signature invalid');
  const claims = JSON.parse(new TextDecoder().decode(b64urlDecode(c)));
  assert(claims.aud === 'https://fcm.googleapis.com' && claims.exp === 1_800_000_000 + 43200, 'bad claims');
});
