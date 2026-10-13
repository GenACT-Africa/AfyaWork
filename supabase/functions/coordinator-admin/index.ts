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
 * The role can only be granted here: it is carried in app_metadata, which a
 * public sign-up cannot set, and handle_new_user reads it from there.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { CORS, getCaller } from '../_shared/auth.ts';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const BAN_FOREVER = '876000h';   // 100 years

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
      const phone = String(body.phone ?? '').trim() || null;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Enter a valid email address' }, 400);
      if (name.length < 2) return json({ error: 'Enter the coordinator\'s name' }, 400);

      const pwd = Array.from(crypto.getRandomValues(new Uint8Array(24))).map((b) => b.toString(16).padStart(2, '0')).join('');
      const { data: created, error: cErr } = await db.auth.admin.createUser({
        email, email_confirm: true, password: pwd,
        user_metadata: { display_name: name, phone },
        app_metadata: { afyawork_role: 'coordinator' },
      });
      if (cErr) return json({ error: cErr.message }, 400);
      const id = created.user.id;

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
