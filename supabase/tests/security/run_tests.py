#!/usr/bin/env python3
"""Attack + happy-path tests for the AfyaWork hardening migration.
Usage: run_tests.py <dbname>
Connects as 'authenticator' (like PostgREST) and switches to authenticated/anon/service_role."""
import subprocess, sys, json, uuid

DB = sys.argv[1]
PSQL = ["psql", "-h", "/tmp/pgt", "-p", "5433", "-d", DB, "-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1"]

def run(sql, user="postgres"):
    p = subprocess.run(PSQL + ["-U", user], input=sql, capture_output=True, text=True)
    return p.returncode == 0, (p.stdout.strip(), p.stderr.strip())

def admin_sql(sql):
    ok, (out, err) = run(sql)
    if not ok:
        raise SystemExit(f"SEED FAILED:\n{sql}\n{err}")
    return out

def as_user(uid, sql, role="authenticated"):
    prelude = f"SET ROLE {role};\n"
    if uid:
        prelude += f"SELECT set_config('request.jwt.claim.sub','{uid}',false);\n"
    prelude += f"SELECT set_config('request.jwt.claim.role','{role}',false);\n"
    ok, (out, err) = run("\\o /dev/null\n" + prelude + "\\o\n" + sql, user="authenticator")
    return ok, out, err

results = []
def last(x):
    l = (x or '').strip().splitlines()
    return l[-1].strip() if l else ''

def check(name, cond, detail=""):
    results.append((name, bool(cond), detail))

def expect_blocked(name, uid, sql, role="authenticated", verify=None):
    """verify() returns True if the attack took effect."""
    ok, out, err = as_user(uid, sql, role)
    blocked = (not ok) or (verify is not None and not verify())
    check("BLOCK: " + name, blocked, (err or out)[:160])

def expect_ok(name, uid, sql, role="authenticated", verify=None):
    ok, out, err = as_user(uid, sql, role)
    good = ok and (verify is None or verify())
    check("ALLOW: " + name, good, (err or out)[:160])
    return out if out else "\n"

# ── Seed ──────────────────────────────────────────────────────────────────────
def signup(email, meta):
    uid = str(uuid.uuid4())
    ok, (out, err) = run(f"""INSERT INTO auth.users (id, email, raw_user_meta_data, aud, role)
        VALUES ('{uid}', '{email}', '{json.dumps(meta)}'::jsonb, 'authenticated', 'authenticated');""",
        user="supabase_auth_admin")
    return uid if ok else None, err

ADMIN = admin_sql("SELECT id FROM public.users WHERE role='admin' LIMIT 1;")
F, _  = signup("fac@test.tz",  {"role": "facility", "display_name": "Kigamboni Clinic", "facility_name": "Kigamboni Clinic"})
F2, _ = signup("fac2@test.tz", {"role": "facility", "display_name": "Other Clinic", "facility_name": "Other Clinic"})
C1, _ = signup("c1@test.tz",   {"role": "co", "display_name": "Asha", "license_number": "CO-111"})
C2, _ = signup("c2@test.tz",   {"role": "co", "display_name": "Baraka", "license_number": "CO-222"})
C3, _ = signup("c3@test.tz",   {"role": "co", "display_name": "Neema", "license_number": "CO-333"})
admin_sql(f"""
UPDATE public.users SET phone='0711000001' WHERE id='{C1}';
UPDATE public.users SET phone='0711000002' WHERE id='{C2}';
UPDATE public.users SET phone='0711000003' WHERE id='{C3}';
UPDATE public.co_profiles SET ica_signed_at = now() WHERE user_id IN ('{C1}','{C2}');
UPDATE public.facility_profiles SET location_lat = -6.8235, location_lng = 39.2695 WHERE user_id IN ('{F}','{F2}');
UPDATE public.co_profiles SET employment_availability_status='open_fulltime' WHERE user_id='{C3}';
INSERT INTO public.co_mobile_money (co_id, mobile_money_provider, mobile_money_number) VALUES ('{C1}','mpesa','0755000001');
UPDATE public.system_config SET value='0' WHERE key='__none__';
""")

# ── 1. Privilege escalation ───────────────────────────────────────────────────
expect_blocked("CO sets own role to admin", C1,
    f"UPDATE public.users SET role='admin' WHERE id='{C1}';",
    verify=lambda: admin_sql(f"SELECT role FROM public.users WHERE id='{C1}'") == "admin")

evil, err = signup("evil@test.tz", {"role": "admin", "display_name": "Evil"})
evil_role = admin_sql(f"SELECT role FROM public.users WHERE id='{evil}'") if evil else ""
check("BLOCK: signup with role=admin", evil_role != "admin", f"role={evil_role!r} {err[:80]}")

expect_blocked("CO changes own account_status", C1,
    f"UPDATE public.users SET account_status='expired' WHERE id='{C1}';",
    verify=lambda: admin_sql(f"SELECT account_status FROM public.users WHERE id='{C1}'") == "expired")

expect_ok("CO edits own name/phone/bio", C1,
    f"UPDATE public.users SET display_name='Asha M', phone='0711000009', bio='Maternity' WHERE id='{C1}';",
    verify=lambda: admin_sql(f"SELECT display_name FROM public.users WHERE id='{C1}'") == "Asha M")

expect_ok("CO records ToS agreement", C1,
    f"UPDATE public.users SET tos_agreed_at = now() WHERE id='{C1}';",
    verify=lambda: admin_sql(f"SELECT tos_agreed_at IS NOT NULL FROM public.users WHERE id='{C1}'") == "t")

# ── 2. Invite tokens ──────────────────────────────────────────────────────────
inv = expect_ok("admin invites a worker", ADMIN,
    "SELECT (public.admin_create_worker('new@test.tz','New CO','CO-999'))->>'invite_token';")
raw_token = last(inv) if inv else ""
ok, stolen, _ = as_user(C2, "SELECT coalesce(invite_token,'') FROM public.users WHERE email='new@test.tz';")
stolen = stolen.strip()
if stolen:
    ok2, out2, _ = as_user(None, f"SELECT public.activate_account('{stolen}', 'hacked-password');", role="anon")
    check("BLOCK: activate with token read from users table", not ('"success": true' in out2), out2[:120])
else:
    check("BLOCK: other users cannot read invite tokens", True, "row not visible")
expect_ok("invitee activates with the emailed token", None,
    f"SELECT public.activate_account('{raw_token}', 'a-good-password');", role="anon",
    verify=lambda: admin_sql("SELECT account_status FROM public.users WHERE email='new@test.tz'") == "active")

# ── 3. Profiles ───────────────────────────────────────────────────────────────
expect_blocked("CO marks self verified", C1,
    f"UPDATE public.co_profiles SET verified=true WHERE user_id='{C1}';",
    verify=lambda: admin_sql(f"SELECT verified FROM public.co_profiles WHERE user_id='{C1}'") == "t")
expect_blocked("CO upgrades own tier to bingwa", C1,
    f"UPDATE public.co_profiles SET subscription_tier='bingwa' WHERE user_id='{C1}';",
    verify=lambda: admin_sql(f"SELECT subscription_tier FROM public.co_profiles WHERE user_id='{C1}'") == "bingwa")
