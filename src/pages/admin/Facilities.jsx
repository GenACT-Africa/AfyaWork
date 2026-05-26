import { useEffect, useState } from 'react';
import { Building2, MapPin, Phone, Mail, Search, Plus, Pencil, Trash2, X, Send } from 'lucide-react';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Input, Select } from '../../components/common/Input';
import {
  getAdminFacilities,
  adminCreateFacility,
  adminUpdateFacility,
  adminDeleteUser,
  adminResendInvite,
} from '../../lib/api';

const BLANK = { email: '', facility_name: '', facility_type: '', address: '', phone: '' };

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function StatusBadge({ status }) {
  if (status === 'pending_invite') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 text-xs font-medium border border-amber-200">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
        Invite pending
      </span>
    );
  }
  if (status === 'expired') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-50 text-red-700 text-xs font-medium border border-red-200">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
        Invite expired
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-green-50 text-green-700 text-xs font-medium border border-green-200">
      <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
      Active
    </span>
  );
}

function Modal({ title, subtitle, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{title}</h2>
            {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

export default function AdminFacilities() {
  const [facilities, setFacilities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [modal, setModal] = useState(null); // null | { mode: 'add' | 'edit', userId?: string }
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const [resendingId, setResendingId] = useState(null);
  const [toast, setToast] = useState('');

  async function load() {
    setLoading(true);
    const { data } = await getAdminFacilities();
    setFacilities(data || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  }

  const filtered = facilities.filter((f) => {
    const q = search.toLowerCase();
    return (
      f.facility_name?.toLowerCase().includes(q) ||
      f.facility_type?.toLowerCase().includes(q) ||
      f.address?.toLowerCase().includes(q) ||
      f.users?.email?.toLowerCase().includes(q)
    );
  });

  function set(field) {
    return (e) => setForm((p) => ({ ...p, [field]: e.target.value }));
  }

  function openAdd() {
    setForm(BLANK);
    setFormError('');
    setModal({ mode: 'add' });
  }

  function openEdit(f) {
    setForm({
      email:         f.users?.email || '',
      facility_name: f.facility_name || '',
      facility_type: f.facility_type || '',
      address:       f.address || '',
      phone:         f.users?.phone || '',
    });
    setFormError('');
    setModal({ mode: 'edit', userId: f.user_id });
  }

  async function handleSave(e) {
    e.preventDefault();
    setFormError('');
    if (!form.facility_name.trim()) { setFormError('Facility name is required.'); return; }
    if (modal.mode === 'add' && !form.email.trim()) { setFormError('Email is required.'); return; }

    setSaving(true);
    const { error } = modal.mode === 'add'
      ? await adminCreateFacility(form)
      : await adminUpdateFacility(modal.userId, form);
    setSaving(false);

    if (error) { setFormError(error.message); return; }

    setModal(null);
    load();
    if (modal.mode === 'add') showToast('Facility created — invite email sent.');
  }

  async function handleDelete() {
    setDeleting(true);
    await adminDeleteUser(deleteTarget.user_id);
    setDeleting(false);
    setDeleteTarget(null);
    load();
  }

  async function handleResend(f) {
    setResendingId(f.user_id);
    const { error } = await adminResendInvite(f.user_id);
    setResendingId(null);
    if (error) {
      showToast(`Failed: ${error.message}`);
    } else {
      showToast(`Invite resent to ${f.users?.email}`);
      load();
    }
  }

  return (
    <PageWrapper
      title="Facilities"
      subtitle={`${facilities.length} registered healthcare facilities`}
      action={
        <Button size="sm" onClick={openAdd}>
          <Plus className="w-4 h-4" /> Add Facility
        </Button>
      }
    >
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white text-sm px-5 py-2.5 rounded-xl shadow-lg animate-fade-in">
          {toast}
        </div>
      )}

      {/* Search */}
      <div className="relative mb-6 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search facilities…"
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white shadow-sm"
        />
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-20 bg-gray-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16 text-center">
          <Building2 className="w-10 h-10 text-gray-300 mb-3" />
          <p className="text-gray-500 text-sm">{search ? 'No facilities match your search.' : 'No facilities yet.'}</p>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-gray-100 shadow-sm bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs text-gray-400 uppercase tracking-wider">
                <th className="text-left px-5 py-4 font-semibold">Facility</th>
                <th className="text-left px-5 py-4 font-semibold">Contact</th>
                <th className="text-left px-5 py-4 font-semibold">Status</th>
                <th className="text-left px-5 py-4 font-semibold">Shifts</th>
                <th className="text-left px-5 py-4 font-semibold">Joined</th>
                <th className="px-5 py-4" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((f) => {
                const acctStatus = f.users?.account_status || 'active';
                const isPending = acctStatus === 'pending_invite' || acctStatus === 'expired';
                return (
                  <tr key={f.user_id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-4">
                      <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-500 flex items-center justify-center shrink-0 shadow-sm">
                          <Building2 className="w-4 h-4 text-white" />
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900">{f.facility_name}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{f.facility_type || '—'}</p>
                          {f.address && (
                            <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                              <MapPin className="w-3 h-3" />{f.address}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <p className="flex items-center gap-1.5 text-gray-600">
                        <Mail className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        {f.users?.email || '—'}
                      </p>
                      {f.users?.phone && (
                        <p className="flex items-center gap-1.5 text-gray-500 text-xs mt-1">
                          <Phone className="w-3 h-3 text-gray-400 shrink-0" />
                          {f.users.phone}
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge status={acctStatus} />
                    </td>
                    <td className="px-5 py-4">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-teal-50 text-teal-700 text-xs font-semibold">
                        {f.shift_stats?.open || 0} open
                      </span>
                      <p className="text-xs text-gray-400 mt-1">{f.shift_stats?.total || 0} total</p>
                    </td>
                    <td className="px-5 py-4 text-gray-500 text-xs">{formatDate(f.users?.created_at)}</td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-1 justify-end">
                        {isPending && (
                          <button
                            onClick={() => handleResend(f)}
                            disabled={resendingId === f.user_id}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-amber-600 hover:bg-amber-50 transition-colors disabled:opacity-50"
                            title="Resend invite"
                          >
                            <Send className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => openEdit(f)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-teal-600 hover:bg-teal-50 transition-colors"
                          title="Edit"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(f)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add / Edit Modal */}
      {modal && (
        <Modal
          title={modal.mode === 'add' ? 'Add Facility' : 'Edit Facility'}
          subtitle={modal.mode === 'add' ? 'An invite email will be sent automatically.' : undefined}
          onClose={() => setModal(null)}
        >
          <form onSubmit={handleSave} className="space-y-4">
            {modal.mode === 'add' ? (
              <Input
                label="Email"
                type="email"
                value={form.email}
                onChange={set('email')}
                placeholder="facility@example.com"
                required
              />
            ) : (
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-700">Email</label>
                <p className="text-sm text-gray-500 bg-gray-50 border border-gray-200 px-3 py-2 rounded-lg">{form.email}</p>
              </div>
            )}

            <Input
              label="Facility Name"
              value={form.facility_name}
              onChange={set('facility_name')}
              placeholder="Aga Khan Health Centre"
              required
            />
            <Select label="Facility Type" value={form.facility_type} onChange={set('facility_type')}>
              <option value="">Select type…</option>
              <option value="Private Clinic">Private Clinic</option>
              <option value="Hospital">Hospital</option>
              <option value="Dispensary">Dispensary</option>
              <option value="Diagnostic Centre">Diagnostic Centre</option>
            </Select>
            <Input label="Address" value={form.address} onChange={set('address')} placeholder="e.g. Upanga, Dar es Salaam" />
            <Input label="Phone" type="tel" value={form.phone} onChange={set('phone')} placeholder="+255 7xx xxx xxx" />

            {formError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-100 px-4 py-3 rounded-xl">{formError}</p>
            )}

            <div className="flex gap-3 pt-2">
              <Button type="button" variant="secondary" className="flex-1" onClick={() => setModal(null)}>
                Cancel
              </Button>
              <Button type="submit" className="flex-1" loading={saving}>
                {modal.mode === 'add' ? 'Create & Send Invite' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete Confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="w-12 h-12 rounded-2xl bg-red-100 flex items-center justify-center mb-4">
              <Trash2 className="w-6 h-6 text-red-600" />
            </div>
            <h2 className="text-lg font-bold text-gray-900 mb-1">Delete Facility</h2>
            <p className="text-sm text-gray-500 mb-6">
              This will permanently delete <span className="font-semibold text-gray-800">{deleteTarget.facility_name}</span> and all their shift data. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setDeleteTarget(null)}>Cancel</Button>
              <Button variant="danger" className="flex-1" loading={deleting} onClick={handleDelete}>Delete</Button>
            </div>
          </div>
        </div>
      )}
    </PageWrapper>
  );
}
