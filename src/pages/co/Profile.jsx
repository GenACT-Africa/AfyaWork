import { useEffect, useRef, useState } from 'react';
import { Camera, Stethoscope, Star, Zap, Briefcase, Pencil, X, MapPin, Calendar, Clock } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getCOProfile, updateCOProfile, updateUserProfile, uploadAvatar, updateCOEmploymentAvailability } from '../../lib/api';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { Card } from '../../components/common/Card';
import { Badge, AvailabilityBadge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { Input, Select, Textarea } from '../../components/common/Input';
import { useToast } from '../../components/common/Toast';
import { Avatar } from '../../components/common/Avatar';

const TIERS = [
  { key: 'msingi', label: 'Msingi (Free)', price: 'TZS 0/mo', desc: 'Standard matching — shifts visible 30 min after paid tiers', icon: Stethoscope },
  { key: 'daktari', label: 'Daktari', price: 'TZS 15,000/mo', desc: 'Priority matching — 30 min early access to new shifts', icon: Star },
  { key: 'bingwa', label: 'Bingwa', price: 'TZS 30,000/mo', desc: 'First access to emergency shifts + Verified badge', icon: Zap },
];

const AVAILABILITY_STATUS_OPTIONS = [
  { value: 'open_fulltime', label: 'Open to full-time opportunities' },
  { value: 'open_parttime', label: 'Open to part-time permanent only' },
  { value: 'not_looking',   label: 'Not currently looking' },
];

const PREFERRED_LOCATION_OPTIONS = [
  { value: 'dar_only',        label: 'Dar es Salaam only' },
  { value: 'open_regions',    label: 'Open to other regions in Tanzania' },
  { value: 'specific_region', label: 'Specific region (specify below)' },
];

const EMPLOYMENT_STATUS_OPTIONS = [
  { value: 'employed_looking', label: 'Currently employed, looking to move' },
  { value: 'locum_only',       label: 'Currently doing locum shifts only' },
  { value: 'unemployed',       label: 'Unemployed / between roles' },
];

const LOCATION_LABELS = {
  dar_only:        'Dar es Salaam only',
  open_regions:    'Open to all regions',
  specific_region: null, // use text
};

const EMPLOYMENT_LABELS = {
  employed_looking: 'Currently employed, looking to move',
  locum_only:       'Currently doing locum shifts only',
  unemployed:       'Unemployed / between roles',
};

function formatAvailableFrom(immediately, date) {
  if (immediately) return 'Immediately available';
  if (date) {
    const d = new Date(date + 'T00:00:00');
    return 'From ' + d.toLocaleDateString('en-TZ', { month: 'long', year: 'numeric' });
  }
  return null;
}

// Convert stored "YYYY-MM-DD" → "YYYY-MM" for <input type="month">
function toMonthValue(dateStr) {
  if (!dateStr) return '';
  return String(dateStr).slice(0, 7);
}

// Min value for month picker: current month
function minMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export default function COProfile() {
  const { user, refreshUser } = useAuth();
  const { show, ToastComponent } = useToast();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [form, setForm] = useState({ display_name: '', phone: '', specialization: '', bio: '' });
  const fileRef = useRef(null);

  // Availability modal
  const [availModal, setAvailModal] = useState(false);
  const [availForm, setAvailForm] = useState({
    employment_availability_status: '',
    available_from_immediately: false,
    available_from_date: '',
    preferred_location: '',
    preferred_location_text: '',
    current_employment_status: '',
    availability_note: '',
  });
  const [availSaving, setAvailSaving] = useState(false);
  const [availError, setAvailError] = useState('');

  useEffect(() => {
    if (!user?.id) return;
    getCOProfile(user.id).then(({ data }) => {
      setProfile(data);
      setAvatarUrl(data?.users?.avatar_url || null);
      setForm({
        display_name:   data?.users?.display_name || '',
        phone:          data?.users?.phone || '',
        specialization: data?.specialization || '',
        bio:            data?.users?.bio || '',
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
      updateUserProfile(user.id, { display_name: form.display_name, phone: form.phone, bio: form.bio }),
      updateCOProfile(user.id, { specialization: form.specialization }),
    ]);
    setSaving(false);
    show('Profile updated successfully!');
  }

  // ── Availability modal ──────────────────────────────────────────

  function openAvailModal() {
    setAvailForm({
      employment_availability_status: profile?.employment_availability_status || '',
      available_from_immediately:     profile?.available_from_immediately ?? false,
      available_from_date:            toMonthValue(profile?.available_from_date),
      preferred_location:             profile?.preferred_location || '',
      preferred_location_text:        profile?.preferred_location_text || '',
      current_employment_status:      profile?.current_employment_status || '',
      availability_note:              profile?.availability_note || '',
    });
    setAvailError('');
    setAvailModal(true);
  }

  function setA(field) {
    return (e) => {
      const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
      setAvailForm((f) => ({ ...f, [field]: val }));
    };
  }

  async function handleAvailSave(e) {
    e.preventDefault();
    setAvailError('');

    const isOpen = ['open_fulltime', 'open_parttime'].includes(availForm.employment_availability_status);

    // Validate required fields when open
    if (isOpen) {
      if (!availForm.available_from_immediately && !availForm.available_from_date) {
        setAvailError('Please select when you are available from, or tick "Immediately available".');
        return;
      }
      if (!availForm.preferred_location) {
        setAvailError('Please select your preferred work location.');
        return;
      }
      if (availForm.preferred_location === 'specific_region' && !availForm.preferred_location_text.trim()) {
        setAvailError('Please specify your preferred region.');
        return;
      }
    }

    setAvailSaving(true);
    const { error } = await updateCOEmploymentAvailability(user.id, {
      employment_availability_status: availForm.employment_availability_status || null,
      available_from_immediately:     availForm.available_from_immediately,
      available_from_date:            availForm.available_from_date || null,
      preferred_location:             isOpen ? (availForm.preferred_location || null) : null,
      preferred_location_text:        isOpen && availForm.preferred_location === 'specific_region'
        ? availForm.preferred_location_text.trim() : null,
      current_employment_status:      availForm.current_employment_status || null,
      availability_note:              availForm.availability_note.trim() || null,
    });
    setAvailSaving(false);

    if (error) { setAvailError(error.message); return; }

    // Refresh profile
    const { data } = await getCOProfile(user.id);
    setProfile(data);
    setAvailModal(false);
    show('Employment availability updated!');
  }

  if (loading) return <div className="max-w-6xl mx-auto px-4 py-8 animate-pulse space-y-4"><div className="h-48 bg-gray-200 rounded-xl" /></div>;

  const isOpen = ['open_fulltime', 'open_parttime'].includes(availForm.employment_availability_status);
  const profileIsOpen = ['open_fulltime', 'open_parttime'].includes(profile?.employment_availability_status);

  return (
    <PageWrapper title="My Profile" subtitle="Manage your information and subscription tier.">
      {ToastComponent}

      <div className="grid lg:grid-cols-3 gap-6 max-w-4xl">
        {/* ── Left column ── */}
        <div className="lg:col-span-2 space-y-6">

          {/* Personal Information */}
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

              <div>
                <Textarea
                  label="About"
                  value={form.bio}
                  onChange={set('bio')}
                  rows={4}
                  maxLength={500}
                  placeholder="Tell healthcare facilities about yourself, your experience, and what makes you a great Clinical Officer…"
                />
                <p className="text-xs text-gray-400 text-right mt-1">{form.bio.length}/500</p>
              </div>

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

          {/* ── Employment Availability ── */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Briefcase className="w-5 h-5 text-gray-400" />
                <h2 className="font-semibold text-gray-900">Employment Availability</h2>
              </div>
              <button
                type="button"
                onClick={openAvailModal}
                className="flex items-center gap-1.5 text-sm text-teal-600 hover:text-teal-700 font-medium"
              >
                <Pencil className="w-3.5 h-3.5" />
                Edit Availability
              </button>
            </div>

            {!profile?.employment_availability_status ? (
              /* Not yet set */
              <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-5 py-6 text-center">
                <Briefcase className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm font-medium text-gray-600">Let facilities know if you're open to full-time work.</p>
                <p className="text-xs text-gray-400 mt-1 mb-4">This section is visible on your public profile.</p>
                <Button size="sm" variant="secondary" onClick={openAvailModal}>Set Availability</Button>
              </div>
            ) : profile.employment_availability_status === 'not_looking' ? (
              /* Not looking */
              <div className="flex items-center gap-3 text-sm text-gray-500">
                <span className="w-2 h-2 rounded-full bg-gray-400 shrink-0" />
                Not currently looking for full-time or permanent roles.
                <span className="text-xs text-gray-400">(Hidden from facility search)</span>
              </div>
            ) : (
              /* Open */
              <div className="space-y-3">
                <AvailabilityBadge status={profile.employment_availability_status} />

                <div className="grid sm:grid-cols-2 gap-3 text-sm mt-2">
                  {/* Available from */}
                  <div className="flex items-start gap-2 text-gray-600">
                    <Calendar className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-0.5">Available from</p>
                      <p>{formatAvailableFrom(profile.available_from_immediately, profile.available_from_date) || '—'}</p>
                    </div>
                  </div>

                  {/* Location */}
                  <div className="flex items-start gap-2 text-gray-600">
                    <MapPin className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-0.5">Preferred location</p>
                      <p>
                        {profile.preferred_location === 'specific_region' && profile.preferred_location_text
                          ? profile.preferred_location_text
                          : LOCATION_LABELS[profile.preferred_location] || '—'}
                      </p>
                    </div>
                  </div>

                  {/* Current status */}
                  {profile.current_employment_status && (
                    <div className="flex items-start gap-2 text-gray-600">
                      <Clock className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-0.5">Current situation</p>
                        <p>{EMPLOYMENT_LABELS[profile.current_employment_status]}</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Note */}
                {profile.availability_note && (
                  <div className="bg-gray-50 rounded-lg px-4 py-3 text-sm text-gray-600 italic border border-gray-100 mt-2">
                    "{profile.availability_note}"
                  </div>
                )}

                {profile.availability_last_updated_at && (
                  <p className="text-xs text-gray-400 mt-1">
                    Last updated {new Date(profile.availability_last_updated_at).toLocaleDateString('en-TZ', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                )}
              </div>
            )}
          </Card>

        </div>{/* end left column */}

        {/* ── Sidebar ── */}
        <div className="space-y-4">
          <Card className="p-5">
            <h2 className="font-semibold text-gray-900 mb-3">About</h2>
            {form.bio ? (
              <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">{form.bio}</p>
            ) : (
              <p className="text-sm text-gray-400 italic">No bio yet — add one in the form to the left.</p>
            )}
          </Card>

          {profileIsOpen && (
            <Card className="p-5 border-green-100 bg-green-50">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2 h-2 rounded-full bg-green-500" />
                <p className="text-sm font-semibold text-green-800">Visible in facility search</p>
              </div>
              <p className="text-xs text-green-700">Facilities browsing for full-time hires can find your profile.</p>
            </Card>
          )}

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

      {/* ── Availability Edit Modal ── */}
      {availModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl z-10">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Employment Availability</h2>
                <p className="text-xs text-gray-400 mt-0.5">Visible to facilities browsing for permanent hires</p>
              </div>
              <button onClick={() => setAvailModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <form onSubmit={handleAvailSave} className="p-6 space-y-5">

              {/* 1. Status */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Availability Status *</label>
                <div className="space-y-2">
                  {AVAILABILITY_STATUS_OPTIONS.map((opt) => (
                    <label key={opt.value} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${availForm.employment_availability_status === opt.value ? 'border-teal-400 bg-teal-50' : 'border-gray-200 hover:border-gray-300'}`}>
                      <input
                        type="radio"
                        name="avail_status"
                        value={opt.value}
                        checked={availForm.employment_availability_status === opt.value}
                        onChange={setA('employment_availability_status')}
                        className="accent-teal-600"
                      />
                      <span className="text-sm text-gray-800">{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Fields only shown when open */}
              {isOpen && (
                <>
                  {/* 2. Available From */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Available From *</label>
                    <label className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer mb-2 transition-colors ${availForm.available_from_immediately ? 'border-teal-400 bg-teal-50' : 'border-gray-200'}`}>
                      <input
                        type="checkbox"
                        checked={availForm.available_from_immediately}
                        onChange={setA('available_from_immediately')}
                        className="accent-teal-600"
                      />
                      <span className="text-sm text-gray-800">Immediately available</span>
                    </label>
                    {!availForm.available_from_immediately && (
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Available from (month &amp; year)</label>
                        <input
                          type="month"
                          value={availForm.available_from_date}
                          min={minMonth()}
                          onChange={setA('available_from_date')}
                          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                        />
                      </div>
                    )}
                  </div>

                  {/* 3. Preferred Location */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Preferred Work Location *</label>
                    <div className="space-y-2">
                      {PREFERRED_LOCATION_OPTIONS.map((opt) => (
                        <label key={opt.value} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${availForm.preferred_location === opt.value ? 'border-teal-400 bg-teal-50' : 'border-gray-200 hover:border-gray-300'}`}>
                          <input
                            type="radio"
                            name="pref_location"
                            value={opt.value}
                            checked={availForm.preferred_location === opt.value}
                            onChange={setA('preferred_location')}
                            className="accent-teal-600"
                          />
                          <span className="text-sm text-gray-800">{opt.label}</span>
                        </label>
                      ))}
                    </div>
                    {availForm.preferred_location === 'specific_region' && (
                      <input
                        type="text"
                        value={availForm.preferred_location_text}
                        onChange={setA('preferred_location_text')}
                        placeholder="e.g. Arusha, Mwanza, Zanzibar…"
                        maxLength={100}
                        className="mt-2 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                      />
                    )}
                  </div>
                </>
              )}

              {/* 4. Current Employment Status (optional, always shown) */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Current Employment Status <span className="text-gray-400 font-normal">(optional)</span></label>
                <div className="space-y-2">
                  {EMPLOYMENT_STATUS_OPTIONS.map((opt) => (
                    <label key={opt.value} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${availForm.current_employment_status === opt.value ? 'border-teal-400 bg-teal-50' : 'border-gray-200 hover:border-gray-300'}`}>
                      <input
                        type="radio"
                        name="emp_status"
                        value={opt.value}
                        checked={availForm.current_employment_status === opt.value}
                        onChange={setA('current_employment_status')}
                        className="accent-teal-600"
                      />
                      <span className="text-sm text-gray-800">{opt.label}</span>
                    </label>
                  ))}
                  {/* Allow deselect */}
                  {availForm.current_employment_status && (
                    <button type="button" onClick={() => setAvailForm((f) => ({ ...f, current_employment_status: '' }))}
                      className="text-xs text-gray-400 hover:text-gray-600 underline pl-1">
                      Clear selection
                    </button>
                  )}
                </div>
              </div>

              {/* 5. Short Note (optional, always shown) */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Short Note <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <textarea
                  value={availForm.availability_note}
                  onChange={setA('availability_note')}
                  maxLength={150}
                  rows={3}
                  placeholder="Anything facilities should know? e.g. preferred department, setting, or conditions"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
                />
                <p className="text-xs text-gray-400 text-right mt-0.5">{availForm.availability_note.length}/150</p>
              </div>

              {availError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-100 px-4 py-3 rounded-xl">{availError}</p>
              )}

              <div className="flex gap-3 pt-1">
                <Button type="button" variant="secondary" className="flex-1" onClick={() => setAvailModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" className="flex-1" loading={availSaving}>
                  Save Availability
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PageWrapper>
  );
}
