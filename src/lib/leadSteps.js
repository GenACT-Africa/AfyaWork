// Facility onboarding SOP: 8 stages, steps 1a–8c.
// Wording and ids come from the standalone tracker; the database stores only ids
// (lead_steps.step_id), so wording can change here without a migration.
//
//   opt:   optional — never blocks a stage
//   due:   ticking it sets the next follow-up date this many days ahead
//   auto:  ticks itself from live data (never stored, can't be unticked)
//   admin: only an admin may tick it (judgement calls)

export const STAGES = [
  { n: 'Identify', goal: 'Confirm the facility is real and operating on HFR, and who to contact.',
    exit: 'Exit: HFR code and official phone are saved.',
    items: [
      { id: '1a', t: 'Found on the HFR portal', auto: 'Run the HFR lookup' },
      { id: '1b', t: 'HFR status shows operating', auto: 'From the HFR lookup' },
      { id: '1c', t: 'HFR code and official phone saved', auto: 'From the HFR lookup' },
      { id: '1d', t: 'Private facility that runs nights or weekends' }] },
  { n: 'Reach out', goal: 'Get a 10-minute call with the medical director or HR/admin.',
    exit: 'Exit: they agree to a call. No reply after day 7: mark Cold.',
    items: [
      { id: '2a', t: 'First message sent (IG or WhatsApp)', due: 3 },
      { id: '2b', t: 'Follow-up sent, day 3', opt: true, due: 4 },
      { id: '2c', t: 'Follow-up on a second channel, day 7', opt: true },
      { id: '2d', t: 'Reply received' },
      { id: '2e', t: 'Call booked with the decision-maker' }] },
  { n: 'Pitch', goal: 'Get a clear yes, no or later from the person who can sign.',
    exit: 'Exit: a yes, with a visit date and the name of the signatory.',
    items: [
      { id: '3a', t: 'Call held with the decision-maker' },
      { id: '3b', t: 'Asked how they cover nights, weekends and leave' },
      { id: '3c', t: 'Explained the 18.6% per-shift fee, paid only when a shift is filled' },
      { id: '3d', t: 'Explained the founding offer', hint: 'First 3 shifts free, first 50 facilities, until 31 Dec 2026' },
      { id: '3e', t: 'One-pager sent' },
      { id: '3f', t: 'Said yes. Visit date and signatory agreed' }] },
  { n: 'Visit', goal: 'Prove the facility is real and that the person has authority.',
    exit: 'Exit: visit report filed and every item ticked.',
    stop: 'Signage does not match HFR, no proof of role, or licence expired or missing.',
    items: [
      { id: '4a', t: 'Visit booked with the named decision-maker' },
      { id: '4b', t: 'Signage and building match the HFR listing' },
      { id: '4c', t: 'Met the decision-maker. National ID and role seen', hint: 'Record that you saw it — do not photograph the ID' },
      { id: '4d', t: 'Registration certificate photographed', hint: 'Upload it under Files below' },
      { id: '4e', t: 'Current annual licence photographed', hint: 'Upload it and note the expiry date below' },
      { id: '4f', t: 'Map pin captured at the entrance' },
      { id: '4g', t: 'Asked pay per shift and how many COs they use' },
      { id: '4h', t: 'Showed how to post a shift' },
      { id: '4i', t: 'Visit report filed the same day' }] },
  { n: 'Contract', goal: 'No signature, no shifts.',
    exit: 'Exit: both parties signed and a scan is filed.',
    items: [
      { id: '5a', t: 'Two copies printed' },
      { id: '5b', t: 'Fee and founding offer read out clause by clause' },
      { id: '5c', t: 'Facility signed, with name and role' },
      { id: '5d', t: 'AfyaWork countersigned' },
      { id: '5e', t: 'Scan filed in the facility folder', hint: 'Upload it under Files as "Contract scan"' }] },
  { n: 'Onboard', goal: 'Turn the facility into a verified account.',
    exit: 'Exit: green Verified badge in the admin panel.',
    items: [
      { id: '6a', t: 'Account created (phone, HFR code, map location)', auto: 'When the facility signs up with this HFR code' },
      { id: '6b', t: 'HFR check in admin shows operating', auto: 'From the facility’s HFR check' },
      { id: '6c', t: 'HFR name and address match the profile', admin: true },
      { id: '6d', t: 'Map pin is on the facility site', auto: 'When the facility adds its map location' },
      { id: '6e', t: 'Called the official HFR phone. Person confirmed', admin: true },
      { id: '6f', t: 'Signed contract confirmed on file', auto: 'When an admin confirms the contract' },
      { id: '6g', t: 'Admin approved (note date and who was called)', auto: 'When the facility is verified' },
      { id: '6h', t: 'Welcome message sent on WhatsApp' }] },
  { n: 'Activate', goal: 'First shift posted within 7 days of approval.',
    exit: 'Exit: the first shift is posted.',
    items: [
      { id: '7a', t: 'Next shift agreed (date, type, pay)', due: 2 },
      { id: '7b', t: 'Nudge sent, day 2', opt: true, due: 3 },
      { id: '7c', t: 'Called on day 5. Admin posts it if they are stuck', opt: true },
      { id: '7d', t: 'First shift posted', auto: 'When the facility posts a shift' },
      { id: '7e', t: 'Applicant selected by the facility', auto: 'When a CO is selected' },
      { id: '7f', t: 'Shift worked: CO ID checked and checked in', auto: 'When a CO checks in' }] },
  { n: 'Monitor', goal: 'Keep the facility posting.',
    exit: 'Exit: day-30 review done. Healthy means 2 or more shifts in 30 days.',
    items: [
      { id: '8a', t: 'Feedback call the day after the first shift' },
      { id: '8b', t: 'Day-30 review: shifts, fill rate, repeat posting' },
      { id: '8c', t: 'January: licence and HFR re-check', opt: true }] },
];