expect_blocked("facility changes own subscription plan", F,
    f"UPDATE public.facility_profiles SET subscription_plan='enterprise' WHERE user_id='{F}';",
    verify=lambda: admin_sql(f"SELECT subscription_plan FROM public.facility_profiles WHERE user_id='{F}'") == "enterprise")
expect_ok("admin verifies CO", ADMIN,
    f"UPDATE public.co_profiles SET verified=true, verified_at=now() WHERE user_id='{C2}';",
    verify=lambda: admin_sql(f"SELECT verified FROM public.co_profiles WHERE user_id='{C2}'") == "t")
expect_ok("CO changes licence → verification reset", C2,
    f"UPDATE public.co_profiles SET license_number='CO-222B' WHERE user_id='{C2}';",
    verify=lambda: admin_sql(f"SELECT verified FROM public.co_profiles WHERE user_id='{C2}'") == "f")
expect_ok("CO edits specialization/availability", C1,
    f"UPDATE public.co_profiles SET specialization='Maternity', employment_availability_status='open_parttime' WHERE user_id='{C1}';")
expect_ok("facility edits its name/address", F,
    f"UPDATE public.facility_profiles SET address='Mikadi' WHERE user_id='{F}';")

# ── 4. Privacy ────────────────────────────────────────────────────────────────
ok, out, _ = as_user(C2, f"SELECT count(*) FROM public.users WHERE id='{C1}';")
check("BLOCK: CO reads another CO's email/phone", out.strip() == "0", out)
ok, out, _ = as_user(F, f"SELECT count(*) FROM public.users WHERE id='{C3}';")
check("ALLOW: facility sees CO open to employment (Browse COs)", out.strip() == "1", out)
ok, out, _ = as_user(C1, f"SELECT count(*) FROM public.users WHERE id='{F}';")
check("ALLOW: CO sees facility account", out.strip() == "1", out)

# ── 5. Shifts: inserts ────────────────────────────────────────────────────────
expect_blocked("facility inserts shift as 'completed'", F,
    f"""INSERT INTO public.shifts (facility_id, shift_date, shift_type, pay_amount, status, assigned_co_id)
        VALUES ('{F}', current_date + 2, 'Day (8AM-4PM)', 35000, 'completed', '{C1}');""")
expect_blocked("facility inserts shift in the past", F,
    f"""INSERT INTO public.shifts (facility_id, shift_date, shift_type, pay_amount)
        VALUES ('{F}', current_date - 3, 'Day (8AM-4PM)', 35000);""")
S1 = last(expect_ok("facility posts a shift", F,
    f"""INSERT INTO public.shifts (facility_id, shift_date, shift_type, pay_amount)
        VALUES ('{F}', current_date + 2, 'Day (8AM-4PM)', 35000) RETURNING id;"""))

# ── 6. Applications ───────────────────────────────────────────────────────────
expect_blocked("CO without signed ICA applies", C3,
    f"INSERT INTO public.applications (shift_id, co_id) VALUES ('{S1}','{C3}');")
ok, out, err = as_user(C2, f"INSERT INTO public.applications (shift_id, co_id, status) VALUES ('{S1}','{C2}','approved') RETURNING status;")
check("BLOCK: CO self-inserts an approved application", (not ok) or last(out) == "pending", (err or out)[:120])
A1 = last(expect_ok("CO applies to open shift", C1,
    f"INSERT INTO public.applications (shift_id, co_id) VALUES ('{S1}','{C1}') RETURNING id;"))
A2 = admin_sql(f"SELECT id FROM public.applications WHERE shift_id='{S1}' AND co_id='{C2}'")
ok, out, _ = as_user(F, f"SELECT count(*) FROM public.users WHERE id='{C1}' AND phone IS NOT NULL;")
check("ALLOW: facility sees its applicant's contact", out.strip() == "1", out)
expect_blocked("facility sets application approved directly", F,
    f"UPDATE public.applications SET status='approved' WHERE id='{A1}';",
    verify=lambda: admin_sql(f"SELECT status FROM public.applications WHERE id='{A1}'") == "approved")
expect_blocked("facility fills shift directly", F,
    f"UPDATE public.shifts SET status='filled', assigned_co_id='{C1}' WHERE id='{S1}';",
    verify=lambda: admin_sql(f"SELECT status FROM public.shifts WHERE id='{S1}'") == "filled")
expect_blocked("other facility approves my applicant", F2, f"SELECT public.approve_application('{A1}');")
if A2:
    expect_ok("facility rejects an applicant", F, f"UPDATE public.applications SET status='rejected' WHERE id='{A2}';")
expect_ok("facility edits pay while open", F, f"UPDATE public.shifts SET pay_amount=40000 WHERE id='{S1}';")
expect_ok("facility approves via RPC", F, f"SELECT public.approve_application('{A1}');",
    verify=lambda: admin_sql(f"SELECT status FROM public.shifts WHERE id='{S1}'") == "filled")
expect_blocked("facility changes pay after CO selected", F,
    f"UPDATE public.shifts SET pay_amount=10000 WHERE id='{S1}';",
    verify=lambda: admin_sql(f"SELECT pay_amount FROM public.shifts WHERE id='{S1}'") == "10000")
expect_blocked("CO applies to a filled shift", C2,
    f"INSERT INTO public.applications (shift_id, co_id) VALUES ('{S1}','{C2}') ON CONFLICT DO NOTHING;",
    verify=lambda: admin_sql(f"SELECT count(*) FROM public.applications WHERE shift_id='{S1}' AND co_id='{C2}' AND status='pending'") != "0")

# ── 7. Lifecycle + payment ────────────────────────────────────────────────────
expect_ok("CO accepts offer", C1, f"SELECT public.accept_shift_offer('{S1}');")
expect_ok("CO checks in", C1, f"SELECT public.co_checkin('{S1}', -6.8, 39.3);")
expect_ok("facility approves check-in", F, f"SELECT public.approve_checkin('{S1}');")
ok, out, _ = as_user(C3, f"SELECT count(*) FROM public.shifts WHERE id='{S1}';")
check("BLOCK: unrelated CO sees in-progress shift / GPS", out.strip() == "0", out)
expect_blocked("facility cancels an in-progress shift", F,
    f"UPDATE public.shifts SET status='cancelled' WHERE id='{S1}';",
    verify=lambda: admin_sql(f"SELECT status FROM public.shifts WHERE id='{S1}'") == "cancelled")
expect_ok("CO checks out", C1, f"SELECT public.co_checkout('{S1}');")
# simulate a 10-hour stay (2h overtime), approvals later than the real times
admin_sql(f"""UPDATE public.shifts SET checkin_at = now() - interval '10 hours',
              checkout_at = now(), checkin_approved_at = now() - interval '9 hours' WHERE id='{S1}';""")
admin_sql(f"UPDATE public.shifts SET checkout_approved_at = NULL WHERE id='{S1}';")
expect_ok("facility approves checkout", F, f"SELECT public.approve_checkout('{S1}');")
pay = admin_sql(f"""SELECT flat_shift_rate||','||platform_fee||','||overtime_minutes||','||overtime_pay||','||co_total_pay||','||facility_total_charge||','||payment_status
                   FROM public.shift_payments WHERE shift_id='{S1}'""")
