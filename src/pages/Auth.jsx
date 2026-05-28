import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Stethoscope, Info, Mail } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/common/Button';
import { Input, Select } from '../components/common/Input';
import { LanguageToggle } from '../components/common/LanguageToggle';

export function RegisterPage() {
  const [params] = useSearchParams();
  const defaultRole = params.get('role') || 'co';
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { signUp, user, role: authRole, loading: authLoading } = useAuth();

  const [role, setRole] = useState(defaultRole);

  useEffect(() => {
    if (!authLoading && user && authRole) {
      const dest = authRole === 'admin' ? '/admin/dashboard' : authRole === 'facility' ? '/facility/dashboard' : '/co/dashboard';
      navigate(dest, { replace: true });
    }
  }, [user, authRole, authLoading, navigate]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [form, setForm] = useState({
    email: '', password: '', display_name: '', phone: '',
    license_number: '', specialization: '',
    facility_name: '', facility_type: '', address: '',
  });

  function set(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (form.password.length < 6) { setError(t('auth.err_password')); return; }
    if (role === 'co' && !form.license_number) { setError(t('auth.err_license')); return; }
    if (role === 'facility' && !form.facility_name) { setError(t('auth.err_facility_name')); return; }

    setLoading(true);
    const payload = {
      email: form.email,
      password: form.password,
      role,
      display_name: role === 'facility' ? form.facility_name : form.display_name,
      ...(role === 'co'
        ? { license_number: form.license_number, specialization: form.specialization }
        : { facility_name: form.facility_name, facility_type: form.facility_type, address: form.address }),
    };
    const { error: err } = await signUp(payload);
    setLoading(false);
    if (err) { setError(err.message); return; }
    setSuccess(true);
  }

  if (success) {
    return (
      <AuthShell title="Check your inbox" subtitle="One last step">
        <div className="flex flex-col items-center text-center py-4">
          <div className="w-16 h-16 bg-teal-50 border border-teal-100 rounded-2xl flex items-center justify-center mb-5">
            <Mail className="w-8 h-8 text-teal-500" />
          </div>
          <p className="text-gray-700 text-sm leading-relaxed mb-2">
            We've sent a confirmation link to <span className="font-semibold text-gray-900">{form.email}</span>.
          </p>
          <p className="text-gray-500 text-sm leading-relaxed mb-6">
            Click the link in the email to activate your account and go straight to your dashboard.
            The link expires in 24 hours.
          </p>
          <p className="text-xs text-gray-400">
            Didn't receive it? Check your spam folder or{' '}
            <button onClick={() => setSuccess(false)} className="text-teal-600 font-semibold hover:underline">
              try again
            </button>.
          </p>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={t('auth.create_account')} subtitle={t('auth.join_today')}>
      <div className="flex rounded-xl border border-gray-200 overflow-hidden mb-6 p-1 bg-gray-50">
        {['co', 'facility'].map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRole(r)}
            className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-all ${
              role === r
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {r === 'co' ? t('auth.co') : t('auth.facility')}
          </button>
        ))}
      </div>

      {role === 'co' && (
        <div className="flex items-start gap-2.5 bg-teal-50 border border-teal-100 rounded-xl px-4 py-3 mb-4 text-sm text-teal-800">
          <Info className="w-4 h-4 text-teal-500 shrink-0 mt-0.5" />
          <p>
            AfyaWork is currently open to <span className="font-semibold">Clinical Officers</span> only.
            We'll be welcoming other healthcare cadres very soon — stay tuned!
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {role === 'co' ? (
          <>
            <Input label={t('auth.full_name')} value={form.display_name} onChange={set('display_name')} placeholder="Dr. Amina Juma" required />
            <Input label={t('auth.email')} type="email" value={form.email} onChange={set('email')} placeholder="you@example.com" required />
            <Input label={t('auth.password')} type="password" value={form.password} onChange={set('password')} placeholder={t('auth.password_placeholder')} required />
            <Input label={t('auth.phone')} type="tel" value={form.phone} onChange={set('phone')} placeholder="+255 7xx xxx xxx" />
            <Input label={t('auth.license_number')} value={form.license_number} onChange={set('license_number')} placeholder="CO-12345" required />
            <Select label={t('auth.specialization')} value={form.specialization} onChange={set('specialization')}>
              <option value="">{t('auth.select_spec')}</option>
              <option value="General">{t('auth.general')}</option>
              <option value="Paediatrics">{t('auth.paediatrics')}</option>
              <option value="Maternity">{t('auth.maternity')}</option>
              <option value="Surgery">{t('auth.surgery')}</option>
              <option value="Emergency">{t('auth.emergency')}</option>
            </Select>
          </>
        ) : (
          <>
            <Input label={t('auth.facility_name')} value={form.facility_name} onChange={set('facility_name')} placeholder="Aga Khan Health Centre" required />
            <Input label={t('auth.contact_email')} type="email" value={form.email} onChange={set('email')} placeholder="admin@facility.co.tz" required />
            <Input label={t('auth.password')} type="password" value={form.password} onChange={set('password')} placeholder={t('auth.password_placeholder')} required />
            <Input label={t('auth.contact_phone')} type="tel" value={form.phone} onChange={set('phone')} placeholder="+255 7xx xxx xxx" />
            <Select label={t('auth.facility_type')} value={form.facility_type} onChange={set('facility_type')}>
              <option value="">{t('auth.select_type')}</option>
              <option value="Private Clinic">{t('auth.private_clinic')}</option>
              <option value="Hospital">{t('auth.hospital')}</option>
              <option value="Dispensary">{t('auth.dispensary')}</option>
              <option value="Diagnostic Centre">{t('auth.diagnostic')}</option>
            </Select>
            <Input label={t('auth.address')} value={form.address} onChange={set('address')} placeholder={t('auth.address_placeholder')} />
          </>
        )}

        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-100 px-4 py-3 rounded-xl">
            {error}
          </div>
        )}

        <Button type="submit" loading={loading} className="w-full" size="lg">
          {t('auth.create_btn')}
        </Button>
      </form>

      <p className="text-center text-sm text-gray-500 mt-5">
        {t('auth.already_account')}{' '}
        <Link to="/auth/login" className="text-teal-600 font-semibold hover:underline">{t('auth.sign_in')}</Link>
      </p>
    </AuthShell>
  );
}

