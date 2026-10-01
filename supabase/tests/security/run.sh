#!/usr/bin/env bash
# Security regression tests for AfyaWork's database.
# Needs a local PostgreSQL 15+ server you can reach as superuser 'postgres'
# over a Unix socket. Set PGHOST_DIR / PGPORT_NUM if yours differ.
#   ./supabase/tests/security/run.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"          # = supabase/
SOCK="${PGHOST_DIR:-/tmp/pgt}"; PORT="${PGPORT_NUM:-5433}"
P="psql -h $SOCK -p $PORT -U postgres -q -v ON_ERROR_STOP=1"
$P -d postgres -c "DROP DATABASE IF EXISTS t" >/dev/null 2>&1 || true
$P -d postgres -c "CREATE DATABASE t" >/dev/null
$P -d t -f "$HERE/shim.sql" >/dev/null
for f in schema rls_public_reads admin_setup create_admin_user invite_flow admin_crud fix_invite_expiry \
         fix_user_update_rls add_bio avatar_storage feature2_checkin_ratings feature3_employment_availability \
         feature4_pay_disbursement fix_payment_creation whatsapp_trigger add_legal_agreements add_beta_feedback; do
  $P -d t -f "$ROOT/$f.sql" >/dev/null 2>&1
done
for m in "$ROOT"/migrations/*.sql; do $P -d t -f "$m" 2>&1 | grep -v NOTICE || true; done
sed -e "s#/tmp/pgt#$SOCK#; s#\"5433\"#\"$PORT\"#" "$HERE/run_tests.py" > /tmp/afyawork_run_tests.py
python3 /tmp/afyawork_run_tests.py t
