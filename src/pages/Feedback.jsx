import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Star, CheckCircle2, Stethoscope } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { submitFeedback } from '../lib/api';

// ── Small reusable controls ───────────────────────────────────────────────────

function StarRating({ value, onChange }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex gap-1.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          className="text-3xl leading-none transition-colors focus:outline-none"
        >
          <span className={(hover || value) >= n ? 'text-amber-400' : 'text-gray-200'}>★</span>
        </button>
      ))}
    </div>
  );
}

function PillGroup({ name, options, value, onChange, required }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <label key={opt} className="cursor-pointer">
          <input
            type="radio"
            name={name}
            value={opt}
            checked={value === opt}
            onChange={() => onChange(opt)}
            required={required}
            className="sr-only"
          />
          <span className={`inline-block px-4 py-2 rounded-full border-2 text-sm font-medium transition-all ${
            value === opt
              ? 'bg-teal-50 border-teal-600 text-teal-700 font-semibold'
              : 'border-gray-200 text-gray-500 hover:border-teal-400 hover:text-teal-600'
          }`}>
            {opt}
          </span>
        </label>
      ))}
    </div>
  );
}

function CheckGroup({ name, options, value, onChange }) {
  function toggle(opt) {
    onChange(value.includes(opt) ? value.filter((v) => v !== opt) : [...value, opt]);
  }
  return (
    <div className="flex flex-col gap-2.5">
      {options.map((opt) => (
        <label key={opt} className="flex items-center gap-3 cursor-pointer group">
          <input
            type="checkbox"
            checked={value.includes(opt)}
            onChange={() => toggle(opt)}
            className="w-4 h-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500 shrink-0"
          />
          <span className="text-sm text-gray-700 group-hover:text-gray-900">{opt}</span>
        </label>
      ))}
    </div>
  );
}

function NPSScale({ value, onChange }) {
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 11 }, (_, i) => (
          <label key={i} className="cursor-pointer">
            <input type="radio" value={i} checked={value === i} onChange={() => onChange(i)} className="sr-only" />
            <span className={`w-11 h-11 flex items-center justify-center rounded-lg border-2 text-sm font-semibold transition-all ${
              value === i
                ? 'bg-teal-600 border-teal-600 text-white'
                : 'border-gray-200 text-gray-500 hover:border-teal-400 hover:text-teal-600'
            }`}>
              {i}
            </span>
          </label>
        ))}
      </div>
      <div className="flex justify-between mt-2 text-xs text-gray-400">
        <span>Not likely</span>
        <span>Extremely likely</span>
      </div>
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <p className="text-xs font-bold uppercase tracking-widest text-teal-700 mb-5 pb-2 border-b-2 border-teal-50">
      {children}
    </p>
  );
}

function Question({ label, required, children }) {
  return (
    <div className="mb-7">
      <p className="text-sm font-medium text-gray-800 mb-2.5 leading-snug">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </p>
      {children}
    </div>
  );
}

// ── Required fields for progress bar ─────────────────────────────────────────
const REQUIRED = ['role', 'usability', 'shift_rating', 'checkin_clarity', 'notif_clarity', 'nps', 'top_improvement'];

// ── Main page ─────────────────────────────────────────────────────────────────

