import { useEffect, useMemo, useState } from 'react';
import { MessageSquare, Smile, CalendarCheck, TrendingUp, Search, Download, Star } from 'lucide-react';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { Card, StatCard } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { getAdminFeedback } from '../../lib/api';
import { downloadXlsx, exportFilename, toDate } from '../../lib/exportXlsx';

// Options match the survey in src/pages/Feedback.jsx
const ROLES = ['Healthcare Worker', 'Facility Manager', 'Both'];
const ISSUES = ['Slow loading', 'Crashes or errors', 'Confusing layout', 'Login problems', 'No issues'];
const CHECKIN = ['Yes, very clear', 'Somewhat', 'No, it was confusing'];
const NOTIF = ['Yes', 'Somewhat', 'No'];
const CHANNELS = ['In-app notifications', 'SMS', 'Email', 'WhatsApp'];

const list = (v) => (Array.isArray(v) ? v.join(', ') : v || '');
const senderName = (f) => f.name || f.users?.display_name || 'Anonymous';

const EXPORT_COLUMNS = [
  { header: 'Submitted',              value: (f) => toDate(f.created_at), width: 14 },
  { header: 'Name',                   value: (f) => senderName(f), width: 24 },
  { header: 'Account email',          value: (f) => f.users?.email, width: 30 },
  { header: 'Account phone',          value: (f) => f.users?.phone, width: 18 },
  { header: 'Role',                   value: (f) => f.role, width: 20 },
  { header: 'Usability (1-5)',        value: (f) => f.usability_rating, width: 14 },
  { header: 'Issues',                 value: (f) => list(f.issues), width: 34 },
  { header: 'Usability comment',      value: (f) => f.usability_comment, width: 40 },
  { header: 'Shift process (1-5)',    value: (f) => f.shift_rating, width: 18 },
  { header: 'Check-in clarity',       value: (f) => f.checkin_clarity, width: 20 },
  { header: 'Shift comment',          value: (f) => f.shift_comment, width: 40 },
  { header: 'Notifications clear',    value: (f) => f.notif_clarity, width: 18 },
  { header: 'Preferred updates',      value: (f) => list(f.notif_pref), width: 30 },
  { header: 'NPS (0-10)',             value: (f) => f.nps, width: 11 },
  { header: 'Top improvement',        value: (f) => f.top_improvement, width: 50 },
  { header: 'Other comments',         value: (f) => f.other_comments, width: 50 },
];

