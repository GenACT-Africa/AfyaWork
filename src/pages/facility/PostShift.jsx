import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { show, ToastComponent } = useToast();

  const [form, setForm] = useState({ shift_date: '', shift_type: '', pay_amount: '', description: '' });
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
    if (!form.shift_date) errs.shift_date = t('facility.err_date');
    else if (form.shift_date < today) errs.shift_date = t('facility.err_date_past');
    if (!form.shift_type) errs.shift_type = t('facility.err_type');
    const pay = parseInt(form.pay_amount);
    if (!form.pay_amount) errs.pay_amount = t('facility.err_pay');
    else if (isNaN(pay) || pay < 10000) errs.pay_amount = t('facility.err_pay_min');
    else if (pay > 500000) errs.pay_amount = t('facility.err_pay_max');
    if (form.description.length > 500) errs.description = t('facility.err_desc');
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
    navigate('/facility/shifts');
  }

  const fee = form.pay_amount && !isNaN(parseInt(form.pay_amount))
    ? calculateFee(parseInt(form.pay_amount))
    : null;

  return (
    <PageWrapper title={t('facility.post_shift_title')} subtitle={t('facility.post_shift_sub')}>
      {ToastComponent}
      <div className="max-w-xl">
        <Card className="p-6">
          <form onSubmit={handleReview} className="space-y-5">
            <Input label={t('facility.shift_date')} type="date" min={today} value={form.shift_date} onChange={set('shift_date')} error={errors.shift_date} required />

            <Select label={t('facility.shift_type')} value={form.shift_type} onChange={set('shift_type')} error={errors.shift_type} required>
              <option value="">{t('facility.select_shift_type')}</option>
              {SHIFT_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
            </Select>

            <Input label={t('facility.co_pay_label')} type="number" min="10000" max="500000" step="1000" value={form.pay_amount} onChange={set('pay_amount')} error={errors.pay_amount} placeholder="e.g. 35000" required />

            {fee && (
              <div className="flex items-start gap-3 bg-teal-50 border border-teal-100 rounded-xl px-4 py-3 text-sm">
                <Info className="w-4 h-4 text-teal-600 mt-0.5 shrink-0" />
                <div className="text-teal-800">
                  CO receives <strong>TZS {fee.co_pay.toLocaleString()}</strong> · AfyaWork fee <strong>TZS {fee.platform_fee.toLocaleString()}</strong> · You pay <strong>TZS {fee.total_facility_pays.toLocaleString()}</strong>
                </div>
              </div>
            )}

            <Textarea label={t('facility.notes_label')} value={form.description} onChange={set('description')} error={errors.description} placeholder={t('facility.notes_placeholder')} rows={3} />
            {form.description.length > 450 && (
              <p className="text-xs text-gray-400 text-right">{form.description.length}/500</p>
            )}

            <Button type="submit" className="w-full" size="lg">{t('facility.review_confirm')}</Button>
          </form>
        </Card>
      </div>

      {showSummary && fee && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-1">{t('facility.confirm_post')}</h2>
            <p className="text-sm text-gray-500 mb-5">{t('facility.confirm_sub')}</p>

            <div className="bg-gray-50 rounded-2xl p-4 space-y-2.5 mb-5 text-sm border border-gray-100">
              <Row label={t('facility.shift_date')} value={new Date(form.shift_date + 'T00:00:00').toLocaleDateString('en-TZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} />
              <Row label={t('facility.shift_type')} value={form.shift_type} />
              <div className="border-t border-gray-200 pt-2.5 mt-2 space-y-2.5">
                <Row label={t('facility.co_pay')} value={`TZS ${fee.co_pay.toLocaleString()}`} />
                <Row label={t('facility.platform_fee')} value={`TZS ${fee.platform_fee.toLocaleString()}`} />
                <Row label={t('facility.total_you_pay')} value={`TZS ${fee.total_facility_pays.toLocaleString()}`} bold />
              </div>
            </div>

            <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5 text-xs text-amber-800 mb-5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              {t('facility.invoiced')}
            </div>

            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setShowSummary(false)} disabled={loading}>
                {t('facility.edit')}
              </Button>
              <Button className="flex-1" loading={loading} onClick={handleConfirm}>
                {t('facility.post_shift_btn')}
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
    <div className="flex justify-between items-center">
      <span className="text-gray-500">{label}</span>
      <span className={bold ? 'font-bold text-gray-900' : 'text-gray-700 font-medium'}>{value}</span>
    </div>
  );
}
