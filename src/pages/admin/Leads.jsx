import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, ExternalLink, AlertTriangle, Users, Timer } from 'lucide-react';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { useToast } from '../../components/common/Toast';
import { getLeadBoard } from '../../lib/leadsApi';
import {
  STAGES, LEAD_STATUS, stageOf, nextStep, doneAt, dueState, shortDate, todayEAT,
} from '../../lib/leadSteps';
import { downloadXlsx, exportFilename, toDate } from '../../lib/exportXlsx';

/** First moment any step of stage i was done (manual tick time, or auto timestamp). */
function stageStart(lead, i) {
  const ts = STAGES[i].items.map((x) => doneAt(lead, x.id)).filter(Boolean).map((t) => new Date(t).getTime()).filter(Number.isFinite);
  return ts.length ? Math.min(...ts) : null;
}

const median = (a) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const EXPORT_COLUMNS = [
  { header: 'Facility', value: (l) => l.name, width: 32 },
  { header: 'HFR code', value: (l) => l.hfr_code, width: 12 },
  { header: 'Status', value: (l) => LEAD_STATUS[l.status], width: 10 },
  { header: 'Stage', value: (l) => { const s = stageOf(l); return s.finished ? 'Done' : `${s.idx + 1}. ${STAGES[s.idx].n}`; }, width: 14 },
  { header: 'Next step', value: (l) => nextStep(l)?.t, width: 40 },
  { header: 'Owner', value: (l) => l.owner_name || 'Unassigned', width: 18 },
  { header: 'Follow-up date', value: (l) => toDate(l.due_date) },
  { header: 'Overdue', value: (l) => dueState(l) === 'over' },
  { header: 'Official phone', value: (l) => l.official_phone, width: 16 },
  { header: 'Contact name', value: (l) => l.contact_name, width: 18 },
  { header: 'Contact role', value: (l) => l.contact_role, width: 16 },
  { header: 'Language', value: (l) => (l.language === 'sw' ? 'Kiswahili' : 'English') },
  { header: 'HFR lookup', value: (l) => l.hfr_status?.replace('_', ' ') },
  { header: 'Facility account linked', value: (l) => !!l.facility },
  { header: 'Contract confirmed', value: (l) => !!l.facility?.contract_signed },
  { header: 'Verified', value: (l) => !!l.facility?.verified },
  { header: 'Shifts posted', value: (l) => l.facility?.shifts_posted ?? 0 },
  { header: 'Pay per shift (TZS)', value: (l) => l.pay_per_shift_tzs },
  { header: 'COs per month', value: (l) => l.cos_per_month },
  { header: 'Licence expiry', value: (l) => toDate(l.licence_expiry) },
  { header: 'Files', value: (l) => l.file_count },
  ...STAGES.map((s, i) => ({ header: `Stage ${i + 1} started`, value: (l) => { const t = stageStart(l, i); return t ? new Date(t) : null; } })),
  { header: 'Notes', value: (l) => l.notes, width: 50 },
  { header: 'Added', value: (l) => toDate(l.created_at) },
  { header: 'Last change', value: (l) => toDate(l.updated_at) },
];

