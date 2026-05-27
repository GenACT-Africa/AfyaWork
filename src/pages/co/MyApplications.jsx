import { useEffect, useState, useCallback } from 'react';
import {
  ClipboardList, Search, XCircle, Star, MessageSquare, ChevronDown, ChevronUp,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import {
  getMyCOApplications,
  acceptShiftOffer, declineShiftOffer,
  coCheckin, coCheckout,
  submitRating,
} from '../../lib/api';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { StarRating } from '../../components/common/StarRating';
import { ShiftCardSkeleton } from '../../components/common/Skeleton';
import { Avatar } from '../../components/common/Avatar';
import { useToast } from '../../components/common/Toast';
import { supabase } from '../../lib/supabase';
import { ShiftProgressTracker } from '../../components/shifts/ShiftProgressTracker';

const TABS = ['all', 'pending', 'approved', 'rejected'];

// Lower number = shown first (active lifecycle at top)
const SHIFT_STATUS_PRIORITY = {
  disputed_checkin:          0,
  disputed_checkout:         1,
  pending_checkin_approval:  2,
  in_progress:               3,
  pending_checkout_approval: 4,
  filled:                    5,
  confirmed:                 6,
  no_show:                   7,
  completed:                 8,
};
const APP_STATUS_PRIORITY = { pending: 10, approved: 11, rejected: 12 };

function sortApplications(apps, userId) {
  return [...apps].sort((a, b) => {
    const shiftA = a.shifts;
    const shiftB = b.shifts;
    const assignedA = shiftA?.assigned_co_id === userId;
    const assignedB = shiftB?.assigned_co_id === userId;
    const pa = assignedA && shiftA?.status
      ? (SHIFT_STATUS_PRIORITY[shiftA.status] ?? 9)
      : (APP_STATUS_PRIORITY[a.status] ?? 99);
    const pb = assignedB && shiftB?.status
      ? (SHIFT_STATUS_PRIORITY[shiftB.status] ?? 9)
      : (APP_STATUS_PRIORITY[b.status] ?? 99);
    if (pa !== pb) return pa - pb;
    return new Date(b.applied_at) - new Date(a.applied_at);
  });
}

export default function MyApplications() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const { show, ToastComponent } = useToast();
  const [applications, setApplications] = useState([]);
  const [tab, setTab] = useState('all');
  const [loading, setLoading] = useState(true);

  const loadApps = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await getMyCOApplications(user.id);
    setApplications(data || []);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { loadApps(); }, [loadApps]);

  // ── Real-time: application status changes (offer approved / rejected) ──
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`co-apps-${user.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'applications',
        filter: `user_id=eq.${user.id}`,
      }, () => loadApps())
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [user?.id, loadApps]);

  // ── Real-time: shift lifecycle changes (checkin/checkout/disputes) ──
  useEffect(() => {
    if (!applications.length) return;
    const shiftIds = [...new Set(applications.map((a) => a.shifts?.id).filter(Boolean))];
    if (!shiftIds.length) return;
    const channels = shiftIds.map((shiftId) =>
      supabase
        .channel(`shift-live-${shiftId}`)
        .on('postgres_changes', {
          event: 'UPDATE', schema: 'public', table: 'shifts',
          filter: `id=eq.${shiftId}`,
        }, () => loadApps())
        .subscribe()
    );
    return () => channels.forEach((ch) => supabase.removeChannel(ch));
  }, [applications, loadApps]);

  const filtered = sortApplications(
    tab === 'all' ? applications : applications.filter((a) => a.status === tab),
    user?.id,
  );
  const counts = {
    pending:  applications.filter((a) => a.status === 'pending').length,
    approved: applications.filter((a) => a.status === 'approved').length,
    rejected: applications.filter((a) => a.status === 'rejected').length,
  };

  return (
    <PageWrapper title={t('co.my_applications')} subtitle={t('co.track_applications')}>
      {ToastComponent}

      {/* Tabs */}
      <div className="flex gap-1.5 mb-6 overflow-x-auto pb-1">
        {TABS.map((tabKey) => (
          <button
            key={tabKey}
            onClick={() => setTab(tabKey)}
            className={`shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all
              ${tab === tabKey
                ? 'bg-teal-600 text-white shadow-sm'
                : 'bg-white border border-gray-100 text-gray-600 hover:bg-gray-50 shadow-sm'}`}
          >
            {tabKey === 'all' ? t('common.all') : t(`status.${tabKey}`)}
            {tabKey !== 'all' && counts[tabKey] > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${tab === tabKey ? 'bg-teal-500 text-white' : 'bg-gray-100 text-gray-600'}`}>
                {counts[tabKey]}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <ShiftCardSkeleton key={i} />)}</div>
      ) : filtered.length === 0 ? (
        <EmptyState tab={tab} t={t} />
      ) : (
        <div className="space-y-3">
          {filtered.map((app) => (
            <ApplicationCard
              key={app.id}
              app={app}
              userId={user.id}
              t={t}
              show={show}
              onRefresh={loadApps}
            />
          ))}
        </div>
      )}
    </PageWrapper>
  );
}

