import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { useLeadBoard } from '../../hooks/useLeadBoard';
import { createLead } from '../../lib/leadsApi';
import { Segmented } from '../../components/coordinator/ui';

export default function AddLead() {
  const { reload, notify, me, isAdmin, staff } = useLeadBoard();
  const navigate = useNavigate();
  const [f, setF] = useState({ name: '', hfr_code: '', official_phone: '', language: 'en', owner_id: me?.id || '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const cls = 'w-full h-12 rounded-xl border-[1.5px] border-gray-200 bg-white px-3 text-base';

  async function submit(e) {
    e.preventDefault();
    if (!f.name.trim()) { setError({ message: 'Enter the facility name first.' }); return; }
    setBusy(true); setError(null);
    const { data, error: err } = await createLead({ ...f, owner_id: isAdmin ? f.owner_id || null : undefined });
    setBusy(false);
    if (err) { setError(err); return; }
    await reload();
    notify('Lead added.');
    navigate(`/coordinator/leads/${data.id}`, { replace: true });
  }

  return (
    <>
      <header className="bg-[#07423a] text-white px-[18px] pt-3.5 pb-[18px] sticky top-0 z-20 flex items-center gap-2.5">
        <Link to="/coordinator" aria-label="Back" className="w-11 h-11 rounded-xl bg-white/15 grid place-items-center"><ChevronLeft className="w-6 h-6" /></Link>
        <div><h2 className="font-extrabold text-xl leading-tight">Add a lead</h2><p className="text-[13px] opacity-80">Starts at Stage 1: Identify</p></div>
      </header>
      <form onSubmit={submit} className="p-4 grid gap-3">
        <label className="grid gap-1.5 text-[13.5px] font-bold text-gray-500">Facility name
          <input className={cls} value={f.name} onChange={set('name')} placeholder="e.g. Aga Khan Hospital, Dar es Salaam" autoComplete="off" autoFocus />
        </label>
        <label className="grid gap-1.5 text-[13.5px] font-bold text-gray-500">HFR code (optional now)
          <input className={cls} value={f.hfr_code} onChange={set('hfr_code')} placeholder="e.g. 125039-8" autoComplete="off" />
        </label>
        <label className="grid gap-1.5 text-[13.5px] font-bold text-gray-500">Official phone
          <input className={cls} type="tel" inputMode="tel" value={f.official_phone} onChange={set('official_phone')} placeholder="0712 345 678" />
        </label>
        <div className="grid gap-1.5 text-[13.5px] font-bold text-gray-500">Language
          <Segmented options={[['en', 'English'], ['sw', 'Kiswahili']]} value={f.language} onChange={(v) => setF((x) => ({ ...x, language: v }))} />
        </div>
        {isAdmin ? (
          <label className="grid gap-1.5 text-[13.5px] font-bold text-gray-500">Owner
            <select className={cls} value={f.owner_id} onChange={set('owner_id')}>
              {staff.filter((s) => s.account_status === 'active').map((s) => <option key={s.id} value={s.id}>{s.display_name} ({s.role})</option>)}
              <option value="">Unassigned</option>
            </select>
          </label>
        ) : <p className="text-sm text-gray-500">You will own this lead.</p>}
        {error && (
          <p className="p-3 rounded-xl bg-red-50 text-red-700 text-sm font-semibold">
            {error.message}{' '}
            {error.leadId && <Link to={`/coordinator/leads/${error.leadId}`} className="underline">Open it</Link>}
          </p>
        )}
        <button disabled={busy} className="h-[52px] rounded-[14px] bg-teal-700 text-white font-extrabold text-[16.5px] disabled:opacity-60">
          {busy ? 'Adding…' : 'Add and open'}
        </button>
      </form>
    </>
  );
}
