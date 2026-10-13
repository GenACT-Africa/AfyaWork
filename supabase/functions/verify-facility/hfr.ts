/**
 * HFR (Health Facility Registry, hfrs.moh.go.tz) lookup helpers.
 * No Deno-only imports here so the parsers can be tested with plain Node.
 *
 * The public portal has no JSON API. Two server-rendered fragments are used,
 * the same ones the portal's own search page loads (they need the
 * X-Requested-With header, or the portal returns the full page instead):
 *   list:   /web/index.php?r=portal/health-facility-list&search_by=fac_code&facility_name=<code>
 *   detail: /web/index.php?r=portal/facility-detail&facility_code=<code>
 */

export const HFR = 'https://hfrs.moh.go.tz';
export const HFR_PORTAL_URL = `${HFR}/web/index.php?r=portal%2Fadvanced-search`;

/** "125039-8", "1250398", "125039 8", "HFR 125039-8" → "125039-8". null if it doesn't look like a code. */
export function normaliseHfrCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = String(raw).toUpperCase().replace(/HFR|CODE|[:#\s]/g, '');
  const m = s.match(/^(\d{5,7})-?(\d)$/);
  return m ? `${m[1]}-${m[2]}` : null;
}

const decode = (s: string) => s
  .replace(/<[^>]*>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#039;|&#39;/g, "'")
  .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/\s+/g, ' ').trim();

export type HfrListRow = {
  code: string; name: string; type: string; region: string; council: string;
  ownership: string; ownership_authority: string; moh_authority: string; operating_status: string;
};

/** Rows of the search-results grid. Columns are identified by data-col-seq (1..9). */
export function parseHfrList(html: string): HfrListRow[] {
  const rows: HfrListRow[] = [];
  const body = html.split(/<tbody[^>]*>/i)[1]?.split(/<\/tbody>/i)[0] ?? '';
  for (const tr of body.split(/<tr\b/i).slice(1)) {
    const cells: Record<number, string> = {};
    const re = /<td[^>]*data-col-seq="(\d+)"[^>]*>([\s\S]*?)<\/td>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(tr))) cells[Number(m[1])] = decode(m[2]);
    if (!cells[1]) continue;   // "No results found." row
    rows.push({
      code: cells[1], name: cells[2] ?? '', type: cells[3] ?? '', region: cells[4] ?? '',
      council: cells[5] ?? '', ownership: cells[6] ?? '', ownership_authority: cells[7] ?? '',
      moh_authority: cells[8] ?? '', operating_status: cells[9] ?? '',
    });
  }
  return rows;
}

export type HfrDetail = {
  name: string | null; common_name: string | null; status: string | null; code: string | null;
  opened: string | null; type: string | null; ownership: string | null; owner_name: string | null;
  address: string | null; phone: string | null; website: string | null;
};

/** The facility-detail fragment: <label>X</label> <span>value</span> pairs. */
export function parseHfrDetail(html: string): HfrDetail | null {
  const f: Record<string, string> = {};
  const re = /<label>\s*([^<]*?)\s*<\/label>\s*<span[^>]*>([\s\S]*?)<\/span>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) f[m[1].toLowerCase()] = decode(m[2]);
  const h4 = html.match(/<h4>\s*Facility Name:\s*([\s\S]*?)<\/h4>/i);
  const name = h4 ? decode(h4[1]) : '';
  const code = f['facility code'] || '';
  if (!code && !name) return null;   // unknown codes render the template with empty values
  const own = f['ownership'] || '';
  const [ownCat, ownerName] = own.split(/\s:\s/);
  const opened = /^\d{4}-\d{2}-\d{2}$/.test(f['date opened'] || '') ? f['date opened'] : null;
  return {
    name: name || null, common_name: f['common name'] || null, status: f['status'] || null,
    code: code || null, opened, type: f['facility type'] || null,
    ownership: (ownCat || '').replace(/,\s*$/, '').trim() || null,
    owner_name: (ownerName || '').trim() || null,
    address: f['address'] || null, phone: f['official phone'] || null, website: f['website'] || null,
  };
}

/** Share (0..1) of the shorter name's words found in the other. "Dispensary", "Clinic" etc. are ignored. */
const FILLER = new Set(['dispensary', 'clinic', 'polyclinic', 'hospital', 'health', 'centre', 'center',
  'medical', 'healthcare', 'care', 'the', 'and', 'of', 'ltd', 'limited', 'co', 'company', 'hc', 'dsp']);
export function nameScore(a: string, b: string) {
  const words = (s: string) => (s ?? '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/).filter((w) => w.length > 1 && !FILLER.has(w));
  const A = words(a), B = new Set(words(b));
  if (!A.length || !B.size) return 0;
  const shorter = Math.min(new Set(A).size, B.size);
  const hits = new Set(A.filter((w) => B.has(w))).size;
  return Math.round((hits / shorter) * 100) / 100;
}

export type HfrResult = {
  status: 'operating' | 'not_operating' | 'not_found' | 'no_code' | 'error';
  message: string; searched_code?: string | null;
  hfr_code?: string | null; hfr_name?: string | null; hfr_type?: string | null;
  hfr_region?: string | null; hfr_council?: string | null; hfr_address?: string | null;
  hfr_ownership?: string | null; hfr_owner_name?: string | null; hfr_authority?: string | null;
  hfr_operating?: string | null; hfr_opened?: string | null; hfr_phone?: string | null;
  hfr_record?: unknown;
};

/** Combine the list row (status, region, authority) and detail (phone, owner, address). */
export function resolveHfr(code: string, row: HfrListRow | null, detail: HfrDetail | null): HfrResult {
  if (!row && !detail) {
    return { status: 'not_found', searched_code: code, message: `No facility with code ${code} on the Health Facility Registry` };
  }
  const operating = row?.operating_status || detail?.status || '';
  const base = {
    searched_code: code,
    hfr_code: row?.code || detail?.code || code,
    hfr_name: row?.name || detail?.name || null,
    hfr_type: row?.type || detail?.type || null,
    hfr_region: row?.region || null,
    hfr_council: row?.council || null,
    hfr_address: detail?.address || null,
    hfr_ownership: [row?.ownership, row?.ownership_authority].filter(Boolean).join(' – ') || detail?.ownership || null,
    hfr_owner_name: detail?.owner_name || null,
    hfr_authority: row?.moh_authority || null,
    hfr_operating: operating || null,
    hfr_opened: detail?.opened || null,
    hfr_phone: detail?.phone || null,
    hfr_record: { list: row, detail },
  };
  if (/^operating$/i.test(operating.trim())) {
    return { ...base, status: 'operating',
      message: `${base.hfr_name} (${base.hfr_type ?? 'facility'}, ${base.hfr_council ?? base.hfr_region ?? 'Tanzania'}) is registered and operating` };
  }
  return { ...base, status: 'not_operating',
    message: `${base.hfr_name} is on the registry but shown as "${operating || 'unknown status'}", not operating` };
}
