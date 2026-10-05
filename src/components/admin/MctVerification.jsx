import { useEffect, useState } from 'react';
import { ShieldCheck, RefreshCw, BadgeCheck, XCircle, ExternalLink, UserCircle } from 'lucide-react';
import { MCT_STATUS } from './mctStatus';
import { Button } from '../common/Button';
import { Section } from './ProfileKit';
import { formatDate } from './profileUtils';
import { adminCheckCOLicence, adminSetCOVerification, getCOMctChecks, getHprsPhoto } from '../../lib/api';


const TONES = {
  gray:  'text-gray-600 bg-gray-50 border-gray-200',
  green: 'text-green-700 bg-green-50 border-green-200',
  amber: 'text-amber-700 bg-amber-50 border-amber-200',
  red:   'text-red-700 bg-red-50 border-red-200',
};

export function MctStatusBadge({ status, className = '' }) {
  const s = MCT_STATUS[status] || MCT_STATUS.unchecked;
  const Icon = s.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${TONES[s.tone]} ${className}`}>
      <Icon className="w-3.5 h-3.5" /> {s.label}
    </span>
  );
}

function Photo({ src, label, loading }) {
  return (
    <figure className="flex flex-col items-center gap-1.5">
      <div className="w-28 h-32 rounded-xl border border-gray-200 bg-gray-50 overflow-hidden flex items-center justify-center">
        {loading ? <div className="w-full h-full animate-pulse bg-gray-100" />
          : src ? <img src={src} alt={label} className="w-full h-full object-cover" />
          : <UserCircle className="w-10 h-10 text-gray-300" />}
      </div>
      <figcaption className="text-xs text-gray-500">{label}</figcaption>
    </figure>
  );
}

/** Loads the HPRS photo through verify-co (HPRS serves photos over plain http). */
function HprsPhoto({ url }) {
  const [state, setState] = useState({ loading: !!url, src: null });
  useEffect(() => {
    if (!url) return undefined;
    let alive = true;
    getHprsPhoto(url).then(({ data }) => { if (alive) setState({ loading: false, src: data }); });
    return () => { alive = false; };
  }, [url]);
  return <Photo src={state.src} loading={state.loading} label="MCT register photo" />;
}

const pct = (n) => (n == null ? '—' : `${Math.round(n * 100)}%`);

/**
 * Admin panel on the CO profile: latest MCT lookup, HPRS photo next to the CO's own photo,
 * and the identity decision. `profile` is the co_profiles row with users(...) joined.
 */
export function MctVerificationPanel({ profile, onChanged }) {
  const [checks, setChecks] = useState(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [note, setNote] = useState('');

  const coId = profile.user_id;
  const last = checks?.[0];

  function loadChecks() {
    return getCOMctChecks(coId).then(({ data }) => setChecks(data || []));
  }
  useEffect(() => {
    let alive = true;
    getCOMctChecks(coId).then(({ data }) => { if (alive) setChecks(data || []); });
    return () => { alive = false; };
  }, [coId]);


  async function runCheck() {
    setBusy('check'); setMsg('');
    const { data, error } = await adminCheckCOLicence(coId);
    setBusy('');
    if (error) { setMsg(`Check failed: ${error.message}`); return; }
    setMsg(data?.message || '');
    await loadChecks();
    onChanged?.();
  }

  async function decide(verified) {
    setBusy(verified ? 'approve' : 'reject'); setMsg('');
    const { error } = await adminSetCOVerification(coId, verified, note.trim() || null);
    setBusy('');
    if (error) { setMsg(error.message); return; }
    setNote('');
    onChanged?.();
  }

  const canApprove = ['valid', 'grace'].includes(profile.mct_status);
  const lowMatch = last?.name_match != null && last.name_match < 0.67;

  return (
    <Section
      icon={ShieldCheck}
      title="MCT licence verification"
      action={<MctStatusBadge status={profile.mct_status} />}
    >
      {checks === null ? (
        <div className="h-24 bg-gray-50 rounded-xl animate-pulse" />
      ) : !last ? (
        <p className="text-sm text-gray-500">This CO has not been checked against the MCT register yet.</p>
      ) : (
        <div className="space-y-4">
          <p className={`text-sm ${['valid'].includes(last.status) ? 'text-green-700' : ['grace', 'wrong_profession', 'error'].includes(last.status) ? 'text-amber-700' : 'text-red-700'}`}>
            {last.message}
          </p>

          {last.hprs_name && (
            <div className="flex flex-col sm:flex-row gap-5">
              <div className="flex gap-4 justify-center">
                <HprsPhoto key={last.hprs_photo_url || 'none'} url={last.hprs_photo_url} />
                <Photo src={profile.users?.avatar_url} label="AfyaWork profile photo" />
              </div>
              <dl className="text-sm grid grid-cols-[auto,1fr] gap-x-4 gap-y-1.5 flex-1 content-start">
                <dt className="text-gray-500">Name on MCT</dt><dd className="text-gray-900 font-medium">{last.hprs_name}</dd>
                <dt className="text-gray-500">Name on AfyaWork</dt><dd className="text-gray-900">{profile.users?.display_name || '—'}</dd>
                <dt className="text-gray-500">Name match</dt>
                <dd className={lowMatch ? 'text-red-700 font-semibold' : 'text-gray-900'}>{pct(last.name_match)}{lowMatch && ' — check carefully'}</dd>
                <dt className="text-gray-500">Profession</dt><dd className="text-gray-900">{last.hprs_profession || '—'}</dd>
                <dt className="text-gray-500">MCT number</dt><dd className="text-gray-900 font-mono">{last.reg_number || '—'}</dd>
                <dt className="text-gray-500">Licence valid to</dt><dd className="text-gray-900">{last.licence_expires ? formatDate(last.licence_expires) : '—'}</dd>
                {last.caveat && (<><dt className="text-gray-500">Caveat</dt><dd className="text-red-700 font-semibold">{last.caveat}</dd></>)}
              </dl>
            </div>
          )}

          <p className="text-xs text-gray-400">
            Checked {formatDate(last.checked_at)} ({last.trigger_source}) · searched {last.searched_number || '—'} ·{' '}
            <a href="https://hprs.moh.go.tz/#/hprs/practitioner-portal" target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-teal-700 hover:underline">
              open HPRS <ExternalLink className="w-3 h-3" />
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
            Approve only if the MCT photo and name match this person (compare with their ID on a WhatsApp video call if unsure).
          </p>
        )}
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note (optional), e.g. 'Video call 5 Oct, NIDA matches'"
          className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
        />
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" loading={busy === 'check'} onClick={runCheck}>
            <RefreshCw className="w-4 h-4" /> {last ? 'Check again' : 'Check MCT register'}
          </Button>
          {!profile.verified && (
            <Button size="sm" disabled={!canApprove} loading={busy === 'approve'} onClick={() => decide(true)}
              title={canApprove ? '' : 'Needs a valid MCT licence first'}>
              <BadgeCheck className="w-4 h-4" /> Approve — identity confirmed
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
