import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Edge functions reply { error: "<what went wrong>" } with a 4xx/5xx status, but
// supabase-js only reports "Edge Function returned a non-2xx status code".
// Unwrap the function's own message so every screen shows the real reason.
const rawInvoke = supabase.functions.invoke.bind(supabase.functions);
supabase.functions.invoke = async (name, options) => {
  const res = await rawInvoke(name, options);
  const err = res.error;
  if (!err) return res;
  if (err.name === 'FunctionsHttpError' && err.context && typeof err.context.json === 'function') {
    try {
      const body = await err.context.clone().json();
      const msg = body?.error || body?.message || body?.msg;
      if (msg) err.message = String(msg);
      return { data: body ?? null, error: err };
    } catch { /* not JSON — keep the default message */ }
    if (err.context.status === 401) err.message = 'Your session has expired. Sign in again.';
    else if (err.context.status === 403) err.message = 'You do not have permission to do this.';
  } else if (err.name === 'FunctionsFetchError') {
    err.message = 'Could not reach AfyaWork. Check your internet connection and try again.';
  }
  return res;
};
