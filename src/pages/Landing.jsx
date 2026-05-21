import { useNavigate } from 'react-router-dom';
import { Stethoscope, Building2, ArrowRight, CheckCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useEffect } from 'react';

export default function Landing() {
  const navigate = useNavigate();
  const { user, role } = useAuth();

  useEffect(() => {
    if (user && role) {
      navigate(role === 'co' ? '/co/dashboard' : '/facility/dashboard', { replace: true });
    }
  }, [user, role, navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 via-white to-blue-50">
      {/* Header */}
      <header className="max-w-6xl mx-auto px-4 py-6 flex items-center justify-between">
        <div className="flex items-center gap-2 font-bold text-teal-600 text-xl">
          <Stethoscope className="w-7 h-7" />
          AfyaWork
        </div>
        <button
          onClick={() => navigate('/auth/login')}
          className="text-sm font-medium text-gray-600 hover:text-teal-600 transition-colors"
        >
          Sign in
        </button>
      </header>

      {/* Hero */}
      <main className="max-w-4xl mx-auto px-4 pt-16 pb-24 text-center">
        <div className="inline-flex items-center gap-2 bg-teal-100 text-teal-700 text-xs font-semibold px-3 py-1.5 rounded-full mb-6">
          <span className="w-1.5 h-1.5 bg-teal-500 rounded-full"></span>
          Healthcare Workforce Platform · Dar es Salaam, Tanzania
        </div>

        <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 leading-tight mb-5">
          Connect healthcare facilities<br />
          with <span className="text-teal-600">verified Clinical Officers</span>
        </h1>

        <p className="text-lg text-gray-500 max-w-xl mx-auto mb-12">
          AfyaWork replaces informal WhatsApp shift networks with a transparent, reliable platform for locum shift coverage.
        </p>

        {/* Role cards */}
        <div className="grid md:grid-cols-2 gap-6 max-w-2xl mx-auto">
          <RoleCard
            icon={Building2}
            title="I'm a Healthcare Facility"
            description="Post shifts and find verified Clinical Officers for coverage."
            features={['Post shifts in under 2 minutes', 'Browse verified CO profiles', 'One-click approval']}
            color="teal"
            onClick={() => navigate('/auth/register?role=facility')}
          />
          <RoleCard
            icon={Stethoscope}
            title="I'm a Clinical Officer"
            description="Find flexible locum shifts that fit your schedule."
            features={['Browse open shifts', 'Apply with one click', 'Track your applications']}
            color="blue"
            onClick={() => navigate('/auth/register?role=co')}
          />
        </div>

        <p className="mt-8 text-sm text-gray-400">
          Already have an account?{' '}
          <button onClick={() => navigate('/auth/login')} className="text-teal-600 font-medium hover:underline">
            Sign in
          </button>
        </p>
      </main>
    </div>
  );
}

function RoleCard({ icon: Icon, title, description, features, color, onClick }) {
  const colors = {
    teal: { bg: 'bg-teal-50', icon: 'text-teal-600', btn: 'bg-teal-600 hover:bg-teal-700', check: 'text-teal-500' },
    blue: { bg: 'bg-blue-50', icon: 'text-blue-600', btn: 'bg-blue-600 hover:bg-blue-700', check: 'text-blue-500' },
  }[color];

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 text-left flex flex-col gap-4 hover:shadow-md transition-shadow">
      <div className={`w-12 h-12 rounded-xl ${colors.bg} flex items-center justify-center`}>
        <Icon className={`w-6 h-6 ${colors.icon}`} />
      </div>
      <div>
        <h2 className="text-lg font-bold text-gray-900">{title}</h2>
        <p className="text-sm text-gray-500 mt-1">{description}</p>
      </div>
      <ul className="space-y-2">
        {features.map((f) => (
          <li key={f} className="flex items-center gap-2 text-sm text-gray-600">
            <CheckCircle className={`w-4 h-4 shrink-0 ${colors.check}`} />
            {f}
          </li>
        ))}
      </ul>
      <button
        onClick={onClick}
        className={`mt-auto w-full flex items-center justify-center gap-2 text-white text-sm font-medium py-2.5 rounded-lg transition-colors ${colors.btn}`}
      >
        Get started <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  );
}
