#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Rendered-page audit.
#
# Fetches every screen as each role and greps the HTML for the things that give a
# demo away: NaN, undefined, Invalid Date, empty currency, unresolved React keys,
# and data that the viewer's role should not be able to see.
#
#   npm run dev && bash scripts/audit-pages.sh
# ---------------------------------------------------------------------------
set -uo pipefail

BASE="${BASE:-http://localhost:3000}"
PASS_WORD="Dayflow@2026"
TMP="$(mktemp -d)"
PASSED=0
FAILED=0

green() { printf '\033[32m%s\033[0m' "$1"; }
red()   { printf '\033[31m%s\033[0m' "$1"; }

login() {
  curl -s -c "$1" -o /dev/null -X POST "$BASE/api/auth/sign-in" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"$2\",\"password\":\"$PASS_WORD\"}"
}

# Flags that should never appear in rendered output.
BAD_PATTERNS='NaN|Invalid Date|undefined<|>undefined|\[object Object\]|₹NaN|Infinity'

fetch() { # fetch <jar> <path> <label>
  local status body
  status="$(curl -s -b "$1" -o "$TMP/page.html" -w '%{http_code}' "$BASE$2")"
  if [ "$status" != "200" ]; then
    FAILED=$((FAILED + 1))
    printf '  %s %-46s HTTP %s\n' "$(red FAIL)" "$3" "$status"
    return
  fi
  if grep -qE "$BAD_PATTERNS" "$TMP/page.html"; then
    FAILED=$((FAILED + 1))
    body="$(grep -oE "$BAD_PATTERNS" "$TMP/page.html" | sort -u | tr '\n' ' ')"
    printf '  %s %-46s rendered: %s\n' "$(red FAIL)" "$3" "$body"
    return
  fi
  PASSED=$((PASSED + 1))
  printf '  %s %-46s %s bytes\n' "$(green PASS)" "$3" "$(wc -c < "$TMP/page.html" | tr -d ' ')"
}

absent() { # absent <jar> <path> <needle> <label>
  curl -s -b "$1" -o "$TMP/page.html" "$BASE$2"
  if grep -q "$3" "$TMP/page.html"; then
    FAILED=$((FAILED + 1)); printf '  %s %s (leaked "%s")\n' "$(red FAIL)" "$4" "$3"
  else
    PASSED=$((PASSED + 1)); printf '  %s %s\n' "$(green PASS)" "$4"
  fi
}

echo
echo "Dayflow page audit → $BASE"

login "$TMP/admin.jar" admin@dayflow.io
login "$TMP/hr.jar" hr@dayflow.io
login "$TMP/emp.jar" employee@dayflow.io

EID="$(curl -s -b "$TMP/admin.jar" "$BASE/api/search?q=Aarav" \
  | python -c "import sys,json;print(json.load(sys.stdin)['employees'][0]['id'])")"

echo
echo "Administrator"
fetch "$TMP/admin.jar" /overview      "/overview"      "Attention queue"
fetch "$TMP/admin.jar" /people        "/people"        "Employees on record"
fetch "$TMP/admin.jar" /attendance    "/attendance"    "Working now"
fetch "$TMP/admin.jar" /leave         "/leave"         "Approval queue"
fetch "$TMP/admin.jar" /payroll       "/payroll"       "Payroll run"
fetch "$TMP/admin.jar" /reports       "/reports"       "Attendance summary"
fetch "$TMP/admin.jar" /notifications "/notifications" "Notifications"
fetch "$TMP/admin.jar" /settings      "/settings"      "Work policy"
fetch "$TMP/admin.jar" /profile       "/profile"       "Reports to"
fetch "$TMP/admin.jar" "/people/$EID?tab=overview"   "/people/[id]?tab=overview"   "Hours this month"
fetch "$TMP/admin.jar" "/people/$EID?tab=personal"   "/people/[id]?tab=personal"   "Personal details"
fetch "$TMP/admin.jar" "/people/$EID?tab=employment" "/people/[id]?tab=employment" "Reporting line"
fetch "$TMP/admin.jar" "/people/$EID?tab=attendance" "/people/[id]?tab=attendance" "Day by day"
fetch "$TMP/admin.jar" "/people/$EID?tab=leave"      "/people/[id]?tab=leave"      "Request history"
fetch "$TMP/admin.jar" "/people/$EID?tab=payroll"    "/people/[id]?tab=payroll"    "Salary structure"
fetch "$TMP/admin.jar" "/people/$EID?tab=documents"  "/people/[id]?tab=documents"  "Documents"
fetch "$TMP/admin.jar" "/people/$EID?tab=activity"   "/people/[id]?tab=activity"   "Activity trail"
fetch "$TMP/admin.jar" "/reports?report=attendance" "/reports?report=attendance" "Attendance summary"
fetch "$TMP/admin.jar" "/reports?report=leave"      "/reports?report=leave"      "Leave register"
fetch "$TMP/admin.jar" "/reports?report=payroll"    "/reports?report=payroll"    "Payroll register"
fetch "$TMP/admin.jar" "/reports?report=headcount"  "/reports?report=headcount"  "Headcount register"
fetch "$TMP/admin.jar" "/attendance?filter=unclosed" "/attendance?filter=unclosed"
fetch "$TMP/admin.jar" "/payroll?period=2026-07" "/payroll?period=2026-07"
fetch "$TMP/admin.jar" "/people?status=PROBATION&sort=joinedAt&dir=desc" "/people (filtered + sorted)"
fetch "$TMP/admin.jar" "/leave?status=PENDING" "/leave?status=PENDING"

