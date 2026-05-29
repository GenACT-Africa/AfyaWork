/**
 * ICAGate — prompts CO workers to sign the ICA on first login.
 *
 * - If already signed: renders children silently.
 * - If not signed and not dismissed: shows the ICA modal.
 * - If dismissed ("Sign Later"): renders children, but ICAContext.signed = false
 *   so BrowseShifts can block the Apply action.
 *
 * Exports ICAContext so any CO page can read { signed, refresh }.
 */
import { createContext, useContext, useEffect, useState } from 'react';
import { FileText, CheckCircle2, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getCOICAStatus, signICA } from '../../lib/api';

export const ICAContext = createContext({ signed: false, refresh: () => {} });
export const useICA = () => useContext(ICAContext);

const SESSION_KEY = 'ica_modal_dismissed';

export default function ICAGate({ children }) {
  const { user } = useAuth();

  const [signed, setSigned]       = useState(false);
  const [status, setStatus]       = useState('loading'); // 'loading' | 'needed' | 'signed'
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem(SESSION_KEY) === '1');
  const [agreed, setAgreed]       = useState(false);
  const [signing, setSigning]     = useState(false);
  const [error, setError]         = useState('');

  async function fetchStatus() {
    if (!user?.id) return;
    const { signed: s } = await getCOICAStatus(user.id);
    setSigned(s);
    setStatus(s ? 'signed' : 'needed');
  }

  useEffect(() => { fetchStatus(); }, [user?.id]);

  async function handleSign() {
    if (!agreed) return;
    setSigning(true);
    const { error: err } = await signICA(user.id);
    setSigning(false);
    if (err) { setError('Could not record your signature. Please try again.'); return; }
    setSigned(true);
    setStatus('signed');
    sessionStorage.removeItem(SESSION_KEY);
  }

  function handleSignLater() {
    sessionStorage.setItem(SESSION_KEY, '1');
    setDismissed(true);
  }

  const ctx = { signed, refresh: fetchStatus };

  // Still loading
  if (status === 'loading') return null;

  // Already signed — transparent passthrough
  if (status === 'signed') {
    return <ICAContext.Provider value={ctx}>{children}</ICAContext.Provider>;
  }

  // Dismissed — show children with context (signed = false, shift apply blocked elsewhere)
  if (dismissed) {
    return <ICAContext.Provider value={ctx}>{children}</ICAContext.Provider>;
  }

  // ── ICA modal ─────────────────────────────────────────────────────────────
  return (
    <>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">

          {/* Header */}
          <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 shrink-0">
            <div className="w-10 h-10 bg-teal-50 border border-teal-100 rounded-xl flex items-center justify-center">
              <FileText className="w-5 h-5 text-teal-600" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-bold text-gray-900">Independent Contractor Agreement</h2>
              <p className="text-xs text-gray-400">Required before applying for shifts</p>
            </div>
            <button
              onClick={handleSignLater}
              className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600"
              title="Sign later"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* PDF viewer */}
          <div className="flex-1 overflow-hidden bg-gray-100">
            <iframe
              src="/AfyaWork_Independent_Contractor_Agreement.pdf"
              className="w-full h-full min-h-[420px]"
              title="Independent Contractor Agreement"
            />
          </div>

          {/* Footer */}
          <div className="px-6 py-5 border-t border-gray-100 bg-gray-50 shrink-0 space-y-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500 shrink-0"
              />
              <span className="text-sm text-gray-700 leading-relaxed">
                I have read, understood, and agree to the terms of the{' '}
                <span className="font-semibold text-gray-900">AfyaWork Independent Contractor Agreement</span>.
                I understand that my electronic acceptance constitutes a legally binding signature.
              </span>
            </label>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-100 px-4 py-2 rounded-xl">{error}</p>
            )}

            <div className="flex items-center gap-3">
              <a
                href="/AfyaWork_Independent_Contractor_Agreement.pdf"
                target="_blank" rel="noopener noreferrer"
                className="text-sm text-teal-600 font-semibold hover:underline"
              >
                Open in new tab ↗
              </a>
              <div className="flex-1" />
              <button
                onClick={handleSignLater}
                className="px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-500 hover:bg-gray-100 transition-colors"
              >
                Sign Later
              </button>
              <button
                onClick={handleSign}
                disabled={!agreed || signing}
                className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${
                  agreed && !signing
                    ? 'bg-gradient-to-r from-teal-600 to-teal-500 text-white hover:from-teal-700 hover:to-teal-600 shadow-sm hover:shadow'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }`}
              >
                {signing ? (
                  <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Signing…</>
                ) : (
                  <><CheckCircle2 className="w-4 h-4" />Sign Agreement</>
                )}
              </button>
            </div>

            <p className="text-xs text-gray-400 text-center">
              You can sign later from your Profile page, but you won't be able to apply for shifts until you do.
            </p>
          </div>
        </div>
      </div>

      {/* Blurred dashboard behind modal */}
      <div className="pointer-events-none select-none filter blur-sm">
        <ICAContext.Provider value={ctx}>{children}</ICAContext.Provider>
      </div>
    </>
  );
}
