import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Wallet, TrendingUp, Clock, CheckCircle2, XCircle,
  AlertTriangle, ChevronRight, Smartphone, ArrowRight,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getCOPayments, getCOPaymentStats, getCOMobileMoneyProfile } from '../../lib/api';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { StatCard } from '../../components/common/Card';

// ── Provider display labels ───────────────────────────────────────

const PROVIDER_LABELS = {
  mpesa:        'M-Pesa',
  mixx_by_yas:  'Mixx by Yas',
  airtel_money: 'Airtel Money',
  halopesa:     'Halopesa',
};

// ── Status badge ──────────────────────────────────────────────────

const STATUS_CONFIG = {
  pending:    { label: 'Pending',     cls: 'bg-gray-100 text-gray-600' },
  scheduled:  { label: 'Scheduled',   cls: 'bg-blue-100 text-blue-700' },
  processing: { label: 'Processing',  cls: 'bg-indigo-100 text-indigo-700' },
  disbursed:  { label: 'Paid',        cls: 'bg-emerald-100 text-emerald-700' },
  failed:     { label: 'Failed',      cls: 'bg-red-100 text-red-700' },
  held:       { label: 'On Hold',     cls: 'bg-amber-100 text-amber-700' },
  cancelled:  { label: 'Cancelled',   cls: 'bg-gray-100 text-gray-500' },
  released:   { label: 'Released',    cls: 'bg-teal-100 text-teal-700' },
};

function PaymentStatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

// ── Payment row ───────────────────────────────────────────────────