check("ALLOW: payment uses 18.6% fee and actual-time overtime",
      pay == "40000,7440,120,10000,50000,57440,pending", pay)

expect_blocked("CO releases own payment with inflated amount", C1,
    f"SELECT public.release_shift_payment('{S1}', 5000000, true);",
    verify=lambda: admin_sql(f"SELECT payment_status FROM public.shift_payments WHERE shift_id='{S1}'") == "scheduled")
expect_blocked("anon calls cancel_shift_payment", None, f"SELECT public.cancel_shift_payment('{S1}');", role="anon")
expect_blocked("CO claims scheduled payments", C1, f"SELECT count(*) FROM public.claim_scheduled_payments(gen_random_uuid());")
expect_ok("facility holds payment (protective)", F, f"SELECT public.hold_shift_payment('{S1}', 'query');",
    verify=lambda: admin_sql(f"SELECT payment_status FROM public.shift_payments WHERE shift_id='{S1}'") == "held")
expect_ok("admin releases payment", ADMIN, f"SELECT public.release_shift_payment('{S1}');",
    verify=lambda: admin_sql(f"SELECT payment_status FROM public.shift_payments WHERE shift_id='{S1}'") == "scheduled")
admin_sql("INSERT INTO public.disbursement_batches (batch_date) VALUES (current_date);")
out = expect_ok("service role claims batch", None,
    "SELECT count(*) FROM public.claim_scheduled_payments((SELECT id FROM public.disbursement_batches LIMIT 1));", role="service_role")
check("ALLOW: claim returns 1 payment", last(out) == "1", out)
out2 = as_user(None, "SELECT count(*) FROM public.claim_scheduled_payments((SELECT id FROM public.disbursement_batches LIMIT 1));", role="service_role")[1]
check("BLOCK: second concurrent claim gets nothing", last(out2) == "0", out2)

# ──
# ── 8. Ratings / notifications / mobile money ────────────────────────────────
expect_blocked("direct fake rating insert", C2,
    f"""INSERT INTO public.shift_ratings (shift_id, rater_id, ratee_id, rating_type, stars)
        VALUES ('{S1}','{C2}','{F}','co_rates_facility',1);""")
expect_ok("CO rates facility via RPC", C1, f"SELECT public.submit_rating('{S1}','{F}',5,'Great');")
expect_blocked("CO un-hides / edits own rating row", C1,
    f"UPDATE public.shift_ratings SET stars=1 WHERE rater_id='{C1}';",
    verify=lambda: admin_sql(f"SELECT stars FROM public.shift_ratings WHERE rater_id='{C1}'") == "1")
expect_blocked("user inserts notification for someone else", C2,
    f"INSERT INTO public.notifications (user_id, type, title, action_url) VALUES ('{C1}','x','Pay your fee','https://evil.example');")
nid = admin_sql(f"SELECT id FROM public.notifications WHERE user_id='{C1}' LIMIT 1")
expect_ok("user marks own notification read", C1, f"UPDATE public.notifications SET read=true WHERE id='{nid}';")
expect_blocked("user rewrites own notification link", C1,
    f"UPDATE public.notifications SET action_url='https://evil.example' WHERE id='{nid}';",
    verify=lambda: admin_sql(f"SELECT action_url FROM public.notifications WHERE id='{nid}'") == "https://evil.example")
expect_blocked("CO self-verifies mobile money", C1,
    f"UPDATE public.co_mobile_money SET number_verified=true WHERE co_id='{C1}';",
    verify=lambda: admin_sql(f"SELECT number_verified FROM public.co_mobile_money WHERE co_id='{C1}'") == "t")
expect_ok("CO updates mobile money number", C1,
    f"UPDATE public.co_mobile_money SET mobile_money_number='0755000099' WHERE co_id='{C1}';")

# ── 9. Cancellation rules ─────────────────────────────────────────────────────
S2 = last(expect_ok("facility posts second shift", F,
    f"INSERT INTO public.shifts (facility_id, shift_date, shift_type, pay_amount) VALUES ('{F}', current_date + 3, '24-Hour', 60000) RETURNING id;"))
expect_ok("facility cancels open shift", F, f"UPDATE public.shifts SET status='cancelled', cancellation_reason='covered' WHERE id='{S2}';",
    verify=lambda: admin_sql(f"SELECT status||'/'||cancelled_by FROM public.shifts WHERE id='{S2}'") == "cancelled/facility")

# ── 10. Disputed checkout gets a payment record ───────────────────────────────
S3 = admin_sql(f"""INSERT INTO public.shifts (facility_id, shift_date, shift_type, pay_amount, status, assigned_co_id, checkin_at, checkout_at)
                  VALUES ('{F}', current_date, 'Night (10PM-6AM)', 30000, 'pending_checkout_approval', '{C1}', now()-interval '8 hours', now())
                  RETURNING id;""").splitlines()[0]
expect_ok("facility disputes checkout", F, f"SELECT public.dispute_checkout('{S3}','left early');")
expect_ok("admin resolves dispute (approve)", ADMIN, f"SELECT public.resolve_dispute('{S3}','approve');",
    verify=lambda: admin_sql(f"SELECT count(*) FROM public.shift_payments WHERE shift_id='{S3}'") == "1")

# ── 11. Facility HFR verification ─────────────────────────────────────────────
F3, _ = signup("fac3@test.tz", {"role": "facility", "display_name": "Morcep", "facility_name": "Morcep Dispensary", "hfr_code": " 1250398 ", "phone": " 0754 051 704 ",
                     "location_url": "https://www.google.com/maps/place/Morcep/@-6.89,39.27,17z", "location_lat": "-6.8952", "location_lng": "39.2726"})
check("ALLOW: signup stores the phone number",
      admin_sql(f"SELECT phone FROM public.users WHERE id='{F3}'") == "0754 051 704")
check("ALLOW: signup stores normalised HFR code",
      admin_sql(f"SELECT hfr_code||'/'||hfr_status||'/'||verified FROM public.facility_profiles WHERE user_id='{F3}'") == "125039-8/unchecked/false")
F4, err4 = signup("fac4@test.tz", {"role": "facility", "display_name": "Copycat", "facility_name": "Copycat", "hfr_code": "125039-8"})
check("ALLOW: signup with a taken HFR code still succeeds, code dropped",
      F4 and admin_sql(f"SELECT coalesce(hfr_code,'none') FROM public.facility_profiles WHERE user_id='{F4}'") == "none", err4[:120])
expect_blocked("facility marks self verified", F3,
    f"UPDATE public.facility_profiles SET verified=true WHERE user_id='{F3}';",
    verify=lambda: admin_sql(f"SELECT verified FROM public.facility_profiles WHERE user_id='{F3}'") == "t")
expect_blocked("facility sets own hfr_status", F3,
    f"UPDATE public.facility_profiles SET hfr_status='operating' WHERE user_id='{F3}';",
    verify=lambda: admin_sql(f"SELECT hfr_status FROM public.facility_profiles WHERE user_id='{F3}'") == "operating")
