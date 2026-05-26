import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { token, password } = await req.json();
    if (!token || !password) return err('Missing token or password');
    if (password.length < 6) return err('Password must be at least 6 characters');

    // ── Validate the invite token ───────────────────────────────
    const { data: validation, error: valError } = await supabase
      .rpc('validate_invite_token', { p_token: token });

    if (valError) return err(valError.message);
    if (!validation?.valid) {
      return new Response(JSON.stringify({ success: false, reason: validation?.reason ?? 'Invalid token' }), {
        status: 400,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // ── Look up user by invite token ────────────────────────────
    const { data: userRow, error: fetchError } = await supabase
      .from('users')
      .select('id, email')
      .eq('invite_token', token)
      .single();

    if (fetchError || !userRow) return err('User not found');

    // ── Set real password via Admin API (handles bcrypt correctly) ─
    const { error: pwdError } = await supabase.auth.admin.updateUserById(
      userRow.id,
      { password },
    );
    if (pwdError) return err(pwdError.message);

    // ── Mark account active, clear invite token ─────────────────
    const { error: clearError } = await supabase
      .from('users')
      .update({
        account_status: 'active',
        invite_token: null,
        invite_token_expiry: null,
        activated_at: new Date().toISOString(),
      })
      .eq('id', userRow.id);

    if (clearError) return err(clearError.message);

    // ── Audit log ───────────────────────────────────────────────
    await supabase
      .from('invite_audit_log')
      .insert({ user_id: userRow.id, action: 'activated' });

    return ok({ success: true, email: userRow.email });
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
  return new Response(JSON.stringify({ success: false, reason: message, error: message }), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