// ── ApplicationCard ───────────────────────────────────────────────

function ApplicationCard({ app, userId, t, show, onRefresh }) {
  const shift    = app.shifts;
  const facility = shift?.facility_profiles;
  const status   = shift?.status;

  const [acting, setActing]             = useState(null);
  const [declineModal, setDeclineModal] = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  const [ratingModal, setRatingModal]   = useState(false);
  const [stars, setStars]               = useState(0);
  const [comment, setComment]           = useState('');
  const [showDetails, setShowDetails]   = useState(false);

  const isAssignedCO = shift?.assigned_co_id === userId;
  const myRating     = app.my_rating;

  async function act(fn, loadingKey, ...args) {
    setActing(loadingKey);
    const { error } = await fn(...args);
    setActing(null);
    if (error) { show(error.message || 'Something went wrong.', 'error'); return false; }
    await onRefresh();
    return true;
  }

  async function handleAccept() {
    const ok = await act(acceptShiftOffer, 'accept', shift.id);
    if (ok) show('Offer accepted! Your shift is confirmed.', 'success');
  }

  async function handleDecline() {
    const ok = await act(declineShiftOffer, 'decline', shift.id, declineReason || null);
    if (ok) { setDeclineModal(false); show('Offer declined.'); }
  }

  async function handleCheckin() {
    const ok = await act(coCheckin, 'checkin', shift.id);
    if (ok) show('Checked in! Waiting for facility confirmation.');
  }

  async function handleCheckout() {
    const ok = await act(coCheckout, 'checkout', shift.id);
    if (ok) show('Checked out! Waiting for facility confirmation.');
  }

  async function handleRate() {
    if (stars === 0) { show('Please select a star rating.', 'error'); return; }
    const ok = await act(submitRating, 'rate', shift.id, shift.facility_id, stars, comment || null);
    if (ok) { setRatingModal(false); show('Thank you for your feedback!', 'success'); }
  }

  // Border colour by shift lifecycle status
  const borderClass = (() => {
    if (status === 'filled' && isAssignedCO)            return 'border-blue-200 bg-blue-50/20';
    if (status === 'confirmed')                          return 'border-indigo-200 bg-indigo-50/20';
    if (status === 'pending_checkin_approval')           return 'border-amber-200 bg-amber-50/20';
    if (status === 'in_progress')                        return 'border-teal-200 bg-teal-50/20';
    if (status === 'pending_checkout_approval')          return 'border-orange-200 bg-orange-50/20';
    if (status === 'completed')                          return 'border-emerald-200 bg-emerald-50/20';
    if (['disputed_checkin','disputed_checkout'].includes(status)) return 'border-red-200 bg-red-50/20';
    if (status === 'no_show')                            return 'border-gray-300 bg-gray-50/50';
    if (app.status === 'approved')                       return 'border-emerald-200 bg-emerald-50/30';
    return 'border-gray-100 hover:shadow-md';
  })();

  return (
    <div className={`bg-white rounded-2xl border px-5 py-5 shadow-sm transition-all ${borderClass}`}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Avatar
            src={facility?.users?.avatar_url}
            name={facility?.facility_name}
            size="md"
            shape="rounded"
            className="mt-0.5 shrink-0"
          />
          <div>
            <p className="font-bold text-gray-900 text-base">{shift?.shift_type}</p>
            <p className="text-sm text-gray-500 mt-0.5 font-medium">{facility?.facility_name}</p>
            {facility?.users?.bio && (
              <p className="text-xs text-gray-400 italic mt-1 line-clamp-1">"{facility.users.bio}"</p>
            )}
            <p className="text-sm text-gray-400 mt-1">
              {new Date(shift?.shift_date + 'T00:00:00').toLocaleDateString('en-TZ', {
                weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
              })}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          {isAssignedCO && status && !['open', 'filled'].includes(status)
            ? <Badge status={status} />
            : <Badge status={app.status} />
          }
          <span className="text-lg font-extrabold text-gray-900">TZS {shift?.pay_amount?.toLocaleString()}</span>
        </div>
      </div>

      {/* ── Shift Progress Tracker (only for the assigned CO) ── */}
      {isAssignedCO && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <ShiftProgressTracker
            shift={shift}
            role="co"
            myRating={myRating}
            facilityName={facility?.facility_name}
            onAccept={handleAccept}
            onDecline={() => setDeclineModal(true)}
            onCheckin={handleCheckin}
            onCheckout={handleCheckout}
            onRate={() => setRatingModal(true)}
            actionLoading={acting}
          />
        </div>
      )}

      {/* Toggle details */}
      <button
        className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 mt-3 transition-colors"
        onClick={() => setShowDetails((v) => !v)}
      >
        {showDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        {showDetails ? 'Hide details' : 'Show details'}
      </button>

      {showDetails && (
        <p className="text-xs text-gray-400 mt-1.5">
          {t('co.applied')} {new Date(app.applied_at).toLocaleDateString('en-TZ', { day: 'numeric', month: 'short', year: 'numeric' })}
        </p>
      )}

      {/* ── Decline modal ── */}
      {declineModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setDeclineModal(false); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 bg-red-100 rounded-2xl flex items-center justify-center">
                <XCircle className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900">Decline this offer?</h3>
                <p className="text-xs text-gray-500">The shift will be re-opened.</p>
              </div>
            </div>
            <textarea
              value={declineReason}
              onChange={(e) => setDeclineReason(e.target.value)}
              placeholder="Optional: briefly explain why (e.g. scheduling conflict)"
              rows={3}
              className="w-full text-sm rounded-xl border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-300 resize-none mb-4"
            />
            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setDeclineModal(false)}>
                Keep offer
              </Button>
              <Button variant="danger" className="flex-1" loading={acting === 'decline'} onClick={handleDecline}>
                Yes, decline
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Rating modal ── */}
      {ratingModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setRatingModal(false); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-11 h-11 bg-amber-100 rounded-2xl flex items-center justify-center">
                <Star className="w-6 h-6 text-amber-500" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900">Rate {facility?.facility_name}</h3>
                <p className="text-xs text-gray-500">Your feedback is anonymous.</p>
              </div>
            </div>

            <div className="mb-4 flex flex-col items-center gap-2">
              <StarRating value={stars} onChange={setStars} size="lg" />
              <p className="text-xs text-gray-400">
                {stars === 0 ? 'Tap to rate' : ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'][stars]}
              </p>
            </div>

            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Leave a comment (optional)"
              rows={3}
              className="w-full text-sm rounded-xl border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-300 resize-none mb-4"
            />

            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setRatingModal(false)}>Cancel</Button>
              <Button className="flex-1" loading={acting === 'rate'} disabled={stars === 0} onClick={handleRate}>
                <MessageSquare className="w-4 h-4" /> Submit Rating
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── EmptyState ────────────────────────────────────────────────────

function EmptyState({ tab, t }) {
  return (
    <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-gray-200">
      <div className="w-16 h-16 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-blue-100">
        <ClipboardList className="w-8 h-8 text-blue-400" />
      </div>
      <p className="font-semibold text-gray-700">
        {tab === 'all' ? t('co.no_applications') : t('co.no_apps_tab', { tab: t(`status.${tab}`) })}
      </p>
      {tab === 'all' && (
        <>
          <p className="text-sm text-gray-400 mt-1 mb-5">{t('co.start_browsing')}</p>
          <Button to="/co/shifts" size="sm"><Search className="w-4 h-4" />{t('co.browse_btn')}</Button>
        </>
      )}
    </div>
  );
}