expect_blocked("facility calls admin_set_facility_verification", F3,
    f"SELECT public.admin_set_facility_verification('{F3}', true, 'me');",
    verify=lambda: admin_sql(f"SELECT verified FROM public.facility_profiles WHERE user_id='{F3}'") == "t")
expect_blocked("admin approves before HFR shows operating", ADMIN,
    f"SELECT public.admin_set_facility_verification('{F3}', true, 'too early');",
    verify=lambda: admin_sql(f"SELECT verified FROM public.facility_profiles WHERE user_id='{F3}'") == "t")
expect_ok("edge function (service role) records HFR result", None,
    f"UPDATE public.facility_profiles SET hfr_status='operating', hfr_name='MORCEP', hfr_checked_at=now() WHERE user_id='{F3}';",
    role="service_role",
    verify=lambda: admin_sql(f"SELECT hfr_status FROM public.facility_profiles WHERE user_id='{F3}'") == "operating")
expect_blocked("facility writes its own HFR check row", F3,
    f"INSERT INTO public.facility_hfr_checks (facility_id, trigger_source, status) VALUES ('{F3}','self','operating');")
admin_sql(f"INSERT INTO public.facility_hfr_checks (facility_id, trigger_source, status, hfr_phone) VALUES ('{F3}','admin','operating','0754051704');")
ok, out, _ = as_user(F3, "SELECT count(*) FROM public.facility_hfr_checks;")
check("BLOCK: facility reads HFR check history (official phone etc.)", out.strip() == "0", out)
admin_sql(f"UPDATE public.facility_profiles SET contract_signed_at = now(), contract_note = 'seed' WHERE user_id='{F3}';")
expect_ok("admin approves operating facility", ADMIN,
    f"SELECT public.admin_set_facility_verification('{F3}', true, 'Called HFR number');",
    verify=lambda: admin_sql(f"SELECT verified FROM public.facility_profiles WHERE user_id='{F3}'") == "t")
ok, out, _ = as_user(C1, f"SELECT verified FROM public.facility_profiles WHERE user_id='{F3}';")
check("ALLOW: CO sees facility Verified flag", out.strip() == "t", out)
expect_ok("verified facility edits address, stays verified", F3,
    f"UPDATE public.facility_profiles SET address='Kijichi' WHERE user_id='{F3}';",
    verify=lambda: admin_sql(f"SELECT verified FROM public.facility_profiles WHERE user_id='{F3}'") == "t")
admin_sql("UPDATE public.system_config SET value='true' WHERE key='require_verified_facilities';")
expect_blocked("unverified facility posts shift (enforced)", F2,
    f"INSERT INTO public.shifts (facility_id, shift_date, shift_type, pay_amount) VALUES ('{F2}', current_date + 2, 'Day (8AM-4PM)', 35000);")
expect_ok("verified facility posts shift (enforced)", F3,
    f"INSERT INTO public.shifts (facility_id, shift_date, shift_type, pay_amount) VALUES ('{F3}', current_date + 2, 'Day (8AM-4PM)', 35000);")
admin_sql("UPDATE public.system_config SET value='false' WHERE key='require_verified_facilities';")
admin_sql(f"UPDATE public.facility_profiles SET hfr_code='111111-1' WHERE user_id='{F}';")
expect_blocked("facility claims another account's HFR code", F3,
    f"UPDATE public.facility_profiles SET hfr_code='111111-1' WHERE user_id='{F3}';",
    verify=lambda: admin_sql(f"SELECT hfr_code FROM public.facility_profiles WHERE user_id='{F3}'") == "111111-1")
expect_ok("facility changes HFR code → verification reset", F3,
    f"UPDATE public.facility_profiles SET hfr_code='2222229' WHERE user_id='{F3}';",
    verify=lambda: admin_sql(f"SELECT hfr_code||'/'||hfr_status||'/'||verified FROM public.facility_profiles WHERE user_id='{F3}'") == "222222-9/unchecked/false")

# ── 12. Admin shift & application management ─────────────────────────────────
def n_notes(uid, ntype):
    return admin_sql(f"SELECT count(*) FROM public.notifications WHERE user_id='{uid}' AND type='{ntype}'")
expect_blocked("facility calls admin_create_shift", F,
    f"SELECT public.admin_create_shift('{F}', current_date + 4, 'Weekend', 40000);")
expect_blocked("admin posts a shift for a CO account", ADMIN,
    f"SELECT public.admin_create_shift('{C1}', current_date + 4, 'Weekend', 40000);")
S4 = last(expect_ok("admin posts a shift for a facility", ADMIN,
    f"SELECT public.admin_create_shift('{F}', current_date + 4, 'Weekend', 40000, 'Cover for leave', 'phoned in');"))
check("ALLOW: facility told AfyaWork posted a shift", n_notes(F, 'shift_posted_by_admin') == "1")
expect_ok("admin adds CO as applicant", ADMIN, f"SELECT public.admin_add_applicant('{S4}', '{C1}', 'called us');",
    verify=lambda: admin_sql(f"SELECT status FROM public.applications WHERE shift_id='{S4}' AND co_id='{C1}'") == "pending")
check("ALLOW: CO told they were added", n_notes(C1, 'added_as_applicant') == "1")
expect_blocked("admin adds CO without signed ICA", ADMIN, f"SELECT public.admin_add_applicant('{S4}', '{C3}');")
expect_blocked("admin adds same CO twice", ADMIN, f"SELECT public.admin_add_applicant('{S4}', '{C1}');")
A4b = last(expect_ok("CO applies normally", C2, f"INSERT INTO public.applications (shift_id, co_id) VALUES ('{S4}','{C2}') RETURNING id;"))
expect_ok("admin rejects an application", ADMIN, f"SELECT public.admin_set_application_status('{A4b}', 'rejected', 'not a fit');",
    verify=lambda: admin_sql(f"SELECT status FROM public.applications WHERE id='{A4b}'") == "rejected")
check("ALLOW: CO told application not selected", n_notes(C2, 'application_rejected') == "1")
expect_ok("admin restores an application", ADMIN, f"SELECT public.admin_set_application_status('{A4b}', 'pending');",
    verify=lambda: admin_sql(f"SELECT status FROM public.applications WHERE id='{A4b}'") == "pending")
expect_blocked("admin sets application approved via status RPC", ADMIN,
    f"SELECT public.admin_set_application_status('{A4b}', 'approved');",
    verify=lambda: admin_sql(f"SELECT status FROM public.applications WHERE id='{A4b}'") == "approved")
expect_ok("admin edits pay on open shift", ADMIN,
    f"SELECT public.admin_update_shift('{S4}', current_date + 4, 'Weekend', 45000, 'Cover for leave', 'agreed with facility');",
    verify=lambda: admin_sql(f"SELECT pay_amount FROM public.shifts WHERE id='{S4}'") == "45000")
check("ALLOW: applicants told shift changed",
      n_notes(C1, 'shift_updated') == "1" and n_notes(C2, 'shift_updated') == "1" and n_notes(F, 'shift_updated') == "1")
expect_blocked("admin moves shift into the past", ADMIN,
    f"SELECT public.admin_update_shift('{S4}', current_date - 1, 'Weekend', 45000);",
    verify=lambda: admin_sql(f"SELECT shift_date < current_date FROM public.shifts WHERE id='{S4}'") == "t")
