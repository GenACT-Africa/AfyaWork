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

# ── Report ───────────────────────────────────────────────────────────────────
passed = sum(1 for _, ok, _ in results if ok)
for name, ok, detail in results:
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else f"   ← {detail}"))
print(f"\n{passed}/{len(results)} passed")
