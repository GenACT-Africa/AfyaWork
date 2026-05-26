import { supabase } from './supabase';

const FEE_RATE = parseFloat(import.meta.env.VITE_PLATFORM_FEE_RATE || '0.186');

export function calculateFee(coPay) {
  const fee = Math.round(coPay * FEE_RATE);
  return { co_pay: coPay, platform_fee: fee, total_facility_pays: coPay + fee };
}

// ── Shifts ──

// Shifts → facility_profiles goes through users (no direct FK), so we fetch separately
async function attachFacilityProfiles(shifts) {
  if (!shifts || shifts.length === 0) return shifts;
  const ids = [...new Set(shifts.map((s) => s.facility_id))];
  const { data: profiles } = await supabase
    .from('facility_profiles')
    .select('user_id, facility_name, facility_type, address, users(avatar_url)')
    .in('user_id', ids);
  const byId = Object.fromEntries((profiles || []).map((p) => [p.user_id, p]));
  return shifts.map((s) => ({ ...s, facility_profiles: byId[s.facility_id] || null }));
}

export async function getOpenShifts() {
  const { data, error } = await supabase
    .from('shifts')
    .select('*')
    .eq('status', 'open')
    .order('shift_date', { ascending: true });
  if (error) return { data: null, error };
  return { data: await attachFacilityProfiles(data), error: null };
}

export async function getFacilityShifts(facilityId) {
  // Fetch shifts without the applications(count) join — count separately to avoid RLS edge cases
  const { data: shifts, error } = await supabase
    .from('shifts')
    .select('*')
    .eq('facility_id', facilityId)
    .order('created_at', { ascending: false });

  if (error || !shifts || shifts.length === 0) return { data: shifts || [], error };

  // Count pending applications per shift
  const shiftIds = shifts.map((s) => s.id);
  const { data: appCounts } = await supabase
    .from('applications')
    .select('shift_id, status')
    .in('shift_id', shiftIds);

  const countMap = {};
  (appCounts || []).forEach(({ shift_id }) => {
    countMap[shift_id] = (countMap[shift_id] || 0) + 1;
  });

  return {
    data: shifts.map((s) => ({ ...s, applicant_count: countMap[s.id] || 0 })),
    error: null,
  };
}

export async function getShiftWithApplicants(shiftId) {
  const { data: shift, error: shiftError } = await supabase
    .from('shifts')
    .select('*')
    .eq('id', shiftId)
    .single();

  if (shiftError) return { data: null, error: shiftError };

  // Fetch applications with user info (direct FK: applications.co_id → users.id)
  const { data: applications, error: appError } = await supabase
    .from('applications')
    .select('*, users(display_name, phone, email, avatar_url)')
    .eq('shift_id', shiftId)
    .order('applied_at', { ascending: true });

  if (appError) return { data: null, error: appError };

  // Attach co_profiles separately (no direct FK from applications to co_profiles)
  const coIds = (applications || []).map((a) => a.co_id);
  const { data: coProfiles } = coIds.length
    ? await supabase
        .from('co_profiles')
        .select('user_id, license_number, specialization, subscription_tier')
        .in('user_id', coIds)
    : { data: [] };

  const profileMap = Object.fromEntries((coProfiles || []).map((p) => [p.user_id, p]));
  const applicants = (applications || []).map((a) => ({
    ...a,
    co_profiles: profileMap[a.co_id] || null,
  }));

  return { data: { ...shift, applicants }, error: null };
}

export async function createShift(shiftData) {
  return supabase.from('shifts').insert(shiftData).select().single();
}

export async function cancelShift(shiftId) {
  return supabase.from('shifts').update({ status: 'cancelled' }).eq('id', shiftId);
}

// ── Applications ──

export async function applyToShift(shiftId, coId) {
  return supabase
    .from('applications')
    .insert({ shift_id: shiftId, co_id: coId })
    .select()
    .single();
}

export async function getMyCOApplications(coId) {
  const { data: apps, error } = await supabase
    .from('applications')
    .select('*, shifts(shift_id:id, shift_date, shift_type, pay_amount, status, facility_id)')
    .eq('co_id', coId)
    .order('applied_at', { ascending: false });

  if (error) return { data: null, error };
  if (!apps || apps.length === 0) return { data: [], error: null };

  // Attach facility names separately (shifts → facility_profiles has no direct FK)
  const facilityIds = [...new Set(apps.map((a) => a.shifts?.facility_id).filter(Boolean))];
  const { data: profiles } = await supabase
    .from('facility_profiles')
    .select('user_id, facility_name')
    .in('user_id', facilityIds);

  const byId = Object.fromEntries((profiles || []).map((p) => [p.user_id, p]));
  return {
    data: apps.map((a) => ({
      ...a,
      shifts: a.shifts
        ? { ...a.shifts, facility_profiles: byId[a.shifts.facility_id] || null }
        : null,
    })),
    error: null,
  };
}

