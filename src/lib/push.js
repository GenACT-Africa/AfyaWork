// Browser push notifications: permission, subscription and device registration.
import { supabase } from './supabase';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || '';

function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export function isIOS() {
  const ua = navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
}

/** Running as an installed home-screen app (needed for push on iPhone). */
export function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

/** 'unsupported' | 'needs-install' | 'default' | 'granted' | 'denied' */
export function pushState() {
  if (!VAPID_PUBLIC_KEY) return 'unsupported';
  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (!supported) return isIOS() && !isStandalone() ? 'needs-install' : 'unsupported';
  return Notification.permission; // 'default' | 'granted' | 'denied'
}

async function registration() {
  const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  await navigator.serviceWorker.ready;
  return reg;
}

async function saveSubscription(sub) {
  const json = sub.toJSON();
  const { error } = await supabase.rpc('save_push_subscription', {
    p_endpoint: json.endpoint,
    p_p256dh: json.keys.p256dh,
    p_auth: json.keys.auth,
    p_user_agent: navigator.userAgent.slice(0, 300),
  });
  if (error) throw error;
}

/** Ask permission (must be called from a tap/click) and register this device. */
export async function enablePush() {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return { ok: false, permission };
  const reg = await registration();
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }
  await saveSubscription(sub);
  return { ok: true, permission };
}

/**
 * Called after sign-in: if this browser already allowed notifications, make
 * sure the device is registered to the user who is signed in now.
 */
export async function syncPushSubscription() {
  try {
    if (pushState() !== 'granted') return;
    const reg = await registration();
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }
    await saveSubscription(sub);
  } catch (e) {
    console.warn('Push sync skipped:', e?.message);
  }
}

/** Called before sign-out so a shared phone stops receiving this user's alerts. */
export async function detachPushSubscription() {
  try {
    if (!('serviceWorker' in navigator)) return;
    const reg = await navigator.serviceWorker.getRegistration('/');
    const sub = await reg?.pushManager.getSubscription();
    if (sub) await supabase.rpc('remove_push_subscription', { p_endpoint: sub.endpoint });
  } catch (e) {
    console.warn('Push detach skipped:', e?.message);
  }
}

// If the browser rotates the subscription, the service worker tells us
if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener?.('message', (event) => {
    if (event.data?.type === 'push-subscription-changed') syncPushSubscription();
  });
}
