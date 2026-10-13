import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Check, MapPin, Search, Upload, FileText, Trash2, ExternalLink, ShieldCheck, Link2Off } from 'lucide-react';
import { useLeadBoard } from '../../hooks/useLeadBoard';
import {
  STAGES, STEP, LEAD_STATUS, FILE_KINDS, stageOf, stageStat, isDone, doneAt, shortDate, addDaysEAT,
} from '../../lib/leadSteps';
import {
  getLeadBoard, updateLead, tickStep, untickStep, lookupLeadHfr, uploadLeadFile, leadFileUrl, deleteLeadFile,
  deleteLead, setLeadOwner, setLeadFacility, setContractSigned, getLeadEvents,
} from '../../lib/leadsApi';
import { isGoogleMapsUrl } from '../../lib/maps';
import { ContactButtons, BlurField, Segmented } from '../../components/coordinator/ui';

const nowIso = () => new Date().toISOString();

function Fold({ title, children, defaultOpen = false }) {
  return (
    <details open={defaultOpen} className="group mx-4 mb-3 bg-white border-[1.5px] border-gray-200 rounded-[18px] overflow-hidden">
      <summary className="list-none cursor-pointer min-h-[54px] px-4 py-3.5 font-extrabold text-[17px] flex items-center justify-between [&::-webkit-details-marker]:hidden">
        {title}<span className="text-2xl text-teal-700 group-open:hidden">+</span><span className="text-2xl text-teal-700 hidden group-open:inline">−</span>
      </summary>
      <div className="px-4 pb-4 grid gap-3 text-[15px]">{children}</div>
    </details>
  );
}

function mapHref(lead) {
  const m = lead.map_url || '';
  if (isGoogleMapsUrl(m)) return m;
  if (/^-?\d{1,2}\.\d+,\s*-?\d{1,3}\.\d+$/.test(m)) return `https://www.google.com/maps/search/?api=1&query=${m.replace(/\s/g, '')}`;
  return null;
}

const EVENT_LABELS = {
  created: 'Lead added', step_ticked: 'Ticked', step_unticked: 'Unticked', owner_changed: 'Owner changed',
  status_changed: 'Status changed', hfr_code_changed: 'HFR code changed', hfr_lookup: 'HFR lookup', linked: 'Linked to facility account',
  unlinked: 'Unlinked from facility', file_uploaded: 'File uploaded', file_deleted: 'File deleted',
  contract_confirmed: 'Contract confirmed', contract_withdrawn: 'Contract withdrawn', deleted: 'Lead deleted',
};

