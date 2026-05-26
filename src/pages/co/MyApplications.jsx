import { useEffect, useState, useCallback } from 'react';
import {
  ClipboardList, Search, CheckCircle2, XCircle, LogIn, LogOut,
  Clock, AlertTriangle, Star, MessageSquare, ChevronDown, ChevronUp,
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

const TABS = ['all', 'pending', 'approved', 'rejected'];

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

  const filtered = tab === 'all' ? applications : applications.filter((a) => a.status === tab);
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

  const [acting, setActing]         = useState(null);
  const [declineModal, setDeclineModal] = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  const [ratingModal, setRatingModal]   = useState(false);
  const [stars, setStars]           = useState(0);
  const [comment, setComment]       = useState('');
  const [showDetails, setShowDetails] = useState(false);

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

  const isApproved = app.status === 'approved';

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
    if (isApproved)                                      return 'border-emerald-200 bg-emerald-50/30';
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
          {/* Show shift status badge for approved apps in the new lifecycle */}
          {isAssignedCO && status && !['open','filled'].includes(status)
            ? <Badge status={status} />
            : <Badge status={app.status} />
          }
          <span className="text-lg font-extrabold text-gray-900">TZS {shift?.pay_amount?.toLocaleString()}</span>
        </div>
      </div>

      {/* ── Lifecycle panels (only for approved + assigned CO) ── */}

      {/* OFFER PENDING — facility selected this CO */}
      {isApproved && isAssignedCO && status === 'filled' && (
        <LifecyclePanel color="blue" icon={<Star className="w-5 h-5 text-blue-600" />}>
          <p className="font-bold text-blue-900">You've been selected! 🎉</p>
          <p className="text-sm text-blue-700 mt-0.5">
            Review this offer and respond.
            {shift.offer_expires_at && (
              <span className="ml-1 text-xs text-blue-500">
                Expires {new Date(shift.offer_expires_at).toLocaleString('en-TZ', { dateStyle: 'short', timeStyle: 'short' })}
              </span>
            )}
          </p>
          <div className="flex gap-2 mt-3">
            <Button size="sm" loading={acting === 'accept'} disabled={!!acting} onClick={handleAccept}>
              <CheckCircle2 className="w-4 h-4" /> Accept Offer
            </Button>
            <Button variant="secondary" size="sm" disabled={!!acting}
              onClick={() => setDeclineModal(true)}>
              <XCircle className="w-4 h-4" /> Decline
            </Button>
          </div>
        </LifecyclePanel>
      )}

      {/* CONFIRMED — CO accepted, waiting for shift day */}
      {isApproved && isAssignedCO && status === 'confirmed' && (
        <LifecyclePanel color="indigo" icon={<CheckCircle2 className="w-5 h-5 text-indigo-600" />}>
          <p className="font-bold text-indigo-900">Shift confirmed ✓</p>
          <p className="text-sm text-indigo-700 mt-0.5">You're all set. Check in on shift day to begin.</p>
          <div className="mt-3">
            <Button size="sm" loading={acting === 'checkin'} disabled={!!acting} onClick={handleCheckin}>
              <LogIn className="w-4 h-4" /> Check In Now
            </Button>
          </div>
        </LifecyclePanel>
      )}

      {/* PENDING CHECKIN APPROVAL */}
      {isApproved && isAssignedCO && status === 'pending_checkin_approval' && (
        <LifecyclePanel color="amber" icon={<Clock className="w-5 h-5 text-amber-600" />}>
          <p className="font-bold text-amber-900">Checked in</p>
          <p className="text-sm text-amber-700 mt-0.5">
            Waiting for the facility to confirm you're on-site.
            {shift.checkin_at && (
              <span className="ml-1 text-xs">({new Date(shift.checkin_at).toLocaleTimeString('en-TZ', { timeStyle: 'short' })})</span>
            )}
          </p>
        </LifecyclePanel>
      )}

      {/* IN PROGRESS */}
      {isApproved && isAssignedCO && status === 'in_progress' && (
        <LifecyclePanel color="teal" icon={<LogIn className="w-5 h-5 text-teal-600" />}>
          <p className="font-bold text-teal-900">Shift in progress 🟢</p>
          <p className="text-sm text-teal-700 mt-0.5">
            Check-in confirmed.
            {shift.checkin_approved_at && (
              <span className="ml-1 text-xs">Started at {new Date(shift.checkin_approved_at).toLocaleTimeString('en-TZ', { timeStyle: 'short' })}</span>
            )}
          </p>
          <div className="mt-3">
            <Button size="sm" loading={acting === 'checkout'} disabled={!!acting} onClick={handleCheckout}>
              <LogOut className="w-4 h-4" /> Check Out
            </Button>
          </div>
        </LifecyclePanel>
      )}

      {/* PENDING CHECKOUT APPROVAL */}
      {isApproved && isAssignedCO && status === 'pending_checkout_approval' && (
        <LifecyclePanel color="orange" icon={<Clock className="w-5 h-5 text-orange-600" />}>
          <p className="font-bold text-orange-900">Checked out</p>
          <p className="text-sm text-orange-700 mt-0.5">
            Waiting for the facility to confirm shift completion.
            {shift.checkout_at && (
              <span className="ml-1 text-xs">({new Date(shift.checkout_at).toLocaleTimeString('en-TZ', { timeStyle: 'short' })})</span>
            )}
          </p>
        </LifecyclePanel>
      )}

      {/* COMPLETED */}
      {isApproved && isAssignedCO && status === 'completed' && (
        <LifecyclePanel color="emerald" icon={<CheckCircle2 className="w-5 h-5 text-emerald-600" />}>
          <p className="font-bold text-emerald-900">Shift completed! 🎉</p>
          {myRating ? (
            <div className="mt-2">
              <p className="text-sm text-emerald-700 mb-1">Your rating for this facility:</p>
              <StarRating value={myRating.stars} readonly size="sm" />
            </div>
          ) : (
            <div className="mt-2">
              <p className="text-sm text-emerald-700 mb-2">Share your experience — rate this facility.</p>
              <Button size="sm" onClick={() => setRatingModal(true)}>
                <Star className="w-4 h-4" /> Rate Facility
              </Button>
            </div>
          )}
        </LifecyclePanel>
      )}

      {/* DISPUTED */}
      {isAssignedCO && ['disputed_checkin','disputed_checkout'].includes(status) && (
        <LifecyclePanel color="red" icon={<AlertTriangle className="w-5 h-5 text-red-600" />}>
          <p className="font-bold text-red-900">Dispute under review</p>
          <p className="text-sm text-red-700 mt-0.5">
            The facility raised a dispute. Our admin team will review and resolve it.
            {shift.dispute_reason && (
              <span className="block mt-1 text-xs italic">"{shift.dispute_reason}"</span>
            )}
          </p>
        </LifecyclePanel>
      )}

      {/* NO SHOW */}
      {isAssignedCO && status === 'no_show' && (
        <LifecyclePanel color="gray" icon={<AlertTriangle className="w-5 h-5 text-gray-600" />}>
          <p className="font-bold text-gray-800">No-show recorded</p>
          <p className="text-sm text-gray-600 mt-0.5">This shift was marked as a no-show after admin review.</p>
        </LifecyclePanel>
      )}

      {/* Old-style approved banner (when not yet in the new lifecycle) */}
      {isApproved && isAssignedCO && status === 'filled' && false && (
        <div className="mt-4 pt-4 border-t border-emerald-100 bg-emerald-50 rounded-xl px-4 py-3">
          <p className="text-sm text-emerald-800 font-semibold">{t('co.selected')}</p>
          <p className="text-xs text-emerald-600 mt-0.5">{t('co.facility_will_contact')}</p>
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

// ── LifecyclePanel helper ─────────────────────────────────────────

const PANEL_COLORS = {
  blue:    'bg-blue-50 border-blue-100',
  indigo:  'bg-indigo-50 border-indigo-100',
  amber:   'bg-amber-50 border-amber-100',
  teal:    'bg-teal-50 border-teal-100',
  orange:  'bg-orange-50 border-orange-100',
  emerald: 'bg-emerald-50 border-emerald-100',
  red:     'bg-red-50 border-red-100',
  gray:    'bg-gray-50 border-gray-200',
};

function LifecyclePanel({ color, icon, children }) {
  const cls = PANEL_COLORS[color] || PANEL_COLORS.gray;
  return (
    <div className={`mt-4 pt-4 border-t border-gray-100`}>
      <div className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${cls}`}>
        <div className="mt-0.5 shrink-0">{icon}</div>
        <div className="flex-1 min-w-0">{children}</div>
      </div>
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
