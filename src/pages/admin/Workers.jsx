import { useEffect, useState } from 'react';
import { UserCircle, Mail, Phone, Search, Award, Plus, Pencil, Trash2, X } from 'lucide-react';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Input, Select } from '../../components/common/Input';
import { getAdminWorkers, adminCreateWorker, adminUpdateWorker, adminDeleteUser } from '../../lib/api';

const BLANK = { email: '', password: '', display_name: '', license_number: '', specialization: '', phone: '' };

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

const tierBadge = {
  basic:    'bg-gray-100 text-gray-600',
  standard: 'bg-blue-50 text-blue-700',
  premium:  'bg-amber-50 text-amber-700',
};

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl">
          <h2 className="text-lg font-bold text-gray-900">{title}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

export default function AdminWorkers() {
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [modal, setModal] = useState(null); // null | { mode: 'add' | 'edit', userId?: string }
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  async function load() {
    const { data } = await getAdminWorkers();
    setWorkers(data || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const filtered = workers.filter((w) => {
    const q = search.toLowerCase();
    return (
      w.users?.display_name?.toLowerCase().includes(q) ||
      w.users?.email?.toLowerCase().includes(q) ||
      w.license_number?.toLowerCase().includes(q) ||
      w.specialization?.toLowerCase().includes(q)
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

  function openEdit(w) {
    setForm({
      email: w.users?.email || '',
      password: '',
      display_name: w.users?.display_name || '',
      license_number: w.license_number || '',
      specialization: w.specialization || '',
      phone: w.users?.phone || '',
    });
    setFormError('');
    setModal({ mode: 'edit', userId: w.user_id });
  }

  async function handleSave(e) {
    e.preventDefault();
    setFormError('');
    if (!form.display_name.trim()) { setFormError('Full name is required.'); return; }
    if (!form.license_number.trim()) { setFormError('License number is required.'); return; }
    if (modal.mode === 'add') {
      if (!form.email.trim()) { setFormError('Email is required.'); return; }
      if (form.password.length < 6) { setFormError('Password must be at least 6 characters.'); return; }
    }
    setSaving(true);
    const { error } = modal.mode === 'add'
      ? await adminCreateWorker(form)
      : await adminUpdateWorker(modal.userId, form);
    setSaving(false);
    if (error) { setFormError(error.message); return; }
    setModal(null);
    load();
  }

  async function handleDelete() {
    setDeleting(true);
    await adminDeleteUser(deleteTarget.user_id);
    setDeleting(false);
    setDeleteTarget(null);
    load();
  }

  return (
    <PageWrapper
      title="Clinical Officers"
      subtitle={`${workers.length} registered workers`}
      action={
        <Button size="sm" onClick={openAdd}>
          <Plus className="w-4 h-4" /> Add Worker
        </Button>
      }
    >
      {/* Search */}
      <div className="relative mb-6 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search workers…"
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
          <UserCircle className="w-10 h-10 text-gray-300 mb-3" />
          <p className="text-gray-500 text-sm">{search ? 'No workers match your search.' : 'No workers yet.'}</p>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-gray-100 shadow-sm bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs text-gray-400 uppercase tracking-wider">
                <th className="text-left px-5 py-4 font-semibold">Worker</th>
                <th className="text-left px-5 py-4 font-semibold">Contact</th>
                <th className="text-left px-5 py-4 font-semibold">Tier</th>
                <th className="text-left px-5 py-4 font-semibold">Applications</th>
                <th className="text-left px-5 py-4 font-semibold">Joined</th>
                <th className="px-5 py-4" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((w) => (
                <tr key={w.user_id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-4">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center shrink-0 shadow-sm text-white text-xs font-bold">
                        {(w.users?.display_name || '?').split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()}
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">{w.users?.display_name || '—'}</p>
                        <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                          <Award className="w-3 h-3" />
                          {w.license_number} · {w.specialization || 'General'}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <p className="flex items-center gap-1.5 text-gray-600">
                      <Mail className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                      {w.users?.email || '—'}
                    </p>
                    {w.users?.phone && (
                      <p className="flex items-center gap-1.5 text-gray-500 text-xs mt-1">
                        <Phone className="w-3 h-3 text-gray-400 shrink-0" />
                        {w.users.phone}
                      </p>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold capitalize ${tierBadge[w.subscription_tier] || tierBadge.basic}`}>
                      {w.subscription_tier || 'basic'}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-50 text-purple-700 text-xs font-semibold">
                      {w.app_stats?.approved || 0} approved
                    </span>
                    <p className="text-xs text-gray-400 mt-1">{w.app_stats?.total || 0} total</p>
                  </td>
                  <td className="px-5 py-4 text-gray-500 text-xs">{formatDate(w.users?.created_at)}</td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-1 justify-end">
                      <button
                        onClick={() => openEdit(w)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-teal-600 hover:bg-teal-50 transition-colors"
                        title="Edit"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(w)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add / Edit Modal */}
      {modal && (
        <Modal title={modal.mode === 'add' ? 'Add Clinical Officer' : 'Edit Clinical Officer'} onClose={() => setModal(null)}>
          <form onSubmit={handleSave} className="space-y-4">
            {modal.mode === 'add' && (
              <>
                <Input label="Email" type="email" value={form.email} onChange={set('email')} placeholder="doctor@example.com" required />
                <Input label="Temporary Password" type="password" value={form.password} onChange={set('password')} placeholder="Min. 6 characters" required />
              </>
            )}
            {modal.mode === 'edit' && (
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-700">Email</label>
                <p className="text-sm text-gray-500 bg-gray-50 border border-gray-200 px-3 py-2 rounded-lg">{form.email}</p>
              </div>
            )}
            <Input label="Full Name" value={form.display_name} onChange={set('display_name')} placeholder="Dr. Amina Juma" required />
            <Input label="License Number" value={form.license_number} onChange={set('license_number')} placeholder="CO-12345" required />
            <Select label="Specialization" value={form.specialization} onChange={set('specialization')}>
              <option value="">Select specialization…</option>
              <option value="General">General</option>
              <option value="Paediatrics">Paediatrics</option>
              <option value="Maternity">Maternity</option>
              <option value="Surgery">Surgery</option>
              <option value="Emergency">Emergency</option>
            </Select>
            <Input label="Phone" type="tel" value={form.phone} onChange={set('phone')} placeholder="+255 7xx xxx xxx" />

            {formError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-100 px-4 py-3 rounded-xl">{formError}</p>
            )}

            <div className="flex gap-3 pt-2">
              <Button type="button" variant="secondary" className="flex-1" onClick={() => setModal(null)}>Cancel</Button>
              <Button type="submit" className="flex-1" loading={saving}>
                {modal.mode === 'add' ? 'Create Worker' : 'Save Changes'}
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
            <h2 className="text-lg font-bold text-gray-900 mb-1">Delete Worker</h2>
            <p className="text-sm text-gray-500 mb-6">
              This will permanently delete <span className="font-semibold text-gray-800">{deleteTarget.users?.display_name || 'this worker'}</span> and all their application history. This cannot be undone.
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