A4a = admin_sql(f"SELECT id FROM public.applications WHERE shift_id='{S4}' AND co_id='{C1}'")
expect_ok("admin selects a CO", ADMIN, f"SELECT public.admin_approve_application('{A4a}');",
    verify=lambda: admin_sql(f"SELECT status||'/'||assigned_co_id FROM public.shifts WHERE id='{S4}'") == f"filled/{C1}")
check("ALLOW: other applicant set to rejected on selection",
      admin_sql(f"SELECT status FROM public.applications WHERE id='{A4b}'") == "rejected")
check("ALLOW: facility told AfyaWork selected a CO", n_notes(F, 'co_selected_by_admin') == "1")
expect_blocked("admin selects second CO on a filled shift", ADMIN, f"SELECT public.admin_approve_application('{A4b}');")
expect_blocked("facility calls admin_unassign_co", F, f"SELECT public.admin_unassign_co('{S4}', 'x');",
    verify=lambda: admin_sql(f"SELECT status FROM public.shifts WHERE id='{S4}'") == "open")
expect_ok("admin removes selected CO", ADMIN, f"SELECT public.admin_unassign_co('{S4}', 'did not answer');",
    verify=lambda: admin_sql(f"SELECT status||'/'||coalesce(assigned_co_id::text,'none') FROM public.shifts WHERE id='{S4}'") == "open/none")
check("ALLOW: removed CO rejected, others pending again",
      admin_sql(f"SELECT string_agg(status, ',' ORDER BY co_id='{C1}' DESC) FROM public.applications WHERE shift_id='{S4}'") == "rejected,pending")
check("ALLOW: removed CO + facility notified", n_notes(C1, 'removed_from_shift') == "1" and n_notes(F, 'co_unassigned') == "1")
expect_ok("admin selects another CO", ADMIN, f"SELECT public.admin_approve_application('{A4b}');",
    verify=lambda: admin_sql(f"SELECT assigned_co_id FROM public.shifts WHERE id='{S4}'") == C2)
expect_blocked("admin cancels without a reason", ADMIN, f"SELECT public.admin_cancel_shift('{S4}', '  ');",
    verify=lambda: admin_sql(f"SELECT status FROM public.shifts WHERE id='{S4}'") == "cancelled")
before = n_notes(C2, 'shift_cancelled')
expect_ok("admin cancels shift", ADMIN, f"SELECT public.admin_cancel_shift('{S4}', 'Facility closed for inspection');",
    verify=lambda: admin_sql(f"SELECT status||'/'||cancelled_by FROM public.shifts WHERE id='{S4}'") == "cancelled/admin")
check("ALLOW: CO + facility told AfyaWork cancelled",
      int(n_notes(C2, 'shift_cancelled')) == int(before) + 1
      and admin_sql(f"SELECT count(*) FROM public.notifications WHERE user_id='{F}' AND type='shift_cancelled' AND body LIKE '%AfyaWork%inspection%'") == "1")
expect_blocked("admin edits a cancelled shift", ADMIN,
    f"SELECT public.admin_update_shift('{S4}', current_date + 5, 'Weekend', 45000);",
    verify=lambda: admin_sql(f"SELECT shift_date = current_date + 5 FROM public.shifts WHERE id='{S4}'") == "t")
expect_blocked("admin cancels a completed shift", ADMIN, f"SELECT public.admin_cancel_shift('{S1}', 'oops');",
    verify=lambda: admin_sql(f"SELECT status FROM public.shifts WHERE id='{S1}'") == "cancelled")
check("ALLOW: every admin action logged",
      admin_sql(f"SELECT string_agg(action, ',' ORDER BY created_at, action) FROM public.admin_shift_actions WHERE shift_id='{S4}'").count(',') >= 8)
ok, out, _ = as_user(C1, "SELECT count(*) FROM public.admin_shift_actions;")
check("BLOCK: CO reads admin action log", out.strip() == "0", out)
expect_blocked("facility writes admin action log", F,
    f"INSERT INTO public.admin_shift_actions (shift_id, action) VALUES ('{S4}', 'cancel');")

# ── 13. Facility Google Maps location ───────────────────────────────────────
check("ALLOW: signup stores Maps link + coordinates",
      admin_sql(f"SELECT location_lat||','||location_lng||' '||(location_url LIKE 'https://www.google.com/maps/%') FROM public.facility_profiles WHERE user_id='{F3}'")
      == "-6.895200,39.272600 true")
F5, _ = signup("fac5@test.tz", {"role": "facility", "display_name": "Sketchy", "facility_name": "Sketchy",
                                "location_url": "https://evil.example/maps/login", "location_lat": "abc", "location_lng": "39"})
check("ALLOW: signup drops a non-Google link and bad coordinates (signup still works)",
      F5 and admin_sql(f"SELECT coalesce(location_url,'none')||'/'||coalesce(location_lat::text,'none') FROM public.facility_profiles WHERE user_id='{F5}'") == "none/none")
expect_blocked("facility without a location posts a shift", F5,
    f"INSERT INTO public.shifts (facility_id, shift_date, shift_type, pay_amount) VALUES ('{F5}', current_date + 2, 'Day (8AM-4PM)', 35000);")
expect_blocked("facility sets a non-Google 'map' link", F5,
    f"UPDATE public.facility_profiles SET location_url='https://google.evil.com/maps/x' WHERE user_id='{F5}';",
    verify=lambda: admin_sql(f"SELECT coalesce(location_url,'') FROM public.facility_profiles WHERE user_id='{F5}'") != "")
expect_blocked("facility sets latitude without longitude", F5,
    f"UPDATE public.facility_profiles SET location_lat=-6.8 WHERE user_id='{F5}';",
    verify=lambda: admin_sql(f"SELECT location_lat IS NOT NULL FROM public.facility_profiles WHERE user_id='{F5}'") == "t")
expect_ok("facility adds a short Google Maps link", F5,
    f"UPDATE public.facility_profiles SET location_url=' https://maps.app.goo.gl/AbCdEf123 ' WHERE user_id='{F5}';",
    verify=lambda: admin_sql(f"SELECT location_url FROM public.facility_profiles WHERE user_id='{F5}'") == "https://maps.app.goo.gl/AbCdEf123")
expect_ok("facility with a location posts a shift", F5,
    f"INSERT INTO public.shifts (facility_id, shift_date, shift_type, pay_amount) VALUES ('{F5}', current_date + 2, 'Day (8AM-4PM)', 35000);")
expect_blocked("facility removes its location", F5,
    f"UPDATE public.facility_profiles SET location_url=NULL WHERE user_id='{F5}';",
    verify=lambda: admin_sql(f"SELECT location_url IS NULL FROM public.facility_profiles WHERE user_id='{F5}'") == "t")
expect_ok("facility switches to GPS position", F5,
    f"UPDATE public.facility_profiles SET location_lat=-6.7924, location_lng=39.2083 WHERE user_id='{F5}';")
ok, out, _ = as_user(C1, f"SELECT location_lat FROM public.facility_profiles WHERE user_id='{F3}';")
check("ALLOW: CO can read facility location (for directions)", out.strip() == "-6.895200", out)

