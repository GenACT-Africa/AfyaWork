# Agent Task: Integrate Legal Pages into AfyaWork Platform

## Goal
Build and wire up two public legal pages — **Terms of Service** and **Privacy Policy** — into the AfyaWork React/Vite app. Both pages must be publicly accessible (no auth required), linked from the footer and registration form, and styled to match the existing AfyaWork design system.

---

## Codebase Context

- **Framework**: React 18 + Vite, React Router v6, Tailwind CSS
- **i18n**: `react-i18next` — translation keys live in `src/i18n/locales/en.json` and `src/i18n/locales/sw.json`
- **Brand**: teal accent = `#2EC4B6` (Tailwind: `teal-500`), deep dark bg = `#0B151F`, body white/gray-50
- **Router**: `src/App.jsx` — all routes defined in `<AppShell>` inside a `<Routes>` block
- **NavBar**: shown on all routes except `/`, `/auth/*`, `/invite/*` (controlled by `showNav` in AppShell)
- **Footer**: in `src/pages/Landing.jsx` near line 238 — a simple `<footer>` with brand mark and copyright

---

## Deliverables

### 1. `src/pages/TermsOfService.jsx`
A standalone page rendering the full CO + Facility Terms of Service content.

**Structure:**
```
/terms                     → shows combined ToS (or tab-switch between CO / Facility)
```

**UI requirements:**
- No auth guard — public route
- Light background (`bg-gray-50`), max-width container (`max-w-3xl mx-auto px-4 py-12`)
- Page title: "Terms of Service" with last-updated date: **28 May 2026**
- Two tabs: "Clinical Officers" | "Healthcare Facilities" — active tab underlined in teal
- Under each tab, render the full numbered sections as described below
- Section headings: `text-lg font-semibold text-gray-900 mt-8 mb-2`
- Body text: `text-sm text-gray-700 leading-relaxed`
- Subsections / list items indented with `ml-4`
- Back-to-top anchor at bottom: "↑ Back to top"
- Footer: same as Landing page footer (import or duplicate)

**CO Terms of Service content** (15 sections):

1. **Introduction** — AfyaWork is a digital platform connecting Clinical Officers (COs) with private healthcare facilities for locum shifts in Tanzania. These Terms govern your use of the platform.
2. **Eligibility** — You must hold a valid Tanzania Medical and Dental Council (TMDC) licence and be at least 18 years old to register. You warrant all submitted credentials are accurate and current.
3. **Account** — You are responsible for maintaining the confidentiality of your login credentials. You must not share your account. Notify us immediately at support@afyawork.com if you suspect unauthorised access.
4. **Platform Use** — AfyaWork grants you a non-exclusive, non-transferable licence to access the platform for lawful purposes. You may not scrape, reverse-engineer, or use automated tools against the platform.
5. **Prohibited Conduct** — You must not: submit false credentials; accept payment directly from a Facility for a shift booked through AfyaWork; harass other users; or use the platform to solicit work outside the platform during the term and for 6 months after termination.
6. **Shift Applications & Professional Standards** — You must only apply for shifts you are qualified and available to work. Once a Facility confirms your application, you are committed to that shift. You must comply with all applicable clinical standards and the facility's internal policies during the shift.
7. **Cancellation Policy** — Cancellations with less than 4 hours' notice may result in a warning, temporary suspension, or account termination at AfyaWork's discretion. Repeated cancellations will result in account suspension.
8. **Payment**
   - **CO Pay**: Set by the Facility per shift. You receive the posted CO Pay amount less the AfyaWork Platform Fee.
   - **Platform Fee**: A flat fee of TZS 2,000 is deducted per shift.
   - **Overtime**: Any time worked beyond 60 minutes past the scheduled shift end is compensated at TZS 5,000 per additional hour, subject to Facility confirmation.
   - **Disbursement**: Payments are disbursed via mobile money (M-Pesa, Mixx by Yas, Airtel Money, or Halopesa) to your registered account within 48 hours of shift completion and Facility confirmation.
   - **Taxes**: You are an independent contractor. AfyaWork does not withhold income tax. You are solely responsible for registering with the Tanzania Revenue Authority (TRA) and filing all applicable taxes.
9. **Subscription Tiers**
   - **Msingi (Free)**: Access to shifts posted 30 minutes after posting goes live.
   - **Daktari (TZS 15,000/month)**: Immediate shift access and priority listing.
   - **Bingwa (TZS 30,000/month)**: All Daktari benefits plus a Verified badge displayed to Facilities.
   - Subscriptions auto-renew monthly. You may cancel at any time; cancellation takes effect at end of the billing period.
