import { useMemo, useState } from 'react';
import { STAGES, stageOf } from '../../lib/leadSteps';
import { useLeadBoard } from '../../hooks/useLeadBoard';
import { LeadCard } from '../../components/coordinator/LeadCard';

const byDue = (a, b) => {
  const da = a.due_date || '9999', db = b.due_date || '9999';
  if (da !== db) return da < db ? -1 : 1;
  return (b.updated_at || '') < (a.updated_at || '') ? -1 : 1;
};

export default function Pipeline() {
  const { leads } = useLeadBoard();
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const [showPaused, setShowPaused] = useState(false);

  const { active, paused, counts } = useMemo(() => {
    const s = q.trim().toLowerCase();
    const match = (l) => !s || l.name.toLowerCase().includes(s) || (l.hfr_code || '').toLowerCase().includes(s);
    const all = leads || [];
    const act = all.filter((l) => l.status === 'open');
    const c = Array(8).fill(0);
    act.forEach((l) => { c[stageOf(l).idx]++; });
    return {
      counts: { all: act.length, stages: c },
      active: act.filter(match).filter((l) => filter === 'all' || stageOf(l).idx === Number(filter)).sort(byDue),
      paused: all.filter((l) => l.status !== 'open').filter(match).sort(byDue),
    };
  }, [leads, filter, q]);

  const chip = (v, label, n) => (
    <button key={v} onClick={() => setFilter(v)}
      className={`shrink-0 h-[42px] px-3.5 rounded-full border-[1.5px] font-semibold text-[14.5px] flex items-center gap-1.5 ${filter === v ? 'bg-teal-700 border-teal-700 text-white' : 'bg-white border-gray-200 text-gray-900'}`}>
      {label}
      <i className={`not-italic text-[12.5px] min-w-[22px] h-[22px] rounded-full grid place-items-center ${filter === v ? 'bg-white/25' : 'bg-teal-50 text-teal-900'}`}>{n}</i>
    </button>
  );

  return (
    <>
      <div className="px-4 pt-3.5">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or HFR code" aria-label="Search leads"
          className="w-full h-12 rounded-[14px] border-[1.5px] border-gray-200 bg-white px-3.5 text-base" />
      </div>
      <div className="flex gap-2 overflow-x-auto px-4 pt-3 pb-1 [scrollbar-width:none]">
        {chip('all', 'All', counts.all)}
        {STAGES.map((s, i) => chip(String(i), `${i + 1} ${s.n}`, counts.stages[i]))}
      </div>
      <div className="h-2.5" />
      {leads === null ? (
        [0, 1, 2].map((i) => <div key={i} className="h-40 mx-4 mb-3 rounded-[18px] bg-gray-200/60 animate-pulse" />)
      ) : active.length === 0 ? (
        <div className="mx-6 my-8 text-center text-gray-500">
          <b className="block text-lg text-gray-900 mb-1">{counts.all ? 'Nothing here' : 'No leads yet'}</b>
          {counts.all ? 'Pick another stage, or clear the search.' : 'Tap Add lead to start your first one.'}
        </div>
      ) : active.map((l) => <LeadCard key={l.id} lead={l} />)}

      {paused.length > 0 && (
        <>
          <button onClick={() => setShowPaused((v) => !v)}
            className="mx-4 my-2 h-[42px] px-3.5 rounded-full border-[1.5px] border-gray-200 bg-white font-semibold text-[14.5px] flex items-center gap-1.5">
            {showPaused ? 'Hide' : 'Show'} cold, not now and declined
            <i className="not-italic text-[12.5px] min-w-[22px] h-[22px] rounded-full grid place-items-center bg-teal-50 text-teal-900">{paused.length}</i>
          </button>
          {showPaused && paused.map((l) => <LeadCard key={l.id} lead={l} />)}
        </>
      )}
    </>
  );
}