export async function approveApplication(applicationId) {
  return supabase.rpc('approve_application', { application_id: applicationId });
}

export async function rejectApplication(applicationId) {
  return supabase
    .from('applications')
    .update({ status: 'rejected' })
    .eq('id', applicationId);
}

// ── Profiles ──

export async function getCOProfile(userId) {
  return supabase
    .from('co_profiles')
    .select('*, users(display_name, email, phone, avatar_url)')
    .eq('user_id', userId)
    .single();
}

export async function getFacilityProfile(userId) {
  return supabase
    .from('facility_profiles')
    .select('*, users(display_name, email, phone, avatar_url)')
    .eq('user_id', userId)
    .single();
}

export async function updateCOProfile(userId, updates) {
  return supabase.from('co_profiles').update(updates).eq('user_id', userId);
}

export async function updateFacilityProfile(userId, updates) {
  return supabase.from('facility_profiles').update(updates).eq('user_id', userId);
}

export async function updateUserProfile(userId, updates) {
  return supabase.from('users').update(updates).eq('id', userId);
}

/**
 * Upload a profile picture to Supabase Storage and update avatar_url in public.users.
 * Returns { url, error }.
 */
export async function uploadAvatar(userId, file) {
  const ext  = file.name.split('.').pop().toLowerCase();
  const path = `${userId}/avatar.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(path, file, { upsert: true, contentType: file.type });

  if (uploadError) return { url: null, error: uploadError };

  const { data: { publicUrl } } = supabase.storage
    .from('avatars')
    .getPublicUrl(path);

  // Append cache-buster so browsers reload after re-upload
  const bust = `?t=${Date.now()}`;
  const url  = publicUrl + bust;

  const { error: updateError } = await supabase
    .from('users')
    .update({ avatar_url: url })
    .eq('id', userId);

  return { url, error: updateError || null };
}

// ── Dashboard Stats ──

export async function getCODashboardStats(coId) {
  const [openShifts, myApps] = await Promise.all([
    supabase.from('shifts').select('id', { count: 'exact', head: true }).eq('status', 'open'),
    supabase.from('applications').select('status').eq('co_id', coId),
  ]);

  const apps = myApps.data || [];
  return {
    openShifts: openShifts.count || 0,
    myApplications: apps.length,
    confirmed: apps.filter((a) => a.status === 'approved').length,
    pending: apps.filter((a) => a.status === 'pending').length,
  };
}

// ── Admin ──

export async function getAdminStats() {
  const [usersRes, shiftsRes, appsRes] = await Promise.all([
    supabase.from('users').select('role'),
    supabase.from('shifts').select('status'),
    supabase.from('applications').select('status'),
  ]);
  const users = usersRes.data || [];
  const shifts = shiftsRes.data || [];
  const apps = appsRes.data || [];
  return {
    totalFacilities:  users.filter((u) => u.role === 'facility').length,
    totalWorkers:     users.filter((u) => u.role === 'co').length,
    totalShifts:      shifts.length,
    openShifts:       shifts.filter((s) => s.status === 'open').length,
    filledShifts:     shifts.filter((s) => s.status === 'filled').length,
    cancelledShifts:  shifts.filter((s) => s.status === 'cancelled').length,
    totalApps:        apps.length,
    pendingApps:      apps.filter((a) => a.status === 'pending').length,
    approvedApps:     apps.filter((a) => a.status === 'approved').length,
  };
}

export async function getAdminFacilities() {
  const { data, error } = await supabase
    .from('facility_profiles')
    .select('*, users(email, phone, created_at, account_status, invited_at, avatar_url)')
    .order('facility_name', { ascending: true });
  if (error || !data) return { data: [], error };

  const ids = data.map((f) => f.user_id);
  const { data: shifts } = await supabase.from('shifts').select('facility_id, status').in('facility_id', ids);
  const shiftMap = {};
  (shifts || []).forEach((s) => {
    if (!shiftMap[s.facility_id]) shiftMap[s.facility_id] = { total: 0, open: 0 };
    shiftMap[s.facility_id].total++;
    if (s.status === 'open') shiftMap[s.facility_id].open++;
  });
  return { data: data.map((f) => ({ ...f, shift_stats: shiftMap[f.user_id] || { total: 0, open: 0 } })), error: null };
}

export async function getAdminWorkers() {
  const { data, error } = await supabase
    .from('co_profiles')
    .select('*, users(email, phone, display_name, created_at, account_status, invited_at, avatar_url)')
    .order('user_id', { ascending: true });
  if (error || !data) return { data: [], error };

  const ids = data.map((c) => c.user_id);
  const { data: apps } = await supabase.from('applications').select('co_id, status').in('co_id', ids);
  const appMap = {};
  (apps || []).forEach((a) => {
    if (!appMap[a.co_id]) appMap[a.co_id] = { total: 0, approved: 0 };
    appMap[a.co_id].total++;
    if (a.status === 'approved') appMap[a.co_id].approved++;
  });
  return { data: data.map((c) => ({ ...c, app_stats: appMap[c.user_id] || { total: 0, approved: 0 } })), error: null };
}

export async function getAdminShifts() {
  const { data: shifts, error } = await supabase
    .from('shifts').select('*').order('created_at', { ascending: false });
  if (error || !shifts) return { data: [], error };

  const facilityIds = [...new Set(shifts.map((s) => s.facility_id))];
  const shiftIds = shifts.map((s) => s.id);
  const [{ data: profiles }, { data: apps }] = await Promise.all([
    supabase.from('facility_profiles').select('user_id, facility_name').in('user_id', facilityIds),
    supabase.from('applications').select('shift_id').in('shift_id', shiftIds),
  ]);
  const profileMap = Object.fromEntries((profiles || []).map((p) => [p.user_id, p]));
  const appCountMap = {};
  (apps || []).forEach((a) => { appCountMap[a.shift_id] = (appCountMap[a.shift_id] || 0) + 1; });
  return {
    data: shifts.map((s) => ({
      ...s,
      facility_profiles: profileMap[s.facility_id] || null,
      applicant_count: appCountMap[s.id] || 0,
    })),
    error: null,
  };
}

// ── Admin CRUD ──

/**
 * Create a facility via admin.
 * Uses the admin-create-user Edge Function (Supabase Admin API) for correct auth setup.
 */
export async function adminCreateFacility({ email, facility_name, facility_type, address, phone }) {
  const { data: result, error } = await supabase.functions.invoke('admin-create-user', {
    body: { email, role: 'facility', facility_name, facility_type, address, phone },
  });
  if (error) return { data: null, error };
  if (result?.error) return { data: null, error: { message: result.error } };

  // Send invite email (best-effort)
  await supabase.functions.invoke('send-invite-email', {
    body: {
      email:         result.email,
      display_name:  result.display_name,
      role:          result.role,
      invite_token:  result.invite_token,
      facility_name: result.display_name,
    },
  });

  return { data: result, error: null };
}

/**
 * Create a worker via admin.
 * Uses the admin-create-user Edge Function (Supabase Admin API) for correct auth setup.
 */
export async function adminCreateWorker({ email, display_name, license_number, specialization, phone }) {
  const { data: result, error } = await supabase.functions.invoke('admin-create-user', {
    body: { email, role: 'co', display_name, license_number, specialization, phone },
  });
  if (error) return { data: null, error };
  if (result?.error) return { data: null, error: { message: result.error } };

  await supabase.functions.invoke('send-invite-email', {
    body: {
      email:        result.email,
      display_name: result.display_name,
      role:         result.role,
      invite_token: result.invite_token,
    },
  });

  return { data: result, error: null };
}

/**
 * Resend invite to a pending/expired user. Generates a new token and sends the email.
 */
export async function adminResendInvite(userId) {
  const { data: result, error } = await supabase.rpc('admin_resend_invite', {
    p_user_id: userId,
  });
  if (error) return { error };

  await supabase.functions.invoke('send-invite-email', {
    body: {
      email:         result.email,
      display_name:  result.display_name,
      role:          result.role,
      invite_token:  result.invite_token,
      facility_name: result.display_name,
      is_resend:     true,
    },
  });

  return { error: null };
}

export async function adminUpdateFacility(userId, { facility_name, facility_type, address, phone }) {
  const [profileRes, userRes] = await Promise.all([
    supabase.from('facility_profiles').update({ facility_name, facility_type, address }).eq('user_id', userId),
    supabase.from('users').update({ display_name: facility_name, phone }).eq('id', userId),
  ]);
  return { error: profileRes.error || userRes.error || null };
}

export async function adminUpdateWorker(userId, { display_name, license_number, specialization, phone }) {
  const [profileRes, userRes] = await Promise.all([
    supabase.from('co_profiles').update({ license_number, specialization }).eq('user_id', userId),
    supabase.from('users').update({ display_name, phone }).eq('id', userId),
  ]);
  return { error: profileRes.error || userRes.error || null };
}

export async function adminDeleteUser(userId) {
  return supabase.rpc('admin_delete_user', { p_user_id: userId });
}

export async function getFacilityDashboardStats(facilityId) {
  const { data: shifts } = await supabase
    .from('shifts')
    .select('id, status')
    .eq('facility_id', facilityId);

  const allShifts = shifts || [];
  const openIds = allShifts.filter((s) => s.status === 'open').map((s) => s.id);

  let pendingApplicants = 0;
  if (openIds.length > 0) {
    const { count } = await supabase
      .from('applications')
      .select('id', { count: 'exact', head: true })
      .in('shift_id', openIds)
      .eq('status', 'pending');
    pendingApplicants = count || 0;
  }

  return {
    openShifts: allShifts.filter((s) => s.status === 'open').length,
    filledShifts: allShifts.filter((s) => s.status === 'filled').length,
    cancelledShifts: allShifts.filter((s) => s.status === 'cancelled').length,
    pendingApplicants,
  };
}
