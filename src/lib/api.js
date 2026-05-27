import { supabase } from './supabase';

const FEE_RATE = parseFloat(import.meta.env.VITE_PLATFORM_FEE_RATE || '0.186');

// ── WhatsApp helper ───────────────────────────────────────────────
/**
 * Fire-and-forget WhatsApp notification.
 * Never throws — WA messages are best-effort and must not block the UI.
 */
function wa(event, shiftId = null, extra = {}) {
  supabase.functions
    .invoke('send-whatsapp', { body: { event, shift_id: shiftId, ...extra } })
    .catch((e) => console.warn('WA notification skipped:', e?.message));
}

export function calculateFee(coPay) {
  const fee = Math.round(coPay * FEE_RATE);
  return { co_pay: coPay, platform_fee: fee, total_facility_pays: coPay + fee };
}

// ── Shifts ──────────────────────────────────────────────────────────

// Shifts → facility_profiles goes through users (no direct FK), so we fetch separately
async function attachFacilityProfiles(shifts) {
  if (!shifts || shifts.length === 0) return shifts;
  const ids = [...new Set(shifts.map((s) => s.facility_id))];
  const { data: profiles } = await supabase
    .from('facility_profiles')
    .select('user_id, facility_name, facility_type, address, users(avatar_url, bio)')
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
  const { data: shifts, error } = await supabase
    .from('shifts')
    .select('*')
    .eq('facility_id', facilityId)
    .order('created_at', { ascending: false });

  if (error || !shifts || shifts.length === 0) return { data: shifts || [], error };

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

  const { data: applications, error: appError } = await supabase
    .from('applications')
    .select('*, users(display_name, phone, email, avatar_url, bio)')
    .eq('shift_id', shiftId)
    .order('applied_at', { ascending: true });

  if (appError) return { data: null, error: appError };

  const coIds = (applications || []).map((a) => a.co_id);
  const { data: coProfiles } = coIds.length
    ? await supabase
        .from('co_profiles')
        .select('user_id, license_number, specialization, subscription_tier, verified, employment_availability_status, available_from_immediately, available_from_date, preferred_location, preferred_location_text, current_employment_status, availability_note')
        .in('user_id', coIds)
    : { data: [] };

  const profileMap = Object.fromEntries((coProfiles || []).map((p) => [p.user_id, p]));
  const applicants = (applications || []).map((a) => ({
    ...a,
    co_profiles: profileMap[a.co_id] || null,
  }));

  // Fetch ratings for this shift (so facility can see if they've already rated)
  const { data: ratings } = await supabase
    .from('shift_ratings')
    .select('*')
    .eq('shift_id', shiftId);

  return { data: { ...shift, applicants, ratings: ratings || [] }, error: null };
}

export async function createShift(shiftData) {
  return supabase.from('shifts').insert(shiftData).select().single();
}

export async function cancelShift(shiftId) {
  return supabase.from('shifts').update({ status: 'cancelled' }).eq('id', shiftId);
}

// ── Applications ─────────────────────────────────────────────────

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
    .select(`
      *,
      shifts(
        id, shift_date, shift_type, pay_amount, status, facility_id, assigned_co_id,
        checkin_at, checkout_at, checkin_approved_at, checkout_approved_at,
        offer_expires_at, dispute_reason, dispute_raised_at, reliability_flag
      )
    `)
    .eq('co_id', coId)
    .order('applied_at', { ascending: false });

  if (error) return { data: null, error };
  if (!apps || apps.length === 0) return { data: [], error: null };

  const facilityIds = [...new Set(apps.map((a) => a.shifts?.facility_id).filter(Boolean))];
  const { data: profiles } = await supabase
    .from('facility_profiles')
    .select('user_id, facility_name, users(avatar_url, bio)')
    .in('user_id', facilityIds);

  const byId = Object.fromEntries((profiles || []).map((p) => [p.user_id, p]));

  // Fetch ratings by this CO so we know which shifts they've rated
  const shiftIds = apps.map((a) => a.shifts?.id).filter(Boolean);
  const { data: myRatings } = shiftIds.length
    ? await supabase
        .from('shift_ratings')
        .select('shift_id, stars')
        .eq('rater_id', coId)
        .in('shift_id', shiftIds)
    : { data: [] };

  const ratingMap = Object.fromEntries((myRatings || []).map((r) => [r.shift_id, r]));

  return {
    data: apps.map((a) => ({
      ...a,
      my_rating: ratingMap[a.shifts?.id] || null,
      shifts: a.shifts
        ? { ...a.shifts, facility_profiles: byId[a.shifts.facility_id] || null }
        : null,
    })),
    error: null,
  };
}

