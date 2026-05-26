import { useEffect, useRef, useState } from 'react';
import { Camera, Stethoscope, Star, Zap } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getCOProfile, updateCOProfile, updateUserProfile, uploadAvatar } from '../../lib/api';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { Card } from '../../components/common/Card';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { Input, Select } from '../../components/common/Input';
import { useToast } from '../../components/common/Toast';
import { Avatar } from '../../components/common/Avatar';

const TIERS = [
  { key: 'msingi', label: 'Msingi (Free)', price: 'TZS 0/mo', desc: 'Standard matching — shifts visible 30 min after paid tiers', icon: Stethoscope },
  { key: 'daktari', label: 'Daktari', price: 'TZS 15,000/mo', desc: 'Priority matching — 30 min early access to new shifts', icon: Star },
  { key: 'bingwa', label: 'Bingwa', price: 'TZS 30,000/mo', desc: 'First access to emergency shifts + Verified badge', icon: Zap },
];

export default function COProfile() {
  const { user, refreshUser } = useAuth();
  const { show, ToastComponent } = useToast();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [form, setForm] = useState({ display_name: '', phone: '', specialization: '' });
  const fileRef = useRef(null);

  useEffect(() => {
    if (!user?.id) return;
    getCOProfile(user.id).then(({ data }) => {
      setProfile(data);
      setAvatarUrl(data?.users?.avatar_url || null);
      setForm({
        display_name: data?.users?.display_name || '',
        phone: data?.users?.phone || '',
        specialization: data?.specialization || '',
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
      updateUserProfile(user.id, { display_name: form.display_name, phone: form.phone }),
      updateCOProfile(user.id, { specialization: form.specialization }),
    ]);
    setSaving(false);
    show('Profile updated successfully!');
  }

  if (loading) return <div className="max-w-6xl mx-auto px-4 py-8 animate-pulse space-y-4"><div className="h-48 bg-gray-200 rounded-xl" /></div>;

  return (
    <PageWrapper title="My Profile" subtitle="Manage your information and subscription tier.">
      {ToastComponent}

      <div className="grid lg:grid-cols-3 gap-6 max-w-4xl">
        {/* Profile form */}
        <div className="lg:col-span-2">
          <Card className="p-6">
            <h2 className="font-semibold text-gray-900 mb-5">Personal Information</h2>

            {/* Avatar upload */}
            <div className="flex items-center gap-4 mb-6 pb-6 border-b border-gray-100">
              <div className="relative group shrink-0">
                <Avatar src={avatarUrl} name={form.display_name || user?.email} size="xl" />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity disabled:cursor-wait"
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
                <p className="text-sm font-semibold text-gray-900">{form.display_name || 'Your name'}</p>
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
              <Input label="Full Name" value={form.display_name} onChange={set('display_name')} required />
              <Input label="Email" value={profile?.users?.email || user?.email} disabled className="bg-gray-50 text-gray-500" />
              <Input label="Phone" type="tel" value={form.phone} onChange={set('phone')} placeholder="+255 7xx xxx xxx" />
              <Input label="License Number" value={profile?.license_number || ''} disabled className="bg-gray-50 text-gray-500" />
              <Select label="Specialization" value={form.specialization} onChange={set('specialization')}>
                <option value="">Select specialization</option>
                <option value="General">General Practice</option>
                <option value="Paediatrics">Paediatrics</option>
                <option value="Maternity">Maternity / Obstetrics</option>
                <option value="Surgery">Surgical Assist</option>
                <option value="Emergency">Emergency / Trauma</option>
              </Select>

              <div className="flex items-center gap-2 pt-1">
                <Button type="submit" loading={saving}>Save Changes</Button>
                {profile?.verified && (
                  <span className="text-xs text-green-700 bg-green-50 border border-green-200 px-2.5 py-1 rounded-full font-medium">
                    Verified CO
                  </span>
                )}
              </div>
            </form>
          </Card>
        </div>

        {/* Subscription tier */}
        <div>
          <Card className="p-5">
            <h2 className="font-semibold text-gray-900 mb-1">Subscription Tier</h2>
            <p className="text-sm text-gray-400 mb-4">Current: <Badge status={profile?.subscription_tier || 'msingi'} /></p>

            <div className="space-y-2">
              {TIERS.map((tier) => {
                const isCurrent = (profile?.subscription_tier || 'msingi') === tier.key;
                const Icon = tier.icon;
                return (
                  <div
                    key={tier.key}
                    className={`p-3 rounded-lg border text-left w-full ${isCurrent ? 'border-teal-300 bg-teal-50' : 'border-gray-200'}`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Icon className="w-4 h-4 text-teal-600" />
                      <span className="text-sm font-semibold text-gray-900">{tier.label}</span>
                      {isCurrent && <span className="text-xs text-teal-600 font-medium ml-auto">Current</span>}
                    </div>
                    <p className="text-xs text-gray-500">{tier.desc}</p>
                    <p className="text-xs font-semibold text-gray-700 mt-1">{tier.price}</p>
                    {!isCurrent && (
                      <button className="mt-2 text-xs text-teal-600 font-medium opacity-60 cursor-not-allowed">
                        Upgrade — Coming Soon
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      </div>
    </PageWrapper>
  );
}
