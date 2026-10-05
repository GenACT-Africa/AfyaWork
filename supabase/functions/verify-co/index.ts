/**
 * verify-co — check Clinical Officers against the MCT register (HPRS portal)
 *
 * POST body (one of):
 *   { co_id: "<uuid>" }            admin: check one CO now
 *   { all: true, limit?, only_unchecked?, older_than_hours? }
 *                                  admin or service: check the next batch of COs (oldest check first)
 *   { self: true }                 signed-in CO: check own licence (max once / 10 min)
 *   { photo_url: "<hprs url>" }    admin: fetch an HPRS profile photo as a data URL
 *   { ping: true }                 anyone: is HPRS reachable from here? (no data returned)
 *
 * Writes the latest result to co_profiles.mct_* and a full row to co_mct_checks.
 * Never sets verified = true (an admin does that after the identity check).
 * Sets verified = false when the licence is found expired / suspended / missing.
 *
 * Source: https://hprs.moh.go.tz (public practitioner search). This is not an
 * official API — if it fails we record status 'error' and change nothing else.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY         = Deno.env.get('SUPABASE_ANON_KEY')!;
const WEBHOOK_SECRET   = Deno.env.get('INTERNAL_WEBHOOK_SECRET') ?? '';

const HPRS          = 'https://hprs.moh.go.tz';
const MCT_COUNCIL   = '6904e90f-5df9-4e7e-b681-a4f2044ef042';
const OK_PROFESSIONS = ['CO', 'AMO'];          // Clinical Officer, Assistant Medical Officer
const MCT_GRACE_FROM = '2025-12-31';           // portal still shows these as allowed

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// ── auth ────────────────────────────────────────────────────────────────────
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

// ── HPRS lookup ─────────────────────────────────────────────────────────────
/** "CO-MCTER 2461", "Mct 16585", "21433" → "2461", "16585", "21433" */
export function licenceDigits(raw: string | null): string | null {
  if (!raw) return null;
  const s = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const m = s.match(/^(?:CO)?(?:MCTER|MCTE|MCT|ER)?(\d{3,})$/);
  return m && Number(m[1]) > 0 ? m[1] : null;
}
const normReg = (r: string) => (r ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

async function hprsSearch(term: string): Promise<any[]> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const r = await fetch(`${HPRS}/api/user_management/search-user/`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json',
                 'User-Agent': 'AfyaWork licence verification (afyawork.com)' },
      body: JSON.stringify({ council: MCT_COUNCIL, search_type: 'mct_number', mct_number: term }),
    });
    if (!r.ok) throw new Error(`HPRS returned HTTP ${r.status}`);
    const j = await r.json();
    if (!Array.isArray(j)) throw new Error('Unexpected HPRS response');
    return j;
  } finally { clearTimeout(t); }
}

function nameScore(a: string, b: string) {
  const words = (s: string) => (s ?? '').toLowerCase().normalize('NFKD').replace(/[^a-z\s]/g, ' ')
    .split(/\s+/).filter((w) => w.length > 1);
  const A = words(a), B = new Set(words(b));
  if (!A.length || !B.size) return 0;
  const shorter = Math.min(A.length, B.size);
  const hits = new Set(A.filter((w) => B.has(w))).size;
  return Math.round((hits / shorter) * 100) / 100;
}

type Result = {
  status: string; reg_number?: string | null; hprs_name?: string | null; hprs_profession?: string | null;
  licence_expires?: string | null; caveat?: string | null; message: string;
  hprs_photo_url?: string | null; hprs_record?: unknown; searched_number?: string | null;
};

const today = () => new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10); // EAT

