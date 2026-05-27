import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  CalendarDays, Search, Users, AlertTriangle, CheckCircle2,
  X, ShieldCheck, XCircle,
} from 'lucide-react';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { Card } from '../../components/common/Card';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { useToast } from '../../components/common/Toast';
import { getAdminShifts, resolveDispute } from '../../lib/api';

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatPay(amount) {
  return `TZS ${Number(amount || 0).toLocaleString()}`;
}

const STATUS_LABELS = {
  all:               'All',
  open:              'Open',
  filled:            'Offer Pending',
  confirmed:         'Confirmed',
  in_progress:       'In Progress',
  completed:         'Completed',
  disputed:          'Disputed',           // combined filter
  disputed_checkin:  'Check-in Dispute',
  disputed_checkout: 'Check-out Dispute',
  no_show:           'No Show',
  cancelled:         'Cancelled',
};
const statusFilters = Object.keys(STATUS_LABELS);

const DISPUTED_STATUSES = ['disputed_checkin', 'disputed_checkout'];

export default function AdminShifts() {
  const { search: queryString } = useLocation();
  const { show, ToastComponent } = useToast();

  const [shifts, setShifts]           = useState([]);
  const [loading, setLoading]         = useState(true);
  const [searchQ, setSearchQ]         = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Dispute-resolve modal state
  const [resolveModal, setResolveModal]   = useState(null); // shift object
  const [resolution, setResolution]       = useState('approve'); // 'approve' | 'reject'
  const [resolveNote, setResolveNote]     = useState('');
  const [resolving, setResolving]         = useState(false);

  // Read ?status= from URL on first mount
  useEffect(() => {
    const params = new URLSearchParams(queryString);
    const s = params.get('status');
    if (s && statusFilters.includes(s)) setStatusFilter(s);
  }, [queryString]);

  const loadShifts = () => {
    setLoading(true);
    getAdminShifts().then(({ data }) => { setShifts(data || []); setLoading(false); });
  };

  useEffect(() => { loadShifts(); }, []);

  const filtered = shifts.filter((s) => {
    const q = searchQ.toLowerCase();
    const matchesSearch =
      s.facility_profiles?.facility_name?.toLowerCase().includes(q) ||
      s.shift_type?.toLowerCase().includes(q) ||
      s.co_user?.display_name?.toLowerCase().includes(q);
    const matchesStatus =
      statusFilter === 'all'
        ? true
        : statusFilter === 'disputed'
          ? DISPUTED_STATUSES.includes(s.status)
          : s.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const disputedCount = shifts.filter((s) => DISPUTED_STATUSES.includes(s.status)).length;

  async function handleResolve() {
    if (!resolveModal) return;
    setResolving(true);
    const { error } = await resolveDispute(resolveModal.id, resolution, resolveNote || null);
    setResolving(false);
    if (error) { show(error.message || 'Failed to resolve dispute.', 'error'); return; }
    show('Dispute resolved successfully.', 'success');
    setResolveModal(null);
    setResolution('approve');
    setResolveNote('');
    loadShifts();
  }

  return (
    <PageWrapper
      title="All Shifts"
      subtitle={`${shifts.length} shifts on the platform`}
    >
      {ToastComponent}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            placeholder="Search shifts, facilities, COs…"
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white shadow-sm"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {statusFilters.map((f) => {
            const isDisputedFilter = f === 'disputed';
            const active = statusFilter === f;
            return (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className={`relative px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                  active
                    ? isDisputedFilter
                      ? 'bg-amber-500 text-white shadow-sm'
                      : 'bg-teal-600 text-white shadow-sm'
                    : isDisputedFilter && disputedCount > 0
                      ? 'bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100'
                      : 'bg-white border border-gray-200 text-gray-500 hover:text-gray-800'
                }`}
              >
                {STATUS_LABELS[f] ?? f}
                {isDisputedFilter && disputedCount > 0 && (
                  <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${active ? 'bg-amber-400 text-white' : 'bg-amber-500 text-white'}`}>
                    {disputedCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-16 bg-gray-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16 text-center">
          <CalendarDays className="w-10 h-10 text-gray-300 mb-3" />
          <p className="text-gray-500 text-sm">
            {searchQ || statusFilter !== 'all' ? 'No shifts match your filters.' : 'No shifts yet.'}
          </p>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-gray-100 shadow-sm bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs text-gray-400 uppercase tracking-wider">
                <th className="text-left px-5 py-4 font-semibold">Shift</th>
                <th className="text-left px-5 py-4 font-semibold">Facility</th>
                <th className="text-left px-5 py-4 font-semibold hidden md:table-cell">CO</th>
                <th className="text-left px-5 py-4 font-semibold hidden lg:table-cell">Pay</th>
                <th className="text-left px-5 py-4 font-semibold hidden sm:table-cell">Applicants</th>
                <th className="text-left px-5 py-4 font-semibold">Status</th>
                <th className="text-left px-5 py-4 font-semibold hidden lg:table-cell">Posted</th>
                <th className="px-5 py-4" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((s) => {
                const isDisputed = DISPUTED_STATUSES.includes(s.status);
                return (
                  <tr
                    key={s.id}
                    className={`transition-colors ${isDisputed ? 'bg-amber-50/50 hover:bg-amber-50' : 'hover:bg-gray-50'}`}
                  >
                    <td className="px-5 py-4">
                      <p className="font-semibold text-gray-900 capitalize">{s.shift_type}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{formatDate(s.shift_date)}</p>
                    </td>
                    <td className="px-5 py-4 text-gray-600">
                      {s.facility_profiles?.facility_name || '—'}
                    </td>
                    <td className="px-5 py-4 text-gray-600 hidden md:table-cell">
                      {s.co_user?.display_name || <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-5 py-4 font-medium text-gray-900 hidden lg:table-cell">
                      {formatPay(s.pay_amount)}
                    </td>
                    <td className="px-5 py-4 hidden sm:table-cell">
                      <span className="flex items-center gap-1.5 text-gray-600">
                        <Users className="w-3.5 h-3.5 text-gray-400" />
                        {s.applicant_count}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-col gap-1.5">
                        <Badge status={s.status} />
                        {isDisputed && s.dispute_reason && (
                          <p className="text-[10px] text-amber-700 italic max-w-[140px] truncate">
                            "{s.dispute_reason}"
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-gray-500 text-xs hidden lg:table-cell">
                      {formatDate(s.created_at)}
                    </td>
                    <td className="px-5 py-4 text-right">
                      {isDisputed && (
                        <button
                          onClick={() => { setResolveModal(s); setResolution('approve'); setResolveNote(''); }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold transition-colors whitespace-nowrap"
                        >
                          <AlertTriangle className="w-3.5 h-3.5" />
                          Resolve
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Dispute resolution modal ── */}
      {resolveModal && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setResolveModal(null); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <h2 className="font-bold text-gray-900">Resolve Dispute</h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {resolveModal.status === 'disputed_checkin' ? 'Check-in dispute' : 'Check-out dispute'}
                  </p>
                </div>
              </div>
              <button onClick={() => setResolveModal(null)} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Context */}
              <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 space-y-1.5 text-sm">
                <p><span className="text-gray-400 font-medium">Shift:</span> <span className="text-gray-800 font-semibold">{resolveModal.shift_type} · {formatDate(resolveModal.shift_date)}</span></p>
                <p><span className="text-gray-400 font-medium">Facility:</span> <span className="text-gray-700">{resolveModal.facility_profiles?.facility_name || '—'}</span></p>
                <p><span className="text-gray-400 font-medium">CO:</span> <span className="text-gray-700">{resolveModal.co_user?.display_name || '—'}</span></p>
                {resolveModal.dispute_reason && (
                  <p className="pt-1 border-t border-gray-100">
                    <span className="text-gray-400 font-medium">Reason:</span>{' '}
                    <span className="text-amber-800 italic">"{resolveModal.dispute_reason}"</span>
                  </p>
                )}
              </div>

              {/* Resolution choice */}
              <div>
                <p className="text-sm font-semibold text-gray-700 mb-3">Your decision:</p>
                <div className="space-y-2.5">
                  <label className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${resolution === 'approve' ? 'border-emerald-400 bg-emerald-50' : 'border-gray-200 hover:border-gray-300'}`}>
                    <input
                      type="radio"
                      name="resolution"
                      value="approve"
                      checked={resolution === 'approve'}
                      onChange={() => setResolution('approve')}
                      className="mt-0.5 shrink-0 accent-emerald-600"
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span className="font-semibold text-gray-900 text-sm">Approve CO — Shift completed</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        The CO was present and performed the shift. Mark as completed and release payment.
                      </p>
                    </div>
                  </label>

                  <label className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${resolution === 'reject' ? 'border-red-400 bg-red-50' : 'border-gray-200 hover:border-gray-300'}`}>
                    <input
                      type="radio"
                      name="resolution"
                      value="reject"
                      checked={resolution === 'reject'}
                      onChange={() => setResolution('reject')}
                      className="mt-0.5 shrink-0 accent-red-600"
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <XCircle className="w-4 h-4 text-red-600" />
                        <span className="font-semibold text-gray-900 text-sm">Side with Facility — No-show</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        The CO did not fulfil the shift. Record as a no-show against the CO's reliability score.
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Admin note */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  Admin note <span className="font-normal text-gray-400">(optional — sent to CO)</span>
                </label>
                <textarea
                  value={resolveNote}
                  onChange={(e) => setResolveNote(e.target.value)}
                  placeholder="Add a brief explanation for your decision…"
                  rows={3}
                  className="w-full text-sm rounded-xl border border-gray-200 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
                />
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-1">
                <Button variant="secondary" className="flex-1" onClick={() => setResolveModal(null)} disabled={resolving}>
                  Cancel
                </Button>
                <Button
                  className={`flex-1 ${resolution === 'reject' ? 'bg-red-600 hover:bg-red-700 border-red-600' : ''}`}
                  loading={resolving}
                  onClick={handleResolve}
                >
                  <ShieldCheck className="w-4 h-4" />
                  Confirm Resolution
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </PageWrapper>
  );
}
