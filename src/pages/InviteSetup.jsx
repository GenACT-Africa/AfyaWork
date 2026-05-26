import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Stethoscope, Eye, EyeOff, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';

// ── Password strength ─────────────────────────────────────────────

function getStrength(pwd) {
  let s = 0;
  if (pwd.length >= 8) s++;
  if (pwd.length >= 12) s++;
  if (/[A-Z]/.test(pwd)) s++;
  if (/[0-9]/.test(pwd)) s++;
  if (/[^A-Za-z0-9]/.test(pwd)) s++;
  return s; // 0–5
}

const strengthConfig = [
  { label: '', color: 'bg-gray-200' },
  { label: 'Too weak', color: 'bg-red-500' },
  { label: 'Weak', color: 'bg-orange-400' },
  { label: 'Fair', color: 'bg-amber-400' },
  { label: 'Good', color: 'bg-teal-400' },
  { label: 'Strong', color: 'bg-teal-600' },
];

function StrengthMeter({ password }) {
  if (!password) return null;
  const s = getStrength(password);
  const cfg = strengthConfig[s];
  return (
    <div className="mt-1.5">
      <div className="flex gap-1">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
              i <= Math.ceil(s / 1.25) ? cfg.color : 'bg-gray-200'
            }`}
          />
        ))}
      </div>
      {cfg.label && (
        <p className={`text-xs mt-1 ${s <= 2 ? 'text-red-500' : s <= 3 ? 'text-amber-500' : 'text-teal-600'}`}>
          {cfg.label}
        </p>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────

export default function InviteSetup() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  // Page state
  const [status, setStatus] = useState('loading'); // loading | invalid | ready | activating | done
  const [userInfo, setUserInfo] = useState(null); // { role, display_name, email }
  const [invalidReason, setInvalidReason] = useState('');

  // Form state
  const [password, setPassword] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [formError, setFormError] = useState('');

  // Validate token on mount
  useEffect(() => {
    if (!token) {
      setInvalidReason('No invite token found in the link. Please check the email you received.');
      setStatus('invalid');
      return;
    }
    supabase
      .rpc('validate_invite_token', { p_token: token })
      .then(({ data, error }) => {
        if (error || !data?.valid) {
          setInvalidReason(data?.reason || error?.message || 'This invite link is invalid.');
          setStatus('invalid');
        } else {
          setUserInfo({ role: data.role, display_name: data.display_name, email: data.email });
          setStatus('ready');
        }
      });
  }, [token]);

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError('');

    if (getStrength(password) < 2) {
      setFormError('Please choose a stronger password (min. 8 characters).');
      return;
    }
    if (password !== confirmPwd) {
      setFormError('Passwords do not match.');
      return;
    }

    setStatus('activating');

    // 1 — Activate account (sets real password in auth.users)
    const { data: result, error: rpcError } = await supabase.rpc('activate_account', {
      p_token: token,
      p_new_password: password,
    });

    if (rpcError || !result?.success) {
      setFormError(result?.reason || rpcError?.message || 'Activation failed. Please try again.');
      setStatus('ready');
      return;
    }

    // 2 — Auto sign-in with the new password
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: userInfo.email,
      password,
    });

    if (signInError) {
      // Show the exact error so the admin can diagnose it
      setFormError(`Account activated but sign-in failed: ${signInError.message}. Please try signing in manually.`);
      setStatus('ready');
      return;
    }

    // 3 — Show success, then redirect
    setStatus('done');
    const dest = userInfo.role === 'facility' ? '/facility/dashboard' : '/co/dashboard';
    setTimeout(() => navigate(dest, { replace: true }), 2500);
  }

  // ── Render states ──────────────────────────────────────────────

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-50 to-emerald-50">
        <div className="flex flex-col items-center gap-3 text-teal-600">
          <Stethoscope className="w-9 h-9 animate-pulse" />
          <p className="text-sm text-gray-500">Verifying your invite…</p>
        </div>
      </div>
    );
  }

  if (status === 'invalid') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-50 to-emerald-50 px-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8 text-center">
          <div className="w-14 h-14 rounded-2xl bg-red-100 flex items-center justify-center mx-auto mb-4">
            <XCircle className="w-7 h-7 text-red-600" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Invite link invalid</h1>
          <p className="text-sm text-gray-500 mb-6">{invalidReason}</p>
          <p className="text-xs text-gray-400">
            Contact <a href="mailto:admin@genactafrica.org" className="text-teal-600 underline">admin@genactafrica.org</a> if you need help.
          </p>
        </div>
      </div>
    );
  }

  if (status === 'done') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-50 to-emerald-50 px-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8 text-center">
          <div className="w-14 h-14 rounded-2xl bg-teal-100 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-7 h-7 text-teal-600" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Your account is active!</h1>
          <p className="text-sm text-gray-500">
            Welcome to AfyaWork{userInfo?.display_name ? `, ${userInfo.display_name}` : ''}. Taking you to your dashboard…
          </p>
          <div className="mt-4 w-8 h-1 bg-teal-500 rounded-full mx-auto animate-pulse" />
        </div>
      </div>
    );
  }

  // status === 'ready' | 'activating'
  const strength = getStrength(password);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-50 to-emerald-50 px-4 py-12">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2.5 mb-4">
            <div className="w-10 h-10 rounded-xl bg-teal-600 flex items-center justify-center shadow-md">
              <Stethoscope className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold text-gray-900">AfyaWork</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Set your password</h1>
          <p className="text-sm text-gray-500 mt-1">
            Welcome{userInfo?.display_name ? `, ${userInfo.display_name}` : ''}! Create a secure password to activate your account.
          </p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl p-8">
          {/* Email display */}
          <div className="mb-6 flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
            <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center shrink-0 text-teal-700 text-xs font-bold">
              {(userInfo?.display_name || userInfo?.email || '?')[0].toUpperCase()}
            </div>
            <div>
              <p className="text-xs text-gray-400">Signing in as</p>
              <p className="text-sm font-semibold text-gray-800">{userInfo?.email}</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                New password
              </label>
              <div className="relative">
                <input
                  type={showPwd ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Create a strong password"
                  required
                  autoComplete="new-password"
                  className="w-full pr-10 pl-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  tabIndex={-1}
                >
                  {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <StrengthMeter password={password} />
            </div>

            {/* Confirm password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Confirm password
              </label>
              <div className="relative">
                <input
                  type={showConfirm ? 'text' : 'password'}
                  value={confirmPwd}
                  onChange={(e) => setConfirmPwd(e.target.value)}
                  placeholder="Re-enter your password"
                  required
                  autoComplete="new-password"
                  className="w-full pr-10 pl-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  tabIndex={-1}
                >
                  {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {confirmPwd && password !== confirmPwd && (
                <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> Passwords don't match
                </p>
              )}
              {confirmPwd && password === confirmPwd && password.length > 0 && (
                <p className="text-xs text-teal-600 mt-1 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Passwords match
                </p>
              )}
            </div>

            {formError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-100 px-4 py-3 rounded-xl">
                {formError}
              </p>
            )}

            <button
              type="submit"
              disabled={status === 'activating' || strength < 2 || password !== confirmPwd}
              className="w-full bg-teal-600 hover:bg-teal-700 disabled:bg-teal-300 text-white font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              {status === 'activating' ? (
                <>
                  <Stethoscope className="w-4 h-4 animate-pulse" />
                  Activating…
                </>
              ) : (
                'Set Password & Activate Account'
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          This link expires 7 days from when it was sent.
        </p>
      </div>
    </div>
  );
}
