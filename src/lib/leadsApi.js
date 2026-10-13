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

// ── Leads ─────────────────────────────────────────────────────────────────
/** All leads with manual + auto ticks and limited facility status (or one lead, with its files). */
export async function getLeadBoard(leadId = null) {
  const { data, error } = await supabase.rpc('lead_board', { p_lead_id: leadId });
  return { data: data || [], error };
}

const LEAD_COLS = ['name', 'hfr_code', 'official_phone', 'contact_name', 'contact_role', 'language', 'status',
  'due_date', 'notes', 'pay_per_shift_tzs', 'cos_per_month', 'licence_expiry', 'map_url'];

export async function createLead(fields) {
  const row = Object.fromEntries(Object.entries(fields)
    .filter(([k, v]) => (LEAD_COLS.includes(k) || k === 'owner_id') && v !== '' && v != null));
  const { data, error } = await supabase.from('facility_leads').insert(row).select('id').single();
  return { data, error: friendlyLeadError(error) };
}

export async function updateLead(leadId, patch) {
  const clean = Object.fromEntries(Object.entries(patch).filter(([k]) => LEAD_COLS.includes(k))
    .map(([k, v]) => [k, v === '' ? null : v]));
  const { error } = await supabase.from('facility_leads').update(clean).eq('id', leadId);
  return { error: friendlyLeadError(error) };
}

export const deleteLead = (leadId) => supabase.from('facility_leads').delete().eq('id', leadId);

export const tickStep = (leadId, stepId) => supabase.from('lead_steps').insert({ lead_id: leadId, step_id: stepId });
export const untickStep = (leadId, stepId) => supabase.from('lead_steps').delete().eq('lead_id', leadId).eq('step_id', stepId);

/** Admin: link a lead to a facility account, or unlink (null). */
export const setLeadFacility = (leadId, facilityId) =>
  supabase.from('facility_leads').update({ facility_profile_id: facilityId }).eq('id', leadId);

export async function lookupLeadHfr(leadId) {
  const { data, error } = await supabase.functions.invoke('verify-facility', { body: { lead_id: leadId } });
  return { data, error: fnError(data, error) };
}

export async function getLeadEvents(leadId) {
  return supabase.from('lead_events').select('id, action, detail, actor_id, created_at')
    .eq('lead_id', leadId).order('created_at', { ascending: false }).limit(100);
}

function friendlyLeadError(error) {
  if (!error) return null;
  if (error.code === '23505' && /already on the lead/.test(error.message || '')) {
    return Object.assign(new Error(`${error.message}. Open that lead instead.`), { leadId: error.details || null });
  }
  return error;
}

// ── Files (private bucket 'lead-files') ──────────────────────────────────
export const FILE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

export async function uploadLeadFile(leadId, kind, file) {
  if (!FILE_TYPES.includes(file.type)) return { error: new Error('Only photos (JPG, PNG, WebP, HEIC) and PDF files.') };
  if (file.size > MAX_FILE_BYTES) return { error: new Error('Files must be under 10 MB.') };
  const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5);
  const path = `${leadId}/${kind}-${crypto.randomUUID()}.${ext}`;
  const { error: upErr } = await supabase.storage.from('lead-files').upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) return { error: upErr };
  const { error } = await supabase.from('lead_files').insert({
    lead_id: leadId, kind, storage_path: path, file_name: file.name.slice(0, 200), mime_type: file.type, size_bytes: file.size,
  });
  if (error) {
    await supabase.storage.from('lead-files').remove([path]).catch(() => {});
    return { error };
  }
  return { error: null };
}

/** Short-lived link to view a file (60 s). */
export async function leadFileUrl(path) {
  const { data, error } = await supabase.storage.from('lead-files').createSignedUrl(path, 60);
  return { url: data?.signedUrl || null, error };
}

/** Admin: remove a file (row + stored object). */
export async function deleteLeadFile(file) {
  const { error } = await supabase.from('lead_files').delete().eq('id', file.id);
  if (error) return { error };
  await supabase.storage.from('lead-files').remove([file.storage_path]);
  return { error: null };
}

// ── Contract (admin) ─────────────────────────────────────────────────────
export const setContractSigned = (facilityId, signed, fileId = null, note = null) =>
  supabase.rpc('admin_set_contract_signed', { p_facility_id: facilityId, p_signed: signed, p_file_id: fileId, p_note: note });

/** Admin: the lead linked to a facility, with its contract scans (for the verification panel). */
export async function getFacilityLeadContracts(facilityId) {
  const { data: lead } = await supabase.from('facility_leads').select('id, name').eq('facility_profile_id', facilityId).maybeSingle();
  if (!lead) return { lead: null, files: [] };
  const { data: files } = await supabase.from('lead_files').select('id, file_name, storage_path, created_at, kind')
    .eq('lead_id', lead.id).eq('kind', 'contract_scan').order('created_at', { ascending: false });
  return { lead, files: files || [] };
}