# ── 14. Coordinators & facility leads ──────────────────────────────────────
def staff_signup(email, name, app_role=None, user_role=None, token=None):
    uid = str(uuid.uuid4())
    app = json.dumps({"provider": "email", **({"afyawork_role": app_role} if app_role else {})})
    meta = json.dumps({"display_name": name, **({"role": user_role} if user_role else {}),
                       **({"staff_invite_token": token} if token else {})})
    ok, (out, err) = run(f"""INSERT INTO auth.users (id, email, raw_app_meta_data, raw_user_meta_data, aud, role)
        VALUES ('{uid}', '{email}', '{app}'::jsonb, '{meta}'::jsonb, 'authenticated', 'authenticated');""",
        user="supabase_auth_admin")
    return uid if ok else None, err

fake, _ = staff_signup("fake-coord@test.tz", "Fake", user_role="coordinator")
check("BLOCK: public signup as coordinator", not fake or admin_sql(f"SELECT count(*) FROM public.users WHERE id='{fake}'") == "0")
# Real Auth flow: the user row is inserted BEFORE app_metadata is attached, so the role
# arrives via user_metadata + a one-time token that only the service role can plant.
admin_sql("INSERT INTO public.staff_invites (email, token) VALUES ('k1@afyawork.test', 'tok-good-1'), "
          "('late@afyawork.test', 'tok-late'), ('forge@afyawork.test', 'tok-real');"
          "UPDATE public.staff_invites SET expires_at = now() - interval '1 minute' WHERE email = 'late@afyawork.test';")
forged, _ = staff_signup("forge@afyawork.test", "Forger", user_role="coordinator", token="tok-guess")
check("BLOCK: coordinator signup with a wrong invite token", not forged or admin_sql(f"SELECT count(*) FROM public.users WHERE id='{forged}'") == "0")
other, _ = staff_signup("someone-else@afyawork.test", "Thief", user_role="coordinator", token="tok-real")
check("BLOCK: coordinator signup reusing another email's token", not other or admin_sql(f"SELECT count(*) FROM public.users WHERE id='{other}'") == "0")
late, _ = staff_signup("late@afyawork.test", "Late", user_role="coordinator", token="tok-late")
check("BLOCK: coordinator signup with an expired token", not late or admin_sql(f"SELECT count(*) FROM public.users WHERE id='{late}'") == "0")
for r in ("authenticated", "anon"):
    ok, out, _ = as_user(None, "SELECT count(*) FROM public.staff_invites;", role=r)
    check(f"BLOCK: {r} reads staff_invites", not ok, out)
    ok, out, _ = as_user(None, "INSERT INTO public.staff_invites (email, token) VALUES ('x@y.tz','t');", role=r)
    check(f"BLOCK: {r} plants a staff invite token", not ok, out)
K1, e1 = staff_signup("k1@afyawork.test", "Neema Coordinator", user_role="coordinator", token="tok-good-1")
check("ALLOW: coordinator via one-time invite token (real Auth order)",
      K1 and admin_sql(f"SELECT role FROM public.users WHERE id='{K1}'") == "coordinator", e1[:160])
check("token is consumed after use", admin_sql("SELECT count(*) FROM public.staff_invites WHERE email='k1@afyawork.test'") == "0")
K2, e2 = staff_signup("k2@afyawork.test", "Juma Coordinator", app_role="coordinator")
check("ALLOW: admin-created coordinator gets the coordinator role",
      K1 and admin_sql(f"SELECT role FROM public.users WHERE id='{K1}'") == "coordinator", e1[:120])

for tbl in ["facility_profiles", "co_profiles", "co_mct_checks", "shifts", "applications", "facility_hfr_checks",
            "shift_payments", "co_mobile_money", "admin_shift_actions", "system_config"]:
    ok, out, _ = as_user(K1, f"SELECT count(*) FROM public.{tbl};")
    check(f"BLOCK: coordinator reads {tbl}", (not ok) or out.strip() == "0", out)
ok, out, _ = as_user(K1, "SELECT count(*) FROM public.users;")
check("BLOCK: coordinator reads other users (own row only)", out.strip() == "1", out)
expect_blocked("coordinator updates a facility profile", K1,
    f"UPDATE public.facility_profiles SET facility_name='Hacked' WHERE user_id='{F}';",
    verify=lambda: admin_sql(f"SELECT facility_name FROM public.facility_profiles WHERE user_id='{F}'") == "Hacked")
ok, out, _ = as_user(C1, "SELECT count(*) FROM public.facility_leads;")
check("BLOCK: CO reads leads", (not ok) or out.strip() == "0", out)
expect_blocked("facility adds a lead", F, "INSERT INTO public.facility_leads (name) VALUES ('Sneaky');")

L1 = last(expect_ok("coordinator adds a lead (owner = self)", K1,
    "INSERT INTO public.facility_leads (name, hfr_code, official_phone) VALUES ('Morcep', ' 1250398 ', '0754051704') RETURNING id;"))
check("ALLOW: lead owner defaults to the coordinator, code normalised",
      admin_sql(f"SELECT owner_id||'/'||hfr_code FROM public.facility_leads WHERE id='{L1}'") == f"{K1}/125039-8")
expect_blocked("coordinator adds a lead owned by someone else", K1,
    f"INSERT INTO public.facility_leads (name, owner_id) VALUES ('X', '{K2}');")
expect_blocked("coordinator sets a facility link on insert", K1,
    f"INSERT INTO public.facility_leads (name, facility_profile_id) VALUES ('Y', '{F}');")
ok, out, err = as_user(K2, "INSERT INTO public.facility_leads (name, hfr_code) VALUES ('Morcep again', '125039-8');")
check("BLOCK: duplicate HFR code names the existing lead", (not ok) and 'Morcep' in err, err[:160])
expect_ok("coordinator edits notes and follow-up date", K2,
    f"UPDATE public.facility_leads SET notes='Asked for the medical director', due_date=current_date + 3 WHERE id='{L1}';")
expect_blocked("coordinator changes lead owner", K2, f"UPDATE public.facility_leads SET owner_id='{K2}' WHERE id='{L1}';",
    verify=lambda: admin_sql(f"SELECT owner_id FROM public.facility_leads WHERE id='{L1}'") == K2)
expect_blocked("coordinator sets HFR result directly", K1, f"UPDATE public.facility_leads SET hfr_status='operating' WHERE id='{L1}';",
    verify=lambda: admin_sql(f"SELECT coalesce(hfr_status,'') FROM public.facility_leads WHERE id='{L1}'") == "operating")
expect_blocked("coordinator links a lead to a facility", K1, f"UPDATE public.facility_leads SET facility_profile_id='{F}' WHERE id='{L1}';",
    verify=lambda: admin_sql(f"SELECT coalesce(facility_profile_id::text,'') FROM public.facility_leads WHERE id='{L1}'") == F)
expect_blocked("coordinator deletes a lead", K1, f"DELETE FROM public.facility_leads WHERE id='{L1}';",
    verify=lambda: admin_sql(f"SELECT count(*) FROM public.facility_leads WHERE id='{L1}'") == "0")