10. **Suspension & Termination** — AfyaWork may suspend or terminate your account for breach of these Terms, falsification of credentials, or patient safety concerns, with or without notice. You may close your account at any time by contacting support@afyawork.com.
11. **Intellectual Property** — All platform content, trademarks, and software remain the property of AfyaWork. Your profile data remains yours; you grant AfyaWork a licence to display it to Facilities.
12. **Limitation of Liability** — AfyaWork is a marketplace platform. We are not liable for the quality of clinical care delivered, workplace injuries, or disputes between you and a Facility. Our aggregate liability to you shall not exceed TZS 50,000.
13. **Indemnification** — You agree to indemnify AfyaWork against claims arising from your breach of these Terms, your clinical conduct, or your misrepresentation of credentials.
14. **Privacy** — Your use of the platform is subject to our Privacy Policy at afyawork.com/privacy.
15. **Governing Law** — These Terms are governed by the laws of the United Republic of Tanzania. Disputes shall be resolved in the courts of Dar es Salaam.

**Facility Terms of Service content** (16 sections):

1. **Introduction** — AfyaWork is a digital platform enabling private healthcare facilities to post locum shifts and engage verified Clinical Officers. These Terms govern facility use of the platform.
2. **Eligibility** — You must be a legally registered healthcare facility in Tanzania with a valid operating licence. The person accepting these Terms warrants they have authority to bind the facility.
3. **Registration** — Facility accounts are created by invitation or application and must be approved by AfyaWork. You must provide accurate facility details and keep them current.
4. **Shift Posting** — Shifts posted on AfyaWork constitute a binding offer. Once a CO's application is approved by you, the shift is confirmed and you are obligated to honour it. You must not post shifts you do not intend to fulfil.
5. **Fees & Invoicing**
   - **Platform Fee**: AfyaWork charges a fee of 18.6% on the CO Pay you post for each shift.
   - **Invoicing**: Invoices are issued monthly for all completed shifts. Payment is due within 14 days of invoice date.
   - **Late Payment**: Overdue invoices accrue interest at 2% per month. Repeated non-payment may result in account suspension.
6. **Overtime Charges** — If a CO works more than 60 minutes beyond the scheduled shift end at your request or with your consent, an overtime charge of TZS 5,000 per additional hour applies and will be added to your invoice.
7. **CO No-Shows** — If a confirmed CO fails to report for a shift, AfyaWork will make reasonable efforts to find a replacement. AfyaWork is not liable for CO no-shows but will investigate and may take action against the CO.
8. **Facility Obligations** — You must: (a) not pay a CO directly in cash or by any method outside the AfyaWork platform for a shift booked through AfyaWork; (b) provide a safe working environment; (c) not solicit or engage COs you met through AfyaWork outside the platform for 6 months after their last shift at your facility.
9. **Cancellation Policy** — Shift cancellations with less than 4 hours' notice may incur a cancellation fee of 20% of the posted CO Pay. AfyaWork reserves the right to suspend posting privileges for repeated cancellations.
10. **CO Conduct** — AfyaWork verifies TMDC credentials but does not supervise clinical conduct. You retain clinical governance responsibility for work performed at your facility.
11. **Suspension & Termination** — AfyaWork may suspend or terminate your account for breach of these Terms, non-payment, or conduct harmful to COs, with or without notice.
12. **Intellectual Property** — All platform content, trademarks, and software remain the property of AfyaWork.
13. **Limitation of Liability** — AfyaWork is a marketplace platform. We are not liable for the quality of clinical care delivered by COs, workplace incidents, or disputes with COs. Our aggregate liability shall not exceed TZS 200,000 per incident.
14. **Indemnification** — You agree to indemnify AfyaWork against claims arising from your breach of these Terms, your facility's working conditions, or your direct engagement of COs outside the platform.
15. **Privacy** — Your use of the platform is subject to our Privacy Policy at afyawork.com/privacy.
16. **Governing Law** — These Terms are governed by the laws of the United Republic of Tanzania. Disputes shall be resolved in the courts of Dar es Salaam.

---

### 2. `src/pages/PrivacyPolicy.jsx`
A standalone page rendering the full Privacy Policy.

**Route:** `/privacy`

**UI requirements:** Same layout as TermsOfService (no tabs — single document). Title: "Privacy Policy". Last updated: 28 May 2026.

**Privacy Policy content** (14 sections):

1. **Data Controller** — AfyaWork ("we", "us") is the data controller. Contact: support@afyawork.com, Dar es Salaam, Tanzania.
2. **Scope** — This policy covers data collected from Clinical Officers (COs) and Healthcare Facilities using the AfyaWork platform (web and mobile).
3. **Data We Collect — Clinical Officers**
   - Identity: full name, date of birth, gender, profile photo
   - Professional: TMDC licence number, licence expiry, specialisation, employment status
   - Contact: phone number, email address, location (district/region)
   - Financial: mobile money provider and registered mobile number
   - Platform: shift history, application history, subscription tier, login timestamps
4. **Data We Collect — Healthcare Facilities**
   - Organisation: facility name, type, registration number, operating licence details
   - Contact: physical address, phone, email, authorised contact person name
   - Platform: shift postings, confirmed shifts, invoices, payment history