export async function approveApplication(applicationId) {
  const result = await supabase.rpc('approve_application', { application_id: applicationId });
  if (!result.error) {
    // Fetch the shift_id so we can pass it to the WA function
    const { data: app } = await supabase
      .from('applications').select('shift_id').eq('id', applicationId).single();
    if (app?.shift_id) wa('shift_offer', app.shift_id);
  }
  return result;
}

export async function rejectApplication(applicationId) {
  return supabase
    .from('applications')
    .update({ status: 'rejected' })
    .eq('id', applicationId);
}

// ── Feature 2: Shift lifecycle ───────────────────────────────────

/** CO accepts the shift offer */
export async function acceptShiftOffer(shiftId) {
  const result = await supabase.rpc('accept_shift_offer', { p_shift_id: shiftId });
  if (!result.error) wa('offer_accepted', shiftId);
  return result;
}

/** CO declines the shift offer (optionally with a reason) */
export async function declineShiftOffer(shiftId, reason = null) {
  const result = await supabase.rpc('decline_shift_offer', { p_shift_id: shiftId, p_reason: reason });
  if (!result.error) wa('offer_declined', shiftId);
  return result;
}

/** CO checks in at the start of shift (optionally with GPS coords) */
export async function coCheckin(shiftId, lat = null, lng = null) {
  const result = await supabase.rpc('co_checkin', { p_shift_id: shiftId, p_lat: lat, p_lng: lng });
  if (!result.error) wa('co_checked_in', shiftId);
  return result;
}

/** Facility confirms CO is on-site */
export async function approveCheckin(shiftId) {
  const result = await supabase.rpc('approve_checkin', { p_shift_id: shiftId });
  if (!result.error) wa('checkin_approved', shiftId);
  return result;
}

/** Facility disputes CO check-in claim */
export async function disputeCheckin(shiftId, reason) {
  const result = await supabase.rpc('dispute_checkin', { p_shift_id: shiftId, p_reason: reason });
  if (!result.error) wa('checkin_disputed', shiftId);
  return result;
}

/** CO checks out at the end of shift (optionally with GPS coords) */
export async function coCheckout(shiftId, lat = null, lng = null) {
  const result = await supabase.rpc('co_checkout', { p_shift_id: shiftId, p_lat: lat, p_lng: lng });
  if (!result.error) wa('co_checked_out', shiftId);
  return result;
}

/** Facility confirms end of shift → status: completed */
export async function approveCheckout(shiftId) {
  const result = await supabase.rpc('approve_checkout', { p_shift_id: shiftId });
  if (!result.error) wa('checkout_approved', shiftId);
  return result;
}

/** Facility disputes CO checkout claim */
export async function disputeCheckout(shiftId, reason) {
  const result = await supabase.rpc('dispute_checkout', { p_shift_id: shiftId, p_reason: reason });
  if (!result.error) wa('checkout_disputed', shiftId);
  return result;
}

/** Submit a star rating after shift completion */
export async function submitRating(shiftId, rateeId, stars, comment = null) {
  return supabase.rpc('submit_rating', {
    p_shift_id:  shiftId,
    p_ratee_id:  rateeId,
    p_stars:     stars,
    p_comment:   comment,
  });
}

/** Admin resolves a disputed shift */
export async function resolveDispute(shiftId, resolution, note = null) {
  const result = await supabase.rpc('resolve_dispute', {
    p_shift_id:   shiftId,
    p_resolution: resolution,
    p_note:       note,
  });
  if (!result.error) wa('dispute_resolved', shiftId, { resolution, note });
  return result;
}

// ── Notifications ────────────────────────────────────────────────

/** Fetch recent notifications for the current user */
export async function getNotifications(limit = 20) {
  return supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
}

/** Count unread notifications for the current user */
export async function getUnreadNotificationCount() {
  const { count } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('read', false);
  return count || 0;
}

/** Mark notifications as read */
export async function markNotificationsRead(ids) {
  if (!ids || ids.length === 0) return;
  return supabase
    .from('notifications')
    .update({ read: true })
    .in('id', ids);
}