export default function FeedbackPage() {
  const { user, role: authRole } = useAuth();

  const defaultRole =
    authRole === 'co' ? 'Healthcare Worker' :
    authRole === 'facility' ? 'Facility Manager' : '';

  const [form, setForm] = useState({
    name:              '',
    role:              defaultRole,
    usability:         0,
    issues:            [],
    usability_comment: '',
    shift_rating:      0,
    checkin_clarity:   '',
    shift_comment:     '',
    notif_clarity:     '',
    notif_pref:        [],
    nps:               null,
    top_improvement:   '',
    other_comments:    '',
  });

  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  function set(field) {
    return (val) => setForm((f) => ({ ...f, [field]: val }));
  }

  // Progress: count how many required fields have a value
  const progress = Math.round(
    (REQUIRED.filter((k) => {
      const v = form[k === 'usability' ? 'usability' : k === 'nps' ? 'nps' : k];
      if (k === 'usability') return form.usability > 0;
      if (k === 'shift_rating') return form.shift_rating > 0;
      if (k === 'nps') return form.nps !== null;
      return !!v;
    }).length / REQUIRED.length) * 100
  );

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    // Validate required
    if (!form.role)             { setError('Please select your role.'); return; }
    if (!form.usability)        { setError('Please rate app usability.'); return; }
    if (!form.shift_rating)     { setError('Please rate the shift process.'); return; }
    if (!form.checkin_clarity)  { setError('Please answer the check-in question.'); return; }
    if (!form.notif_clarity)    { setError('Please answer the notifications question.'); return; }
    if (form.nps === null)      { setError('Please select an NPS score.'); return; }
    if (!form.top_improvement.trim()) { setError('Please fill in the top improvement field.'); return; }

    setSubmitting(true);
    const payload = {
      name:              form.name || null,
      role:              form.role,
      usability_rating:  form.usability,
      issues:            form.issues.length ? form.issues : null,
      usability_comment: form.usability_comment || null,
      shift_rating:      form.shift_rating,
      checkin_clarity:   form.checkin_clarity,
      shift_comment:     form.shift_comment || null,
      notif_clarity:     form.notif_clarity,
      notif_pref:        form.notif_pref.length ? form.notif_pref : null,
      nps:               form.nps,
      top_improvement:   form.top_improvement,
      other_comments:    form.other_comments || null,
    };

    const { error: err } = await submitFeedback(user?.id || null, payload);
    setSubmitting(false);
    if (err) { setError('Submission failed. Please try again.'); return; }
    setSubmitted(true);
  }

  // ── Thank-you screen ────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-16">
        <div className="bg-white rounded-2xl shadow-lg max-w-lg w-full p-12 text-center">
          <div className="text-5xl mb-5">🙏</div>
          <h2 className="text-2xl font-bold text-teal-700 mb-3">Thank you!</h2>
          <p className="text-gray-500 text-sm leading-relaxed mb-8">
            Your feedback has been recorded. We'll use it to make AfyaWork better for every
            healthcare worker on the platform.
            <br /><br />— The AfyaWork Team
          </p>
          <Link
            to={authRole === 'facility' ? '/facility/dashboard' : '/co/dashboard'}
            className="inline-flex items-center gap-2 bg-gradient-to-r from-teal-600 to-teal-500 text-white font-semibold px-6 py-3 rounded-xl hover:from-teal-700 hover:to-teal-600 transition-all shadow-sm"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  // ── Form ────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 flex items-start justify-center px-4 py-10">
      <div className="w-full max-w-2xl">

        {/* Header */}
        <div className="bg-gradient-to-br from-teal-700 to-emerald-600 rounded-t-2xl px-8 py-8 text-white">
          <div className="flex items-center gap-2 font-bold text-xl mb-2">
            <Stethoscope className="w-5 h-5" /> AfyaWork
          </div>
          <h1 className="text-xl font-semibold mb-1">Beta Feedback Survey</h1>
          <p className="text-teal-100 text-sm leading-relaxed">
            Your feedback shapes the platform. This takes less than 3 minutes.
          </p>
          {/* Progress bar */}
          <div className="mt-5 bg-white/20 rounded-full h-1.5">
            <div
              className="bg-white h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Form body */}
        <form onSubmit={handleSubmit} className="bg-white rounded-b-2xl shadow-lg px-8 py-8 space-y-8">

          {/* Section 1 */}
          <div>
            <SectionTitle>About You</SectionTitle>
            <Question label="Your name (optional)">
              <input
                type="text"
                value={form.name}
                onChange={(e) => set('name')(e.target.value)}
                placeholder="e.g. Kilian Mwangi"
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-800 focus:outline-none focus:border-teal-500 transition-colors"
              />
            </Question>
            <Question label="Your role on AfyaWork" required>
              <PillGroup
                name="role"
                options={['Healthcare Worker', 'Facility Manager', 'Both']}
                value={form.role}
                onChange={set('role')}
                required
              />
            </Question>
          </div>

          {/* Section 2 */}
          <div>
            <SectionTitle>App Usability</SectionTitle>
            <Question label="How easy was it to navigate the app?" required>
              <StarRating value={form.usability} onChange={set('usability')} />
            </Question>
            <Question label="Did you encounter any issues while using the app?">
              <CheckGroup
                name="issues"
                options={['Slow loading', 'Crashes or errors', 'Confusing layout', 'Login problems', 'No issues']}
                value={form.issues}
                onChange={set('issues')}
              />
            </Question>
            <Question label="Any specific usability feedback?">
              <textarea
                value={form.usability_comment}
                onChange={(e) => set('usability_comment')(e.target.value)}
                placeholder="Tell us what worked well or what confused you…"
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-800 focus:outline-none focus:border-teal-500 transition-colors resize-none min-h-[80px]"
              />
            </Question>
          </div>

          {/* Section 3 */}
          <div>
            <SectionTitle>Shift Application Process</SectionTitle>
            <Question label="How smooth was the shift application process?" required>
              <StarRating value={form.shift_rating} onChange={set('shift_rating')} />
            </Question>
            <Question label="Did you understand how to check in and check out of a shift?" required>
              <PillGroup
                name="checkin_clarity"
                options={['Yes, very clear', 'Somewhat', 'No, it was confusing']}
                value={form.checkin_clarity}
                onChange={set('checkin_clarity')}
                required
              />
            </Question>
            <Question label="What would improve the shift process?">
              <textarea
                value={form.shift_comment}
                onChange={(e) => set('shift_comment')(e.target.value)}
                placeholder="e.g. better confirmation messages, clearer status updates…"
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-800 focus:outline-none focus:border-teal-500 transition-colors resize-none min-h-[80px]"
              />
            </Question>
          </div>

          {/* Section 4 */}
          <div>
            <SectionTitle>Communication & Notifications</SectionTitle>
            <Question label="Were the notifications and updates clear and timely?" required>
              <PillGroup
                name="notif_clarity"
                options={['Yes', 'Somewhat', 'No']}
                value={form.notif_clarity}
                onChange={set('notif_clarity')}
                required
              />
            </Question>
            <Question label="How would you prefer to receive updates?">
              <CheckGroup
                name="notif_pref"
                options={['In-app notifications', 'SMS', 'Email', 'WhatsApp']}
                value={form.notif_pref}
                onChange={set('notif_pref')}
              />
            </Question>
          </div>

          {/* Section 5 */}
          <div>
            <SectionTitle>Overall Satisfaction</SectionTitle>
            <Question label="How likely are you to recommend AfyaWork to a colleague?" required>
              <NPSScale value={form.nps} onChange={set('nps')} />
            </Question>
            <Question label="What is the ONE thing we should improve first?" required>
              <textarea
                value={form.top_improvement}
                onChange={(e) => set('top_improvement')(e.target.value)}
                placeholder="Be as specific as you like…"
                required
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-800 focus:outline-none focus:border-teal-500 transition-colors resize-none min-h-[80px]"
              />
            </Question>
            <Question label="Any other comments or suggestions?">
              <textarea
                value={form.other_comments}
                onChange={(e) => set('other_comments')(e.target.value)}
                placeholder="Anything else on your mind…"
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-800 focus:outline-none focus:border-teal-500 transition-colors resize-none min-h-[80px]"
              />
            </Question>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 px-4 py-3 rounded-xl">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3.5 bg-gradient-to-r from-teal-700 to-emerald-600 hover:from-teal-800 hover:to-emerald-700 text-white font-bold rounded-xl text-base transition-all shadow-sm hover:shadow disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {submitting ? (
              <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Submitting…</>
            ) : (
              <><CheckCircle2 className="w-4 h-4" /> Submit Feedback</>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
