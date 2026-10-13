import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Edge functions reply { error: "<what went wrong>" } with a 4xx/5xx status, but
// supabase-js only reports "Edge Function returned a non-2xx status code".
// Unwrap the function's own message so every screen shows the real reason.
// Note: supabase.functions is a getter that builds a new client on every access, so
// the wrapper has to go on the class prototype, not on one instance.
const fnProto = Object.getPrototypeOf(supabase.functions);
if (!fnProto.__afyaUnwrapped) {
  const rawInvoke = fnProto.invoke;
  fnProto.invoke = async function invoke(name, options) {
    const res = await rawInvoke.call(this, name, options);
    const err = res.error;
    if (!err) return res;
    const ctx = err.context;
    if (ctx && typeof ctx.json === 'function') {
      try {
        const body = await ctx.clone().json();
        const msg = body?.error || body?.message || body?.msg;
        if (msg) {
          err.message = String(msg);
          return { data: body ?? null, error: err };
        }
      } catch { /* not JSON — fall through */ }
      if (ctx.status === 401) err.message = 'Your session has expired. Sign in again.';
      else if (ctx.status === 403) err.message = 'You do not have permission to do this.';
      else if (ctx.status >= 500) err.message = `The server hit an error (${ctx.status}). Try again in a minute.`;
    } else if (err.name === 'FunctionsFetchError') {
      err.message = 'Could not reach AfyaWork. Check your internet connection and try again.';
    }
    return res;
  };
  fnProto.__afyaUnwrapped = true;
}
