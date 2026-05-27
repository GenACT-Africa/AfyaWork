import { useEffect, useState, useCallback } from 'react';
import {
  Wallet, RefreshCw, CheckCircle2, Clock, AlertTriangle,
  TrendingUp, Settings, FileText, ChevronDown,
  ChevronUp, Send, DollarSign, RotateCcw, X, Save,
} from 'lucide-react';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { Button } from '../../components/common/Button';
import { Input, Select } from '../../components/common/Input';
import { useToast } from '../../components/common/Toast';
import {
  getAdminPaymentOverview, getAdminPayments, getAdminInvoices,
  getSystemConfig, updateSystemConfig,
  adminRetryPayment, adminTriggerInvoiceGeneration,
  adminMarkInvoicePaid, adminMarkInvoiceSent, adminMarkInvoiceOverdue,
  getInvoiceLineItems,
  adminApprovePayment, adminApproveAllPending, adminMarkPaymentPaid,
} from '../../lib/api';

// ── Constants ─────────────────────────────────────────────────────

const PROVIDER_LABELS = {
  mpesa:        'M-Pesa',
  mixx_by_yas:  'Mixx by Yas',
  airtel_money: 'Airtel Money',
  halopesa:     'Halopesa',
  bank_transfer: 'Bank Transfer',
  cash:         'Cash',
};

const INVOICE_STATUS_COLORS = {
  draft:   'bg-gray-100 text-gray-600',
  sent:    'bg-blue-100 text-blue-700',
  paid:    'bg-emerald-100 text-emerald-700',
  overdue: 'bg-red-100 text-red-700',
};

const PAYMENT_STATUS_COLORS = {
  pending:    'bg-gray-100 text-gray-600',
  scheduled:  'bg-blue-100 text-blue-700',
  processing: 'bg-indigo-100 text-indigo-700',
  disbursed:  'bg-emerald-100 text-emerald-700',
  failed:     'bg-red-100 text-red-700',
  held:       'bg-amber-100 text-amber-700',
  cancelled:  'bg-gray-100 text-gray-400',
};

// ── Small helpers ─────────────────────────────────────────────────

