import { useEffect, useState } from 'react';
import { ShieldCheck, RefreshCw, BadgeCheck, XCircle, ExternalLink, Phone, MessageCircle } from 'lucide-react';
import { HFR_STATUS, hfrStatusOf } from './hfrStatus';
import { Button } from '../common/Button';
import { Section } from './ProfileKit';
import { formatDate } from './profileUtils';
import {
  adminCheckFacilityHfr, adminSetFacilityVerification, adminSetFacilityHfrCode, getFacilityHfrChecks,
} from '../../lib/api';

const HFR_PORTAL = 'https://hfrs.moh.go.tz/web/index.php?r=portal%2Fadvanced-search';

const TONES = {
  gray:  'text-gray-600 bg-gray-50 border-gray-200',
  green: 'text-green-700 bg-green-50 border-green-200',
  amber: 'text-amber-700 bg-amber-50 border-amber-200',
  red:   'text-red-700 bg-red-50 border-red-200',
};

export function HfrStatusBadge({ facility, status, className = '' }) {
  const s = HFR_STATUS[status ?? hfrStatusOf(facility)] || HFR_STATUS.unchecked;
  const Icon = s.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${TONES[s.tone]} ${className}`}>
      <Icon className="w-3.5 h-3.5" /> {s.label}
    </span>
  );
}

/** Tanzanian number in any common format → 2557XXXXXXXX (for tel: / wa.me), or null. */
function tzIntl(raw) {
  const d = String(raw || '').replace(/\D/g, '');
  if (/^0[67]\d{8}$/.test(d)) return `255${d.slice(1)}`;
  if (/^255[67]\d{8}$/.test(d)) return d;
  if (/^[67]\d{8}$/.test(d)) return `255${d}`;
  return null;
}

const pct = (n) => (n == null ? '—' : `${Math.round(n * 100)}%`);

/**
 * Admin panel on the facility profile: latest HFR lookup and the decision.
 * `profile` is the facility_profiles row with users(...) joined.
 */
export function HfrVerificationPanel({ profile, onChanged }) {
  const [checks, setChecks] = useState(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [note, setNote] = useState('');
  const [code, setCode] = useState(profile.hfr_code || '');

  const facilityId = profile.user_id;
  const last = checks?.[0];
  const status = hfrStatusOf(profile);

  function loadChecks() {
    return getFacilityHfrChecks(facilityId).then(({ data }) => setChecks(data || []));
  }
  useEffect(() => {
    let alive = true;
    getFacilityHfrChecks(facilityId).then(({ data }) => { if (alive) setChecks(data || []); });
    return () => { alive = false; };
  }, [facilityId]);

  async function runCheck() {
    setBusy('check'); setMsg('');
    const { data, error } = await adminCheckFacilityHfr(facilityId);
    setBusy('');
    if (error) { setMsg(`Check failed: ${error.message}`); return; }
    setMsg(data?.message || '');
    await loadChecks();
    onChanged?.();
  }

  async function saveCode() {
    setBusy('code'); setMsg('');
    const { error } = await adminSetFacilityHfrCode(facilityId, code);
    if (error) { setBusy(''); setMsg(error.message); return; }
    const { data, error: e2 } = await adminCheckFacilityHfr(facilityId);
    setBusy('');
    setMsg(e2 ? `Saved, but the check failed: ${e2.message}` : data?.message || 'Saved');
    await loadChecks();
    onChanged?.();
  }

  async function decide(verified) {
    setBusy(verified ? 'approve' : 'reject'); setMsg('');
    const { error } = await adminSetFacilityVerification(facilityId, verified, note.trim() || null);
    setBusy('');
    if (error) { setMsg(error.message); return; }
    setNote('');
    onChanged?.();
  }

  const canApprove = profile.hfr_status === 'operating';
  const lowMatch = last?.name_match != null && last.name_match < 0.5;
  const hfrIntl = tzIntl(last?.hfr_phone);
  const signupIntl = tzIntl(profile.users?.phone);
  const samePhone = hfrIntl && signupIntl && hfrIntl === signupIntl;
  const codeChanged = (code.trim() || null) !== (profile.hfr_code || null);

  return (
    <Section icon={ShieldCheck} title="HFR facility verification" action={<HfrStatusBadge status={status} />}>
      {/* HFR code */}
      <div className="flex flex-wrap items-end gap-2 mb-4">
        <label className="flex flex-col gap-1 flex-1 min-w-[180px]">
          <span className="text-sm font-medium text-gray-700">HFR facility code</span>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="e.g. 125039-8"
            className="px-3 py-2 rounded-lg border border-gray-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </label>
        {codeChanged && (
          <Button size="sm" variant="secondary" loading={busy === 'code'} onClick={saveCode}>Save &amp; check</Button>
        )}
      </div>

      {checks === null ? (
        <div className="h-24 bg-gray-50 rounded-xl animate-pulse" />
      ) : !profile.hfr_code ? (
        <p className="text-sm text-gray-500">
          No HFR code yet. Ask the facility for it (it is on their registration certificate), or find them on the{' '}
          <a href={HFR_PORTAL} target="_blank" rel="noreferrer" className="text-teal-700 hover:underline">HFR portal</a> and enter it above.
        </p>
      ) : !last ? (
        <p className="text-sm text-gray-500">This facility has not been checked against the Health Facility Registry yet.</p>
      ) : (
        <div className="space-y-4">
          <p className={`text-sm ${last.status === 'operating' ? 'text-green-700' : last.status === 'error' ? 'text-amber-700' : 'text-red-700'}`}>
            {last.message}
          </p>

          {last.hfr_name && (
            <dl className="text-sm grid grid-cols-[auto,1fr] gap-x-4 gap-y-1.5">
              <dt className="text-gray-500">Name on HFR</dt><dd className="text-gray-900 font-medium">{last.hfr_name}</dd>
              <dt className="text-gray-500">Name on AfyaWork</dt><dd className="text-gray-900">{profile.facility_name || '—'}</dd>
              <dt className="text-gray-500">Name match</dt>
              <dd className={lowMatch ? 'text-red-700 font-semibold' : 'text-gray-900'}>{pct(last.name_match)}{lowMatch && ' — check carefully'}</dd>
              <dt className="text-gray-500">Type</dt><dd className="text-gray-900">{last.hfr_type || '—'}</dd>
              <dt className="text-gray-500">Location</dt><dd className="text-gray-900">{last.hfr_address || [last.hfr_council, last.hfr_region].filter(Boolean).join(', ') || '—'}</dd>
              <dt className="text-gray-500">AfyaWork address</dt><dd className="text-gray-900">{profile.address || '—'}</dd>
              <dt className="text-gray-500">Ownership</dt><dd className="text-gray-900">{last.hfr_ownership || '—'}{last.hfr_owner_name ? ` · ${last.hfr_owner_name}` : ''}</dd>
              <dt className="text-gray-500">Regulator</dt><dd className="text-gray-900">{last.hfr_authority || '—'}</dd>
              <dt className="text-gray-500">HFR code</dt><dd className="text-gray-900 font-mono">{last.hfr_code || '—'}</dd>
              <dt className="text-gray-500">Opened</dt><dd className="text-gray-900">{last.hfr_opened ? formatDate(last.hfr_opened) : '—'}</dd>
              <dt className="text-gray-500">Official phone</dt>
              <dd className="text-gray-900">
                {last.hfr_phone ? (
                  <span className="inline-flex flex-wrap items-center gap-2">
                    <span className="font-mono">{last.hfr_phone}</span>
                    {hfrIntl && (
                      <>
                        <a href={`tel:+${hfrIntl}`} className="inline-flex items-center gap-1 text-teal-700 hover:underline"><Phone className="w-3.5 h-3.5" /> Call</a>
                        <a href={`https://wa.me/${hfrIntl}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-teal-700 hover:underline"><MessageCircle className="w-3.5 h-3.5" /> WhatsApp</a>
                      </>
                    )}
                    {samePhone && <span className="text-xs text-green-700">same as sign-up phone</span>}
                  </span>
                ) : <span className="text-gray-400">not listed on HFR</span>}
              </dd>
            </dl>
          )}

          <p className="text-xs text-gray-400">
            Checked {formatDate(last.checked_at)} ({last.trigger_source}) · searched {last.searched_code || '—'} ·{' '}
            <a href={HFR_PORTAL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-teal-700 hover:underline">
              open HFR <ExternalLink className="w-3 h-3" />
            </a>
          </p>
        </div>
      )}

      {profile.verified ? (
        <div className="mt-4 rounded-xl bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800 flex items-start gap-2">
          <BadgeCheck className="w-4 h-4 mt-0.5 shrink-0" />
          <span>Verified {formatDate(profile.verified_at)}{profile.verification_note ? ` — ${profile.verification_note}` : ''}</span>
        </div>
      ) : profile.verification_note ? (
        <p className="mt-4 text-xs text-gray-500">Last decision: {profile.verification_note}</p>
      ) : null}

      <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">
        {!profile.verified && canApprove && (
          <p className="text-xs text-gray-500">
            Anyone can look up a facility code, so approve only after confirming the person who signed up works there:
            call the official HFR phone{samePhone ? '' : ' (not the sign-up number)'} and ask for the in-charge or the administrator by name.
          </p>
        )}
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note (optional), e.g. 'Called HFR number 13 Oct, spoke to in-charge Dr Mushi'"
          className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
        />
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" loading={busy === 'check'} disabled={!profile.hfr_code || codeChanged} onClick={runCheck}>
            <RefreshCw className="w-4 h-4" /> {last ? 'Check again' : 'Check HFR'}
          </Button>
          {!profile.verified && (
            <Button size="sm" disabled={!canApprove} loading={busy === 'approve'} onClick={() => decide(true)}
              title={canApprove ? '' : 'Needs an operating facility on HFR first'}>
              <BadgeCheck className="w-4 h-4" /> Approve — facility confirmed
            </Button>
          )}
          {profile.verified && (
            <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50" loading={busy === 'reject'} onClick={() => decide(false)}>
              <XCircle className="w-4 h-4" /> Remove verification
            </Button>
          )}
        </div>
        {msg && <p className="text-sm text-gray-700">{msg}</p>}
      </div>
    </Section>
  );
}
