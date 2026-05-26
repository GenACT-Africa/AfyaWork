import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // ── Verify caller is a logged-in admin ──────────────────────
    const authHeader = req.headers.get('Authorization') ?? '';
    const callerClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user: callerUser } } = await callerClient.auth.getUser();
    if (!callerUser) return err('Unauthorized', 401);

    const { data: callerProfile } = await supabaseAdmin
      .from('users').select('role').eq('id', callerUser.id).single();
    if (callerProfile?.role !== 'admin') return err('Forbidden', 403);

    // ── Parse request ───────────────────────────────────────────
    const {
      email, role,
      // facility fields
      facility_name, facility_type, address,
      // worker fields
      display_name, license_number, specialization,
      // shared
      phone,
    } = await req.json();

    if (!email || !role) return err('Missing required fields: email, role');

    // ── Build user_metadata for handle_new_user trigger ─────────
    const userMeta = role === 'facility'
      ? {
          role: 'facility',
          display_name: facility_name,
          facility_name,
          facility_type: facility_type || null,
          address: address || null,
        }
      : {
          role: 'co',
          display_name,
          license_number,
          specialization: specialization || null,
        };

    // ── Create user via Admin API (all auth fields set correctly) ─
    const randomPwd = Array.from(crypto.getRandomValues(new Uint8Array(24)))
      .map((b) => b.toString(16).padStart(2, '0')).join('');

    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      email_confirm: true,      // mark email as confirmed
      user_metadata: userMeta,
      password: randomPwd,      // random placeholder; user sets real password via invite
    });

    if (createError) return err(createError.message);

    const userId = newUser.user.id;

    // ── Generate invite token ────────────────────────────────────
    const arr = new Uint8Array(32);
    crypto.getRandomValues(arr);
    const inviteToken = Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('');
    const expiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    // ── Update public.users with invite fields + phone ───────────
    // handle_new_user trigger already created the row; we just add invite data.
    const { error: updateError } = await supabaseAdmin
      .from('users')
      .update({
        phone: phone || null,
        invite_token: inviteToken,
        invite_token_expiry: expiry,
        account_status: 'pending_invite',
        invited_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (updateError) {
      // Rollback the auth user so we don't leave an orphan
      await supabaseAdmin.auth.admin.deleteUser(userId);
      return err(updateError.message);
    }

    // ── Audit log ───────────────────────────────────────────────
    await supabaseAdmin
      .from('invite_audit_log')
      .insert({ user_id: userId, action: 'invited', performed_by: callerUser.id });

    return ok({
      user_id: userId,
      invite_token: inviteToken,
      email,
      display_name: userMeta.display_name,
      role,
    });
  } catch (e) {
    console.error(e);
    return err(String(e?.message ?? e), 500);
  }
});

function ok(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
function err(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
