import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, Info } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { createShift, calculateFee } from '../../lib/api';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Input, Select, Textarea } from '../../components/common/Input';
import { useToast } from '../../components/common/Toast';

const SHIFT_TYPES = ['Day (8AM-4PM)', 'Evening (4PM-10PM)', 'Night (10PM-6AM)', '24-Hour', 'Weekend'];

const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Dar_es_Salaam' });

export default function PostShift() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { show, ToastComponent } = useToast();

  const [form, setForm] = useState({
    shift_date: '', shift_type: '', pay_amount: '', description: '',
  });
  const [errors, setErrors] = useState({});
  const [showSummary, setShowSummary] = useState(false);
  const [loading, setLoading] = useState(false);

  function set(field) {
    return (e) => {
      setForm((f) => ({ ...f, [field]: e.target.value }));
      setErrors((e) => ({ ...e, [field]: '' }));
    };
  }

  function validate() {
    const errs = {};
    if (!form.shift_date) errs.shift_date = 'Date is required.';
    else if (form.shift_date < today) errs.shift_date = 'Date must be today or in the future.';
    if (!form.shift_type) errs.shift_type = 'Select a shift type.';
    const pay = parseInt(form.pay_amount);
    if (!form.pay_amount) errs.pay_amount = 'CO pay is required.';
    else if (isNaN(pay) || pay < 10000) errs.pay_amount = 'Minimum CO pay is TZS 10,000.';
    else if (pay > 500000) errs.pay_amount = 'Maximum CO pay is TZS 500,000.';
    if (form.description.length > 500) errs.description = 'Maximum 500 characters.';
    return errs;
  }

  function handleReview(e) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setShowSummary(true);
  }

  async function handleConfirm() {
    setLoading(true);
    const { error } = await createShift({
      facility_id: user.id,
      shift_date: form.shift_date,
      shift_type: form.shift_type,
      pay_amount: parseInt(form.pay_amount),
      description: form.description || null,
    });
    setLoading(false);
    if (error) { show(error.message, 'error'); setShowSummary(false); return; }
    show('Shift posted successfully!');
    navigate('/facility/shifts');
  }

  const fee = form.pay_amount && !isNaN(parseInt(form.pay_amount))
    ? calculateFee(parseInt(form.pay_amount))
    : null;

  return (
    <PageWrapper title="Post a Shift" subtitle="Fill in the details below to post a new locum shift.">
      {ToastComponent}

      <div className="max-w-xl">
        <Card className="p-6">
          <form onSubmit={handleReview} className="space-y-5">
            <Input
              label="Shift Date"
              type="date"
              min={today}
              value={form.shift_date}
              onChange={set('shift_date')}
              error={errors.shift_date}
              required
            />

            <Select
              label="Shift Type"
              value={form.shift_type}
              onChange={set('shift_type')}
              error={errors.shift_type}
              required
            >
              <option value="">Select shift type</option>
              {SHIFT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>

            <Input
              label="CO Pay (TZS)"
              type="number"
              min="10000"
              max="500000"
              step="1000"
              value={form.pay_amount}
              onChange={set('pay_amount')}
              error={errors.pay_amount}
              placeholder="e.g. 35000"
              required
            />

            {fee && (
              <div className="flex items-start gap-2 bg-teal-50 border border-teal-200 rounded-lg px-4 py-3 text-sm">
                <Info className="w-4 h-4 text-teal-600 mt-0.5 shrink-0" />
                <div className="text-teal-800">
                  CO receives <strong>TZS {fee.co_pay.toLocaleString()}</strong> · AfyaWork fee <strong>TZS {fee.platform_fee.toLocaleString()}</strong> · You pay <strong>TZS {fee.total_facility_pays.toLocaleString()}</strong>
                </div>
              </div>
            )}

            <Textarea
              label="Notes / Requirements (optional)"
              value={form.description}
              onChange={set('description')}
              error={errors.description}
              placeholder="e.g. Experience with maternity cases preferred"
              rows={3}
            />
            {form.description.length > 450 && (
              <p className="text-xs text-gray-400 text-right">{form.description.length}/500</p>
            )}

            <Button type="submit" className="w-full" size="lg">
              Review & Confirm
            </Button>
          </form>
        </Card>
      </div>

      {/* Cost Summary Modal */}
      {showSummary && fee && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-1">Confirm Shift Post</h2>
            <p className="text-sm text-gray-500 mb-5">Review the cost breakdown before posting.</p>

            <div className="bg-gray-50 rounded-xl p-4 space-y-2 mb-5 text-sm">
              <Row label="Shift Date" value={new Date(form.shift_date + 'T00:00:00').toLocaleDateString('en-TZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} />
              <Row label="Shift Type" value={form.shift_type} />
              <div className="border-t border-gray-200 pt-2 mt-2 space-y-2">
                <Row label="CO Pay" value={`TZS ${fee.co_pay.toLocaleString()}`} />
                <Row label="AfyaWork Fee (18.6%)" value={`TZS ${fee.platform_fee.toLocaleString()}`} />
                <Row label="Total You Pay" value={`TZS ${fee.total_facility_pays.toLocaleString()}`} bold />
              </div>
            </div>

            <div className="flex items-start gap-2 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 text-xs text-yellow-800 mb-5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              Invoiced at month-end. No payment required now.
            </div>

            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setShowSummary(false)} disabled={loading}>
                Edit
              </Button>
              <Button className="flex-1" loading={loading} onClick={handleConfirm}>
                Post Shift
              </Button>
            </div>
          </div>
        </div>
      )}
    </PageWrapper>
  );
}

function Row({ label, value, bold }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500">{label}</span>
      <span className={bold ? 'font-bold text-gray-900' : 'text-gray-700'}>{value}</span>
    </div>
  );
}
