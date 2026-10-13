// Run: deno test supabase/functions/verify-facility/hfr.test.ts
//  or: node --experimental-strip-types supabase/functions/verify-facility/hfr.test.ts
// Fixtures are trimmed copies of real hfrs.moh.go.tz fragments (13 Oct 2026).
import { normaliseHfrCode, parseHfrList, parseHfrDetail, resolveHfr, nameScore } from './hfr.ts';

let failed = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; console.error(`FAIL ${msg}\n  expected ${e}\n  got      ${a}`); } else console.log(`ok   ${msg}`);
}

const LIST = `<div class="summary">Showing <b>1-1</b> of <b>1</b> item.</div>
<table class="kv-grid-table table"><thead><tr><th>#</th><th data-col-seq="1"><a href="#">Facility Code</a></th></tr></thead>
<tbody>
<tr class="w1" data-key="27716"><td>1</td><td class="w1" data-col-seq="1">125039-8</td><td class="w1" data-col-seq="2">MORCEP</td><td class="w1" data-col-seq="3">Dispensary</td><td class="w1" data-col-seq="4">Dar es Salaam Region</td><td class="w1" data-col-seq="5">Temeke MC</td><td class="w1" data-col-seq="6">Private</td><td class="w1" data-col-seq="7">Company/Business Name</td><td class="w1" data-col-seq="8">PHAB</td><td class="w1" data-col-seq="9">Operating</td><td class="w1" data-col-seq="10"><button type="button" value="/web/index.php?r=portal%2Ffacility-detail&amp;facility_code=125039-8" onclick="loadView(this)"></button></td><td class="w1" data-col-seq="11"><a href="#"></a></td></tr>
</tbody></table>`;

const EMPTY_LIST = `<table><thead><tr><th data-col-seq="1">Facility Code</th></tr></thead><tbody>
<tr><td colspan="12"><div class="empty">No results found.</div></td></tr></tbody></table>`;

const DETAIL = `<div class="media-body"><h4>Facility Name: MORCEP</h4></div>
<div><label>Common name</label> <span
  class="font-weight-semibold fs-14">MORCEP</span></div>
<div><label>Status</label> <span class="font-weight-semibold fs-14">Operating</span></div>
<div><label>Facility Code</label> <span class="font-weight-semibold fs-14">125039-8</span></div>
<div><label>Date Opened</label> <span class="font-weight-semibold fs-14">2025-12-05</span></div>
<div><label>Facility Type</label> <span class="font-weight-semibold fs-14">Dispensary</span></div>
<div><label>Ownership</label> <span class="font-weight-semibold fs-14">Private, Company/Business Name : MORCEP INVESTIMENT COMPANY LIMITED </span></div>
<div><label>Address</label> <span class="font-weight-semibold fs-14">Eastern Zone-Dar es Salaam Region - Temeke District - Temeke MC - Kijichi - Mgeninani</span></div>
<div><label>Official Phone</label> <span class="font-weight-semibold fs-14">0754051704</span></div>
<div><label>Website</label> <span class="font-weight-semibold fs-14">www.morcep.com </span></div>`;

// What HFR renders for a code that does not exist
const DETAIL_UNKNOWN = `<h4>Facility Name: </h4><label>Common name</label> <span></span>
<label>Status</label> <span></span><label>Facility Code</label> <span></span><label>Date Opened</label> <span>Not set</span>`;

eq(normaliseHfrCode('125039-8'), '125039-8', 'code: canonical');
eq(normaliseHfrCode(' 1250398 '), '125039-8', 'code: missing dash');
eq(normaliseHfrCode('HFR code: 125039 8'), '125039-8', 'code: prefix + space');
eq(normaliseHfrCode('MCTER2461'), null, 'code: not an HFR code');
eq(normaliseHfrCode(''), null, 'code: empty');

const rows = parseHfrList(LIST);
eq(rows.length, 1, 'list: one row');
eq(rows[0], { code: '125039-8', name: 'MORCEP', type: 'Dispensary', region: 'Dar es Salaam Region', council: 'Temeke MC',
  ownership: 'Private', ownership_authority: 'Company/Business Name', moh_authority: 'PHAB', operating_status: 'Operating' }, 'list: fields');
eq(parseHfrList(EMPTY_LIST), [], 'list: no results');

const d = parseHfrDetail(DETAIL)!;
eq([d.name, d.status, d.code, d.opened, d.ownership, d.owner_name, d.phone],
   ['MORCEP', 'Operating', '125039-8', '2025-12-05', 'Private, Company/Business Name', 'MORCEP INVESTIMENT COMPANY LIMITED', '0754051704'], 'detail: fields');
eq(parseHfrDetail(DETAIL_UNKNOWN), null, 'detail: unknown code');

const ok = resolveHfr('125039-8', rows[0], d);
eq([ok.status, ok.hfr_name, ok.hfr_council, ok.hfr_phone, ok.hfr_authority], ['operating', 'MORCEP', 'Temeke MC', '0754051704', 'PHAB'], 'resolve: operating');
eq(resolveHfr('999999-9', null, null).status, 'not_found', 'resolve: not found');
eq(resolveHfr('125039-8', null, { ...d, status: 'Closed' }).status, 'not_operating', 'resolve: closed facility');

eq(nameScore('Morcep dispensary', 'MORCEP'), 1, 'name: filler words ignored');
eq(nameScore('PCMC Health care', 'PCMC'), 1, 'name: PCMC');
eq(nameScore('GenACT Clinic', 'MORCEP'), 0, 'name: mismatch');

if (failed) { console.error(`${failed} failed`); (globalThis as any).Deno ? (globalThis as any).Deno.exit(1) : (globalThis as any).process.exit(1); }
