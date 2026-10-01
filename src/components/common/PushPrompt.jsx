import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BellRing, Share, X, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Button } from './Button';
import { pushState, enablePush, syncPushSubscription } from '../../lib/push';

const DISMISS_KEY = 'afyawork_push_prompt_dismissed_at';
const SNOOZE_MS = 7 * 24 * 3600 * 1000; // ask again after a week

function dismissedRecently() {
  try {
    const t = Number(localStorage.getItem(DISMISS_KEY) || 0);
    return Date.now() - t < SNOOZE_MS;
  } catch { return false; }
}
function rememberDismiss() {
  try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* private mode */ }
}

/** Banner that invites COs and facilities to turn on phone notifications. */
export function PushPrompt() {
  const { t } = useTranslation();
  const { user, role } = useAuth();
  const [state, setState] = useState(() => pushState());
  const [hidden, setHidden] = useState(dismissedRecently);
  const [busy, setBusy] = useState(false);
  const [justEnabled, setJustEnabled] = useState(false);
  const [error, setError] = useState('');

  // Already allowed on this browser → quietly make sure it's linked to this user
  useEffect(() => {
    if (user?.id && state === 'granted') syncPushSubscription();
  }, [user?.id, state]);

  if (!user || (role !== 'co' && role !== 'facility')) return null;

  if (justEnabled) {
    return (
      <div className="max-w-6xl mx-auto px-4 mt-3">
        <div className="flex items-center gap-2 rounded-xl bg-teal-50 border border-teal-100 px-4 py-2.5 text-sm text-teal-800">
          <CheckCircle2 className="w-4 h-4 shrink-0" /> {t('push.enabled')}
        </div>
      </div>
    );
  }

  if (hidden || (state !== 'default' && state !== 'needs-install')) return null;

  async function onEnable() {
    setBusy(true); setError('');
    try {
      const res = await enablePush();
      setState(pushState());
      if (res.ok) {
        setJustEnabled(true);
        setTimeout(() => setJustEnabled(false), 4000);
      } else if (res.permission === 'denied') {
        setError(t('push.denied'));
      }
    } catch (e) {
      console.warn('enablePush failed:', e);
      setError(t('push.failed'));
    } finally {
      setBusy(false);
    }
  }

  function onDismiss() { rememberDismiss(); setHidden(true); }

  const needsInstall = state === 'needs-install';

  return (
    <div className="max-w-6xl mx-auto px-4 mt-3">
      <div className="relative flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl bg-white border border-teal-100 shadow-sm px-4 py-3">
        <div className="flex items-start gap-3 flex-1 min-w-0 pr-6 sm:pr-0">
          <div className="w-9 h-9 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center shrink-0">
            {needsInstall ? <Share className="w-5 h-5" /> : <BellRing className="w-5 h-5" />}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 text-sm">
              {needsInstall ? t('push.install_title') : t('push.title')}
            </p>
            <p className="text-sm text-gray-500">
              {needsInstall ? t('push.install_body') : t(role === 'co' ? 'push.body_co' : 'push.body_facility')}
            </p>
            {error && <p className="text-sm text-red-600 mt-1">{error}</p>}
          </div>
        </div>
        {!needsInstall && (
          <div className="flex gap-2 sm:shrink-0">
            <Button size="sm" onClick={onEnable} loading={busy}>{t('push.enable')}</Button>
            <Button size="sm" variant="ghost" onClick={onDismiss}>{t('push.not_now')}</Button>
          </div>
        )}
        <button
          onClick={onDismiss}
          aria-label={t('push.not_now')}
          className="absolute top-2.5 right-2.5 p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