/** Mark ALL unread notifications as read for current user */
export async function markAllNotificationsRead() {
  return supabase
    .from('notifications')
    .update({ read: true })
    .eq('read', false);
}

// ── Ratings ──────────────────────────────────────────────────────

/** Get all ratings received by a user (for profile display) */
export async function getUserRatings(userId) {
  return supabase
    .from('shift_ratings')
    .select('*, shifts(shift_date, shift_type), rater:rater_id(display_name, avatar_url, role)')
    .eq('ratee_id', userId)
    .eq('hidden_by_admin', false)
    .order('published_at', { ascending: false });
}

// ── Profiles ─────────────────────────────────────────────────────

export async function getCOProfile(userId) {
  return supabase
    .from('co_profiles')
    .select('*, users(display_name, email, phone, avatar_url, bio)')
    .eq('user_id', userId)
    .single();
}

export async function getFacilityProfile(userId) {
  return supabase
    .from('facility_profiles')
    .select('*, users(display_name, email, phone, avatar_url, bio)')
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

  const bust = `?t=${Date.now()}`;
  const url  = publicUrl + bust;

  const { error: updateError } = await supabase
    .from('users')
    .update({ avatar_url: url })
    .eq('id', userId);

  return { url, error: updateError || null };
}

// ── Dashboard Stats ──────────────────────────────────────────────

export async function getCODashboardStats(coId) {
  const [openShifts, myApps] = await Promise.all([
    supabase.from('shifts').select('id', { count: 'exact', head: true }).eq('status', 'open'),
    supabase.from('applications').select('status').eq('co_id', coId),
  ]);

  const apps = myApps.data || [];
  return {
    openShifts:     openShifts.count || 0,
    myApplications: apps.length,
    confirmed:      apps.filter((a) => a.status === 'approved').length,
    pending:        apps.filter((a) => a.status === 'pending').length,
  };
}

// ── Admin ────────────────────────────────────────────────────────