5. **How We Use Your Data** — To operate the platform (matching, payments, notifications); to verify credentials with TMDC; to generate invoices; to comply with legal obligations including TRA requirements; to improve the platform.
6. **Legal Basis** — Contract performance (service delivery), legal obligation (TRA/TMDC compliance), and legitimate interest (platform security and fraud prevention).
7. **Service Providers** — We share data only with: Supabase (database and authentication infrastructure, EU-hosted); mobile money providers (Vodacom/M-Pesa, Tigo/Mixx by Yas, Airtel Money, Halopesa) for payment processing; WhatsApp Business API for notifications. These providers are bound by data processing agreements.
8. **No Sale of Data** — We do not sell, rent, or trade your personal data to third parties for marketing purposes.
9. **Data Retention** — Account data is retained while your account is active and for 12 months after closure. Financial and shift records are retained for 5 years to comply with TRA requirements. You may request earlier deletion of non-financial data by contacting support@afyawork.com.
10. **Your Rights** — You have the right to: access your data; correct inaccurate data; request deletion (subject to retention obligations); object to processing; and withdraw consent where processing is consent-based. Contact support@afyawork.com to exercise these rights.
11. **Security** — We use TLS encryption in transit, AES-256 encryption at rest (via Supabase), and role-based access controls. No system is perfectly secure; notify us immediately of any suspected breach.
12. **Children** — AfyaWork is not directed at persons under 18. We do not knowingly collect data from minors.
13. **Changes** — We may update this policy. Material changes will be notified via in-app notice or email. Continued use after notice constitutes acceptance.
14. **Contact** — Data queries: support@afyawork.com. We aim to respond within 5 business days.

---

### 3. Route Registration — `src/App.jsx`

Add these imports at the top of the file:
```js
import TermsOfService from './pages/TermsOfService';
import PrivacyPolicy from './pages/PrivacyPolicy';
```

Add these routes inside `<Routes>` (before the `*` catch-all), **outside** any auth guard:
```jsx
<Route path="/terms" element={<TermsOfService />} />
<Route path="/privacy" element={<PrivacyPolicy />} />
```

Update `showNav` in AppShell so NavBar is hidden on legal pages too:
```js
const showNav = pathname !== '/'
  && !pathname.startsWith('/auth')
  && !pathname.startsWith('/invite')
  && !pathname.startsWith('/terms')
  && !pathname.startsWith('/privacy');
```

---

### 4. Footer Links — `src/pages/Landing.jsx`

Update the `<footer>` block (around line 238) to add links:

```jsx
<footer className="border-t border-gray-100 bg-white">
  <div className="max-w-6xl mx-auto px-4 py-6 flex flex-col md:flex-row items-center justify-between gap-3">
    <div className="flex items-center gap-2">
      <div className="w-6 h-6 bg-gradient-to-br from-teal-600 to-emerald-500 rounded-md flex items-center justify-center">
        <Stethoscope className="w-3.5 h-3.5 text-white" />
      </div>
      <span className="font-bold text-gray-800 text-sm">Afya<span className="text-teal-600">Work</span></span>
    </div>
    <div className="flex items-center gap-4">
      <Link to="/terms" className="text-xs text-gray-400 hover:text-teal-600 transition-colors">Terms of Service</Link>
      <Link to="/privacy" className="text-xs text-gray-400 hover:text-teal-600 transition-colors">Privacy Policy</Link>
      <p className="text-xs text-gray-400">{t('landing.footer')}</p>
    </div>
  </div>
</footer>
```

Ensure `Link` is imported from `react-router-dom` (it should already be).

---

### 5. Registration Consent Checkbox — `src/pages/Auth.jsx`

In the registration form (`RegisterPage`), add a consent checkbox **above the submit button**:

```jsx
<div className="flex items-start gap-2">
  <input
    type="checkbox"
    id="legal-consent"
    required
    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
  />
  <label htmlFor="legal-consent" className="text-xs text-gray-600">
    I have read and agree to the{' '}
    <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-teal-600 hover:underline">Terms of Service</a>
    {' '}and{' '}
    <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-teal-600 hover:underline">Privacy Policy</a>.
  </label>
</div>
```

The `required` attribute prevents form submission without checking the box.

---

## Constraints

- Do not add any new npm dependencies. Use only what is already installed.
- Do not modify `src/i18n/` files — hardcode English text in these two pages (legal text does not need i18n).
- Do not use `<a href>` for internal links — use React Router `<Link to>` where applicable, except in the consent label where `target="_blank"` is needed.
- Keep both page files self-contained (no shared component needed — both pages are simple enough).
- The NavBar must NOT appear on `/terms` or `/privacy` (handled by the `showNav` update above).

## Verification Checklist

After implementation, confirm:
- [ ] `GET /terms` renders without auth, shows two tabs (CO | Facility), all 15/16 sections visible
- [ ] `GET /privacy` renders without auth, all 14 sections visible
- [ ] Footer on Landing page has "Terms of Service" and "Privacy Policy" links
- [ ] Clicking footer links navigates correctly (no 404)
- [ ] Registration form has consent checkbox; submitting without checking it is blocked
- [ ] No NavBar appears on `/terms` or `/privacy`
- [ ] No TypeScript / ESLint errors introduced
