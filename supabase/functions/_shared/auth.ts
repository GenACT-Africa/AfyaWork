/**
 * Shared caller checks for AfyaWork edge functions.
 *
 * Every function URL is public and the anon key ships in the web app, so each
 * function must decide for itself who may call it:
 *
 *   isServiceCall(req)   – another function, pg_cron, a DB trigger or a DB webhook
 *                          (Authorization: Bearer <service_role key>, or the
 *                          x-webhook-secret header matching INTERNAL_WEBHOOK_SECRET)
 *   getCaller(req)       – the signed-in user behind the request (id + role), or null
 *   requireAdminOrService(req) – returns a 401/403 Response to send, or null if allowed
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY         = Deno.env.get('SUPABASE_ANON_KEY')!;
const WEBHOOK_SECRET   = Deno.env.get('INTERNAL_WEBHOOK_SECRET') ?? '';

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
};

/** Constant-time string comparison */
export function safeEqual(a: string, b: string): boolean {
  if (!a || !b) return false;
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i];
  return diff === 0;
}

function bearer(req: Request): string {
  const h = req.headers.get('Authorization') ?? '';
  return h.toLowerCase().startsWith('bearer ') ? h.slice(7).trim() : '';
}

export function isServiceCall(req: Request): boolean {
  if (safeEqual(bearer(req), SERVICE_ROLE_KEY)) return true;
  const hdr = req.headers.get('x-webhook-secret') ?? '';
  return WEBHOOK_SECRET !== '' && safeEqual(hdr, WEBHOOK_SECRET);
}

export interface Caller { id: string; role: string | null }

export async function getCaller(req: Request): Promise<Caller | null> {
  const token = bearer(req);
  if (!token || token === ANON_KEY) return null;
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return null;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data } = await admin.from('users').select('role').eq('id', user.id).single();
  return { id: user.id, role: data?.role ?? null };
}

export function deny(status: 401 | 403, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

/** null = allowed; otherwise the Response to return */
export async function requireAdminOrService(req: Request): Promise<Response | null> {
  if (isServiceCall(req)) return null;
  const caller = await getCaller(req);
  if (!caller) return deny(401, 'Sign in required');
  if (caller.role !== 'admin') return deny(403, 'Admins only');
  return null;
}

/** null = allowed; otherwise the Response to return */
export function requireService(req: Request): Response | null {
  return isServiceCall(req) ? null : deny(401, 'Unauthorized');
}