export async function getAdminStats() {
  const [usersRes, shiftsRes, appsRes] = await Promise.all([
    supabase.from('users').select('role'),
    supabase.from('shifts').select('status'),
    supabase.from('applications').select('status'),
  ]);
  const users  = usersRes.data  || [];
  const shifts = shiftsRes.data || [];
  const apps   = appsRes.data   || [];
  return {
    totalFacilities:  users.filter((u) => u.role === 'facility').length,
    totalWorkers:     users.filter((u) => u.role === 'co').length,
    totalShifts:      shifts.length,
    openShifts:       shifts.filter((s) => s.status === 'open').length,
    filledShifts:     shifts.filter((s) => s.status === 'filled').length,
    cancelledShifts:  shifts.filter((s) => s.status === 'cancelled').length,
    completedShifts:  shifts.filter((s) => s.status === 'completed').length,
    disputedShifts:   shifts.filter((s) => ['disputed_checkin','disputed_checkout'].includes(s.status)).length,
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
  const shiftIds    = shifts.map((s) => s.id);
  const [{ data: profiles }, { data: apps }] = await Promise.all([
    supabase.from('facility_profiles').select('user_id, facility_name').in('user_id', facilityIds),
    supabase.from('applications').select('shift_id').in('shift_id', shiftIds),
  ]);
  const profileMap  = Object.fromEntries((profiles || []).map((p) => [p.user_id, p]));
  const appCountMap = {};
  (apps || []).forEach((a) => { appCountMap[a.shift_id] = (appCountMap[a.shift_id] || 0) + 1; });
  return {
    data: shifts.map((s) => ({
      ...s,
      facility_profiles: profileMap[s.facility_id] || null,
      applicant_count:   appCountMap[s.id] || 0,
    })),
    error: null,
  };
}

// ── Admin CRUD ───────────────────────────────────────────────────

export async function adminCreateFacility({ email, facility_name, facility_type, address, phone }) {
  const { data: result, error } = await supabase.functions.invoke('admin-create-user', {
    body: { email, role: 'facility', facility_name, facility_type, address, phone },
  });
  if (error) return { data: null, error };
  if (result?.error) return { data: null, error: { message: result.error } };

  const inviteUrl = `https://afyawork.netlify.app/invite/setup?token=${result.invite_token}`;

  // Email invite (awaited — primary channel)
  await supabase.functions.invoke('send-invite-email', {
    body: {
      email:         result.email,
      display_name:  result.display_name,
      role:          result.role,
      invite_token:  result.invite_token,
      facility_name: result.display_name,
    },
  });

  // WhatsApp invite (fire-and-forget — requires phone)
  if (phone) {
    wa('invite', null, {
      to_phone:     phone,
      display_name: result.display_name,
      role:         'facility',
      invite_url:   inviteUrl,
    });
  }

  return { data: result, error: null };
}

export async function adminCreateWorker({ email, display_name, license_number, specialization, phone }) {
  const { data: result, error } = await supabase.functions.invoke('admin-create-user', {
    body: { email, role: 'co', display_name, license_number, specialization, phone },
  });
  if (error) return { data: null, error };
  if (result?.error) return { data: null, error: { message: result.error } };

  const inviteUrl = `https://afyawork.netlify.app/invite/setup?token=${result.invite_token}`;

  await supabase.functions.invoke('send-invite-email', {
    body: {
      email:        result.email,
      display_name: result.display_name,
      role:         result.role,
      invite_token: result.invite_token,
    },
  });

  if (phone) {
    wa('invite', null, {
      to_phone:     phone,
      display_name: result.display_name,
      role:         'co',
      invite_url:   inviteUrl,
    });
  }

  return { data: result, error: null };
}

// ── Feature 3: Employment Availability ──────────────────────────

/**
 * Update a CO's employment availability fields.
 * Pass available_from_date as "YYYY-MM" (month picker value) — we convert to
 * the first of that month before saving.
 */
export async function updateCOEmploymentAvailability(userId, data) {
  const payload = { ...data, availability_last_updated_at: new Date().toISOString() };
  // Normalise month-picker value ("2026-09") → first-of-month date ("2026-09-01")
  if (payload.available_from_date && payload.available_from_date.length === 7) {
    payload.available_from_date = payload.available_from_date + '-01';
  }
  // Clear fields that don't apply when not looking
  if (payload.employment_availability_status === 'not_looking') {
    payload.available_from_immediately  = false;
    payload.available_from_date         = null;
    payload.preferred_location          = null;
    payload.preferred_location_text     = null;
  }
  if (payload.preferred_location !== 'specific_region') {
    payload.preferred_location_text = null;
  }
  return supabase.from('co_profiles').update(payload).eq('user_id', userId);
}

/**
 * Search COs who are open to employment.
 * filters: { status?: 'open_fulltime'|'open_parttime', immediately?: boolean, available_by?: 'YYYY-MM-DD' }
 */
export async function searchCOsByAvailability(filters = {}) {
  let query = supabase
    .from('co_profiles')
    .select(`
      user_id, specialization, verified, subscription_tier,
      employment_availability_status, available_from_immediately, available_from_date,
      preferred_location, preferred_location_text, current_employment_status,
      availability_note, availability_last_updated_at,
      users(display_name, avatar_url, bio)
    `)
    .in('employment_availability_status', ['open_fulltime', 'open_parttime']);

  if (filters.status) {
    query = query.eq('employment_availability_status', filters.status);
  }
  if (filters.immediately) {
    query = query.eq('available_from_immediately', true);
  }
  if (filters.available_by) {
    // COs available on or before this date
    query = query.or(
      `available_from_immediately.eq.true,available_from_date.lte.${filters.available_by}`
    );
  }

  return query.order('availability_last_updated_at', { ascending: false, nullsFirst: false });
}

export async function adminResendInvite(userId) {
  const { data: result, error } = await supabase.rpc('admin_resend_invite', {
    p_user_id: userId,
  });
  if (error) return { error };

  const inviteUrl = `https://afyawork.netlify.app/invite/setup?token=${result.invite_token}`;

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

  // Fetch phone for WhatsApp resend
  const { data: userData } = await supabase
    .from('users').select('phone').eq('id', userId).single();
  if (userData?.phone) {
    wa('invite', null, {
      to_phone:     userData.phone,
      display_name: result.display_name,
      role:         result.role,
      invite_url:   inviteUrl,
    });
  }

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
  const openIds   = allShifts.filter((s) => s.status === 'open').map((s) => s.id);

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
    openShifts:       allShifts.filter((s) => s.status === 'open').length,
    filledShifts:     allShifts.filter((s) => s.status === 'filled').length,
    cancelledShifts:  allShifts.filter((s) => s.status === 'cancelled').length,
    completedShifts:  allShifts.filter((s) => s.status === 'completed').length,
    pendingApplicants,
  };
}