function avg(rows, key) {
  const vals = rows.map((r) => r[key]).filter((v) => typeof v === 'number');
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

/** NPS = % promoters (9–10) − % detractors (0–6). */
function npsScore(rows) {
  const vals = rows.map((r) => r.nps).filter((v) => typeof v === 'number');
  if (!vals.length) return null;
  const promoters = vals.filter((v) => v >= 9).length;
  const detractors = vals.filter((v) => v <= 6).length;
  return Math.round(((promoters - detractors) / vals.length) * 100);
}

function tally(rows, key, options) {
  const counts = Object.fromEntries(options.map((o) => [o, 0]));
  rows.forEach((r) => {
    const v = r[key];
    (Array.isArray(v) ? v : v ? [v] : []).forEach((x) => { counts[x] = (counts[x] || 0) + 1; });
  });
  return Object.entries(counts);
}

function Breakdown({ title, entries, total }) {
  return (
    <Card className="p-5">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">{title}</h3>
      <div className="space-y-3">
        {entries.map(([label, n]) => {
          const pct = total ? Math.round((n / total) * 100) : 0;
          return (
            <div key={label}>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-700">{label}</span>
                <span className="text-gray-500 tabular-nums">{n} <span className="text-gray-400">({pct}%)</span></span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-teal-500 rounded-full" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function Stars({ value }) {
  if (!value) return <span className="text-gray-300">—</span>;
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={`w-3.5 h-3.5 ${n <= value ? 'fill-amber-400 text-amber-400' : 'text-gray-200'}`} />
      ))}
    </span>
  );
}

function npsColor(v) {
  if (v >= 9) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (v >= 7) return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-red-50 text-red-700 border-red-200';
}

function Answer({ label, children }) {
  if (!children) return null;
  return (
    <div>
      <p className="text-xs font-medium text-gray-400 mb-0.5">{label}</p>
      <p className="text-sm text-gray-700 whitespace-pre-wrap">{children}</p>
    </div>
  );
}

function FeedbackCard({ f }) {
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <p className="font-semibold text-gray-900">{senderName(f)}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {f.role}
            {f.users?.email && <> · {f.users.email}</>}
            {' · '}
            {new Date(f.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
        {typeof f.nps === 'number' && (
          <span className={`px-2.5 py-1 rounded-full border text-xs font-semibold ${npsColor(f.nps)}`} title="Likely to recommend (0–10)">
            NPS {f.nps}
          </span>
        )}
      </div>

      <div className="rounded-xl bg-teal-50 border border-teal-100 px-4 py-3 mb-4">
        <p className="text-xs font-semibold text-teal-700 mb-0.5">Top improvement</p>
        <p className="text-sm text-gray-800 whitespace-pre-wrap">{f.top_improvement}</p>
      </div>

      <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3">
        <div className="flex items-center justify-between sm:justify-start sm:gap-3">
          <span className="text-xs font-medium text-gray-400">Usability</span><Stars value={f.usability_rating} />
        </div>
        <div className="flex items-center justify-between sm:justify-start sm:gap-3">
          <span className="text-xs font-medium text-gray-400">Shift process</span><Stars value={f.shift_rating} />
        </div>
        <Answer label="Issues">{list(f.issues)}</Answer>
        <Answer label="Check-in / check-out clear?">{f.checkin_clarity}</Answer>
        <Answer label="Notifications clear?">{f.notif_clarity}</Answer>
        <Answer label="Preferred updates">{list(f.notif_pref)}</Answer>
      </div>

      {(f.usability_comment || f.shift_comment || f.other_comments) && (
        <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">
          <Answer label="Usability comment">{f.usability_comment}</Answer>
          <Answer label="Shift process comment">{f.shift_comment}</Answer>
          <Answer label="Other comments">{f.other_comments}</Answer>
        </div>
      )}
    </Card>
  );
}

export default function AdminFeedback() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [role, setRole] = useState('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('newest');

  useEffect(() => {
    getAdminFeedback().then(({ data, error }) => {
      setRows(data);
      setLoadError(error?.message || '');
      setLoading(false);
    });
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const out = rows.filter((f) => {
      if (role !== 'all' && f.role !== role) return false;
      if (!q) return true;
      return [senderName(f), f.users?.email, f.top_improvement, f.usability_comment, f.shift_comment, f.other_comments, list(f.issues)]
        .some((v) => v && String(v).toLowerCase().includes(q));
    });
    const by = {
      newest: (a, b) => new Date(b.created_at) - new Date(a.created_at),
      oldest: (a, b) => new Date(a.created_at) - new Date(b.created_at),
      nps_low: (a, b) => (a.nps ?? 99) - (b.nps ?? 99),
      nps_high: (a, b) => (b.nps ?? -1) - (a.nps ?? -1),
    };
    return [...out].sort(by[sort]);
  }, [rows, role, search, sort]);

  const roleCounts = useMemo(() => {
    const c = { all: rows.length };
    ROLES.forEach((r) => { c[r] = rows.filter((f) => f.role === r).length; });
    return c;
  }, [rows]);

  const fmt = (v) => (v === null ? '—' : v.toFixed(1));
  const nps = npsScore(filtered);

  function handleExport() {
    downloadXlsx(exportFilename('beta-feedback'), 'Beta Feedback', EXPORT_COLUMNS, filtered);
  }

  return (
    <PageWrapper
      title="Beta Feedback"
      subtitle="Responses to the in-app beta survey"
      action={
        <Button size="sm" variant="secondary" onClick={handleExport} disabled={loading || filtered.length === 0} title="Download the responses below as an Excel spreadsheet">
          <Download className="w-4 h-4" /> Export
        </Button>
      }
    >
      {loadError && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Could not load feedback: {loadError}
        </div>
      )}

      {/* Summary — reflects the current role filter and search */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Responses" value={loading ? '…' : filtered.length} icon={MessageSquare} color="teal" />
        <StatCard label="Avg. usability (of 5)" value={loading ? '…' : fmt(avg(filtered, 'usability_rating'))} icon={Smile} color="blue" />
        <StatCard label="Avg. shift process (of 5)" value={loading ? '…' : fmt(avg(filtered, 'shift_rating'))} icon={CalendarCheck} color="purple" />
        <StatCard label="NPS (−100 to 100)" value={loading ? '…' : nps === null ? '—' : nps > 0 ? `+${nps}` : nps} icon={TrendingUp} color={nps !== null && nps < 0 ? 'red' : 'yellow'} />
      </div>

      {!loading && filtered.length > 0 && (
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Breakdown title="Issues reported" entries={tally(filtered, 'issues', ISSUES)} total={filtered.length} />
          <Breakdown title="Check-in / out clear?" entries={tally(filtered, 'checkin_clarity', CHECKIN)} total={filtered.length} />
          <Breakdown title="Notifications clear?" entries={tally(filtered, 'notif_clarity', NOTIF)} total={filtered.length} />
          <Breakdown title="Preferred updates" entries={tally(filtered, 'notif_pref', CHANNELS)} total={filtered.length} />
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search names, emails, comments…"
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white shadow-sm"
          />
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="md:ml-auto py-2.5 pl-3 pr-8 rounded-xl border border-gray-200 text-sm bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          aria-label="Sort feedback"
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="nps_low">Lowest NPS first</option>
          <option value="nps_high">Highest NPS first</option>
        </select>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {['all', ...ROLES].map((r) => (
          <button
            key={r}
            onClick={() => setRole(r)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
              role === r ? 'bg-teal-600 text-white border-teal-600' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
            }`}
          >
            {r === 'all' ? 'All' : r} <span className={role === r ? 'text-teal-100' : 'text-gray-400'}>{roleCounts[r] || 0}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-48 bg-gray-100 rounded-2xl animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-10 text-center">
          <MessageSquare className="w-8 h-8 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">
            {rows.length === 0 ? 'No feedback has been submitted yet.' : 'No responses match your filters.'}
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {filtered.map((f) => <FeedbackCard key={f.id} f={f} />)}
        </div>
      )}
    </PageWrapper>
  );
}