function resolve(u: any): Result {
  const prof = (u.user_profession ?? []).find((p: any) => p.user_profession_type === 'main') ?? u.user_profession?.[0];
  const profCode = prof?.profession?.profession_short_name ?? prof?.profession?.profession_code ?? null;
  const base = {
    hprs_name: u.get_full_name ?? null,
    hprs_profession: prof?.profession?.profession_name ?? null,
    hprs_photo_url: u.profile_picture ? String(u.profile_picture).replace(/^http:/, 'https:') : null,
  };
  const regs = (u.registration ?? []).filter((r: any) => r.registration_number);
  const approvedReg = regs.find((r: any) => r.application_status === 'Approved');
  const reg_number = approvedReg?.registration_number ?? regs[0]?.registration_number ?? null;

  // Disciplinary / deceased caveats
  const cav = (u.caveat ?? []).find((c: any) => !c.caveat_end_date || c.caveat_end_date >= today());
  if (cav) {
    const label = cav.categories === 'DEATH' ? 'Deceased'
      : cav.categories === 'UNFIT_TO_PRACTICE' ? 'Unfit to practise'
      : cav.punishment_type === 'ERASURE' ? 'Erased from the register'
      : cav.punishment_type === 'SUSPENSION' ? `Suspended ${cav.caveat_start_date ?? ''} to ${cav.caveat_end_date ?? ''}`
      : `Caveat: ${cav.categories ?? 'unknown'}`;
    return { ...base, status: 'suspended', reg_number, caveat: label, message: `${label} — not allowed to practise` };
  }

  if (!approvedReg) {
    return { ...base, status: 'not_licensed', reg_number, message: 'No approved MCT registration — not allowed to practise' };
  }

  const lic = u.licences ?? [];
  const active = lic.filter((l: any) => ['Approved', 'Allowed to Practice'].includes(l.licence_status) && !l.expired);
  let status: string, licence_expires: string | null = null, message: string;
  if (active.length) {
    licence_expires = active.map((l: any) => l.expire_date).filter(Boolean).sort().pop() ?? null;
    status = 'valid';
    message = `Licensed and allowed to practise${licence_expires ? `, licence valid to ${licence_expires}` : ''}`;
  } else {
    const graceLic = lic.filter((l: any) => l.expired && l.expire_date && l.expire_date >= MCT_GRACE_FROM)
      .map((l: any) => l.expire_date).sort().pop();
    if (graceLic) {
      status = 'grace'; licence_expires = graceLic;
      message = `Licence expired ${graceLic}, but MCT is still showing it as allowed (renewal grace period)`;
    } else if (lic.length) {
      licence_expires = lic.map((l: any) => l.expire_date).filter(Boolean).sort().pop() ?? null;
      status = 'expired';
      message = `Licence expired${licence_expires ? ` on ${licence_expires}` : ''} — not allowed to practise`;
    } else {
      status = 'not_licensed';
      message = 'Registered but no practising licence on record';
    }
  }

  if (profCode && !OK_PROFESSIONS.includes(profCode) && (status === 'valid' || status === 'grace')) {
    return { ...base, status: 'wrong_profession', reg_number, licence_expires,
             message: `Registered as ${base.hprs_profession}, not a Clinical Officer` };
  }
  return { ...base, status, reg_number, licence_expires, message };
}

const RANK: Record<string, number> = { valid: 6, grace: 5, wrong_profession: 4, expired: 3, not_licensed: 2, suspended: 7 };

async function lookup(licence: string | null): Promise<Result> {
  const digits = licenceDigits(licence);
  if (!digits) return { status: 'not_found', searched_number: licence, message: `"${licence ?? ''}" is not a valid MCT number (expected e.g. MCTER23228)` };
  const wanted = new Set([`MCTER${digits}`, digits, `MCT${digits}`]);
  let matches: any[] = [];
  for (const term of [`MCTER${digits}`, digits]) {
    const found = await hprsSearch(term);
    matches = found.filter((u) => (u.registration ?? []).some((r: any) => wanted.has(normReg(r.registration_number))));
    if (matches.length) break;
  }
  if (!matches.length) return { status: 'not_found', searched_number: `MCTER${digits}`, message: `No practitioner with number MCTER${digits} on the MCT register` };
  // Same number can appear on more than one HPRS account; a caveat on any wins, else the best licence
  const resolved = matches.map((u) => ({ r: resolve(u), u }));
  resolved.sort((a, b) => (RANK[b.r.status] ?? 0) - (RANK[a.r.status] ?? 0));
  const best = resolved[0];
  return { ...best.r, searched_number: `MCTER${digits}`, hprs_record: best.u };
}

