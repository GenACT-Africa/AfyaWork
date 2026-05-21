import { useEffect, useState, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, CalendarDays, Clock, Banknote, Users, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
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
  const navigate = useNavigate();
  const { show, ToastComponent } = useToast();

  const [shift, setShift] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const [cancelModal, setCancelModal] = useState(false);

  const loadShift = useCallback(async () => {
    const { data, error } = await getShiftWithApplicants(id);
    if (error || !data) { navigate('/facility/shifts'); return; }
    // Security: only the owning facility can view this detail page
    if (data.facility_id !== user?.id) { navigate('/facility/shifts'); return; }
    setShift(data);
    setLoading(false);
  }, [id, user?.id, navigate]);

  useEffect(() => { loadShift(); }, [loadShift]);

  // Realtime: refresh applicant list when new application arrives
  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`shift-${id}-applications`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'applications', filter: `shift_id=eq.${id}` },
        () => loadShift()
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [id, loadShift]);

  async function handleApprove(applicationId) {
    setActionLoading(applicationId);
    const { error } = await approveApplication(applicationId);
    setActionLoading(null);
    if (error) { show(error.message || 'Failed to approve. Try again.', 'error'); return; }
    show('CO approved! Shift is now filled.');
    loadShift();
  }

  async function handleReject(applicationId) {
    setActionLoading(`reject-${applicationId}`);
    const { error } = await rejectApplication(applicationId);
    setActionLoading(null);
    if (error) { show(error.message || 'Failed to reject.', 'error'); return; }
    show('Applicant rejected.');
    loadShift();
  }

  async function handleCancel() {
    setActionLoading('cancel');
    const { error } = await cancelShift(id);
    setActionLoading(null);
    setCancelModal(false);
    if (error) { show(error.message, 'error'); return; }
    show('Shift cancelled.');
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

      {/* Back */}
      <Link to="/facility/shifts" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-teal-600 mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to shifts
      </Link>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Shift info */}
        <div className="lg:col-span-1 space-y-4">
          <Card className="p-5 space-y-4">
            <div className="flex items-start justify-between">
              <h1 className="text-xl font-bold text-gray-900">{shift.shift_type}</h1>
              <Badge status={shift.status} />
            </div>

            <InfoRow icon={CalendarDays} label="Date"
              value={new Date(shift.shift_date + 'T00:00:00').toLocaleDateString('en-TZ', {
                weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
              })}
            />
            <InfoRow icon={Banknote} label="CO Pay" value={`TZS ${shift.pay_amount.toLocaleString()}`} />
            <InfoRow icon={Users} label="Applicants" value={applicants.length} />
            <InfoRow icon={Clock} label="Posted"
              value={new Date(shift.created_at).toLocaleDateString('en-TZ', { day: 'numeric', month: 'short', year: 'numeric' })}
            />

            {shift.description && (
              <div className="bg-gray-50 rounded-lg px-3 py-2 text-sm text-gray-600">
                <p className="text-xs font-medium text-gray-400 mb-1 uppercase tracking-wide">Notes</p>
                {shift.description}
              </div>
            )}

            {isOpen && (
              <Button
                variant="danger"
                size="sm"
                className="w-full"
                onClick={() => setCancelModal(true)}
              >
                Cancel Shift
              </Button>
            )}
          </Card>
        </div>

        {/* Applicants */}
        <div className="lg:col-span-2">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Applicants ({applicants.length})
          </h2>

          {applicants.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-xl border border-dashed border-gray-300">
              <Users className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="font-medium text-gray-700">No applicants yet</p>
              <p className="text-sm text-gray-400 mt-1">Clinical Officers will appear here once they apply.</p>
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
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Cancel confirm modal */}
      {cancelModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <h2 className="text-lg font-bold text-gray-900">Cancel Shift?</h2>
            </div>
            <p className="text-sm text-gray-500 mb-5">
              This will cancel the shift and notify all applicants. This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setCancelModal(false)} disabled={actionLoading === 'cancel'}>
                Keep Shift
              </Button>
              <Button variant="danger" className="flex-1" loading={actionLoading === 'cancel'} onClick={handleCancel}>
                Yes, Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </PageWrapper>
  );
}

function ApplicantCard({ app, shiftFilled, onApprove, onReject, approving, rejecting }) {
  const co = app.users;
  const profile = app.co_profiles;
  const isApproved = app.status === 'approved';
  const isRejected = app.status === 'rejected';

  return (
    <Card className={`p-5 ${isApproved ? 'border-green-300 bg-green-50/20' : ''}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 font-bold text-sm shrink-0">
            {co?.display_name?.[0]?.toUpperCase() || '?'}
          </div>
          <div>
            <p className="font-semibold text-gray-900">{co?.display_name}</p>
            <p className="text-sm text-gray-500">{profile?.specialization || 'General Practice'} · License {profile?.license_number}</p>
            <p className="text-xs text-gray-400 mt-0.5">
              Applied {new Date(app.applied_at).toLocaleDateString('en-TZ', { day: 'numeric', month: 'short' })} at{' '}
              {new Date(app.applied_at).toLocaleTimeString('en-TZ', { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        </div>
        <Badge status={app.status} />
      </div>

      {/* Contact info — only shown when approved */}
      {isApproved && (co?.email || co?.phone) && (
        <div className="mt-3 pt-3 border-t border-green-200 text-sm text-green-800 space-y-1">
          {co.email && <p>Email: <a href={`mailto:${co.email}`} className="underline">{co.email}</a></p>}
          {co.phone && <p>Phone: <a href={`tel:${co.phone}`} className="underline">{co.phone}</a></p>}
        </div>
      )}

      {/* Actions — only when pending and shift is open */}
      {app.status === 'pending' && !shiftFilled && (
        <div className="flex gap-2 mt-4">
          <Button
            size="sm"
            className="flex-1"
            loading={approving}
            disabled={rejecting}
            onClick={onApprove}
          >
            <CheckCircle className="w-4 h-4 mr-1" /> Approve
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="flex-1"
            loading={rejecting}
            disabled={approving}
            onClick={onReject}
          >
            <XCircle className="w-4 h-4 mr-1" /> Reject
          </Button>
        </div>
      )}
    </Card>
  );
}

function InfoRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <Icon className="w-4 h-4 text-gray-400 shrink-0" />
      <span className="text-gray-500">{label}:</span>
      <span className="font-medium text-gray-800">{value}</span>
    </div>
  );
}

function ShiftDetailSkeleton() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-8 animate-pulse space-y-6">
      <div className="h-4 w-24 bg-gray-200 rounded" />
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="bg-gray-100 rounded-xl h-64" />
        <div className="lg:col-span-2 space-y-3">
          {[1,2,3].map(i => <div key={i} className="bg-gray-100 rounded-xl h-24" />)}
        </div>
      </div>
    </div>
  );
}
