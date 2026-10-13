import { useMemo, useState } from 'react';
import { useLeadBoard } from '../../hooks/useLeadBoard';
import { LeadCard } from '../../components/coordinator/LeadCard';
import { todayEAT, addDaysEAT } from '../../lib/leadSteps';
import { Segmented } from '../../components/coordinator/ui';

export default function Todo() {
  const { leads, me } = useLeadBoard();
  const [scope, setScope] = useState('mine');

  const groups = useMemo(() => {
    const t = todayEAT(), wk = addDaysEAT(7);
    const g = { over: [], today: [], week: [], none: [] };
    (leads || [])
      .filter((l) => scope === 'all' || l.owner_id === me?.id)
      .filter((l) => l.status !== 'declined' && (l.status === 'open' || l.due_date))
      .forEach((l) => {
        if (!l.due_date) g.none.push(l);
        else if (l.due_date < t) g.over.push(l);
        else if (l.due_date === t) g.today.push(l);
        else if (l.due_date <= wk) g.week.push(l);
      });
    Object.values(g).forEach((a) => a.sort((x, y) => (x.due_date || '').localeCompare(y.due_date || '')));
    return g;
  }, [leads, scope, me?.id]);

  const sec = (title, arr) => arr.length > 0 && (
    <section key={title}>
      <h2 className="font-extrabold text-base text-gray-500 mx-4 mt-5 mb-2">{title} ({arr.length})</h2>
      {arr.map((l) => <LeadCard key={l.id} lead={l} />)}
    </section>
  );
  const empty = !groups.over.length && !groups.today.length && !groups.week.length && !groups.none.length;

  return (
    <>
      <div className="px-4 pt-3.5">
        <Segmented options={[['mine', 'My leads'], ['all', 'All leads']]} value={scope} onChange={setScope} />
      </div>
      {leads === null ? <div className="h-40 m-4 rounded-[18px] bg-gray-200/60 animate-pulse" /> : (
        <>
          {sec('Overdue', groups.over)}
          {sec('Due today', groups.today)}
          {sec('Next 7 days', groups.week)}
          {sec('No follow-up date set', groups.none)}
          {empty && (
            <div className="mx-6 my-8 text-center text-gray-500">
              <b className="block text-lg text-gray-900 mb-1">All clear</b>
              No follow-ups due. Set a date on a lead to see it here.
            </div>
          )}
        </>
      )}
    </>
  );
}