export default function LeadDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { leads, patchLead, reload, notify, me, isAdmin, staff, staffName } = useLeadBoard();
  const lead = (leads || []).find((l) => l.id === id);
  const [sel, setSel] = useState(null);
  const [files, setFiles] = useState(null);
  const [lookup, setLookup] = useState({ busy: false, result: null });
  const [upload, setUpload] = useState({ kind: 'annual_licence', busy: false });
  const [events, setEvents] = useState(null);
  const [contract, setContract] = useState({ file: '', note: '', busy: false });

  const loadFiles = useCallback(() => getLeadBoard(id).then(({ data }) => setFiles(data[0]?.files || [])), [id]);
  useEffect(() => {
    let alive = true;
    getLeadBoard(id).then(({ data }) => { if (alive) setFiles(data[0]?.files || []); });
    return () => { alive = false; };
  }, [id, lead?.file_count]);

  if (leads === null) return <div className="h-60 m-4 rounded-[18px] bg-gray-200/60 animate-pulse" />;
  if (!lead) {
    return (
      <div className="m-6 text-center text-gray-500">
        <b className="block text-lg text-gray-900 mb-1">Lead not found</b>
        It may have been deleted. <Link to="/coordinator" className="text-teal-700 underline">Back to the pipeline</Link>
      </div>
    );
  }

  const cur = stageOf(lead);
  const si = sel ?? cur.idx;
  const S = STAGES[si];
  const st = stageStat(lead, si);
  const map = mapHref(lead);

  async function save(patch) {
    patchLead(id, (l) => ({ ...l, ...patch }));
    const { error } = await updateLead(id, patch);
    if (error) { notify(error.message); reload(); }
  }

  async function toggle(item, on) {
    const due = on && item.due ? addDaysEAT(item.due) : null;
    patchLead(id, (l) => {
      const steps = { ...l.steps };
      if (on) steps[item.id] = { at: nowIso(), by: me?.id }; else delete steps[item.id];
      return { ...l, steps, ...(due ? { due_date: due } : {}) };
    });
    const { error } = on ? await tickStep(id, item.id) : await untickStep(id, item.id);
    if (error) { notify(`Not saved: ${error.message}`); reload(); return; }
    if (due) {
      await updateLead(id, { due_date: due });
      notify(`Next follow-up set for ${shortDate(due)}`);
    } else if (on) {
      const after = stageStat({ ...lead, steps: { ...lead.steps, [item.id]: { at: nowIso() } } }, si);
      if (after.complete) notify('Stage complete. Well done.');
    }
  }

  async function runLookup() {
    setLookup({ busy: true, result: null });
    const { data, error } = await lookupLeadHfr(id);
    setLookup({ busy: false, result: error ? { status: 'error', message: error.message } : data });
    reload();
  }

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUpload((u) => ({ ...u, busy: true }));
    const { error } = await uploadLeadFile(id, upload.kind, file);
    setUpload((u) => ({ ...u, busy: false }));
    if (error) { notify(error.message); return; }
    notify(`${FILE_KINDS[upload.kind]} uploaded.`);
    loadFiles(); reload();
  }

  async function openFile(f) {
    const { url, error } = await leadFileUrl(f.storage_path);
    if (error || !url) { notify('Could not open the file.'); return; }
    window.open(url, '_blank', 'noopener');
  }

  async function removeFile(f) {
    if (!window.confirm(`Delete ${f.file_name || 'this file'}?`)) return;
    const { error } = await deleteLeadFile(f);
    if (error) { notify(error.message); return; }
    loadFiles(); reload();
  }

  async function confirmContract(signed) {
    setContract((c) => ({ ...c, busy: true }));
    const { error } = await setContractSigned(lead.facility_profile_id, signed, signed ? contract.file || null : null, contract.note || null);
    setContract((c) => ({ ...c, busy: false }));
    if (error) { notify(error.message); return; }
    notify(signed ? 'Contract confirmed. The facility can now be approved.' : 'Contract confirmation withdrawn.');
    reload();
  }

  async function removeLead() {
    if (!window.confirm(`Delete ${lead.name} for everyone? This cannot be undone.`)) return;
    const { error } = await deleteLead(id);
    if (error) { notify(error.message); return; }
    await reload();
    navigate('/coordinator', { replace: true });
  }

  const contractScans = (files || []).filter((f) => f.kind === 'contract_scan');

  return (
    <>
      <header className="bg-[#07423a] text-white px-[18px] pt-3.5 pb-[18px] sticky top-0 z-20">
        <div className="flex items-center gap-2.5">
          <button onClick={() => navigate(-1)} aria-label="Back" className="w-11 h-11 rounded-xl bg-white/15 grid place-items-center shrink-0"><ChevronLeft className="w-6 h-6" /></button>
          <div className="min-w-0">
            <h2 className="font-extrabold text-xl leading-tight break-words">{lead.name}</h2>
            <p className="text-[13px] opacity-80">
              {lead.hfr_code ? `HFR ${lead.hfr_code}` : 'No HFR code yet'}{lead.status !== 'open' ? ` · ${LEAD_STATUS[lead.status]}` : ''}
              {lead.owner_name ? ` · ${lead.owner_name}` : ' · Unassigned'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          <ContactButtons phone={lead.official_phone} labels />
          {map && (
            <a href={map} target="_blank" rel="noreferrer" className="h-11 px-3 rounded-xl bg-white/15 inline-flex items-center gap-1.5 font-bold text-sm">
              <MapPin className="w-4 h-4" />Map
            </a>
          )}
        </div>
      </header>

      {/* Stage rail */}
      <div className="flex overflow-x-auto px-4 pt-4 pb-2 [scrollbar-width:none]">
        {STAGES.map((s, i) => {
          const x = stageStat(lead, i);
          const isCur = i === cur.idx && !cur.finished;
          return (
            <button key={s.n} onClick={() => setSel(i)} aria-label={`Stage ${i + 1} ${s.n}`}
              ref={i === si ? (el) => el?.scrollIntoView({ block: 'nearest', inline: 'center' }) : undefined}
              className="relative shrink-0 w-[68px] flex flex-col items-center gap-1.5">
              {i > 0 && <span className={`absolute top-[19px] -left-1/2 w-full h-1 ${x.complete || isCur ? 'bg-teal-600' : 'bg-gray-200'}`} />}
              <span className={`relative z-[1] w-10 h-10 rounded-full grid place-items-center font-extrabold border-[3px] transition-transform
                ${x.complete ? 'bg-teal-600 border-teal-600 text-white' : x.any ? 'bg-white border-teal-600 text-teal-700' : 'bg-white border-gray-200 text-gray-500'}
                ${isCur ? '!border-amber-400 shadow-[0_0_0_4px_#fdf0d6]' : ''} ${i === si ? 'scale-110' : ''}`}>
                {x.complete ? <Check className="w-5 h-5" strokeWidth={3} /> : i + 1}
              </span>
              <em className={`not-italic text-xs font-bold ${i === si ? 'text-gray-900' : 'text-gray-500'}`}>{s.n}</em>
            </button>
          );
        })}
      </div>

      {/* Stage panel */}
      <section className="mx-4 mt-1.5 mb-3.5 bg-white border-[1.5px] border-gray-200 rounded-[20px] overflow-hidden">
        <div className="px-4 pt-4 pb-3">
          <h3 className="font-extrabold text-[22px] tracking-tight">{si + 1}. {S.n}</h3>
          <p className="text-gray-500 text-[15px] mt-1">{S.goal}</p>
          <div className="flex items-center gap-2.5 mt-3 text-[13.5px] font-bold text-gray-500">
            <div className="flex-1 h-2 rounded bg-gray-200 overflow-hidden"><b className="block h-full bg-teal-600 transition-all" style={{ width: `${Math.round((st.done / st.total) * 100)}%` }} /></div>
            {st.done} of {st.total}
          </div>
        </div>
        {S.items.map((x) => {
          const done = isDone(lead, x.id);
          const auto = !!x.auto;
          const locked = auto || (x.admin && !isAdmin);
          const at = doneAt(lead, x.id);
          const by = lead.steps?.[x.id]?.by;
          return (
            <label key={x.id} className={`relative flex items-center gap-3.5 min-h-[62px] px-4 py-2.5 border-t border-gray-200 ${locked ? '' : 'cursor-pointer'}`}>
              <input type="checkbox" className="absolute inset-0 opacity-0 w-full h-full m-0 cursor-pointer disabled:cursor-default peer"
                checked={done} disabled={locked} onChange={(e) => toggle(x, e.target.checked)} />
              <span className={`w-8 h-8 rounded-[10px] border-[2.5px] shrink-0 grid place-items-center peer-focus-visible:ring-2 peer-focus-visible:ring-amber-400
                ${done ? (auto ? 'bg-teal-100 border-teal-300 text-teal-800' : 'bg-teal-700 border-teal-700 text-white') : 'bg-white border-gray-300 text-transparent'}`}>
                <Check className="w-5 h-5" strokeWidth={3.2} />
              </span>
              <span className="flex-1 text-[16.5px] font-semibold leading-snug">
                <span className={done ? 'text-gray-500 line-through decoration-[1.5px]' : ''}>{x.t}</span>
                {x.opt && <em className="block not-italic text-[12.5px] text-gray-500 font-semibold">Optional</em>}
                {x.hint && <em className="block not-italic text-[12.5px] text-gray-500 font-semibold no-underline">{x.hint}</em>}
                {auto && <em className="block not-italic text-[12.5px] text-teal-700 font-bold">Auto · {x.auto}</em>}
                {x.admin && <em className="block not-italic text-[12.5px] text-gray-500 font-bold">{isAdmin ? 'Admin check' : 'An admin ticks this'}</em>}
              </span>
              <span className="text-[12.5px] font-bold text-teal-700 text-right">
                {at ? shortDate(at) : ''}{by && staffName(by) ? <span className="block text-gray-400 font-semibold">{staffName(by).split(' ')[0]}</span> : null}
              </span>
            </label>
          );
        })}
        {S.stop && <div className="border-t border-gray-200 px-4 py-3 bg-red-50 text-[14.5px] font-semibold"><b className="text-red-700">Stop and escalate if:</b> {S.stop}</div>}

        {/* Stage fields */}
        {si === 0 && (
          <div className="border-t border-gray-200 px-4 pt-3 pb-4 grid gap-3">
            <BlurField label="HFR code" value={lead.hfr_code} onSave={(v) => save({ hfr_code: v })} placeholder="e.g. 125039-8" />
            <BlurField label="Official HFR phone / main contact number" value={lead.official_phone} type="tel" inputMode="tel"
              onSave={(v) => save({ official_phone: v })} placeholder="0712 345 678" />
            <button onClick={runLookup} disabled={!lead.hfr_code || lookup.busy}
              className="h-12 rounded-[14px] border-[1.5px] border-teal-700 text-teal-700 font-extrabold flex items-center justify-center gap-2 disabled:opacity-50">
              <Search className="w-4 h-4" /> {lookup.busy ? 'Checking HFR…' : 'Look up on HFR'}
            </button>
            {(lookup.result || lead.hfr_status) && (
              <p className={`text-sm font-semibold rounded-xl px-3 py-2 ${(lookup.result?.status || lead.hfr_status) === 'operating' ? 'bg-teal-50 text-teal-900' : 'bg-amber-50 text-amber-900'}`}>
                {lookup.result?.message || `${lead.hfr_name || 'Facility'}: ${lead.hfr_status?.replace('_', ' ')} (checked ${shortDate(lead.hfr_checked_at)})`}
                {lookup.result?.phone_filled && ' Official phone saved.'}
              </p>
            )}
          </div>
        )}
        {(si === 1 || si === 6 || si === 7) && (
          <div className="border-t border-gray-200 px-4 pt-3 pb-4">
            <BlurField label={si === 7 ? 'Next review date' : 'Next follow-up date'} type="date" value={lead.due_date} onSave={(v) => save({ due_date: v })} />
          </div>
        )}
        {si === 3 && (
          <div className="border-t border-gray-200 px-4 pt-3 pb-4 grid gap-3">
            <BlurField label="Licence expiry date" type="date" value={lead.licence_expiry} onSave={(v) => save({ licence_expiry: v })} />
            <div className="grid grid-cols-2 gap-3">
              <BlurField label="Pay per shift (TZS)" inputMode="numeric" value={lead.pay_per_shift_tzs}
                onSave={(v) => save({ pay_per_shift_tzs: v ? Number(v.replace(/\D/g, '')) : null })} placeholder="e.g. 60000" />
              <BlurField label="COs used per month" inputMode="numeric" value={lead.cos_per_month}
                onSave={(v) => save({ cos_per_month: v ? Number(v.replace(/\D/g, '')) : null })} />
            </div>
            <BlurField label="Google Maps link" type="url" value={lead.map_url} onSave={(v) => save({ map_url: v })}
              placeholder="Paste the link, or -6.8235, 39.2695" hint="Google Maps link or coordinates" />
          </div>
        )}
        {si === 4 && <div className="border-t border-gray-200 px-4 py-3 bg-amber-50 text-sm font-semibold">Use the lawyer-approved contract only. Upload the signed scan under Files as “Contract scan”.</div>}
        {si === 5 && (
          <div className="border-t border-gray-200 px-4 py-3 grid gap-2 text-sm">
            {lead.facility ? (
              <>
                <p className="font-bold text-gray-700">Facility account</p>
                <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-gray-600">
                  <li>HFR: <b>{lead.facility.hfr_status?.replace('_', ' ') || 'not checked'}</b></li>
                  <li>Map: <b>{lead.facility.map_set ? 'set' : 'missing'}</b></li>
                  <li>Contract: <b>{lead.facility.contract_signed ? 'confirmed' : 'not yet'}</b></li>
                  <li>Verified: <b>{lead.facility.verified ? 'yes' : 'no'}</b></li>
                </ul>
              </>
            ) : (
              <p className="text-gray-600">Not linked to a facility account yet. It links itself when the facility signs up with HFR code {lead.hfr_code || '(add the code first)'}.</p>
            )}
            {isAdmin && lead.facility && (
              <div className="mt-2 grid gap-2 border-t border-gray-100 pt-3">
                <p className="font-bold text-gray-700 flex items-center gap-1.5"><ShieldCheck className="w-4 h-4" /> Admin: contract</p>
                {lead.facility.contract_signed ? (
                  <button onClick={() => confirmContract(false)} disabled={contract.busy}
                    className="h-11 rounded-xl border-[1.5px] border-red-300 text-red-700 font-bold">Withdraw contract confirmation</button>
                ) : (
                  <>
                    <select value={contract.file} onChange={(e) => setContract((c) => ({ ...c, file: e.target.value }))}
                      className="h-11 rounded-xl border-[1.5px] border-gray-200 px-3">
                      <option value="">{contractScans.length ? 'Choose the contract scan…' : 'No scan uploaded — note the paper copy below'}</option>
                      {contractScans.map((f) => <option key={f.id} value={f.id}>{f.file_name || 'Contract scan'} · {shortDate(f.created_at)}</option>)}
                    </select>
                    {!contract.file && (
                      <input value={contract.note} onChange={(e) => setContract((c) => ({ ...c, note: e.target.value }))}
                        placeholder="Where is the signed paper copy?" className="h-11 rounded-xl border-[1.5px] border-gray-200 px-3" />
                    )}
                    <button onClick={() => confirmContract(true)} disabled={contract.busy || (!contract.file && !contract.note.trim())}
                      className="h-11 rounded-xl bg-teal-700 text-white font-bold disabled:opacity-50">Confirm contract signed</button>
                  </>
                )}
                <Link to="/admin/facilities" className="text-teal-700 text-sm font-semibold">Approve in Admin → Facilities →</Link>
              </div>
            )}
          </div>
        )}
        <div className="border-t border-gray-200 px-4 py-3 bg-teal-50 text-teal-900 text-[14.5px] font-semibold">{S.exit}</div>
      </section>

      {/* Files */}
      <Fold title={`Files${files ? ` (${files.length})` : ''}`}>
        {files === null ? <div className="h-12 bg-gray-100 rounded-xl animate-pulse" /> : files.length === 0 ? (
          <p className="text-gray-500 text-sm">No files yet. Upload the registration certificate, annual licence and the signed contract scan.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {files.map((f) => (
              <li key={f.id} className="py-2 flex items-center gap-2">
                <FileText className="w-5 h-5 text-gray-400 shrink-0" />
                <button onClick={() => openFile(f)} className="min-w-0 flex-1 text-left">
                  <span className="block text-sm font-semibold text-gray-900 truncate">{FILE_KINDS[f.kind]}</span>
                  <span className="block text-xs text-gray-500 truncate">{f.file_name} · {shortDate(f.created_at)}{f.uploaded_by ? ` · ${staffName(f.uploaded_by)}` : ''}</span>
                </button>
                <button onClick={() => openFile(f)} aria-label="Open" className="w-11 h-11 grid place-items-center text-teal-700"><ExternalLink className="w-4 h-4" /></button>
                {isAdmin && <button onClick={() => removeFile(f)} aria-label="Delete file" className="w-11 h-11 grid place-items-center text-red-600"><Trash2 className="w-4 h-4" /></button>}
              </li>
            ))}
          </ul>
        )}
        <div className="grid gap-2">
          <select value={upload.kind} onChange={(e) => setUpload((u) => ({ ...u, kind: e.target.value }))} className="h-12 rounded-xl border-[1.5px] border-gray-200 px-3">
            {Object.entries(FILE_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <label className={`h-12 rounded-[14px] bg-teal-700 text-white font-extrabold flex items-center justify-center gap-2 cursor-pointer ${upload.busy ? 'opacity-60 pointer-events-none' : ''}`}>
            <Upload className="w-4 h-4" /> {upload.busy ? 'Uploading…' : 'Take photo or choose file'}
            <input type="file" accept="image/jpeg,image/png,image/webp,image/heic,application/pdf" className="sr-only" onChange={onFile} />
          </label>
          <p className="text-xs text-gray-400">Photos or PDF, up to 10 MB. Never upload ID cards or patient information.</p>
        </div>
      </Fold>

      {/* Details */}
      <Fold title="Lead details">
        <BlurField label="Facility name" value={lead.name} onSave={(v) => (v ? save({ name: v }) : notify('Name cannot be empty.'))} />
        <div className="grid grid-cols-2 gap-3">
          <BlurField label="Contact name" value={lead.contact_name} onSave={(v) => save({ contact_name: v })} />
          <BlurField label="Contact role" value={lead.contact_role} onSave={(v) => save({ contact_role: v })} />
        </div>
        <div className="grid gap-1.5 text-[13.5px] font-bold text-gray-500">Language
          <Segmented options={[['en', 'English'], ['sw', 'Kiswahili']]} value={lead.language} onChange={(v) => save({ language: v })} />
        </div>
        <BlurField label="Notes" multiline value={lead.notes} onSave={(v) => save({ notes: v })}
          placeholder="Objections, who said what, anything the next person should know" />
        {isAdmin && (
          <label className="grid gap-1.5 text-[13.5px] font-bold text-gray-500">Owner
            <select value={lead.owner_id || ''} className="h-12 rounded-xl border-[1.5px] border-gray-200 px-3"
              onChange={async (e) => {
                const { error } = await setLeadOwner(id, e.target.value || null);
                if (error) notify(error.message); else { notify('Owner changed.'); reload(); }
              }}>
              <option value="">Unassigned</option>
              {staff.filter((s) => s.account_status === 'active' || s.id === lead.owner_id).map((s) => <option key={s.id} value={s.id}>{s.display_name} ({s.role})</option>)}
            </select>
          </label>
        )}
        {isAdmin && lead.facility_profile_id && (
          <button onClick={async () => { const { error } = await setLeadFacility(id, null); if (error) notify(error.message); else reload(); }}
            className="h-11 rounded-xl border-[1.5px] border-gray-200 text-gray-700 font-bold flex items-center justify-center gap-2">
            <Link2Off className="w-4 h-4" /> Unlink from the facility account
          </button>
        )}
      </Fold>

      {/* Status */}
      <Fold title="Lead status">
        <Segmented options={Object.entries(LEAD_STATUS)} value={lead.status} danger="declined"
          onChange={(v) => { save({ status: v }); notify(`Status: ${LEAD_STATUS[v]}`); }} />
        <p className="text-gray-500 text-sm">Cold: no reply after day 7, revisit in 30 days. Not now: they said later, set the revisit date in Stage 2 or 7. Declined: log the reason in Notes.</p>
        {isAdmin && <button onClick={removeLead} className="h-[52px] rounded-[14px] border-[1.5px] border-red-500 text-red-600 font-extrabold">Delete this lead</button>}
      </Fold>

      {isAdmin && (
        <details className="group mx-4 mb-3 bg-white border-[1.5px] border-gray-200 rounded-[18px] overflow-hidden"
          onToggle={(e) => { if (e.currentTarget.open && events === null) getLeadEvents(id).then(({ data }) => setEvents(data || [])); }}>
          <summary className="list-none cursor-pointer min-h-[54px] px-4 py-3.5 font-extrabold text-[17px] flex items-center justify-between [&::-webkit-details-marker]:hidden">
            History (admin)<span className="text-2xl text-teal-700">+</span>
          </summary>
          <ol className="px-4 pb-4 space-y-2 text-sm">
            {events === null ? <li className="text-gray-400">Loading…</li> : events.map((ev) => (
              <li key={ev.id}>
                <b>{EVENT_LABELS[ev.action] || ev.action}</b>
                {ev.detail?.step && <> · {ev.detail.step} {STEP[ev.detail.step]?.t}</>}
                {ev.detail?.to && ev.action === 'status_changed' && <> · {LEAD_STATUS[ev.detail.to]}</>}
                {ev.detail?.status && ev.action === 'hfr_lookup' && <> · {ev.detail.status}</>}
                {ev.detail?.kind && <> · {FILE_KINDS[ev.detail.kind]}</>}
                <span className="block text-xs text-gray-400">{new Date(ev.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · {staffName(ev.actor_id) || 'System'}</span>
              </li>
            ))}
          </ol>
        </details>
      )}
    </>
  );
}
