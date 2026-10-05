import { ShieldCheck, ShieldAlert, ShieldQuestion } from 'lucide-react';

/** Labels for co_profiles.mct_status (set by the verify-co edge function). */
export const MCT_STATUS = {
  unchecked:        { label: 'Not checked',        tone: 'gray',  icon: ShieldQuestion },
  valid:            { label: 'MCT licence valid',  tone: 'green', icon: ShieldCheck },
  grace:            { label: 'MCT grace period',   tone: 'amber', icon: ShieldCheck },
  expired:          { label: 'Licence expired',    tone: 'red',   icon: ShieldAlert },
  not_licensed:     { label: 'Not licensed',       tone: 'red',   icon: ShieldAlert },
  suspended:        { label: 'Suspended / erased', tone: 'red',   icon: ShieldAlert },
  not_found:        { label: 'Not on MCT register', tone: 'red',  icon: ShieldAlert },
  wrong_profession: { label: 'Not a CO on MCT',    tone: 'amber', icon: ShieldAlert },
  error:            { label: 'Check failed',       tone: 'gray',  icon: ShieldQuestion },
};