function PaymentRow({ payment }) {
  const amount     = payment.adjusted_pay_amount ?? payment.co_total_pay ?? 0;
  const shiftDate  = payment.shift?.shift_date;
  const shiftType  = payment.shift?.shift_type ?? '—';
  const facility   = payment.facility?.facility_name ?? '—';

  return (
    <div className="flex items-center justify-between bg-white rounded-2xl border border-gray-100 px-5 py-4 shadow-sm">
      <div className="flex items-center gap-4 min-w-0">
        <div className="hidden sm:flex w-10 h-10 rounded-xl items-center justify-center shrink-0 bg-gradient-to-br from-teal-50 to-emerald-50 border border-teal-100">
          <Wallet className="w-5 h-5 text-teal-600" />
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-gray-900 truncate">{shiftType}</p>
          <p className="text-sm text-gray-400">
            {facility}
            {shiftDate && (
              <> · {new Date(shiftDate + 'T00:00:00').toLocaleDateString('en-TZ', { day: 'numeric', month: 'short', year: 'numeric' })}</>
            )}
          </p>
          {payment.payment_status === 'held' && payment.hold_reason && (
            <p className="text-xs text-amber-600 mt-0.5 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              On hold: {payment.hold_reason.replace(/_/g, ' ')}
            </p>
          )}
          {payment.payment_status === 'failed' && payment.failure_reason && (
            <p className="text-xs text-red-500 mt-0.5">{payment.failure_reason}</p>
          )}
          {payment.payment_status === 'disbursed' && payment.mobile_money_provider && (
            <p className="text-xs text-gray-400 mt-0.5">
              Sent to {PROVIDER_LABELS[payment.mobile_money_provider]} ···{payment.mobile_money_number?.slice(-4)}
              {payment.disbursed_at && (
                <> · {new Date(payment.disbursed_at).toLocaleDateString('en-TZ', { day: 'numeric', month: 'short' })}</>
              )}
            </p>
          )}
          {payment.payment_status === 'scheduled' && (
            <p className="text-xs text-blue-500 mt-0.5">Scheduled for tonight's payment batch</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <div className="text-right">
          <p className="font-bold text-gray-900">TZS {amount.toLocaleString()}</p>
          {payment.overtime_pay > 0 && (
            <p className="text-xs text-teal-600">incl. {((payment.overtime_pay / amount) * 100).toFixed(0)}% overtime</p>
          )}
        </div>
        <PaymentStatusBadge status={payment.payment_status} />
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────

export default function COPayments() {
  const { user } = useAuth();
  const [payments, setPayments] = useState([]);
  const [stats,    setStats]    = useState({ totalEarned: 0, earnedThisMonth: 0, upcoming: 0 });
  const [mmProfile, setMmProfile] = useState(null);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    Promise.all([
      getCOPayments(user.id),
      getCOPaymentStats(user.id),
      getCOMobileMoneyProfile(user.id),
    ]).then(([{ data: p }, statsData, { data: mm }]) => {
      setPayments(p || []);
      setStats(statsData);
      setMmProfile(mm);
    }).finally(() => setLoading(false));
  }, [user?.id]);

  const hasPayments = payments.length > 0;

  // Split into sections
  const activePayments = payments.filter((p) => ['scheduled', 'processing', 'held'].includes(p.payment_status));
  const pastPayments   = payments.filter((p) => ['disbursed', 'failed', 'cancelled'].includes(p.payment_status));

  if (loading) {
    return (
      <PageWrapper title="My Payments" subtitle="Your shift earnings and payment history">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-28 bg-gray-100 rounded-2xl animate-pulse" />
          ))}
        </div>
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 bg-gray-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper
      title="My Payments"
      subtitle="Your shift earnings and disbursement history"
    >
      {/* ── No mobile money warning ── */}
      {!mmProfile && (
        <Link
          to="/co/profile"
          className="flex items-center gap-4 mb-6 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 hover:bg-amber-100 transition-colors group"
        >
          <div className="w-10 h-10 bg-amber-500 rounded-xl flex items-center justify-center shrink-0">
            <Smartphone className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <p className="font-bold text-amber-900">Mobile money details required</p>
            <p className="text-sm text-amber-700 mt-0.5">
              Add your mobile money details to your profile to receive shift payments.
            </p>
          </div>
          <ChevronRight className="w-5 h-5 text-amber-500 group-hover:translate-x-0.5 transition-transform" />
        </Link>
      )}

      {/* ── Mobile money summary ── */}
      {mmProfile && (
        <div className="flex items-center gap-3 mb-6 bg-white border border-gray-100 rounded-2xl px-5 py-3 shadow-sm">
          <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center shrink-0">
            <Smartphone className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900">
              {PROVIDER_LABELS[mmProfile.mobile_money_provider]}
              <span className="text-gray-400 font-normal ml-2">···{mmProfile.mobile_money_number?.slice(-4)}</span>
            </p>
            <p className="text-xs text-gray-400">Payments sent here nightly</p>
          </div>
          <Link
            to="/co/profile"
            className="text-xs text-teal-600 hover:text-teal-700 font-medium flex items-center gap-1 whitespace-nowrap"
          >
            Edit <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      )}

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
        <StatCard
          label="Total Earned"
          value={`TZS ${stats.totalEarned.toLocaleString()}`}
          icon={TrendingUp}
          color="teal"
        />
        <StatCard
          label="This Month"
          value={`TZS ${stats.earnedThisMonth.toLocaleString()}`}
          icon={CheckCircle2}
          color="blue"
        />
        <StatCard
          label="Upcoming"
          value={`TZS ${stats.upcoming.toLocaleString()}`}
          icon={Clock}
          color="purple"
        />
      </div>

      {/* ── Active / Upcoming payments ── */}
      {activePayments.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Upcoming & In Progress</h2>
          <div className="space-y-3">
            {activePayments.map((p) => <PaymentRow key={p.id} payment={p} />)}
          </div>
        </div>
      )}

      {/* ── Payment history ── */}
      <div>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Payment History</h2>

        {!hasPayments ? (
          <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-gray-200">
            <div className="w-16 h-16 bg-gradient-to-br from-teal-50 to-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-teal-100">
              <Wallet className="w-8 h-8 text-teal-400" />
            </div>
            <p className="font-semibold text-gray-700">No payments yet</p>
            <p className="text-sm text-gray-400 mt-1">Payments appear here after your first completed shift.</p>
          </div>
        ) : pastPayments.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-2xl border border-gray-100">
            <p className="text-sm text-gray-400">No completed payments yet — your pending payments are shown above.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pastPayments.map((p) => <PaymentRow key={p.id} payment={p} />)}
          </div>
        )}
      </div>
    </PageWrapper>
  );
}