function StatusPill({ status, map = PAYMENT_STATUS_COLORS }) {
  const cls = map[status] || 'bg-gray-100 text-gray-500';
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${cls}`}>{status?.replace(/_/g, ' ')}</span>;
}

function fmt(n) { return Number(n || 0).toLocaleString(); }

function SectionHeader({ children, count }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">{children}</h2>
      {count !== undefined && (
        <span className="text-xs font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{count}</span>
      )}
    </div>
  );
}

// ── Tab: Disbursements ────────────────────────────────────────────

const PAYMENT_METHODS = [
  { value: 'mpesa',        label: 'M-Pesa' },
  { value: 'mixx_by_yas',  label: 'Mixx by Yas' },
  { value: 'airtel_money', label: 'Airtel Money' },
  { value: 'halopesa',     label: 'Halopesa' },
  { value: 'bank',         label: 'Bank Transfer' },
  { value: 'cash',         label: 'Cash' },
  { value: 'other',        label: 'Other' },
];

function PaymentRow({ p, actionSlot }) {
  return (
    <tr className="hover:bg-gray-50/60 transition-colors">
      <td className="px-4 py-3 font-semibold text-gray-900 whitespace-nowrap">{p.co?.display_name ?? '—'}</td>
      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{p.facility?.facility_name ?? '—'}</td>
      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{p.shift?.shift_date ?? '—'}</td>
      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{p.shift?.shift_type ?? '—'}</td>
      <td className="px-4 py-3 font-bold text-gray-900 whitespace-nowrap">TZS {fmt(p.adjusted_pay_amount ?? p.co_total_pay)}</td>
      <td className="px-4 py-3 whitespace-nowrap">
        {p.mobile_money_provider ? (
          <span className="text-xs text-gray-600">
            {PROVIDER_LABELS[p.mobile_money_provider]} ···{p.mobile_money_number?.slice(-4)}
          </span>
        ) : (
          <span className="text-xs text-red-500 font-medium">⚠ No details</span>
        )}
      </td>
      <td className="px-4 py-3">{actionSlot}</td>
    </tr>
  );
}

function PaymentTable({ payments, accent = 'gray', children }) {
  return (
    <div className={`bg-white rounded-2xl border shadow-sm overflow-x-auto ${
      accent === 'amber' ? 'border-amber-100' :
      accent === 'blue'  ? 'border-blue-100'  : 'border-gray-100'
    }`}>
      <table className="w-full text-sm min-w-[700px]">
        <thead className={`border-b ${
          accent === 'amber' ? 'bg-amber-50 border-amber-100' :
          accent === 'blue'  ? 'bg-blue-50  border-blue-100'  : 'bg-gray-50 border-gray-100'
        }`}>
          <tr>
            {['CO', 'Facility', 'Shift Date', 'Shift Type', 'Amount', 'Payment Details', ''].map((h) => (
              <th key={h} className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide whitespace-nowrap ${
                accent === 'amber' ? 'text-amber-700' :
                accent === 'blue'  ? 'text-blue-700'  : 'text-gray-400'
              }`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">{children}</tbody>
        <tfoot className={`border-t ${
          accent === 'amber' ? 'bg-amber-50/50 border-amber-100' :
          accent === 'blue'  ? 'bg-blue-50/50  border-blue-100'  : 'bg-gray-50 border-gray-100'
        }`}>
          <tr>
            <td colSpan={4} className="px-4 py-3 text-xs font-semibold text-gray-500 text-right">Total</td>
            <td className="px-4 py-3 font-bold text-gray-900">
              TZS {fmt(payments.reduce((s, p) => s + (p.adjusted_pay_amount ?? p.co_total_pay ?? 0), 0))}
            </td>
            <td colSpan={2} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function DisbursementsTab() {
  const { show, ToastComponent } = useToast();
  const [overview,   setOverview]  = useState({ stats: {} });
  const [pending,    setPending]   = useState([]);
  const [scheduled,  setScheduled] = useState([]);
  const [held,       setHeld]      = useState([]);
  const [failed,     setFailed]    = useState([]);
  const [recent,     setRecent]    = useState([]);
  const [loading,    setLoading]   = useState(true);
  const [approving,  setApproving] = useState(null);
  const [markPaidId, setMarkPaidId] = useState(null);
  const [marking,    setMarking]   = useState(false);
  const [paidForm,   setPaidForm]  = useState({ method: 'mpesa', reference: '', notes: '' });

  async function load() {
    setLoading(true);
    const [
      overviewData,
      { data: pendingData },
      { data: scheduledData },
      { data: heldData },
      { data: failedData },
      { data: recentData },
    ] = await Promise.all([
      getAdminPaymentOverview(),
      getAdminPayments({ status: 'pending' }),
      getAdminPayments({ status: 'scheduled' }),
      getAdminPayments({ status: 'held' }),
      getAdminPayments({ status: 'failed' }),
      getAdminPayments({ status: 'disbursed' }),
    ]);
    setOverview(overviewData);
    setPending(pendingData   || []);
    setScheduled(scheduledData || []);
    setHeld(heldData         || []);
    setFailed(failedData     || []);
    setRecent((recentData    || []).slice(0, 20));
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleApprove(paymentId) {
    setApproving(paymentId);
    const { error } = await adminApprovePayment(paymentId);
    setApproving(null);
    if (error) { show('Failed: ' + error.message, 'error'); return; }
    show('Approved — moved to "To Pay" queue.');
    load();
  }

  async function handleApproveAll() {
    if (!window.confirm(`Approve all ${pending.length} pending payment${pending.length !== 1 ? 's' : ''}?`)) return;
    setApproving('all');
    const { error } = await adminApproveAllPending();
    setApproving(null);
    if (error) { show('Bulk approval failed: ' + error.message, 'error'); return; }
    show(`${pending.length} payment${pending.length !== 1 ? 's' : ''} approved.`);
    load();
  }

  async function handleMarkPaid() {
    if (!markPaidId) return;
    setMarking(true);
    const { error } = await adminMarkPaymentPaid(markPaidId, paidForm);
    setMarking(false);
    if (error) { show('Failed: ' + error.message, 'error'); return; }
    setMarkPaidId(null);
    setPaidForm({ method: 'mpesa', reference: '', notes: '' });
    show('Payment recorded as paid. CO will be notified.');
    load();
  }

  const s = overview.stats;

  return (
    <div className="space-y-8">
      {ToastComponent}

      {/* ── Top bar ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-gray-500">
          <span className="font-semibold text-amber-700">{pending.length}</span> awaiting review
          {' · '}
          <span className="font-semibold text-blue-700">{scheduled.length}</span> approved, ready to pay
        </p>
        <Button variant="secondary" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total paid out',      value: `TZS ${fmt(s.total_disbursed)}`,      icon: TrendingUp,    color: 'text-emerald-600 bg-emerald-50' },
          { label: 'Paid this month',     value: `TZS ${fmt(s.disbursed_this_month)}`,  icon: CheckCircle2,  color: 'text-teal-600 bg-teal-50' },
          { label: 'Approved to pay',     value: `TZS ${fmt(s.upcoming_total)}`,        icon: Clock,         color: 'text-blue-600 bg-blue-50' },
          { label: 'On hold (disputes)',  value: `TZS ${fmt(s.held_total)}`,            icon: AlertTriangle, color: 'text-amber-600 bg-amber-50' },
        ].map((card) => (
          <div key={card.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${card.color.split(' ')[1]}`}>
              <card.icon className={`w-4 h-4 ${card.color.split(' ')[0]}`} />
            </div>
            <p className="text-xl font-bold text-gray-900">{card.value}</p>
            <p className="text-xs text-gray-500 font-medium mt-0.5">{card.label}</p>
          </div>
        ))}
      </div>

      {/* ── Step 1: Pending review ── */}
      <div>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <SectionHeader count={pending.length}>Step 1 — Review &amp; Approve</SectionHeader>
          {pending.length > 1 && (
            <Button size="sm" loading={approving === 'all'} onClick={handleApproveAll}>
              <CheckCircle2 className="w-4 h-4" /> Approve All ({pending.length})
            </Button>
          )}
        </div>
        {loading ? (
          <div className="space-y-2">{Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-14 bg-gray-100 rounded-2xl animate-pulse" />)}</div>
        ) : pending.length === 0 ? (
          <div className="text-center py-8 bg-white rounded-2xl border border-dashed border-gray-200">
            <CheckCircle2 className="w-7 h-7 text-gray-200 mx-auto mb-2" />
            <p className="text-sm text-gray-400">No payments waiting for review</p>
          </div>
        ) : (
          <PaymentTable payments={pending} accent="amber">
            {pending.map((p) => (
              <PaymentRow key={p.id} p={p} actionSlot={
                <Button size="sm" loading={approving === p.id} disabled={!!approving && approving !== p.id} onClick={() => handleApprove(p.id)}>
                  <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                </Button>
              } />
            ))}
          </PaymentTable>
        )}
      </div>

      {/* ── Step 2: Approved — ready to pay ── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <SectionHeader count={scheduled.length}>Step 2 — Pay &amp; Record</SectionHeader>
        </div>
        <p className="text-xs text-gray-400 -mt-2 mb-3">Pay each CO outside the platform, then click "Mark Paid" to record it here.</p>
        {!loading && scheduled.length === 0 ? (
          <div className="text-center py-8 bg-white rounded-2xl border border-dashed border-gray-200">
            <Wallet className="w-7 h-7 text-gray-200 mx-auto mb-2" />
            <p className="text-sm text-gray-400">No approved payments yet — approve from Step 1 first</p>
          </div>
        ) : !loading && (
          <PaymentTable payments={scheduled} accent="blue">
            {scheduled.map((p) => (
              <PaymentRow key={p.id} p={p} actionSlot={
                <Button size="sm" onClick={() => { setMarkPaidId(p.id); setPaidForm({ method: p.mobile_money_provider || 'mpesa', reference: '', notes: '' }); }}>
                  <DollarSign className="w-3.5 h-3.5" /> Mark Paid
                </Button>
              } />
            ))}
          </PaymentTable>
        )}
      </div>

      {/* ── Held (disputed) ── */}
      {held.length > 0 && (
        <div>
          <SectionHeader count={held.length}>On Hold — Disputed Shifts</SectionHeader>
          <div className="space-y-2">
            {held.map((p) => (
              <div key={p.id} className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 flex-wrap gap-3">
                <div>
                  <p className="font-semibold text-gray-900">{p.co?.display_name ?? '—'}</p>
                  <p className="text-sm text-gray-500">{p.facility?.facility_name ?? '—'} · {p.shift?.shift_date ?? '—'}</p>
                  <p className="text-xs text-amber-700 mt-0.5">{p.hold_reason?.replace(/_/g, ' ') ?? 'Dispute pending'}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-gray-900">TZS {fmt(p.adjusted_pay_amount ?? p.co_total_pay)}</p>
                  <p className="text-xs text-amber-600">Releases on dispute resolution</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Failed ── */}
      {failed.length > 0 && (
        <div>
          <SectionHeader count={failed.length}>Failed — Needs Attention</SectionHeader>
          <div className="space-y-2">
            {failed.map((p) => (
              <div key={p.id} className="flex items-center justify-between bg-red-50 border border-red-200 rounded-2xl px-5 py-4 flex-wrap gap-3">
                <div>
                  <p className="font-semibold text-gray-900">{p.co?.display_name ?? '—'}</p>
                  <p className="text-sm text-gray-500">{p.facility?.facility_name ?? '—'} · {p.shift?.shift_date ?? '—'}</p>
                  <p className="text-xs text-red-600 mt-0.5">{p.failure_reason ?? 'Unknown reason'}</p>
                </div>
                <div className="flex items-center gap-3">
                  <p className="font-bold text-gray-900">TZS {fmt(p.adjusted_pay_amount ?? p.co_total_pay)}</p>
                  <Button size="sm" onClick={() => { setMarkPaidId(p.id); setPaidForm({ method: p.mobile_money_provider || 'mpesa', reference: '', notes: '' }); }}>
                    <DollarSign className="w-3.5 h-3.5" /> Mark Paid
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Recent paid ── */}
      {recent.length > 0 && (
        <div>
          <SectionHeader>Recently Paid</SectionHeader>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {['CO', 'Facility', 'Shift Date', 'Amount', 'Payment Details', 'Paid On'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {recent.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{p.co?.display_name ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{p.facility?.facility_name ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{p.shift?.shift_date ?? '—'}</td>
                    <td className="px-4 py-3 font-semibold text-gray-900 whitespace-nowrap">TZS {fmt(p.adjusted_pay_amount ?? p.co_total_pay)}</td>
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                      {p.selcom_response_description
                        ? p.selcom_response_description
                        : p.mobile_money_provider
                          ? `${PROVIDER_LABELS[p.mobile_money_provider]} ···${p.mobile_money_number?.slice(-4)}`
                          : '—'}
                      {p.selcom_transaction_ref && <span className="ml-1 font-mono text-gray-400">· {p.selcom_transaction_ref}</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                      {p.disbursed_at ? new Date(p.disbursed_at).toLocaleDateString('en-TZ', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Mark Paid modal ── */}
      {markPaidId && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">Record Payment</h2>
              <button onClick={() => setMarkPaidId(null)} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-500">Record how you paid this CO outside the platform.</p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
                <Select value={paidForm.method} onChange={(e) => setPaidForm((f) => ({ ...f, method: e.target.value }))}>
                  {PAYMENT_METHODS.map(({ value, label }) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </Select>
              </div>
              <Input
                label="Transaction Reference (optional)"
                value={paidForm.reference}
                onChange={(e) => setPaidForm((f) => ({ ...f, reference: e.target.value }))}
                placeholder="e.g. M-Pesa transaction ID, bank ref…"
              />
              <Input
                label="Notes (optional)"
                value={paidForm.notes}
                onChange={(e) => setPaidForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Any notes about this payment"
              />
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
              <Button variant="secondary" onClick={() => setMarkPaidId(null)}>Cancel</Button>
              <Button loading={marking} onClick={handleMarkPaid}>
                <CheckCircle2 className="w-4 h-4" /> Confirm Payment Sent
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab: Invoices ─────────────────────────────────────────────────

function InvoicesTab() {
  const { show, ToastComponent } = useToast();
  const [invoices,     setInvoices]     = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [filter,       setFilter]       = useState('all');
  const [generating,   setGenerating]   = useState(false);
  const [markPaidId,   setMarkPaidId]   = useState(null);
  const [expandedId,   setExpandedId]   = useState(null);
  const [lineItems,    setLineItems]    = useState({});
  const [payForm,      setPayForm]      = useState({ amount: '', method: 'mpesa', reference: '' });

  async function load() {
    setLoading(true);
    const { data } = await getAdminInvoices(filter !== 'all' ? { status: filter } : {});
    setInvoices(data || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [filter]);

  async function handleGenerate() {
    const now = new Date();
    // Generate for previous month by default
    let m = now.getMonth(); // 0-based
    let y = now.getFullYear();
    if (m === 0) { m = 11; y -= 1; } else { m -= 1; }
    setGenerating(true);
    const { error } = await adminTriggerInvoiceGeneration(y, m + 1); // 1-based
    setGenerating(false);
    if (error) { show('Generation failed: ' + error.message, 'error'); return; }
    show('Invoices generated and sent to facilities.');
    load();
  }

  async function handleMarkSent(invoiceId) {
    await adminMarkInvoiceSent(invoiceId);
    show('Invoice marked as sent.');
    load();
  }

  async function handleMarkPaid() {
    if (!payForm.amount) { show('Enter the amount received.', 'error'); return; }
    await adminMarkInvoicePaid(markPaidId, {
      amount:    parseInt(payForm.amount, 10),
      method:    payForm.method,
      reference: payForm.reference,
    });
    setMarkPaidId(null);
    setPayForm({ amount: '', method: 'mpesa', reference: '' });
    show('Invoice marked as paid.');
    load();
  }

  async function toggleLines(invoiceId) {
    if (expandedId === invoiceId) { setExpandedId(null); return; }
    setExpandedId(invoiceId);
    if (!lineItems[invoiceId]) {
      const { data } = await getInvoiceLineItems(invoiceId);
      setLineItems((prev) => ({ ...prev, [invoiceId]: data || [] }));
    }
  }

  const outstanding = invoices
    .filter((inv) => ['sent', 'overdue'].includes(inv.invoice_status))
    .reduce((s, inv) => s + (inv.grand_total || 0), 0);

  const collectedThisMonth = invoices
    .filter((inv) => inv.invoice_status === 'paid' && inv.paid_at && new Date(inv.paid_at) >= new Date(new Date().getFullYear(), new Date().getMonth(), 1))
    .reduce((s, inv) => s + (inv.amount_received || 0), 0);

  return (
    <div className="space-y-6">
      {ToastComponent}

      {/* ── Summary ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {[
          { label: 'Outstanding Balance', value: `TZS ${fmt(outstanding)}`,        icon: DollarSign, color: 'text-amber-600 bg-amber-50' },
          { label: 'Collected This Month', value: `TZS ${fmt(collectedThisMonth)}`, icon: TrendingUp, color: 'text-emerald-600 bg-emerald-50' },
          { label: 'Total Invoices',       value: invoices.length,                  icon: FileText,   color: 'text-blue-600 bg-blue-50' },
        ].map((card) => (
          <div key={card.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${card.color.split(' ')[1]}`}>
              <card.icon className={`w-4 h-4 ${card.color.split(' ')[0]}`} />
            </div>
            <p className="text-xl font-bold text-gray-900">{card.value}</p>
            <p className="text-xs text-gray-500 font-medium mt-0.5">{card.label}</p>
          </div>
        ))}
      </div>

      {/* ── Actions ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        {/* Status filter */}
        <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-xl p-1">
          {['all', 'draft', 'sent', 'paid', 'overdue'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors capitalize ${
                filter === f ? 'bg-teal-600 text-white' : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <Button onClick={handleGenerate} loading={generating}>
          <Calendar className="w-4 h-4" />
          Generate Last Month's Invoices
        </Button>
      </div>

      {/* ── Invoice list ── */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-20 bg-gray-100 rounded-2xl animate-pulse" />)}
        </div>
      ) : invoices.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-gray-200">
          <FileText className="w-10 h-10 text-gray-200 mx-auto mb-3" />
          <p className="text-sm text-gray-400">No invoices found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {invoices.map((inv) => (
            <div key={inv.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 flex-wrap gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-gray-900">{inv.facility?.facility_name ?? '—'}</p>
                    <span className="text-xs text-gray-400 font-mono">{inv.invoice_number}</span>
                    <StatusPill status={inv.invoice_status} map={INVOICE_STATUS_COLORS} />
                  </div>
                  <p className="text-sm text-gray-400 mt-0.5">
                    {new Date(inv.invoice_period_start).toLocaleString('en-TZ', { month: 'long', year: 'numeric' })}
                    {' · '}{inv.total_shifts} shift{inv.total_shifts !== 1 ? 's' : ''}
                    {inv.due_date && <> · Due {new Date(inv.due_date + 'T00:00:00').toLocaleDateString('en-TZ', { day: 'numeric', month: 'short' })}</>}
                  </p>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  <p className="font-bold text-gray-900 text-lg">TZS {fmt(inv.grand_total)}</p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleLines(inv.id)}
                      className="text-xs text-teal-600 hover:text-teal-700 font-medium flex items-center gap-1"
                    >
                      {expandedId === inv.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      Details
                    </button>
                    {inv.invoice_status === 'draft' && (
                      <Button size="sm" variant="secondary" onClick={() => handleMarkSent(inv.id)}>
                        <Send className="w-3 h-3" /> Mark Sent
                      </Button>
                    )}
                    {['sent', 'overdue'].includes(inv.invoice_status) && (
                      <Button size="sm" onClick={() => setMarkPaidId(inv.id)}>
                        <CheckCircle2 className="w-3 h-3" /> Mark Paid
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              {/* Line items */}
              {expandedId === inv.id && (
                <div className="border-t border-gray-100 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50">
                      <tr>
                        {['Date', 'CO', 'Shift Type', 'Sched h', 'Appr h', 'Flat Rate', 'Overtime', 'Platform Fee', 'Total'].map((h) => (
                          <th key={h} className="px-4 py-2.5 text-left font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {(lineItems[inv.id] || []).map((line) => (
                        <tr key={line.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2.5 whitespace-nowrap">{line.shift_date}</td>
                          <td className="px-4 py-2.5 font-medium text-gray-900">{line.co_name}</td>
                          <td className="px-4 py-2.5 text-gray-600">{line.shift_type}</td>
                          <td className="px-4 py-2.5 text-gray-600">{line.scheduled_hours}h</td>
                          <td className="px-4 py-2.5 text-gray-600">{line.approved_hours ? `${line.approved_hours}h` : '—'}</td>
                          <td className="px-4 py-2.5">TZS {fmt(line.flat_rate)}</td>
                          <td className="px-4 py-2.5">{line.overtime_pay > 0 ? `TZS ${fmt(line.overtime_pay)}` : '—'}</td>
                          <td className="px-4 py-2.5">TZS {fmt(line.platform_fee)}</td>
                          <td className="px-4 py-2.5 font-bold text-gray-900">TZS {fmt(line.line_total)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50 border-t border-gray-200">
                      <tr>
                        <td colSpan={5} className="px-4 py-3 font-semibold text-gray-600 text-right">Grand Total</td>
                        <td className="px-4 py-3 font-bold text-gray-900">TZS {fmt(inv.total_co_pay)}</td>
                        <td className="px-4 py-3 font-bold text-gray-900">TZS {fmt(inv.total_overtime_pay)}</td>
                        <td className="px-4 py-3 font-bold text-gray-900">TZS {fmt(inv.total_platform_fees)}</td>
                        <td className="px-4 py-3 font-bold text-gray-900 text-base">TZS {fmt(inv.grand_total)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Mark Paid modal ── */}
      {markPaidId && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">Record Payment Received</h2>
              <button onClick={() => setMarkPaidId(null)} className="p-1.5 rounded-lg hover:bg-gray-100">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <Input
                label="Amount Received (TZS) *"
                type="number"
                value={payForm.amount}
                onChange={(e) => setPayForm((f) => ({ ...f, amount: e.target.value }))}
                placeholder="e.g. 850000"
              />
              <Select
                label="Payment Method *"
                value={payForm.method}
                onChange={(e) => setPayForm((f) => ({ ...f, method: e.target.value }))}
              >
                {Object.entries(PROVIDER_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </Select>
              <Input
                label="Transaction Reference (optional)"
                value={payForm.reference}
                onChange={(e) => setPayForm((f) => ({ ...f, reference: e.target.value }))}
                placeholder="M-Pesa transaction ID, bank ref, etc."
              />
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
              <Button variant="secondary" onClick={() => setMarkPaidId(null)}>Cancel</Button>
              <Button onClick={handleMarkPaid}>
                <CheckCircle2 className="w-4 h-4" /> Mark as Paid
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab: Configuration ────────────────────────────────────────────

function ConfigTab() {
  const { show, ToastComponent } = useToast();
  const [config,  setConfig]  = useState({});
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(null);

  useEffect(() => {
    getSystemConfig().then((cfg) => { setConfig(cfg); setLoading(false); });
  }, []);

  function setField(key) {
    return (e) => setConfig((c) => ({ ...c, [key]: e.target.value }));
  }

  async function saveKey(key) {
    setSaving(key);
    const { error } = await updateSystemConfig(key, config[key] ?? '');
    setSaving(null);
    if (error) { show('Save failed: ' + error.message, 'error'); return; }
    show('Saved.');
  }

  async function saveMultiple(keys) {
    setSaving('bulk');
    await Promise.all(keys.map((k) => updateSystemConfig(k, config[k] ?? '')));
    setSaving(null);
    show('Settings saved.');
  }

  if (loading) return <div className="h-40 bg-gray-100 rounded-2xl animate-pulse" />;

  return (
    <div className="space-y-8">
      {ToastComponent}

      {/* ── Platform Rates ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-center gap-2 mb-5">
          <TrendingUp className="w-5 h-5 text-gray-400" />
          <h2 className="font-semibold text-gray-900">Platform Rates</h2>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Input
              label="Overtime Rate (TZS per hour)"
              type="number"
              value={config.platform_overtime_hourly_rate ?? ''}
              onChange={setField('platform_overtime_hourly_rate')}
            />
            <p className="text-xs text-gray-400 mt-1">Applied when approved hours exceed scheduled by ≥60 min</p>
          </div>
          <div>
            <Input
              label="Platform Fee per Shift (TZS)"
              type="number"
              value={config.platform_fee_per_shift ?? ''}
              onChange={setField('platform_fee_per_shift')}
            />
            <p className="text-xs text-gray-400 mt-1">Added to facility invoice — not shown to CO</p>
          </div>
        </div>
        <div className="mt-4">
          <Button
            size="sm"
            loading={saving === 'bulk'}
            onClick={() => saveMultiple(['platform_overtime_hourly_rate', 'platform_fee_per_shift'])}
          >
            <Save className="w-4 h-4" /> Save Rates
          </Button>
        </div>
      </div>

      {/* ── Invoice Settings ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-center gap-2 mb-5">
          <FileText className="w-5 h-5 text-gray-400" />
          <h2 className="font-semibold text-gray-900">Invoice Settings</h2>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <Input
            label="Payment Due Day (of month)"
            type="number"
            min={1} max={28}
            value={config.payment_due_day ?? ''}
            onChange={setField('payment_due_day')}
          />
          <Input
            label="Escalation Day (of month)"
            type="number"
            min={1} max={31}
            value={config.overdue_escalation_day ?? ''}
            onChange={setField('overdue_escalation_day')}
          />
          <Input
            label="Admin Contact Name"
            value={config.invoice_admin_name ?? ''}
            onChange={setField('invoice_admin_name')}
          />
          <Input
            label="Admin WhatsApp Number"
            value={config.invoice_admin_whatsapp ?? ''}
            onChange={setField('invoice_admin_whatsapp')}
            placeholder="+255 7xx xxx xxx"
          />
        </div>
        <div className="mt-4">
          <Button
            size="sm"
            loading={saving === 'bulk'}
            onClick={() => saveMultiple(['payment_due_day', 'overdue_escalation_day', 'invoice_admin_name', 'invoice_admin_whatsapp'])}
          >
            <Save className="w-4 h-4" /> Save Invoice Settings
          </Button>
        </div>
      </div>

      {/* ── Payment Collection Instructions ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-center gap-2 mb-5">
          <Wallet className="w-5 h-5 text-gray-400" />
          <h2 className="font-semibold text-gray-900">Payment Collection (Facility Instructions)</h2>
        </div>
        <p className="text-sm text-gray-500 mb-4">These till/bank details appear on facility invoices.</p>
        <div className="grid sm:grid-cols-2 gap-4">
          <Input label="M-Pesa Till Number"       value={config.mpesa_till_number ?? ''}        onChange={setField('mpesa_till_number')} />
          <Input label="Mixx by Yas Till Number"  value={config.mixx_by_yas_till_number ?? ''}  onChange={setField('mixx_by_yas_till_number')} />
          <Input label="Airtel Money Till Number" value={config.airtel_money_till_number ?? ''} onChange={setField('airtel_money_till_number')} />
          <Input label="Halopesa Till Number"     value={config.halopesa_till_number ?? ''}     onChange={setField('halopesa_till_number')} />
          <Input label="Bank Name"                value={config.bank_name ?? ''}                onChange={setField('bank_name')} />
          <Input label="Bank Account Number"      value={config.bank_account_number ?? ''}      onChange={setField('bank_account_number')} />
          <Input label="Bank Account Name"        value={config.bank_account_name ?? ''}        onChange={setField('bank_account_name')} className="sm:col-span-2" />
        </div>
        <div className="mt-4">
          <Button
            size="sm"
            loading={saving === 'bulk'}
            onClick={() => saveMultiple([
              'mpesa_till_number', 'mixx_by_yas_till_number',
              'airtel_money_till_number', 'halopesa_till_number',
              'bank_name', 'bank_account_number', 'bank_account_name',
            ])}
          >
            <Save className="w-4 h-4" /> Save Collection Details
          </Button>
        </div>
      </div>

    </div>
  );
}

// ── Main Admin Payments page ──────────────────────────────────────

export default function AdminPayments() {
  const [tab, setTab] = useState('disbursements');

  const tabs = [
    { key: 'disbursements', label: 'Disbursements', icon: Wallet },
    { key: 'invoices',      label: 'Invoices',      icon: FileText },
    { key: 'config',        label: 'Config',         icon: Settings },
  ];

  return (
    <PageWrapper
      title="Payments & Disbursements"
      subtitle="Manage CO payouts, facility invoices, and platform configuration"
    >
      {/* Tab bar */}
      <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-xl p-1 mb-8 w-fit">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === key
                ? 'bg-teal-600 text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === 'disbursements' && <DisbursementsTab />}
      {tab === 'invoices'      && <InvoicesTab />}
      {tab === 'config'        && <ConfigTab />}
    </PageWrapper>
  );
}