export const STEP = Object.fromEntries(STAGES.flatMap((s, i) => s.items.map((x) => [x.id, { ...x, stage: i }])));

export const LEAD_STATUS = { open: 'Active', cold: 'Cold', later: 'Not now', declined: 'Declined' };

export const FILE_KINDS = {
  registration_cert: 'Registration certificate',
  annual_licence:    'Annual licence',
  site_photo:        'Site photo',
  visit_report:      'Visit report',
  contract_scan:     'Contract scan',
};

/** A step is done if it was ticked by hand or the app knows it (auto). */
export const isDone = (lead, id) => !!(lead.steps?.[id] || lead.auto?.[id]);
export const doneAt = (lead, id) => lead.steps?.[id]?.at || (typeof lead.auto?.[id] === 'string' ? lead.auto[id] : null);

export function stageStat(lead, i) {
  const items = STAGES[i].items;
  const req = items.filter((x) => !x.opt);
  const done = req.filter((x) => isDone(lead, x.id)).length;
  const any = items.some((x) => isDone(lead, x.id));
  return { done, total: req.length, any, complete: done === req.length };
}

/** Furthest stage with any tick; moves on once that stage's required steps are all done. */
export function stageOf(lead) {
  let hi = -1;
  STAGES.forEach((_, i) => { if (stageStat(lead, i).any) hi = i; });
  if (hi < 0) return { idx: 0, finished: false };
  if (stageStat(lead, hi).complete) return hi === STAGES.length - 1 ? { idx: hi, finished: true } : { idx: hi + 1, finished: false };
  return { idx: hi, finished: false };
}

export function nextStep(lead) {
  const s = stageOf(lead);
  if (s.finished) return null;
  return STAGES[s.idx].items.find((x) => !x.opt && !isDone(lead, x.id)) || null;
}

/** Required steps still open in stages before the current one. */
export function behind(lead) {
  const s = stageOf(lead);
  let n = 0;
  for (let i = 0; i < s.idx; i++) STAGES[i].items.forEach((x) => { if (!x.opt && !isDone(lead, x.id)) n++; });
  return n;
}

export function todayEAT() {
  return new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
}
export function addDaysEAT(n) {
  return new Date(Date.now() + 3 * 3600e3 + n * 864e5).toISOString().slice(0, 10);
}

export function dueState(lead) {
  if (!lead.due_date) return '';
  const t = todayEAT();
  return lead.due_date < t ? 'over' : lead.due_date === t ? 'today' : 'later';
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function shortDate(s) {
  if (!s) return '';
  const [y, m, d] = String(s).slice(0, 10).split('-');
  return y ? `${parseInt(d, 10)} ${MON[parseInt(m, 10) - 1]}` : '';
}

/** Tanzanian number → digits with 255 prefix, for tel: and wa.me. */
export function intlDigits(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.startsWith('0')) d = `255${d.slice(1)}`;
  else if (d.length === 9) d = `255${d}`;
  return d.length >= 11 ? d : '';
}

export const SCRIPTS = [
  { h: 'First message, English', t: 'Hello [Name/Team], this is [Your name] from AfyaWork. We help private hospitals cover nights, weekends, leave and sick days with Clinical Officers whose MCT licences we check. You post the shift and set the pay, then approve one applicant. We have a founding offer for the first facilities. Could we have 10 minutes with your medical director or HR/admin this week? WhatsApp: +255 712 168 011' },
  { h: 'First message, Kiswahili', t: 'Habari [Jina/Timu], mimi ni [Jina lako] kutoka AfyaWork. Tunasaidia hospitali binafsi kupata Clinical Officers wa kujaza zamu za usiku, wikendi, likizo na wakati wa ugonjwa, na leseni zao za MCT huhakikiwa. Wewe unaweka zamu na malipo, kisha unachagua mwombaji mmoja. Tuna ofa maalum kwa vituo vya kwanza. Tunaweza kupata dakika 10 na mkurugenzi wa matibabu au HR/utawala wiki hii? WhatsApp: +255 712 168 011' },
  { h: 'Follow-up, English', t: 'Hello [Name], a quick follow-up on my message about covering shifts with licensed COs. Would 10 minutes this week suit you or your medical director?' },
  { h: 'Follow-up, Kiswahili', t: 'Habari [Jina], nafuatilia ujumbe wangu kuhusu kujaza zamu kwa COs wenye leseni. Je, dakika 10 wiki hii zinafaa kwako au kwa mkurugenzi wa matibabu?' },
  { h: 'Book the visit', t: 'Thank you for your time today. Our coordinator [Name] would like to visit [Facility] on [date/time] to meet you, see the facility licence and sign the agreement. Who should they ask for at the gate?' },
];

export const RULES = [
  'Do not promise terms that are not in the contract. No patient photos. No bulk messages to anyone who has not agreed to receive them. Never mention month-end invoicing.',
  'Escalate at once: unlicensed CO, patient safety incident, payment dispute, or a facility trying to take a CO off the platform.',
];
