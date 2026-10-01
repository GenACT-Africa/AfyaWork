#!/usr/bin/env node
// Generates the key pair for browser push notifications (VAPID).
// Run once:  node scripts/generate-vapid-keys.mjs
// The PUBLIC key goes in .env / Vercel; the PRIVATE key goes only into Supabase secrets.
import { generateKeyPairSync } from 'node:crypto';

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const pub = publicKey.export({ format: 'jwk' });
const priv = privateKey.export({ format: 'jwk' });
const raw = Buffer.concat([Buffer.from([4]), Buffer.from(pub.x, 'base64url'), Buffer.from(pub.y, 'base64url')]);
const publicB64 = raw.toString('base64url');

console.log(`
1) Add this line to .env AND to Vercel → Settings → Environment Variables:

VITE_VAPID_PUBLIC_KEY=${publicB64}

2) Run this in Terminal (with SUPABASE_ACCESS_TOKEN set) — keep the private key secret:

supabase secrets set VAPID_PUBLIC_KEY=${publicB64} VAPID_PRIVATE_KEY=${priv.d} VAPID_SUBJECT=mailto:support@afyawork.com

Generate these only once. If you generate new keys later, every user has to enable notifications again.
`);