expect_blocked("coordinator calls admin_reassign_leads", K1, f"SELECT public.admin_reassign_leads('{K1}', '{K2}');",
    verify=lambda: admin_sql(f"SELECT owner_id FROM public.facility_leads WHERE id='{L1}'") == K2)
expect_blocked("coordinator approves a facility", K1, f"SELECT public.admin_set_facility_verification('{F}', true, 'x');")
expect_blocked("coordinator calls an admin shift RPC", K1, f"SELECT public.admin_create_shift('{F}', current_date + 4, 'Weekend', 40000);")

expect_ok("coordinator ticks a manual step", K1, f"INSERT INTO public.lead_steps (lead_id, step_id) VALUES ('{L1}', '2a');",
    verify=lambda: admin_sql(f"SELECT done_by FROM public.lead_steps WHERE lead_id='{L1}' AND step_id='2a'") == K1)
expect_blocked("coordinator stores an auto step (6g approved)", K1, f"INSERT INTO public.lead_steps (lead_id, step_id) VALUES ('{L1}', '6g');")
expect_blocked("coordinator stores an auto step (1b operating)", K1, f"INSERT INTO public.lead_steps (lead_id, step_id) VALUES ('{L1}', '1b');")
expect_blocked("coordinator ticks admin-only step 6e", K1, f"INSERT INTO public.lead_steps (lead_id, step_id) VALUES ('{L1}', '6e');")
expect_ok("admin ticks 6e (official phone call)", ADMIN, f"INSERT INTO public.lead_steps (lead_id, step_id) VALUES ('{L1}', '6e');")
expect_blocked("coordinator unticks admin-only step 6e", K1, f"DELETE FROM public.lead_steps WHERE lead_id='{L1}' AND step_id='6e';",
    verify=lambda: admin_sql(f"SELECT count(*) FROM public.lead_steps WHERE lead_id='{L1}' AND step_id='6e'") == "0")
expect_ok("coordinator unticks a manual step", K2, f"DELETE FROM public.lead_steps WHERE lead_id='{L1}' AND step_id='2a';",
    verify=lambda: admin_sql(f"SELECT count(*) FROM public.lead_steps WHERE lead_id='{L1}' AND step_id='2a'") == "0")
ok, out, _ = as_user(K1, "SELECT count(*) FROM public.lead_events;")
check("BLOCK: coordinator reads the audit trail", out.strip() == "0", out)
check("ALLOW: audit trail records create, edit and ticks",
      admin_sql(f"SELECT string_agg(DISTINCT action, ',' ORDER BY action) FROM public.lead_events WHERE lead_id='{L1}'")
      == "created,step_ticked,step_unticked")
ok, out, _ = as_user(K1, "SELECT count(*) FROM public.lead_staff();")
check("ALLOW: coordinator lists staff names", ok and int(out.strip() or 0) >= 3, out)
expect_blocked("CO lists lead staff", C1, "SELECT * FROM public.lead_staff();")

L2 = last(expect_ok("coordinator adds lead for a facility already on AfyaWork", K1,
    "INSERT INTO public.facility_leads (name, hfr_code) VALUES ('Morcep branch', '2222229') RETURNING id;"))
check("ALLOW: lead links itself to the facility with that HFR code",
      admin_sql(f"SELECT facility_profile_id FROM public.facility_leads WHERE id='{L2}'") == F3)
L3 = last(expect_ok("coordinator adds lead before the facility signs up", K2,
    "INSERT INTO public.facility_leads (name, hfr_code) VALUES ('Future Clinic', '333333-4') RETURNING id;"))
F6, _ = signup("fac6@test.tz", {"role": "facility", "display_name": "Future Clinic", "facility_name": "Future Clinic",
                                "hfr_code": "3333334", "location_lat": "-6.8", "location_lng": "39.2"})
check("ALLOW: facility signing up with the code gets linked to the lead",
      admin_sql(f"SELECT facility_profile_id FROM public.facility_leads WHERE id='{L3}'") == F6)

expect_ok("admin reassigns a coordinator's leads", ADMIN, f"SELECT public.admin_reassign_leads('{K2}', '{K1}');",
    verify=lambda: admin_sql(f"SELECT owner_id FROM public.facility_leads WHERE id='{L3}'") == K1)
admin_sql(f"UPDATE public.users SET account_status='disabled' WHERE id='{K2}';")
ok, out, _ = as_user(K2, "SELECT count(*) FROM public.facility_leads;")
check("BLOCK: revoked coordinator reads leads", (not ok) or out.strip() == "0", out)
expect_blocked("revoked coordinator adds a lead", K2, "INSERT INTO public.facility_leads (name) VALUES ('After revoke');")
expect_blocked("revoked coordinator ticks a step", K2, f"INSERT INTO public.lead_steps (lead_id, step_id) VALUES ('{L1}', '2b');")
ok, out, _ = as_user(K2, "SELECT count(*) FROM public.facility_profiles;")
check("BLOCK: revoked coordinator reads facilities", out.strip() == "0", out)
expect_blocked("revoked coordinator reactivates self", K2, f"UPDATE public.users SET account_status='active' WHERE id='{K2}';",
    verify=lambda: admin_sql(f"SELECT account_status FROM public.users WHERE id='{K2}'") == "active")
expect_ok("admin deletes a lead", ADMIN, f"DELETE FROM public.facility_leads WHERE id='{L2}';",
    verify=lambda: admin_sql(f"SELECT count(*) FROM public.lead_events WHERE lead_id='{L2}' AND action='deleted'") == "1")

# ── 15. Lead files, contract gate, lead board ─────────────────────────────────
expect_blocked("facility marks its own contract signed", F6,
    f"UPDATE public.facility_profiles SET contract_signed_at = now() WHERE user_id='{F6}';",
    verify=lambda: admin_sql(f"SELECT contract_signed_at IS NOT NULL FROM public.facility_profiles WHERE user_id='{F6}'") == "t")
expect_blocked("coordinator confirms a contract", K1, f"SELECT public.admin_set_contract_signed('{F6}', true, NULL, 'paper copy');",
    verify=lambda: admin_sql(f"SELECT contract_signed_at IS NOT NULL FROM public.facility_profiles WHERE user_id='{F6}'") == "t")
expect_blocked("coordinator approves a facility", K1, f"SELECT public.admin_set_facility_verification('{F6}', true);",
    verify=lambda: admin_sql(f"SELECT verified FROM public.facility_profiles WHERE user_id='{F6}'") == "t")
expect_ok("HFR check marks the facility operating (service role)", None,
    f"UPDATE public.facility_profiles SET hfr_status='operating', hfr_checked_at=now() WHERE user_id='{F6}';", role="service_role")
admin_sql("UPDATE public.system_config SET value='true' WHERE key='require_verified_facilities';")
expect_blocked("admin approves a facility with no signed contract", ADMIN, f"SELECT public.admin_set_facility_verification('{F6}', true, 'called');",
    verify=lambda: admin_sql(f"SELECT verified FROM public.facility_profiles WHERE user_id='{F6}'") == "t")
expect_blocked("admin confirms a contract with no scan and no note", ADMIN, f"SELECT public.admin_set_contract_signed('{F6}', true);",
    verify=lambda: admin_sql(f"SELECT contract_signed_at IS NOT NULL FROM public.facility_profiles WHERE user_id='{F6}'") == "t")

