/**
 * /auth/confirmed — landing page after clicking the email confirmation link.
 *
 * Supabase processes the token from the URL, fires onAuthStateChange, and the
 * AuthContext sets `user` + `role`. We just wait for that and redirect to the
 * correct dashboard. Shows a friendly "confirmed" screen in the meantime.
 */
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Stethoscope, CheckCircle2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LanguageToggle } from '../components/common/LanguageToggle';

export default function AuthConfirmed() {
  const { user, role, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!user || !role) return; // still waiting for Supabase to process token

    const dest =
      role === 'admin'    ? '/admin/dashboard'    :
      role === 'facility' ? '/facility/dashboard' :
                            '/co/dashboard';

    navigate(dest, { replace: true });
  }, [user, role, loading, navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-teal-900 flex flex-col items-center justify-center px-4 py-12">
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

        <div className="bg-white rounded-2xl shadow-2xl p-8 text-center">
          <div className="w-16 h-16 bg-teal-50 border border-teal-100 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <CheckCircle2 className="w-8 h-8 text-teal-500" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Email confirmed!</h1>
          <p className="text-gray-500 text-sm mb-6">
            Your AfyaWork account is verified. Taking you to your dashboard…
          </p>
          {/* Animated dots while redirecting */}
          <div className="flex justify-center gap-1.5">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="w-2 h-2 bg-teal-400 rounded-full animate-bounce"
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
