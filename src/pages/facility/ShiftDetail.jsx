import { useEffect, useState, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, CalendarDays, Clock, Banknote, Users, CheckCircle, XCircle,
  AlertTriangle, Eye, X, Mail, Phone, Award, Star, Zap, Stethoscope,
  MessageSquare, Briefcase, MapPin,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import {
  getShiftWithApplicants, approveApplication, rejectApplication, cancelShift,
  approveCheckin, disputeCheckin, approveCheckout, disputeCheckout, submitRating,
} from '../../lib/api';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { Card } from '../../components/common/Card';
import { Badge, AvailabilityBadge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { StarRating } from '../../components/common/StarRating';
import { useToast } from '../../components/common/Toast';
import { supabase } from '../../lib/supabase';
import { Avatar } from '../../components/common/Avatar';
import { ShiftProgressTracker } from '../../components/shifts/ShiftProgressTracker';

// ── Tier display config ───────────────────────────────────────────
const TIER = {
  msingi:  { label: 'Msingi',  desc: 'Standard',       color: 'bg-gray-100 text-gray-700',   icon: Stethoscope },
  daktari: { label: 'Daktari', desc: 'Priority access', color: 'bg-blue-50 text-blue-700',    icon: Star },
  bingwa:  { label: 'Bingwa',  desc: 'First access',    color: 'bg-amber-50 text-amber-700',  icon: Zap },
};

// ── Main page ─────────────────────────────────────────────────────
export default function ShiftDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { show, ToastComponent } = useToast();

  const [shift, setShift]           = useState(null);
  const [loading, setLoading]       = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const [cancelModal, setCancelModal]   = useState(false);
  const [modalApp, setModalApp]         = useState(null);
  const [disputeModal, setDisputeModal] = useState(null); // 'checkin' | 'checkout'
  const [disputeReason, setDisputeReason] = useState('');
  const [ratingModal, setRatingModal]   = useState(false);
  const [ratingStars, setRatingStars]   = useState(0);
  const [ratingComment, setRatingComment] = useState('');

  const loadShift = useCallback(async () => {
    const { data, error } = await getShiftWithApplicants(id);
    if (error || !data) { navigate('/facility/shifts'); return; }
    if (data.facility_id !== user?.id) { navigate('/facility/shifts'); return; }
    setShift(data);
    setLoading(false);
  }, [id, user?.id, navigate]);

  useEffect(() => { loadShift(); }, [loadShift]);

  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`shift-${id}-applications`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'applications', filter: `shift_id=eq.${id}` }, () => loadShift())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts', filter: `id=eq.${id}` }, () => loadShift())
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [id, loadShift]);

  async function handleApprove(applicationId) {
    setActionLoading(applicationId);
    const { error } = await approveApplication(applicationId);
    setActionLoading(null);
    if (error) { show(error.message || 'Failed to approve.', 'error'); return; }
    show(t('facility.co_approved'));
    loadShift();
  }

  async function handleReject(applicationId) {
    setActionLoading(`reject-${applicationId}`);
    const { error } = await rejectApplication(applicationId);
    setActionLoading(null);
    if (error) { show(error.message || 'Failed to reject.', 'error'); return; }
    show(t('facility.applicant_rejected'));
    loadShift();
  }

  async function handleCancel() {
    setActionLoading('cancel');
    const { error } = await cancelShift(id);
    setActionLoading(null);
    setCancelModal(false);
    if (error) { show(error.message, 'error'); return; }
    navigate('/facility/shifts');
  }

  async function handleApproveCheckin() {
    setActionLoading('approve-checkin');
    const { error } = await approveCheckin(id);
    setActionLoading(null);
    if (error) { show(error.message || 'Failed.', 'error'); return; }
    show('Check-in confirmed! Shift is now in progress.');
    loadShift();
  }

  async function handleDisputeCheckin() {
    if (!disputeReason.trim()) { show('Please provide a reason.', 'error'); return; }
    setActionLoading('dispute-checkin');
    const { error } = await disputeCheckin(id, disputeReason);
    setActionLoading(null);
    if (error) { show(error.message || 'Failed.', 'error'); return; }
    setDisputeModal(null); setDisputeReason('');
    show('Dispute raised. Admin will review shortly.');
    loadShift();
  }

  async function handleApproveCheckout() {
    setActionLoading('approve-checkout');
    const { error } = await approveCheckout(id);
    setActionLoading(null);
    if (error) { show(error.message || 'Failed.', 'error'); return; }
    show('Checkout confirmed! Shift is now complete.');
    loadShift();
  }

  async function handleDisputeCheckout() {
    if (!disputeReason.trim()) { show('Please provide a reason.', 'error'); return; }
    setActionLoading('dispute-checkout');
    const { error } = await disputeCheckout(id, disputeReason);
    setActionLoading(null);
    if (error) { show(error.message || 'Failed.', 'error'); return; }
    setDisputeModal(null); setDisputeReason('');
    show('Dispute raised. Admin will review shortly.');
    loadShift();
  }

  async function handleRate() {
    if (ratingStars === 0) { show('Please select a rating.', 'error'); return; }
    setActionLoading('rate');
    const { error } = await submitRating(id, shift.assigned_co_id, ratingStars, ratingComment || null);
    setActionLoading(null);
    if (error) { show(error.message || 'Failed.', 'error'); return; }
    setRatingModal(false);
    show('Thank you for your feedback!', 'success');
    loadShift();
  }

  if (loading) return <ShiftDetailSkeleton />;

  const applicants  = shift.applicants || [];
  const ratings     = shift.ratings    || [];
  const shiftStatus = shift.status;

  const isFilled    = shiftStatus === 'filled';
  const isCancelled = shiftStatus === 'cancelled';
  const isOpen      = shiftStatus === 'open';

  const isPendingCheckin  = shiftStatus === 'pending_checkin_approval';
  const isInProgress      = shiftStatus === 'in_progress';
  const isPendingCheckout = shiftStatus === 'pending_checkout_approval';
  const isCompleted       = shiftStatus === 'completed';
  const isDisputed        = ['disputed_checkin', 'disputed_checkout'].includes(shiftStatus);
  const isNoShow          = shiftStatus === 'no_show';
  const isConfirmed       = shiftStatus === 'confirmed';

  // Find the approved applicant (CO) details
  const approvedApp = applicants.find((a) => a.status === 'approved');
  const assignedCO  = approvedApp?.users;

  // Has the facility already rated the CO?
  const facilityRating = ratings.find((r) => r.rater_id === user?.id && r.rating_type === 'facility_rates_co');

  const shiftCanReceiveActions = !isOpen && !isCancelled && !isCompleted && !isNoShow;

  return (
    <PageWrapper>
      {ToastComponent}

      <Link to="/facility/shifts" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-teal-600 mb-6 font-medium transition-colors">
        <ArrowLeft className="w-4 h-4" /> {t('facility.back_to_shifts')}
      </Link>

      {/* ── Full-width shift progress tracker ── */}
      {!isOpen && !isCancelled && (
        <Card className="p-5 mb-6">
          <ShiftProgressTracker
            shift={shift}
            role="facility"
            myRating={facilityRating}
            coName={assignedCO?.display_name}
            onApproveCheckin={handleApproveCheckin}
            onDisputeCheckin={() => { setDisputeModal('checkin'); setDisputeReason(''); }}
            onApproveCheckout={handleApproveCheckout}
            onDisputeCheckout={() => { setDisputeModal('checkout'); setDisputeReason(''); }}
            onRate={() => setRatingModal(true)}
            actionLoading={actionLoading}
          />
        </Card>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        {/* ── Left: Shift info ── */}
        <div className="lg:col-span-1 space-y-4">
          <Card className="p-6 space-y-5">
            <div className="flex items-start justify-between">
              <h1 className="text-xl font-bold text-gray-900">{shift.shift_type}</h1>
              <Badge status={shiftStatus} />
            </div>

            <div className="space-y-3">
              <InfoRow icon={CalendarDays} label={t('facility.date')}
                value={new Date(shift.shift_date + 'T00:00:00').toLocaleDateString('en-TZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              />
              <InfoRow icon={Banknote} label={t('facility.co_pay')} value={`TZS ${shift.pay_amount.toLocaleString()}`} />
              <InfoRow icon={Users} label={t('facility.applicants_label')} value={applicants.length} />
              <InfoRow icon={Clock} label={t('facility.posted')}
                value={new Date(shift.created_at).toLocaleDateString('en-TZ', { day: 'numeric', month: 'short', year: 'numeric' })}
              />
            </div>

            {shift.description && (
              <div className="bg-gray-50 rounded-xl px-4 py-3 border border-gray-100">
                <p className="text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">{t('facility.notes')}</p>
                <p className="text-sm text-gray-600">{shift.description}</p>
              </div>
            )}

            {isOpen && (
              <Button variant="danger" size="sm" className="w-full" onClick={() => setCancelModal(true)}>
                {t('facility.cancel_shift')}
              </Button>
            )}
          </Card>
        </div>

        {/* ── Right: Applicants ── */}
        <div className="lg:col-span-2">
          <h2 className="text-lg font-bold text-gray-900 mb-4">
            {t('facility.applicants_count', { count: applicants.length })}
          </h2>

          {applicants.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-gray-200">
              <div className="w-16 h-16 bg-gradient-to-br from-gray-50 to-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-gray-200">
                <Users className="w-8 h-8 text-gray-400" />
              </div>
              <p className="font-semibold text-gray-700">{t('facility.no_applicants')}</p>
              <p className="text-sm text-gray-400 mt-1">{t('facility.cos_appear')}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {applicants.map((app) => (
                <ApplicantCard
                  key={app.id}
                  app={app}
                  shiftFilled={!isOpen}
                  onViewProfile={() => setModalApp(app)}
                  onApprove={() => handleApprove(app.id)}
                  onReject={() => handleReject(app.id)}
                  approving={actionLoading === app.id}
                  rejecting={actionLoading === `reject-${app.id}`}
                  t={t}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Applicant profile modal ── */}
      {modalApp && (
        <ApplicantModal
          app={modalApp}
          shiftFilled={!isOpen}
          onClose={() => setModalApp(null)}
          onApprove={() => { setModalApp(null); handleApprove(modalApp.id); }}
          onReject={() => { setModalApp(null); handleReject(modalApp.id); }}
          approving={actionLoading === modalApp.id}
          rejecting={actionLoading === `reject-${modalApp.id}`}
          t={t}
        />
      )}

      {/* ── Cancel shift modal ── */}
      {cancelModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-red-100 rounded-2xl flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
              <h2 className="text-lg font-bold text-gray-900">{t('facility.cancel_title')}</h2>
            </div>
            <p className="text-sm text-gray-500 mb-6">{t('facility.cancel_warning')}</p>
            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setCancelModal(false)} disabled={actionLoading === 'cancel'}>
                {t('facility.keep_shift')}
              </Button>
              <Button variant="danger" className="flex-1" loading={actionLoading === 'cancel'} onClick={handleCancel}>
                {t('facility.yes_cancel')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Dispute modal ── */}
      {disputeModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) { setDisputeModal(null); setDisputeReason(''); } }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-red-100 rounded-2xl flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900">Raise a dispute</h2>
                <p className="text-xs text-gray-500">
                  {disputeModal === 'checkin' ? 'CO claims to be on-site but isn\'t?' : 'CO claims to have completed but you disagree?'}
                </p>
              </div>
            </div>
            <textarea
              value={disputeReason}
              onChange={(e) => setDisputeReason(e.target.value)}
              placeholder="Describe what happened…"
              rows={4}
              className="w-full text-sm rounded-xl border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-300 resize-none mb-4"
            />
            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1"
                onClick={() => { setDisputeModal(null); setDisputeReason(''); }}>
                Cancel
              </Button>
              <Button variant="danger" className="flex-1"
                loading={actionLoading === `dispute-${disputeModal}`}
                onClick={disputeModal === 'checkin' ? handleDisputeCheckin : handleDisputeCheckout}>
                Submit Dispute
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Rating modal ── */}
      {ratingModal && assignedCO && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setRatingModal(false); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-5">
              <Avatar src={assignedCO.avatar_url} name={assignedCO.display_name} size="md" />
              <div>
                <h3 className="font-bold text-gray-900">Rate {assignedCO.display_name}</h3>
                <p className="text-xs text-gray-500">Your feedback helps improve AfyaWork.</p>
              </div>
            </div>

            <div className="mb-4 flex flex-col items-center gap-2">
              <StarRating value={ratingStars} onChange={setRatingStars} size="lg" />
              <p className="text-xs text-gray-400">
                {ratingStars === 0 ? 'Tap a star to rate' : ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'][ratingStars]}
              </p>
            </div>

            <textarea
              value={ratingComment}
              onChange={(e) => setRatingComment(e.target.value)}
              placeholder="Leave a comment (optional)"
              rows={3}
              className="w-full text-sm rounded-xl border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-300 resize-none mb-4"
            />

            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setRatingModal(false)}>Cancel</Button>
              <Button className="flex-1" loading={actionLoading === 'rate'} disabled={ratingStars === 0} onClick={handleRate}>
                <MessageSquare className="w-4 h-4" /> Submit Rating
              </Button>
            </div>
          </div>
        </div>
      )}
    </PageWrapper>
  );
}

// ── Applicant summary card ────────────────────────────────────────
function ApplicantCard({ app, shiftFilled, onViewProfile, onApprove, onReject, approving, rejecting, t }) {
  const co      = app.users;
  const profile = app.co_profiles;
  const isApproved = app.status === 'approved';

  return (
    <Card className={`p-5 transition-all ${isApproved ? 'border-emerald-200 bg-emerald-50/20' : 'hover:shadow-md'}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <Avatar src={co?.avatar_url} name={co?.display_name} size="lg" />
          <div className="min-w-0">
            <p className="font-bold text-gray-900 truncate">{co?.display_name}</p>
            <p className="text-sm text-gray-500">
              {profile?.specialization || 'General Practice'} · {t('common.license')} {profile?.license_number}
            </p>
            {co?.bio && (
              <p className="text-xs text-gray-500 italic mt-1 line-clamp-2 leading-relaxed">"{co.bio}"</p>
            )}
            <p className="text-xs text-gray-400 mt-1">
              {t('co.applied')} {new Date(app.applied_at).toLocaleDateString('en-TZ', { day: 'numeric', month: 'short', year: 'numeric' })}
            </p>
          </div>
        </div>
        <Badge status={app.status} />
      </div>

      {isApproved && (co?.email || co?.phone) && (
        <div className="mt-4 pt-4 border-t border-emerald-100 bg-emerald-50 rounded-xl px-4 py-3 text-sm text-emerald-800 space-y-1">
          {co.email && <p>Email: <a href={`mailto:${co.email}`} className="underline font-medium">{co.email}</a></p>}
          {co.phone && <p>Phone: <a href={`tel:${co.phone}`} className="underline font-medium">{co.phone}</a></p>}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 mt-4 pt-3 border-t border-gray-50">
        <button
          type="button"
          onClick={onViewProfile}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-600 hover:text-teal-700 transition-colors"
        >
          <Eye className="w-3.5 h-3.5" />
          View full profile
        </button>
        {app.status === 'pending' && !shiftFilled && (
          <div className="flex gap-2">
            <Button size="sm" loading={approving} disabled={rejecting} onClick={onApprove}>
              <CheckCircle className="w-4 h-4" /> {t('facility.approve')}
            </Button>
            <Button variant="secondary" size="sm" loading={rejecting} disabled={approving} onClick={onReject}>
              <XCircle className="w-4 h-4" /> {t('facility.reject')}
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

// ── Applicant profile modal ───────────────────────────────────────
function ApplicantModal({ app, shiftFilled, onClose, onApprove, onReject, approving, rejecting, t }) {
  const co      = app.users;
  const profile = app.co_profiles;
  const isApproved = app.status === 'approved';
  const isPending  = app.status === 'pending';

  const tierKey  = profile?.subscription_tier || 'msingi';
  const tier     = TIER[tierKey] ?? TIER.msingi;
  const TierIcon = tier.icon;

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[92vh] overflow-y-auto flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl z-10">
          <h2 className="text-base font-bold text-gray-900">Applicant Profile</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors" aria-label="Close">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="flex items-start gap-4">
            <Avatar src={co?.avatar_url} name={co?.display_name} size="xl" />
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-bold text-gray-900 text-lg leading-tight">{co?.display_name}</h3>
                <Badge status={app.status} />
              </div>
              <p className="text-sm text-gray-500 mt-1">{profile?.specialization || 'General Practice'}</p>
              <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                <Award className="w-3 h-3 shrink-0" />
                Licence {profile?.license_number}
              </p>
              <div className="flex items-center gap-2 flex-wrap mt-2">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium ${tier.color}`}>
                  <TierIcon className="w-3 h-3" />
                  {tier.label}
                </span>
                {profile?.verified && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-green-50 text-green-700 text-xs font-medium border border-green-200">
                    <CheckCircle className="w-3 h-3" />
                    Verified CO
                  </span>
                )}
              </div>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">About</p>
            {co?.bio ? (
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{co.bio}</p>
            ) : (
              <p className="text-sm text-gray-400 italic">This worker hasn't added a bio yet.</p>
            )}
          </div>

          {/* Employment availability — only shown when CO has declared a status */}
          {profile?.employment_availability_status && (
            <div className="border border-gray-100 rounded-xl p-4 space-y-2.5">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Employment Availability</p>

              <AvailabilityBadge status={profile.employment_availability_status} />

              {profile.employment_availability_status === 'not_looking' && (
                <p className="text-sm text-gray-500">Not currently looking for full-time or permanent roles.</p>
              )}

              {['open_fulltime', 'open_parttime'].includes(profile.employment_availability_status) && (
                <div className="space-y-1.5 text-sm text-gray-600">
                  {/* Available from */}
                  {(profile.available_from_immediately || profile.available_from_date) && (
                    <div className="flex items-center gap-2">
                      <CalendarDays className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                      <span>
                        {profile.available_from_immediately
                          ? 'Immediately available'
                          : 'From ' + new Date(String(profile.available_from_date) + 'T00:00:00')
                              .toLocaleDateString('en-TZ', { month: 'long', year: 'numeric' })}
                      </span>
                    </div>
                  )}

                  {/* Preferred location */}
                  {profile.preferred_location && (
                    <div className="flex items-center gap-2">
                      <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                      <span>
                        {profile.preferred_location === 'specific_region' && profile.preferred_location_text
                          ? profile.preferred_location_text
                          : profile.preferred_location === 'dar_only'
                            ? 'Dar es Salaam only'
                            : 'Open to all regions in Tanzania'}
                      </span>
                    </div>
                  )}

                  {/* Current employment status */}
                  {profile.current_employment_status && (
                    <div className="flex items-center gap-2">
                      <Briefcase className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                      <span>
                        {{ employed_looking: 'Currently employed, looking to move', locum_only: 'Currently doing locum shifts only', unemployed: 'Unemployed / between roles' }[profile.current_employment_status]}
                      </span>
                    </div>
                  )}

                  {/* Note */}
                  {profile.availability_note && (
                    <p className="text-xs text-gray-500 italic bg-gray-50 rounded-lg px-3 py-2 border border-gray-100 mt-1">
                      "{profile.availability_note}"
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="flex items-center gap-2 text-xs text-gray-400 pb-1 border-b border-gray-100">
            <Clock className="w-3.5 h-3.5 shrink-0" />
            Applied {new Date(app.applied_at).toLocaleDateString('en-TZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </div>

          {isApproved && (co?.email || co?.phone) && (
            <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-4 space-y-2">
              <p className="text-xs font-semibold text-emerald-800 uppercase tracking-wide mb-1">Contact Information</p>
              {co.email && (
                <a href={`mailto:${co.email}`} className="flex items-center gap-2 text-sm text-emerald-700 hover:text-emerald-900 transition-colors">
                  <Mail className="w-4 h-4 shrink-0" />{co.email}
                </a>
              )}
              {co.phone && (
                <a href={`tel:${co.phone}`} className="flex items-center gap-2 text-sm text-emerald-700 hover:text-emerald-900 transition-colors">
                  <Phone className="w-4 h-4 shrink-0" />{co.phone}
                </a>
              )}
            </div>
          )}

          {isPending && !isApproved && (
            <p className="text-xs text-gray-400 text-center">
              Contact details are shared after you approve the applicant.
            </p>
          )}

          {isPending && !shiftFilled && (
            <div className="flex gap-3">
              <Button className="flex-1" loading={approving} disabled={rejecting} onClick={onApprove}>
                <CheckCircle className="w-4 h-4" /> {t('facility.approve')}
              </Button>
              <Button variant="secondary" className="flex-1" loading={rejecting} disabled={approving} onClick={onReject}>
                <XCircle className="w-4 h-4" /> {t('facility.reject')}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Shared helpers ────────────────────────────────────────────────
function InfoRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-3 text-sm">
      <div className="w-8 h-8 bg-gray-50 rounded-lg flex items-center justify-center shrink-0 border border-gray-100">
        <Icon className="w-4 h-4 text-gray-400" />
      </div>
      <div>
        <p className="text-xs text-gray-400 font-medium">{label}</p>
        <p className="font-semibold text-gray-800 mt-0.5">{value}</p>
      </div>
    </div>
  );
}

function ShiftDetailSkeleton() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-8 animate-pulse space-y-6">
      <div className="h-4 w-24 bg-gray-200 rounded-lg" />
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="space-y-4">
          <div className="bg-gray-100 rounded-2xl h-64" />
        </div>
        <div className="lg:col-span-2 space-y-3">
          {[1,2,3].map(i => <div key={i} className="bg-gray-100 rounded-2xl h-24" />)}
        </div>
      </div>
    </div>
  );
}