FL1 = last(expect_ok("coordinator records an uploaded licence", K1,
    f"INSERT INTO public.lead_files (lead_id, kind, storage_path, file_name, mime_type, size_bytes) VALUES ('{L3}', 'annual_licence', '{L3}/licence.jpg', 'licence.jpg', 'image/jpeg', 120000) RETURNING id;"))
FC1 = last(expect_ok("coordinator records the contract scan", K1,
    f"INSERT INTO public.lead_files (lead_id, kind, storage_path, file_name, mime_type, size_bytes) VALUES ('{L3}', 'contract_scan', '{L3}/contract.pdf', 'contract.pdf', 'application/pdf', 900000) RETURNING id;"))
expect_blocked("file path outside its lead", K1,
    f"INSERT INTO public.lead_files (lead_id, kind, storage_path, mime_type, size_bytes) VALUES ('{L3}', 'site_photo', '{L1}/x.jpg', 'image/jpeg', 100);")
expect_blocked("upload of a disallowed file type", K1,
    f"INSERT INTO public.lead_files (lead_id, kind, storage_path, mime_type, size_bytes) VALUES ('{L3}', 'site_photo', '{L3}/x.exe', 'application/x-msdownload', 100);")
expect_blocked("upload over 10 MB", K1,
    f"INSERT INTO public.lead_files (lead_id, kind, storage_path, mime_type, size_bytes) VALUES ('{L3}', 'site_photo', '{L3}/big.jpg', 'image/jpeg', 20000000);")
expect_blocked("coordinator deletes a file", K1, f"DELETE FROM public.lead_files WHERE id='{FL1}';",
    verify=lambda: admin_sql(f"SELECT count(*) FROM public.lead_files WHERE id='{FL1}'") == "0")
expect_blocked("admin confirms a contract with a licence instead of the contract scan", ADMIN,
    f"SELECT public.admin_set_contract_signed('{F6}', true, '{FL1}');",
    verify=lambda: admin_sql(f"SELECT contract_signed_at IS NOT NULL FROM public.facility_profiles WHERE user_id='{F6}'") == "t")
expect_ok("admin confirms the contract from the scan", ADMIN, f"SELECT public.admin_set_contract_signed('{F6}', true, '{FC1}');",
    verify=lambda: admin_sql(f"SELECT contract_file_id FROM public.facility_profiles WHERE user_id='{F6}'") == FC1)
expect_ok("admin approves once the contract is signed", ADMIN, f"SELECT public.admin_set_facility_verification('{F6}', true, 'called');",
    verify=lambda: admin_sql(f"SELECT verified FROM public.facility_profiles WHERE user_id='{F6}'") == "t")
expect_ok("verified facility posts its first shift", F6,
    f"INSERT INTO public.shifts (facility_id, shift_date, shift_type, pay_amount) VALUES ('{F6}', current_date + 3, 'Weekend', 40000);")
admin_sql("UPDATE public.system_config SET value='false' WHERE key='require_verified_facilities';")

ok, out, err = as_user(K1, f"SELECT (b->'auto') ? '6a', (b->'auto') ? '6b', (b->'auto') ? '6f', (b->'auto') ? '6g', (b->'auto') ? '7d', (b->'auto') ? '7e', b->'facility'->>'shifts_posted', jsonb_array_length(b->'files') FROM public.lead_board('{L3}') b;")
check("ALLOW: lead board ticks 6a 6b 6f 6g 7d from live data (7e not yet)", last(out) == "t|t|t|t|t|f|1|2", (err or out)[:160])
ok, out, err = as_user(K1, f"SELECT b->'steps' ? '6e', jsonb_typeof(b->'facility') = 'null' FROM public.lead_board('{L1}') b;")
check("ALLOW: lead board shows manual ticks; unlinked lead has no facility", last(out) == "t|t", (err or out)[:160])
ok, out, _ = as_user(K1, "SELECT count(*) FROM public.lead_board();")
check("ALLOW: coordinator sees every lead on the board", ok and int(last(out) or 0) >= 2, out)
expect_blocked("CO reads the lead board", C1, "SELECT * FROM public.lead_board();")
expect_blocked("revoked coordinator reads the lead board", K2, "SELECT * FROM public.lead_board();")
ok, out, _ = as_user(K1, f"SELECT b::text LIKE '%%hfr_phone%%' OR b::text LIKE '%%phone%%0754%%' FROM public.lead_board('{L3}') b;")
check("BLOCK: lead board leaks no facility contact details", last(out) == "f", out)
expect_ok("admin withdraws the contract → verification removed", ADMIN, f"SELECT public.admin_set_contract_signed('{F6}', false, NULL, 'wrong version signed');",
    verify=lambda: admin_sql(f"SELECT verified FROM public.facility_profiles WHERE user_id='{F6}'") == "f")
check("ALLOW: contract events logged on the lead",
      admin_sql(f"SELECT string_agg(action, ',' ORDER BY created_at) FROM public.lead_events WHERE lead_id='{L3}' AND action LIKE 'contract%'") == "contract_confirmed,contract_withdrawn")

# storage (the local shim lacks Supabase's storage grants)
admin_sql("GRANT USAGE ON SCHEMA storage TO authenticated, anon; GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO authenticated;")
expect_ok("coordinator uploads into the lead-files bucket", K1,
    f"INSERT INTO storage.objects (bucket_id, name) VALUES ('lead-files', '{L3}/site.jpg');")
expect_blocked("coordinator uploads under a made-up lead folder", K1,
    "INSERT INTO storage.objects (bucket_id, name) VALUES ('lead-files', '00000000-0000-0000-0000-000000000000/x.jpg');")
expect_blocked("coordinator uploads to another bucket", K1, f"INSERT INTO storage.objects (bucket_id, name) VALUES ('avatars', '{K1}/me.jpg');")
admin_sql(f"INSERT INTO storage.objects (bucket_id, name) VALUES ('avatars', '{C1}/face.jpg');")
ok, out, _ = as_user(K1, "SELECT count(*) FROM storage.objects WHERE bucket_id <> 'lead-files';")
check("BLOCK: coordinator reads other buckets", out.strip() == "0", out)
ok, out, _ = as_user(C1, "SELECT count(*) FROM storage.objects WHERE bucket_id = 'lead-files';")
check("BLOCK: CO reads lead files", out.strip() == "0", out)
ok, out, _ = as_user(K2, "SELECT count(*) FROM storage.objects WHERE bucket_id = 'lead-files';")
check("BLOCK: revoked coordinator reads lead files", out.strip() == "0", out)
expect_blocked("coordinator deletes a stored file", K1, f"DELETE FROM storage.objects WHERE bucket_id='lead-files' AND name='{L3}/site.jpg';",
    verify=lambda: admin_sql(f"SELECT count(*) FROM storage.objects WHERE name='{L3}/site.jpg'") == "0")

# ── Report ───────────────────────────────────────────────────────────────────
passed = sum(1 for _, ok, _ in results if ok)
for name, ok, detail in results:
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else f"   ← {detail}"))
print(f"\n{passed}/{len(results)} passed")
