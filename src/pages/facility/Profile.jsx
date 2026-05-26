import { useEffect, useRef, useState } from 'react';
import { Camera } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getFacilityProfile, updateFacilityProfile, updateUserProfile, uploadAvatar } from '../../lib/api';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Input, Select, Textarea } from '../../components/common/Input';
import { useToast } from '../../components/common/Toast';
import { Avatar } from '../../components/common/Avatar';

const PLANS = [
  { key: 'payg', label: 'Pay-as-you-go', price: 'TZS 0/mo', fee: '18.6% of CO pay' },
  { key: 'starter', label: 'Starter', price: 'TZS 30,000/mo', fee: 'TZS 8,000 flat per shift' },
  { key: 'growth', label: 'Growth', price: 'TZS 60,000/mo', fee: 'TZS 6,000 flat per shift' },
  { key: 'enterprise', label: 'Enterprise', price: 'TZS 100,000/mo', fee: 'TZS 4,000 flat per shift' },
];

export default function FacilityProfile() {
  const { user, refreshUser } = useAuth();
  const { show, ToastComponent } = useToast();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [form, setForm] = useState({ phone: '', facility_name: '', facility_type: '', address: '', bio: '' });
  const fileRef = useRef(null);

  useEffect(() => {
    if (!user?.id) return;
    getFacilityProfile(user.id).then(({ data }) => {
      setProfile(data);
      setAvatarUrl(data?.users?.avatar_url || null);
      setForm({
        phone: data?.users?.phone || '',
        facility_name: data?.facility_name || '',
        facility_type: data?.facility_type || '',
        address: data?.address || '',
        bio: data?.users?.bio || '',
      });
    }).finally(() => setLoading(false));
  }, [user?.id]);

  async function handleAvatarChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { show('Image must be under 5 MB.', 'error'); return; }
    setUploading(true);
    const { url, error } = await uploadAvatar(user.id, file);
    setUploading(false);
    if (error) { show('Upload failed: ' + error.message, 'error'); return; }
    setAvatarUrl(url);
    await refreshUser();
    show('Profile picture updated!');
  }

  function set(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    await Promise.all([
      updateUserProfile(user.id, { phone: form.phone, bio: form.bio }),
      updateFacilityProfile(user.id, {
        facility_name: form.facility_name,
        facility_type: form.facility_type,
        address: form.address,
      }),
    ]);
    setSaving(false);
    show('Profile updated successfully!');
  }

  if (loading) return <div className="max-w-6xl mx-auto px-4 py-8 animate-pulse"><div className="h-48 bg-gray-200 rounded-xl" /></div>;

  const currentPlan = profile?.subscription_plan || 'payg';

  return (
    <PageWrapper title="Facility Profile" subtitle="Manage your facility information and subscription plan.">
      {ToastComponent}

      <div className="grid lg:grid-cols-3 gap-6 max-w-4xl">
        <div className="lg:col-span-2">
          <Card className="p-6">
            <h2 className="font-semibold text-gray-900 mb-5">Facility Information</h2>

            {/* Avatar upload */}
            <div className="flex items-center gap-4 mb-6 pb-6 border-b border-gray-100">
              <div className="relative group shrink-0">
                <Avatar src={avatarUrl} name={form.facility_name || user?.email} size="xl" shape="rounded" />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity disabled:cursor-wait"
                  aria-label="Change photo"
                >
                  <Camera className="w-5 h-5 text-white" />
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  onChange={handleAvatarChange}
                />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">{form.facility_name || 'Your facility'}</p>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="text-sm text-teal-600 hover:text-teal-700 font-medium disabled:opacity-60"
                >
                  {uploading ? 'Uploading…' : 'Change photo'}
                </button>
                <p className="text-xs text-gray-400 mt-0.5">JPG, PNG or WebP · max 5 MB</p>
              </div>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <Input label="Facility Name" value={form.facility_name} onChange={set('facility_name')} required />
              <Input label="Contact Email" value={profile?.users?.email || user?.email} disabled className="bg-gray-50 text-gray-500" />
              <Input label="Contact Phone" type="tel" value={form.phone} onChange={set('phone')} placeholder="+255 7xx xxx xxx" />
              <Select label="Facility Type" value={form.facility_type} onChange={set('facility_type')}>
                <option value="">Select type</option>
                <option value="Private Clinic">Private Clinic</option>
                <option value="Hospital">Hospital</option>
                <option value="Dispensary">Dispensary</option>
                <option value="Diagnostic Centre">Diagnostic Centre</option>
              </Select>
              <Input label="Address" value={form.address} onChange={set('address')} placeholder="Kinondoni, Dar es Salaam" />

              {/* About / Bio */}
              <div>
                <Textarea
                  label="About"
                  value={form.bio}
                  onChange={set('bio')}
                  rows={4}
                  maxLength={500}
                  placeholder="Tell Clinical Officers about your facility, the environment, specialties, and what makes working with you great…"
                />
                <p className="text-xs text-gray-400 text-right mt-1">{form.bio.length}/500</p>
              </div>

              <Button type="submit" loading={saving}>Save Changes</Button>
            </form>
          </Card>
        </div>

        <div className="space-y-4">
          {/* About preview */}
          <Card className="p-5">
            <h2 className="font-semibold text-gray-900 mb-3">About</h2>
            {form.bio ? (
              <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">{form.bio}</p>
            ) : (
              <p className="text-sm text-gray-400 italic">No bio yet — add one in the form to the left.</p>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="font-semibold text-gray-900 mb-4">Subscription Plan</h2>
            <div className="space-y-2">
              {PLANS.map((plan) => {
                const isCurrent = currentPlan === plan.key;
                return (
                  <div key={plan.key} className={`p-3 rounded-lg border ${isCurrent ? 'border-teal-300 bg-teal-50' : 'border-gray-200'}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-semibold text-gray-900">{plan.label}</span>
                      {isCurrent && <span className="text-xs text-teal-600 font-medium">Current</span>}
                    </div>
                    <p className="text-xs text-gray-500">{plan.fee}</p>
                    <p className="text-xs font-semibold text-gray-700 mt-0.5">{plan.price}</p>
                    {!isCurrent && (
                      <button className="mt-2 text-xs text-teal-600 font-medium opacity-60 cursor-not-allowed">
                        Upgrade — Coming Soon
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="mt-4 pt-4 border-t border-gray-100">
              <p className="text-xs text-gray-400">
                Invoices are sent at month-end. Contact us to upgrade your plan.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </PageWrapper>
  );
}
