import { Link } from 'react-router-dom';
import { Clock, CheckCircle2 } from 'lucide-react';
import { STAGES, LEAD_STATUS, stageOf, stageStat, nextStep, behind, dueState, shortDate } from '../../lib/leadSteps';
import { ContactButtons } from './ui';

export function LeadCard({ lead }) {
  const s = stageOf(lead);
  const ni = nextStep(lead);
  const b = behind(lead);
  const ds = dueState(lead);
  return (
    <Link to={`/coordinator/leads/${lead.id}`}
      className="block bg-white border-[1.5px] border-gray-200 rounded-[18px] px-3.5 pt-3.5 pb-3 mx-4 mb-3 active:bg-gray-50">
      <div className="flex items-start gap-2.5">
        <div className="min-w-0 flex-1">
          <h3 className="text-[18px] font-extrabold text-gray-900 leading-tight tracking-tight">{lead.name}</h3>
          <p className="text-[13.5px] font-semibold text-gray-500 mt-0.5">
            {s.finished ? 'All steps done' : `Stage ${s.idx + 1} of 8: ${STAGES[s.idx].n}`}
            {lead.hfr_code ? ` · ${lead.hfr_code}` : ''}
          </p>
        </div>
        <ContactButtons phone={lead.official_phone} />
      </div>
      <div className="grid grid-cols-8 gap-[3px] my-2.5" aria-hidden="true">
        {STAGES.map((_, i) => {
          const st = stageStat(lead, i);
          return (
            <span key={i} className="h-[7px] rounded bg-gray-200 overflow-hidden block">
              <b className="block h-full bg-teal-600" style={{ width: `${Math.round((st.done / st.total) * 100)}%` }} />
            </span>
          );
        })}
      </div>
      {ni ? (
        <div className="flex gap-2 items-start bg-teal-50 rounded-xl px-3 py-2 text-[14.5px] font-semibold text-teal-900">
          <Clock className="w-[18px] h-[18px] shrink-0 mt-0.5" /> <span>{ni.t}</span>
        </div>
      ) : s.finished ? (
        <div className="flex gap-2 items-start bg-teal-50 rounded-xl px-3 py-2 text-[14.5px] font-semibold text-teal-900">
          <CheckCircle2 className="w-[18px] h-[18px] shrink-0 mt-0.5" /> <span>Fully onboarded. Keep monitoring.</span>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2 items-center mt-2.5">
        {lead.status !== 'open' && <Tag tone="pause">{LEAD_STATUS[lead.status]}</Tag>}
        {ds === 'over' && <Tag tone="over">Overdue {shortDate(lead.due_date)}</Tag>}
        {ds === 'today' && <Tag tone="due">Due today</Tag>}
        {ds === 'later' && <Tag>Follow up {shortDate(lead.due_date)}</Tag>}
        {b > 0 && <Tag tone="due">{b} earlier step{b > 1 ? 's' : ''} open</Tag>}
        {lead.facility?.verified && <Tag>Verified</Tag>}
        {lead.owner_name && <span className="text-xs text-gray-400 ml-auto">{lead.owner_name}</span>}
      </div>
    </Link>
  );
}

const TONES = {
  base:  'bg-teal-50 text-teal-900',
  over:  'bg-red-50 text-red-700',
  due:   'bg-amber-50 text-amber-900',
  pause: 'bg-gray-200 text-gray-600',
};
export function Tag({ tone = 'base', children }) {
  return <span className={`text-[12.5px] font-bold px-2.5 py-1 rounded-full ${TONES[tone]}`}>{children}</span>;
}
