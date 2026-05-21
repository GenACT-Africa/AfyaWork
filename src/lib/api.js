import { supabase } from './supabase';

const FEE_RATE = parseFloat(import.meta.env.VITE_PLATFORM_FEE_RATE || '0.186');

export function calculateFee(coPay) {
  const fee = Math.round(coPay * FEE_RATE);
  return { co_pay: coPay, platform_fee: fee, total_facility_pays: coPay + fee };
}

// ── Shifts ──

export async function getOpenShifts() {
  return supabase
    .from('shifts')
    .select(`*, facility_profiles(facility_name, facility_type, address)`)
    .eq('status', 'open')
    .order('shift_date', { ascending: true });
}

export async function getFacilityShifts(facilityId) {
  return supabase
    .from('shifts')
    .select(`*, applications(count)`)
    .eq('facility_id', facilityId)
    .order('created_at', { ascending: false });
}

export async function getShiftWithApplicants(shiftId) {
  const { data: shift, error: shiftError } = await supabase
    .from('shifts')
    .select('*')
    .eq('id', shiftId)
    .single();

  if (shiftError) return { data: null, error: shiftError };

  const { data: applicants, error: appError } = await supabase
    .from('applications')
    .select(`*, users(display_name, phone, email), co_profiles(license_number, specialization, subscription_tier)`)
    .eq('shift_id', shiftId)
    .order('applied_at', { ascending: true });

  return { data: { ...shift, applicants: applicants || [] }, error: appError };
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
  return supabase
    .from('applications')
    .select(`*, shifts(shift_date, shift_type, pay_amount, status, facility_profiles(facility_name))`)
    .eq('co_id', coId)
    .order('applied_at', { ascending: false });
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
    .select('*, users(display_name, email, phone)')
    .eq('user_id', userId)
    .single();
}

export async function getFacilityProfile(userId) {
  return supabase
    .from('facility_profiles')
    .select('*, users(display_name, email, phone)')
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
