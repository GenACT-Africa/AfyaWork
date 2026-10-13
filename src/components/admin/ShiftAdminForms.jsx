import { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '../common/Button';
import { Input, Select, Textarea } from '../common/Input';
import { SHIFT_TYPES, todayEAT } from './shiftAdminUtils';

export function Modal({ title, subtitle, onClose, children, wide = false }) {
  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className={`bg-white rounded-2xl shadow-2xl w-full ${wide ? 'max-w-lg' : 'max-w-md'} max-h-[90vh] overflow-y-auto`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{title}</h2>
            {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100" aria-label="Close">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

/**
 * Create (with facility picker) or edit a shift.
 * `initial` = shift row when editing; `facilities` = options when creating.
 */
export function ShiftFormModal({ initial, facilities, onSubmit, onClose }) {
  const editing = !!initial;
  const [form, setForm] = useState({
    facility_id: initial?.facility_id || '',
    shift_date:  initial?.shift_date || '',
    shift_type:  initial?.shift_type || '',
    pay_amount:  initial?.pay_amount ?? '',
    description: initial?.description || '',
    note: '',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const hasCO = !!initial?.assigned_co_id;

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!editing && !form.facility_id) { setError('Choose a facility.'); return; }
    if (!form.shift_date || !form.shift_type) { setError('Date and shift type are required.'); return; }
    const pay = Number(form.pay_amount);
    if (!pay || pay < 10000 || pay > 500000) { setError('CO pay must be between TZS 10,000 and 500,000.'); return; }
    if ((form.description || '').length > 500) { setError('Notes can be at most 500 characters.'); return; }
    setSaving(true);
    const { error: err } = await onSubmit(form);
    setSaving(false);
    if (err) { setError(err.message); return; }
    onClose();
  }

  return (
    <Modal
      title={editing ? 'Edit shift' : 'Post a shift for a facility'}
      subtitle={editing
        ? (hasCO ? 'The selected CO, the facility and pending applicants are notified.' : 'The facility and pending applicants are notified.')
        : 'The facility is notified and COs see it like any other open shift.'}
      onClose={onClose}
      wide
    >
      <form onSubmit={submit} className="space-y-4">
        {!editing && (
          <Select label="Facility" value={form.facility_id} onChange={set('facility_id')} required>
            <option value="">Choose a facility…</option>
            {(facilities || []).map((f) => (
              <option key={f.user_id} value={f.user_id}>
                {f.facility_name}{f.address ? ` — ${f.address}` : ''}{f.verified ? ' ✓' : ''}
              </option>
            ))}
          </Select>
        )}
        <div className="grid sm:grid-cols-2 gap-4">
          <Input label="Date" type="date" min={todayEAT()} value={form.shift_date} onChange={set('shift_date')} required />
          <Select label="Shift type" value={form.shift_type} onChange={set('shift_type')} required>
            <option value="">Select…</option>
            {SHIFT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
        </div>
        <Input label="CO pay (TZS)" type="number" min="10000" max="500000" step="1000" value={form.pay_amount} onChange={set('pay_amount')} required />
        <Textarea label="Notes for COs" rows={3} maxLength={500} value={form.description} onChange={set('description')} />
        <Input
          label={editing ? 'Reason for the change (shown to the facility and COs)' : 'Internal note (optional)'}
          value={form.note}
          onChange={set('note')}
          placeholder={editing ? 'e.g. Facility asked to move to Saturday' : 'e.g. Requested by phone, Dr Mushi'}
        />
        {editing && hasCO && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            A CO is already selected. Agree any change with them first; if they can no longer take it, use Remove CO.
          </p>
        )}
        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 px-4 py-3 rounded-xl">{error}</p>}
        <div className="flex gap-3 pt-1">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button type="submit" className="flex-1" loading={saving}>{editing ? 'Save changes' : 'Post shift'}</Button>
        </div>
      </form>
    </Modal>
  );
}

/** Confirm an action, with an optional / required reason. */
export function ConfirmModal({ title, body, reasonLabel, reasonRequired = false, confirmLabel, danger = false, onConfirm, onClose }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function go() {
    setError('');
    if (reasonRequired && !reason.trim()) { setError('Please give a reason.'); return; }
    setBusy(true);
    const { error: err } = await onConfirm(reason.trim());
    setBusy(false);
    if (err) { setError(err.message); return; }
    onClose();
  }

  return (
    <Modal title={title} onClose={onClose}>
      <div className="space-y-4">
        {body && <div className="text-sm text-gray-600 leading-relaxed">{body}</div>}
        {reasonLabel && (
          <Textarea
            label={`${reasonLabel}${reasonRequired ? '' : ' (optional)'}`}
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        )}
        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 px-4 py-3 rounded-xl">{error}</p>}
        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={onClose} disabled={busy}>Back</Button>
          <Button variant={danger ? 'danger' : 'primary'} className="flex-1" loading={busy} onClick={go}>{confirmLabel}</Button>
        </div>
      </div>
    </Modal>
  );
}