echo
echo "HR officer"
fetch "$TMP/hr.jar" /overview   "/overview"   "Attention queue"
fetch "$TMP/hr.jar" /people     "/people"     "Employees on record"
fetch "$TMP/hr.jar" /attendance "/attendance" "Working now"
fetch "$TMP/hr.jar" /leave      "/leave"      "Approval queue"
fetch "$TMP/hr.jar" /payroll    "/payroll"    "Payroll run"
fetch "$TMP/hr.jar" /reports    "/reports"    "Attendance summary"
fetch "$TMP/hr.jar" /settings   "/settings"   "Work policy"

echo
echo "Employee"
fetch "$TMP/emp.jar" /overview      "/overview"      "Your workday"
fetch "$TMP/emp.jar" /attendance    "/attendance"    "My attendance"
fetch "$TMP/emp.jar" /leave         "/leave"         "Your entitlements"
fetch "$TMP/emp.jar" /payroll       "/payroll"       "My payroll"
fetch "$TMP/emp.jar" /notifications "/notifications" "Notifications"
fetch "$TMP/emp.jar" /settings      "/settings"      "Your working pattern"
fetch "$TMP/emp.jar" /profile       "/profile"       "Hours this month"
fetch "$TMP/emp.jar" "/profile?tab=overview"   "/profile?tab=overview"   "Leave balances"
fetch "$TMP/emp.jar" "/profile?tab=personal"   "/profile?tab=personal"   "Emergency contact"
fetch "$TMP/emp.jar" "/profile?tab=employment" "/profile?tab=employment" "Reporting line"
fetch "$TMP/emp.jar" "/profile?tab=attendance" "/profile?tab=attendance" "Day by day"
fetch "$TMP/emp.jar" "/profile?tab=leave"      "/profile?tab=leave"      "Request history"
fetch "$TMP/emp.jar" "/profile?tab=payroll"    "/profile?tab=payroll"    "Salary structure"
fetch "$TMP/emp.jar" "/profile?tab=documents"  "/profile?tab=documents"  "Documents"
fetch "$TMP/emp.jar" "/profile?tab=activity"   "/profile?tab=activity"   "Activity trail"

echo
echo "Employee must not see management surfaces"
absent "$TMP/emp.jar" /overview "Attention queue" "no attention queue on the employee overview"
absent "$TMP/emp.jar" /overview "Add employee" "no onboarding action"
absent "$TMP/emp.jar" /payroll "Process payroll" "no payroll processing control"
absent "$TMP/emp.jar" /payroll "Cost by department" "no organisation payroll analytics"
absent "$TMP/emp.jar" /attendance "Adjust record" "no attendance adjustment control"
absent "$TMP/emp.jar" /settings "Send an announcement" "no announcement composer"
absent "$TMP/emp.jar" /leave "Approval queue" "no approval queue"
# A teammate's leave is deliberately visible (it is a team calendar, not private
# data); leave from another department is not.
absent "$TMP/emp.jar" /overview "Grace Wanjiru" "no cross-department leave on the overview"
absent "$TMP/emp.jar" /overview "Monthly commitment" "no organisation salary commitment"

echo
printf 'Result: %s passed, %s failed\n\n' "$(green "$PASSED")" "$([ "$FAILED" -eq 0 ] && green 0 || red "$FAILED")"
rm -rf "$TMP"
[ "$FAILED" -eq 0 ]
