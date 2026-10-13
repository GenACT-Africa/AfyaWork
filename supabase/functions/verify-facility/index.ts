/**
 * verify-facility — check facilities against the Health Facility Registry (HFR)
 *
 * POST body (one of):
 *   { facility_id: "<uuid>" }      admin: check one facility now
 *   { all: true, limit?, only_unchecked?, older_than_hours? }
 *                                  admin or service: check the next batch (oldest check first)
 *   { self: true }                 signed-in facility: check own HFR code (max once / 10 min)
 *   { lookup: "<hfr code>" }       admin: look a code up without saving (e.g. while adding a facility)
 *   { lead_id: "<uuid>" }          admin or active coordinator: look up a lead's HFR code and store the
 *                                  result on the lead (ticks steps 1a–1c; fills the official phone if empty).
 *                                  One lead per call, max once a minute per lead — never loop over leads.
 *   { ping: true }                 anyone: is HFR reachable from here? (no data returned)
 *
 * Writes the latest result to facility_profiles.hfr_* and a full row to facility_hfr_checks.
 * Never sets verified = true (an admin does that after calling the facility's official
 * HFR phone). Sets verified = false when the facility is found not operating / missing.
 *
 * Source: https://hfrs.moh.go.tz public portal. Not an official API — if it fails we
 * record status 'error' and change nothing else.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { HFR, normaliseHfrCode, parseHfrList, parseHfrDetail, resolveHfr, nameScore, type HfrResult } from './hfr.ts';

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY         = Deno.env.get('SUPABASE_ANON_KEY')!;
const WEBHOOK_SECRET   = Deno.env.get('INTERNAL_WEBHOOK_SECRET') ?? '';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const today = () => new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10); // EAT

// ── auth (same as verify-co) ────────────────────────────────────────────────
function safeEqual(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
function bearer(req: Request) {
  const h = req.headers.get('Authorization') ?? '';
  return h.toLowerCase().startsWith('bearer ') ? h.slice(7).trim() : '';
}
function isService(req: Request) {
  return safeEqual(bearer(req), SERVICE_ROLE_KEY) ||
    (WEBHOOK_SECRET !== '' && safeEqual(req.headers.get('x-webhook-secret') ?? '', WEBHOOK_SECRET));
}
async function caller(req: Request): Promise<{ id: string; role: string | null } | null> {
  const token = bearer(req);
  if (!token || token === ANON_KEY) return null;
  const c = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: { user } } = await c.auth.getUser();
  if (!user) return null;
  const { data } = await db.from('users').select('role').eq('id', user.id).single();
  return { id: user.id, role: data?.role ?? null };
}

// ── HFR lookup ──────────────────────────────────────────────────────────────
async function hfrGet(route: string, params: Record<string, string>): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const qs = new URLSearchParams({ r: route, ...params });
    const r = await fetch(`${HFR}/web/index.php?${qs}`, {
      signal: ctrl.signal,
      headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'text/html',
                 'User-Agent': 'AfyaWork facility verification (afyawork.com)' },
    });
    if (!r.ok) throw new Error(`HFR returned HTTP ${r.status}`);
    return await r.text();
  } finally { clearTimeout(t); }
}

async function lookup(raw: string | null): Promise<HfrResult> {
  if (!raw || !raw.trim()) return { status: 'no_code', searched_code: null, message: 'No HFR facility code on this profile yet' };
  const code = normaliseHfrCode(raw);
  if (!code) return { status: 'not_found', searched_code: raw, message: `"${raw}" is not a valid HFR facility code (expected e.g. 125039-8)` };

  const listHtml = await hfrGet('portal/health-facility-list', { search_by: 'fac_code', facility_name: code });
  if (/<html/i.test(listHtml.slice(0, 500))) throw new Error('HFR returned a full page instead of search results');
  const row = parseHfrList(listHtml).find((r) => r.code === code) ?? null;
  const detail = parseHfrDetail(await hfrGet('portal/facility-detail', { facility_code: code }));
  // Only trust the detail page if it is for this exact code
  return resolveHfr(code, row, detail && detail.code === code ? detail : null);
}

// ── check one facility and store ────────────────────────────────────────────
async function checkFacility(facilityId: string, source: string) {
  const { data: f, error } = await db.from('facility_profiles')
    .select('user_id, facility_name, hfr_code, verified')
    .eq('user_id', facilityId).single();
  if (error || !f) return { facility_id: facilityId, status: 'error', message: 'Facility not found' };

  let r: HfrResult;
  try { r = await lookup(f.hfr_code); }
  catch (e) { r = { status: 'error', searched_code: f.hfr_code, message: `Could not reach the Health Facility Registry: ${(e as Error).message}` }; }

  const name_match = r.hfr_name ? nameScore(f.facility_name, r.hfr_name) : null;

  if (r.status !== 'no_code') {
    await db.from('facility_hfr_checks').insert({
      facility_id: facilityId, trigger_source: source, searched_code: r.searched_code ?? f.hfr_code,
      status: r.status, hfr_code: r.hfr_code ?? null, hfr_name: r.hfr_name ?? null, hfr_type: r.hfr_type ?? null,
      hfr_region: r.hfr_region ?? null, hfr_council: r.hfr_council ?? null, hfr_address: r.hfr_address ?? null,
      hfr_ownership: r.hfr_ownership ?? null, hfr_owner_name: r.hfr_owner_name ?? null,
      hfr_authority: r.hfr_authority ?? null, hfr_operating: r.hfr_operating ?? null,
      hfr_opened: r.hfr_opened ?? null, hfr_phone: r.hfr_phone ?? null,
      name_match, message: r.message, hfr_record: r.hfr_record ?? null,
    });
  }

  if (r.status !== 'error') {
    const upd: Record<string, unknown> = {
      hfr_status: r.status, hfr_name: r.hfr_name ?? null, hfr_checked_at: new Date().toISOString(),
    };
    if (f.verified && r.status !== 'operating') {
      upd.verified = false; upd.verified_at = null;
      upd.verification_note = `Auto-removed ${today()}: ${r.message}`;
    }
    await db.from('facility_profiles').update(upd).eq('user_id', facilityId);
  }
  return { facility_id: facilityId, name: f.facility_name, status: r.status, message: r.message, name_match,
           hfr_name: r.hfr_name ?? null, hfr_code: r.hfr_code ?? null };
}

// ── look up a lead (coordinator pipeline) ───────────────────────────────────
async function checkLead(leadId: string, actor: string) {
  const { data: lead } = await db.from('facility_leads')
    .select('id, hfr_code, official_phone, hfr_checked_at').eq('id', leadId).single();
  if (!lead) return { error: 'Lead not found' };
  if (!lead.hfr_code) return { status: 'no_code', message: 'Add the HFR code first' };
  if (lead.hfr_checked_at && Date.now() - new Date(lead.hfr_checked_at).getTime() < 60e3) {
    return { skipped: true, message: 'Checked less than a minute ago' };
  }
  let r: HfrResult;
  try { r = await lookup(lead.hfr_code); }
  catch (e) { r = { status: 'error', message: `Could not reach the Health Facility Registry: ${(e as Error).message}` }; }

  if (r.status === 'error') return { status: 'error', message: r.message };   // keep the last good result
  const upd: Record<string, unknown> = {
    hfr_status: r.status,
    hfr_name: r.hfr_name ?? null,
    hfr_checked_at: new Date().toISOString(),
  };
  if (!lead.official_phone && r.hfr_phone) upd.official_phone = r.hfr_phone;
  await db.from('facility_leads').update(upd).eq('id', leadId);
  await db.from('lead_events').insert({
    lead_id: leadId, actor_id: actor, action: 'hfr_lookup',
    detail: { code: lead.hfr_code, status: r.status, name: r.hfr_name ?? null, council: r.hfr_council ?? null },
  });
  return {
    status: r.status, message: r.message, hfr_name: r.hfr_name ?? null, hfr_type: r.hfr_type ?? null,
    hfr_council: r.hfr_council ?? null, hfr_region: r.hfr_region ?? null, hfr_address: r.hfr_address ?? null,
    hfr_phone: r.hfr_phone ?? null, phone_filled: !!upd.official_phone,
  };
}

// ── handler ─────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  let body: any = {};
  try { body = await req.json(); } catch { /* empty body */ }

  if (body.ping) {
    const t0 = Date.now();
    try {
      const rows = parseHfrList(await hfrGet('portal/health-facility-list', { search_by: 'fac_code', facility_name: '125039-8' }));
      return json({ hfr: 'reachable', ms: Date.now() - t0, parsed_rows: rows.length });
    } catch (e) {
      return json({ hfr: 'unreachable', ms: Date.now() - t0, error: (e as Error).message }, 502);
    }
  }

  const service = isService(req);
  const me = service ? null : await caller(req);
  const admin = service || me?.role === 'admin';

  try {
    if (body.self) {
      if (!me || me.role !== 'facility') return json({ error: 'Sign in as a facility' }, 401);
      const { data: p } = await db.from('facility_profiles').select('hfr_checked_at, hfr_code').eq('user_id', me.id).single();
      if (!p?.hfr_code) return json({ status: 'no_code', message: 'Add your HFR facility code first' });
      if (p.hfr_checked_at && Date.now() - new Date(p.hfr_checked_at).getTime() < 10 * 60e3) {
        return json({ skipped: 'checked recently' });
      }
      const r = await checkFacility(me.id, body.source === 'signup' ? 'signup' : 'self');
      return json({ status: r.status, message: r.message, hfr_name: r.hfr_name });  // no phone/owner back to the facility
    }

    if (body.lead_id) {
      if (!me) return json({ error: 'Sign in required' }, 401);
      if (me.role !== 'admin') {
        const { data: u } = await db.from('users').select('role, account_status').eq('id', me.id).single();
        if (u?.role !== 'coordinator' || u?.account_status !== 'active') return json({ error: 'Not allowed' }, 403);
      }
      return json(await checkLead(String(body.lead_id), me.id));
    }

    if (!admin) return json({ error: me ? 'Admins only' : 'Sign in required' }, me ? 403 : 401);

    if (body.lookup) return json(await lookup(String(body.lookup)));

    if (body.facility_id) return json(await checkFacility(String(body.facility_id), 'admin'));

    if (body.all) {
      const limit = Math.min(Number(body.limit) || 25, 40);
      let q = db.from('facility_profiles').select('user_id', { count: 'exact' })
        .not('hfr_code', 'is', null)
        .order('hfr_checked_at', { ascending: true, nullsFirst: true }).limit(limit);
      if (body.only_unchecked) q = q.eq('hfr_status', 'unchecked');
      if (body.older_than_hours) q = q.or(`hfr_checked_at.is.null,hfr_checked_at.lt.${new Date(Date.now() - Number(body.older_than_hours) * 3600e3).toISOString()}`);
      const { data: rows, count } = await q;
      const started = Date.now();
      const results = [];
      for (const f of rows ?? []) {
        if (Date.now() - started > 110_000) break;
        results.push(await checkFacility(f.user_id, 'batch'));
        await new Promise((r) => setTimeout(r, 300));   // be gentle with HFR
      }
      const summary: Record<string, number> = {};
      for (const r of results) summary[r.status] = (summary[r.status] ?? 0) + 1;
      return json({ checked: results.length, remaining: Math.max((count ?? 0) - results.length, 0), summary, results });
    }

    return json({ error: 'Nothing to do' }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
