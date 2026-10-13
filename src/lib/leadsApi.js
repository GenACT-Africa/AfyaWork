// Coordinator pipeline: facility leads, steps, files, coordinators.
// Every call goes through RLS / SECURITY DEFINER RPCs in 20261016000000_coordinator_leads.sql.
import { supabase } from './supabase';

const fnError = (data, error) => error || (data?.error ? new Error(data.error) : null);

// ── Coordinators (admin) ──────────────────────────────────────────────────
export async function listCoordinators() {
  const { data, error } = await supabase.functions.invoke('coordinator-admin', { body: { action: 'list' } });
  return { data: data?.coordinators || [], error: fnError(data, error) };
}

export async function inviteCoordinator({ display_name, email, phone }) {
  const { data, error } = await supabase.functions.invoke('coordinator-admin', {
    body: { action: 'invite', display_name, email, phone },
  });
  const err = fnError(data, error);
  if (err) return { error: err };
  const { error: mailErr } = await supabase.functions.invoke('send-invite-email', {
    body: { email: data.email, display_name: data.display_name, role: 'coordinator', invite_token: data.invite_token },
  });
  return { data, error: null, mailError: mailErr || null };
}

export async function setCoordinatorAccess(userId, revoke) {
  const { data, error } = await supabase.functions.invoke('coordinator-admin', {
    body: { action: revoke ? 'revoke' : 'restore', user_id: userId },
  });
  return { data, error: fnError(data, error) };
}

export const reassignLeads = (fromId, toId) => supabase.rpc('admin_reassign_leads', { p_from: fromId, p_to: toId });
export const setLeadOwner  = (leadId, ownerId) => supabase.rpc('admin_set_lead_owner', { p_lead_id: leadId, p_owner_id: ownerId });

/** Admins + coordinators (names for owners and "ticked by"). */
export async function getLeadStaff() {
  const { data, error } = await supabase.rpc('lead_staff');
  return { data: data || [], error };
}