// ── check one CO and store ──────────────────────────────────────────────────
async function checkCo(coId: string, source: string) {
  const { data: co, error } = await db.from('co_profiles')
    .select('user_id, license_number, verified, users!inner(display_name)')
    .eq('user_id', coId).single();
  if (error || !co) return { co_id: coId, status: 'error', message: 'CO not found' };
  const displayName = (co as any).users?.display_name ?? '';

  let r: Result;
  try { r = await lookup(co.license_number); }
  catch (e) { r = { status: 'error', searched_number: co.license_number, message: `Could not reach the MCT register: ${(e as Error).message}` }; }

  const name_match = r.hprs_name ? nameScore(displayName, r.hprs_name) : null;

  await db.from('co_mct_checks').insert({
    co_id: coId, trigger_source: source, searched_number: r.searched_number ?? co.license_number,
    status: r.status, reg_number: r.reg_number ?? null, hprs_name: r.hprs_name ?? null,
    hprs_profession: r.hprs_profession ?? null, licence_expires: r.licence_expires ?? null,
    name_match, caveat: r.caveat ?? null, message: r.message, hprs_photo_url: r.hprs_photo_url ?? null,
    hprs_record: r.hprs_record ?? null,
  });

  if (r.status !== 'error') {
    const upd: Record<string, unknown> = {
      mct_status: r.status, mct_reg_number: r.reg_number ?? null,
      mct_licence_expires: r.licence_expires ?? null, mct_checked_at: new Date().toISOString(),
    };
    if (co.verified && !['valid', 'grace'].includes(r.status)) {
      upd.verified = false; upd.verified_at = null;
      upd.verification_note = `Auto-removed ${today()}: ${r.message}`;
    }
    await db.from('co_profiles').update(upd).eq('user_id', coId);
  }
  return { co_id: coId, name: displayName, status: r.status, message: r.message, name_match,
           hprs_name: r.hprs_name ?? null, reg_number: r.reg_number ?? null, licence_expires: r.licence_expires ?? null };
}

// ── handler ─────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  let body: any = {};
  try { body = await req.json(); } catch { /* empty body */ }

  // Health check: can this function reach HPRS? Returns no practitioner data.
  if (body.ping) {
    const t0 = Date.now();
    try {
      const found = await hprsSearch('MCTER1');
      return json({ hprs: 'reachable', ms: Date.now() - t0, sample_size: found.length });
    } catch (e) {
      return json({ hprs: 'unreachable', ms: Date.now() - t0, error: (e as Error).message }, 502);
    }
  }

  const service = isService(req);
  const me = service ? null : await caller(req);
  const admin = service || me?.role === 'admin';

  try {
    // CO checks own licence (after signup or after editing the number)
    if (body.self) {
      if (!me || me.role !== 'co') return json({ error: 'Sign in as a CO' }, 401);
      const { data: p } = await db.from('co_profiles').select('mct_checked_at').eq('user_id', me.id).single();
      if (p?.mct_checked_at && Date.now() - new Date(p.mct_checked_at).getTime() < 10 * 60e3) {
        return json({ skipped: 'checked recently' });
      }
      const r = await checkCo(me.id, body.source === 'signup' ? 'signup' : 'self');
      return json({ status: r.status, message: r.message });   // no HPRS data back to the CO
    }

    if (!admin) return json({ error: me ? 'Admins only' : 'Sign in required' }, me ? 403 : 401);

    if (body.photo_url) {
      const u = new URL(String(body.photo_url).replace(/^http:/, 'https:'));
      if (u.hostname !== 'hprs.moh.go.tz') return json({ error: 'Only HPRS photos' }, 400);
      const r = await fetch(u);
      if (!r.ok) return json({ error: `Photo HTTP ${r.status}` }, 502);
      const buf = new Uint8Array(await r.arrayBuffer());
      let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      return json({ data_url: `data:${r.headers.get('content-type') ?? 'image/jpeg'};base64,${btoa(bin)}` });
    }

    if (body.co_id) return json(await checkCo(String(body.co_id), 'admin'));

    if (body.all) {
      // Oldest-checked first, capped so one call stays inside the edge time limit.
      // Call repeatedly (e.g. from pg_cron) until `remaining` is 0.
      const limit = Math.min(Number(body.limit) || 25, 40);
      let q = db.from('co_profiles').select('user_id', { count: 'exact' })
        .order('mct_checked_at', { ascending: true, nullsFirst: true }).limit(limit);
      if (body.only_unchecked) q = q.eq('mct_status', 'unchecked');
      if (body.older_than_hours) q = q.or(`mct_checked_at.is.null,mct_checked_at.lt.${new Date(Date.now() - Number(body.older_than_hours) * 3600e3).toISOString()}`);
      const { data: cos, count } = await q;
      const started = Date.now();
      const results = [];
      for (const c of cos ?? []) {
        if (Date.now() - started > 110_000) break;
        results.push(await checkCo(c.user_id, 'batch'));
        await new Promise((r) => setTimeout(r, 300));   // be gentle with HPRS
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