export default function AdminLeads() {
  const { show, ToastComponent } = useToast();
  const [leads, setLeads] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    getLeadBoard().then(({ data, error: e }) => { if (!alive) return; if (e) setError(e.message); setLeads(data); });
    return () => { alive = false; };
  }, []);

  const r = useMemo(() => {
    const all = leads || [];
    const open = all.filter((l) => l.status === 'open');
    const byStage = STAGES.map(() => 0);
    let finished = 0;
    open.forEach((l) => { const s = stageOf(l); if (s.finished) finished++; else byStage[s.idx]++; });
    // reached = how many open leads have got at least as far as each stage (funnel)
    const reached = STAGES.map((_, i) => open.filter((l) => { const s = stageOf(l); return s.finished || s.idx >= i; }).length);
    const overdue = open.filter((l) => dueState(l) === 'over').sort((a, b) => a.due_date.localeCompare(b.due_date));
    const days = STAGES.map((_, i) => {
      if (i === STAGES.length - 1) return null;
      const spans = all.map((l) => {
        const a = i === 0 ? (stageStart(l, 0) ?? new Date(l.created_at).getTime()) : stageStart(l, i);
        const b = stageStart(l, i + 1);
        return a && b && b >= a ? (b - a) / 864e5 : null;
      }).filter((x) => x != null);
      return { median: median(spans), n: spans.length };
    });
    const owners = {};
    open.forEach((l) => {
      const k = l.owner_name || 'Unassigned';
      owners[k] ??= { open: 0, overdue: 0 };
      owners[k].open++;
      if (dueState(l) === 'over') owners[k].overdue++;
    });
    const paused = Object.fromEntries(['cold', 'later', 'declined'].map((s) => [s, all.filter((l) => l.status === s).length]));
    return { all, open, byStage, reached, finished, overdue, days, owners, paused };
  }, [leads]);

  function exportXlsx() {
    downloadXlsx(exportFilename('facility-leads'), 'Leads', EXPORT_COLUMNS, r.all);
    show(`Exported ${r.all.length} leads to Excel`, 'success');
  }

  const max = Math.max(1, ...r.reached);

  return (
    <PageWrapper
      title="Facility leads"
      subtitle={`Coordinator pipeline · ${r.open.length} active · today ${shortDate(todayEAT())}`}
      action={
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={exportXlsx} disabled={!leads?.length}><Download className="w-4 h-4" /> Export</Button>
          <Button size="sm" to="/coordinator"><ExternalLink className="w-4 h-4" /> Open pipeline</Button>
        </div>
      }
    >
      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
      {leads === null ? (
        <div className="grid md:grid-cols-2 gap-4">{[0, 1, 2, 3].map((i) => <div key={i} className="h-56 bg-gray-100 rounded-2xl animate-pulse" />)}</div>
      ) : (
        <div className="grid lg:grid-cols-2 gap-5">
          <Card className="p-5">
            <h2 className="font-semibold text-gray-900 mb-1">Funnel</h2>
            <p className="text-xs text-gray-500 mb-4">Active leads that have reached each stage. The number on the right is how many are in that stage now.</p>
            <ol className="space-y-2.5">
              {STAGES.map((s, i) => (
                <li key={s.n} className="grid grid-cols-[110px,1fr,auto] items-center gap-3 text-sm">
                  <span className="text-gray-700 font-medium">{i + 1}. {s.n}</span>
                  <span className="h-6 bg-gray-100 rounded-md overflow-hidden">
                    <span className="block h-full bg-teal-600 rounded-md" style={{ width: `${(r.reached[i] / max) * 100}%` }} />
                  </span>
                  <span className="tabular-nums text-gray-900 w-16 text-right"><b>{r.reached[i]}</b> <span className="text-gray-400">({r.byStage[i]})</span></span>
                </li>
              ))}
            </ol>
            <p className="text-xs text-gray-500 mt-4">
              Fully onboarded: <b>{r.finished}</b> · Cold: <b>{r.paused.cold}</b> · Not now: <b>{r.paused.later}</b> · Declined: <b>{r.paused.declined}</b>
            </p>
          </Card>

          <Card className="p-5">
            <h2 className="font-semibold text-gray-900 mb-1 flex items-center gap-2"><Timer className="w-4 h-4 text-gray-400" /> Time per stage</h2>
            <p className="text-xs text-gray-500 mb-4">Median days from the first tick in a stage to the first tick in the next, over every lead that got that far.</p>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-gray-50">
                {STAGES.slice(0, -1).map((s, i) => (
                  <tr key={s.n}>
                    <td className="py-1.5 text-gray-700">{i + 1}. {s.n} → {STAGES[i + 1].n}</td>
                    <td className="py-1.5 text-right tabular-nums text-gray-900">
                      {r.days[i].median == null ? <span className="text-gray-300">—</span> : `${r.days[i].median.toFixed(1)} d`}
                    </td>
                    <td className="py-1.5 text-right text-xs text-gray-400 w-16">{r.days[i].n} lead{r.days[i].n === 1 ? '' : 's'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card className="p-5">
            <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-red-500" /> Overdue follow-ups ({r.overdue.length})</h2>
            {r.overdue.length === 0 ? <p className="text-sm text-gray-400">Nothing overdue.</p> : (
              <ul className="divide-y divide-gray-50 text-sm">
                {r.overdue.map((l) => (
                  <li key={l.id} className="py-2 flex items-center gap-3">
                    <Link to={`/coordinator/leads/${l.id}`} className="font-medium text-gray-900 hover:text-teal-700 flex-1 min-w-0 truncate">{l.name}</Link>
                    <span className="text-xs text-gray-500 hidden sm:inline">{l.owner_name || 'Unassigned'}</span>
                    <span className="text-xs font-semibold text-red-600 whitespace-nowrap">since {shortDate(l.due_date)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2"><Users className="w-4 h-4 text-gray-400" /> By owner</h2>
            <table className="w-full text-sm">
              <thead><tr className="text-xs text-gray-400 uppercase"><th className="text-left font-semibold pb-1">Owner</th><th className="text-right font-semibold pb-1">Active</th><th className="text-right font-semibold pb-1">Overdue</th></tr></thead>
              <tbody className="divide-y divide-gray-50">
                {Object.entries(r.owners).sort((a, b) => b[1].open - a[1].open).map(([k, v]) => (
                  <tr key={k}><td className="py-1.5">{k}</td><td className="py-1.5 text-right tabular-nums">{v.open}</td>
                    <td className={`py-1.5 text-right tabular-nums ${v.overdue ? 'text-red-600 font-semibold' : 'text-gray-400'}`}>{v.overdue}</td></tr>
                ))}
              </tbody>
            </table>
            <Link to="/admin/coordinators" className="text-xs text-teal-700 font-semibold mt-3 inline-block">Manage coordinators →</Link>
          </Card>
        </div>
      )}
      {ToastComponent}
    </PageWrapper>
  );
}
