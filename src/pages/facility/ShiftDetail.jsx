import { useEffect, useState, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, CalendarDays, Clock, Banknote, Users, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { getShiftWithApplicants, approveApplication, rejectApplication, cancelShift } from '../../lib/api';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { Card } from '../../components/common/Card';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { useToast } from '../../components/common/Toast';
import { supabase } from '../../lib/supabase';

export default function ShiftDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { show, ToastComponent } = useToast();
  const [shift, setShift] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const [cancelModal, setCancelModal] = useState(false);

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

  if (loading) return <ShiftDetailSkeleton />;

  const applicants = shift.applicants || [];
  const isFilled = shift.status === 'filled';
  const isCancelled = shift.status === 'cancelled';
  const isOpen = shift.status === 'open';

  return (
    <PageWrapper>
      {ToastComponent}

      <Link to="/facility/shifts" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-teal-600 mb-6 font-medium transition-colors">
        <ArrowLeft className="w-4 h-4" /> {t('facility.back_to_shifts')}
      </Link>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Shift info card */}
        <div className="lg:col-span-1 space-y-4">
          <Card className="p-6 space-y-5">
            <div className="flex items-start justify-between">
              <h1 className="text-xl font-bold text-gray-900">{shift.shift_type}</h1>
              <Badge status={shift.status} />
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

        {/* Applicants */}
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
                  shiftFilled={isFilled || isCancelled}
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

      {/* Cancel modal */}
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
    </PageWrapper>
  );
}

function ApplicantCard({ app, shiftFilled, onApprove, onReject, approving, rejecting, t }) {
  const co = app.users;
  const profile = app.co_profiles;
  const isApproved = app.status === 'approved';

  return (
    <Card className={`p-5 transition-all ${isApproved ? 'border-emerald-200 bg-emerald-50/20' : ''}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full bg-gradient-to-br from-teal-500 to-emerald-500 flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-sm">
            {co?.display_name?.[0]?.toUpperCase() || '?'}
          </div>
          <div>
            <p className="font-bold text-gray-900">{co?.display_name}</p>
            <p className="text-sm text-gray-500">{profile?.specialization || 'General Practice'} · {t('common.license')} {profile?.license_number}</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {t('co.applied')} {new Date(app.applied_at).toLocaleDateString('en-TZ', { day: 'numeric', month: 'short' })}
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

      {app.status === 'pending' && !shiftFilled && (
        <div className="flex gap-2 mt-4">
          <Button size="sm" className="flex-1" loading={approving} disabled={rejecting} onClick={onApprove}>
            <CheckCircle className="w-4 h-4" /> {t('facility.approve')}
          </Button>
          <Button variant="secondary" size="sm" className="flex-1" loading={rejecting} disabled={approving} onClick={onReject}>
            <XCircle className="w-4 h-4" /> {t('facility.reject')}
          </Button>
        </div>
      )}
    </Card>
  );
}

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
        <div className="bg-gray-100 rounded-2xl h-64" />
        <div className="lg:col-span-2 space-y-3">
          {[1,2,3].map(i => <div key={i} className="bg-gray-100 rounded-2xl h-24" />)}
        </div>
      </div>
    </div>
  );
}
