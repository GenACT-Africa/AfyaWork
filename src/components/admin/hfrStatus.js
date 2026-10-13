import { ShieldCheck, ShieldAlert, ShieldQuestion } from 'lucide-react';

/** Labels for facility_profiles.hfr_status (set by the verify-facility edge function). */
export const HFR_STATUS = {
  unchecked:     { label: 'Not checked',          tone: 'gray',  icon: ShieldQuestion },
  no_code:       { label: 'No HFR code',          tone: 'gray',  icon: ShieldQuestion },
  operating:     { label: 'On HFR, operating',    tone: 'green', icon: ShieldCheck },
  not_operating: { label: 'HFR: not operating',   tone: 'red',   icon: ShieldAlert },
  not_found:     { label: 'Not on HFR',           tone: 'red',   icon: ShieldAlert },
  error:         { label: 'Check failed',         tone: 'gray',  icon: ShieldQuestion },
};

/** hfr_status as stored, but 'unchecked' without a code reads as 'no_code'. */
export const hfrStatusOf = (f) => (!f?.hfr_code && (!f?.hfr_status || f.hfr_status === 'unchecked') ? 'no_code' : f?.hfr_status || 'unchecked');
