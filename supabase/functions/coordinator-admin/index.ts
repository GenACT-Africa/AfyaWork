/**
 * coordinator-admin — manage coordinator (staff) accounts. Admins only.
 *
 * POST body:
 *   { action: 'list' }                                   coordinators with status, last sign-in, lead counts
 *   { action: 'invite', email, display_name, phone? }    create the account + invite token (email sent by the app
 *                                                        through send-invite-email, like other invites)
 *   { action: 'revoke', user_id }                        disable: account_status 'disabled' + auth ban, so the
 *                                                        session stops at the next token refresh
 *   { action: 'restore', user_id }                       undo revoke
 *
 * The role can only be granted here: handle_new_user accepts 'coordinator' only with a
 * matching one-time token from staff_invites, a table only the service role can write.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Self-contained (no ../_shared import) so it can also be deployed from the dashboard / API as one file.
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const db = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/** The signed-in user behind the request (id + role), or null. */
async function getCaller(req: Request): Promise<{ id: string; role: string | null } | null> {
  const h = req.headers.get('Authorization') ?? '';
  const token = h.toLowerCase().startsWith('bearer ') ? h.slice(7).trim() : '';
  if (!token || token === ANON_KEY) return null;
  const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return null;
  const { data } = await db.from('users').select('role').eq('id', user.id).single();
  return { id: user.id, role: data?.role ?? null };
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const BAN_FOREVER = '876000h';   // 100 years

const ROLE_LABEL: Record<string, string> = { co: 'Clinical Officer', facility: 'facility', admin: 'admin', coordinator: 'coordinator' };

/** Tanzanian mobile in any common format → "+2557XXXXXXXX", or null. Same rules as src/lib/phone.js. */
function normaliseTzPhone(raw: string): string | null {
  let d = String(raw ?? '').replace(/[\s\-().]/g, '');
  if (/[^+\d]/.test(d)) return null;
  d = d.replace(/^\+/, '').replace(/^00/, '');
  if (/^2550[67]\d{8}$/.test(d)) d = `255${d.slice(4)}`;
  if (/^0[67]\d{8}$/.test(d)) d = `255${d.slice(1)}`;
  else if (/^[67]\d{8}$/.test(d)) d = `255${d}`;
  return /^255[67]\d{8}$/.test(d) ? `+${d}` : null;
}

async function event(actor: string, action: string, detail: Record<string, unknown>) {
  await db.from('lead_events').insert({ lead_id: null, actor_id: actor, action, detail });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const me = await getCaller(req);
  if (!me) return json({ error: 'Sign in required' }, 401);
  if (me.role !== 'admin') return json({ error: 'Admins only' }, 403);

  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }

  try {
    if (body.action === 'list') {
      const { data: users, error } = await db.from('users')
        .select('id, display_name, email, phone, account_status, invited_at, activated_at, created_at')
        .eq('role', 'coordinator').order('display_name');
      if (error) throw error;
      const ids = (users ?? []).map((u) => u.id);
      const { data: leads } = ids.length
        ? await db.from('facility_leads').select('owner_id, status').in('owner_id', ids)
        : { data: [] };
      const counts: Record<string, { open: number; total: number }> = {};
      for (const l of leads ?? []) {
        counts[l.owner_id] ??= { open: 0, total: 0 };
        counts[l.owner_id].total++;
        if (l.status === 'open') counts[l.owner_id].open++;
      }
      const out = [];
      for (const u of users ?? []) {
        const { data: au } = await db.auth.admin.getUserById(u.id);
        out.push({ ...u, last_sign_in_at: au?.user?.last_sign_in_at ?? null, leads: counts[u.id] ?? { open: 0, total: 0 } });
      }
      return json({ coordinators: out });
    }

    if (body.action === 'invite') {
      const email = String(body.email ?? '').trim().toLowerCase();
      const name = String(body.display_name ?? '').trim();
      const rawPhone = String(body.phone ?? '').trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Enter a valid email address.' }, 400);
      if (name.length < 2) return json({ error: 'Enter the coordinator\'s full name.' }, 400);
      const phone = rawPhone ? normaliseTzPhone(rawPhone) : null;
      if (rawPhone && !phone) {
        return json({ error: `"${rawPhone}" is not a Tanzanian mobile number. Use a number like 0748 795 514 or +255 748 795 514.` }, 400);
      }

      // One login per email: say who already has it instead of a generic failure
      const { data: existing } = await db.from('users').select('id, role, display_name, account_status')
        .ilike('email', email.replace(/[\\%_]/g, (c) => `\\${c}`)).limit(1).maybeSingle();
      if (existing) {
        const who = `${ROLE_LABEL[existing.role] ?? existing.role} account${existing.display_name ? ` ("${existing.display_name}")` : ''}`;
        const hint = existing.role === 'coordinator'
          ? (existing.account_status === 'disabled' ? ' Use Restore on their row instead.' : ' Use Resend on their row if they need a new link.')
          : ' Each email can only have one AfyaWork login, so use a different email for their coordinator account.';
        return json({ error: `${email} already has an AfyaWork ${who}.${hint}` }, 409);
      }

      const hex = (n: number) => Array.from(crypto.getRandomValues(new Uint8Array(n))).map((b) => b.toString(16).padStart(2, '0')).join('');
      const pwd = hex(24);
      // Auth inserts the user before it attaches app_metadata, so handle_new_user can't see the role there.
      // A short-lived one-time token in staff_invites (server-only table) proves this sign-up came from here.
      const staffToken = hex(32);
      const { error: sErr } = await db.from('staff_invites').upsert({
        email, token: staffToken, created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 10 * 60e3).toISOString(),
      });
      if (sErr) return json({ error: `Could not prepare the invite: ${sErr.message}` }, 500);
      const { data: created, error: cErr } = await db.auth.admin.createUser({
        email, email_confirm: true, password: pwd,
        user_metadata: { role: 'coordinator', display_name: name, phone, staff_invite_token: staffToken },
        app_metadata: { afyawork_role: 'coordinator' },
      });
      await db.from('staff_invites').delete().eq('email', email);
      if (cErr) {
        const msg = /already (been )?registered|already exists/i.test(cErr.message)
          ? `${email} already has an AfyaWork login. Use a different email for their coordinator account.`
          : /database error/i.test(cErr.message)
            ? `Could not create the account (the database rejected it). Nothing was saved; try again, and if it keeps failing send this to the developer: ${cErr.message}`
            : `Could not create the account: ${cErr.message}`;
        return json({ error: msg }, 400);
      }
      const id = created.user.id;
      // The token is single-use and already consumed; don't leave it in the profile
      await db.auth.admin.updateUserById(id, { user_metadata: { role: 'coordinator', display_name: name, phone, staff_invite_token: null } });

      const tok = Array.from(crypto.getRandomValues(new Uint8Array(32))).map((b) => b.toString(16).padStart(2, '0')).join('');
      const { error: uErr } = await db.from('users').update({
        phone, invite_token: tok, account_status: 'pending_invite', invited_at: new Date().toISOString(),
        invite_token_expiry: new Date(Date.now() + 7 * 864e5).toISOString(),
      }).eq('id', id);
      if (uErr) { await db.auth.admin.deleteUser(id); return json({ error: uErr.message }, 400); }

      await db.from('invite_audit_log').insert({ user_id: id, action: 'invited', performed_by: me.id });
      await event(me.id, 'coordinator_invited', { user_id: id, email });
      return json({ user_id: id, email, display_name: name, role: 'coordinator', invite_token: tok });
    }

    if (body.action === 'revoke' || body.action === 'restore') {
      const id = String(body.user_id ?? '');
      const { data: u } = await db.from('users').select('id, role, activated_at').eq('id', id).single();
      if (!u || u.role !== 'coordinator') return json({ error: 'Coordinator not found' }, 404);
      const revoke = body.action === 'revoke';
      const { error: bErr } = await db.auth.admin.updateUserById(id, { ban_duration: revoke ? BAN_FOREVER : 'none' });
      if (bErr) return json({ error: bErr.message }, 400);
      // Restoring someone who never activated needs a fresh invite (Resend), so they come back as 'expired'
      const status = revoke ? 'disabled' : (u.activated_at ? 'active' : 'expired');
      const patch: Record<string, unknown> = { account_status: status };
      if (revoke) { patch.invite_token = null; patch.invite_token_expiry = null; }   // an unused invite link stops working
      const { error: sErr } = await db.from('users').update(patch).eq('id', id);
      if (sErr) return json({ error: sErr.message }, 400);
      await event(me.id, revoke ? 'coordinator_revoked' : 'coordinator_restored', { user_id: id });
      const { count } = await db.from('facility_leads').select('id', { count: 'exact', head: true }).eq('owner_id', id);
      return json({ ok: true, account_status: status, owned_leads: count ?? 0 });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