export function LoginPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { signIn, user, role, loading: authLoading } = useAuth();
  const [form, setForm] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!authLoading && user && role) {
      const dest = role === 'admin' ? '/admin/dashboard' : role === 'facility' ? '/facility/dashboard' : '/co/dashboard';
      navigate(dest, { replace: true });
    }
  }, [user, role, authLoading, navigate]);

  function set(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error: err } = await signIn(form);
    setLoading(false);
    if (err) { setError(err.message); return; }
  }

  return (
    <AuthShell title={t('auth.welcome_back')} subtitle={t('auth.sign_in_sub')}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input label={t('auth.email')} type="email" value={form.email} onChange={set('email')} placeholder="you@example.com" required />
        <Input label={t('auth.password')} type="password" value={form.password} onChange={set('password')} placeholder={t('auth.password_placeholder')} required />

        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-100 px-4 py-3 rounded-xl">
            {error}
          </div>
        )}

        <Button type="submit" loading={loading} className="w-full" size="lg">
          {t('auth.sign_in')}
        </Button>
      </form>

      <p className="text-center text-sm text-gray-500 mt-5">
        {t('auth.no_account')}{' '}
        <Link to="/auth/register" className="text-teal-600 font-semibold hover:underline">{t('auth.register')}</Link>
      </p>
    </AuthShell>
  );
}

function AuthShell({ title, subtitle, children }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-teal-900 flex flex-col items-center justify-center px-4 py-12">
      {/* Decorative blob */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-teal-500/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl pointer-events-none" />

      <div className="relative w-full max-w-md">
        <div className="flex items-center justify-between mb-8">
          <Link to="/" className="flex items-center gap-2 group">
            <div className="w-9 h-9 bg-gradient-to-br from-teal-500 to-emerald-500 rounded-xl flex items-center justify-center shadow-lg">
              <Stethoscope className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-white text-lg tracking-tight">
              Afya<span className="text-teal-400">Work</span>
            </span>
          </Link>
          <LanguageToggle variant="pill" />
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
            <p className="text-gray-500 text-sm mt-1">{subtitle}</p>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
