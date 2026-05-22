import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Stethoscope } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/common/Button';
import { Input, Select } from '../components/common/Input';

export function RegisterPage() {
  const [params] = useSearchParams();
  const defaultRole = params.get('role') || 'co';
  const navigate = useNavigate();
  const { signUp, user, role: authRole, loading: authLoading } = useAuth();

  const [role, setRole] = useState(defaultRole);

  useEffect(() => {
    if (!authLoading && user && authRole) {
      navigate(authRole === 'facility' ? '/facility/dashboard' : '/co/dashboard', { replace: true });
    }
  }, [user, authRole, authLoading, navigate]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    email: '', password: '', display_name: '', phone: '',
    // CO fields
    license_number: '', specialization: '',
    // Facility fields
    facility_name: '', facility_type: '', address: '',
  });

  function set(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (form.password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (role === 'co' && !form.license_number) { setError('License number is required.'); return; }
    if (role === 'facility' && !form.facility_name) { setError('Facility name is required.'); return; }

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
    // Navigation handled by useEffect once authRole is confirmed
  }

  return (
    <AuthShell title="Create your account" subtitle="Join AfyaWork today">
      {/* Role toggle */}
      <div className="flex rounded-lg border border-gray-200 overflow-hidden mb-6">
        {['co', 'facility'].map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRole(r)}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${role === r ? 'bg-teal-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            {r === 'co' ? 'Clinical Officer' : 'Healthcare Facility'}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {role === 'co' ? (
          <>
            <Input label="Full name" value={form.display_name} onChange={set('display_name')} placeholder="Dr. Amina Juma" required />
            <Input label="Email" type="email" value={form.email} onChange={set('email')} placeholder="you@example.com" required />
            <Input label="Password" type="password" value={form.password} onChange={set('password')} placeholder="Min. 6 characters" required />
            <Input label="Phone (optional)" type="tel" value={form.phone} onChange={set('phone')} placeholder="+255 7xx xxx xxx" />
            <Input label="License number" value={form.license_number} onChange={set('license_number')} placeholder="CO-12345" required />
            <Select label="Specialization" value={form.specialization} onChange={set('specialization')}>
              <option value="">Select specialization</option>
              <option value="General">General Practice</option>
              <option value="Paediatrics">Paediatrics</option>
              <option value="Maternity">Maternity / Obstetrics</option>
              <option value="Surgery">Surgical Assist</option>
              <option value="Emergency">Emergency / Trauma</option>
            </Select>
          </>
        ) : (
          <>
            <Input label="Facility name" value={form.facility_name} onChange={set('facility_name')} placeholder="Aga Khan Health Centre" required />
            <Input label="Contact email" type="email" value={form.email} onChange={set('email')} placeholder="admin@facility.co.tz" required />
            <Input label="Password" type="password" value={form.password} onChange={set('password')} placeholder="Min. 6 characters" required />
            <Input label="Contact phone (optional)" type="tel" value={form.phone} onChange={set('phone')} placeholder="+255 7xx xxx xxx" />
            <Select label="Facility type" value={form.facility_type} onChange={set('facility_type')}>
              <option value="">Select type</option>
              <option value="Private Clinic">Private Clinic</option>
              <option value="Hospital">Hospital</option>
              <option value="Dispensary">Dispensary</option>
              <option value="Diagnostic Centre">Diagnostic Centre</option>
            </Select>
            <Input label="Address" value={form.address} onChange={set('address')} placeholder="Kinondoni, Dar es Salaam" />
          </>
        )}

        {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

        <Button type="submit" loading={loading} className="w-full" size="lg">
          Create account
        </Button>
      </form>

      <p className="text-center text-sm text-gray-500 mt-4">
        Already have an account?{' '}
        <Link to="/auth/login" className="text-teal-600 font-medium hover:underline">Sign in</Link>
      </p>
    </AuthShell>
  );
}

export function LoginPage() {
  const navigate = useNavigate();
  const { signIn, user, role, loading: authLoading } = useAuth();
  const [form, setForm] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!authLoading && user && role) {
      navigate(role === 'facility' ? '/facility/dashboard' : '/co/dashboard', { replace: true });
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
    // Navigation handled by useEffect once role is confirmed
  }

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to your AfyaWork account">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input label="Email" type="email" value={form.email} onChange={set('email')} placeholder="you@example.com" required />
        <Input label="Password" type="password" value={form.password} onChange={set('password')} placeholder="Your password" required />

        {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

        <Button type="submit" loading={loading} className="w-full" size="lg">
          Sign in
        </Button>
      </form>

      <p className="text-center text-sm text-gray-500 mt-4">
        Don&apos;t have an account?{' '}
        <Link to="/auth/register" className="text-teal-600 font-medium hover:underline">Register</Link>
      </p>
    </AuthShell>
  );
}

function AuthShell({ title, subtitle, children }) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2 font-bold text-teal-600 text-xl mb-4">
            <Stethoscope className="w-7 h-7" />
            AfyaWork
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
          <p className="text-gray-500 text-sm mt-1">{subtitle}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
          {children}
        </div>
      </div>
    </div>
  );
}
