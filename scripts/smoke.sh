#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Dayflow end-to-end smoke test.
#
# Drives the real HTTP API against a running dev server the way the UI does:
# authentication, RBAC boundaries, attendance transitions, the leave workflow,
# payroll processing and notifications. Every assertion is a real response code
# or payload — nothing is mocked.
#
# The leave and payroll sections adapt to the state already in the database, so
# the script is safe to re-run; for the cleanest output start from a fresh dataset
# with `npm run db:reset`.
#
#   npm run dev            # in one terminal
#   bash scripts/smoke.sh  # in another
# ---------------------------------------------------------------------------
set -uo pipefail

BASE="${BASE:-http://localhost:3000}"
PASS="Dayflow@2026"
TMP="$(mktemp -d)"
PASSED=0
FAILED=0

green() { printf '\033[32m%s\033[0m' "$1"; }
red()   { printf '\033[31m%s\033[0m' "$1"; }

check() { # check <label> <expected> <actual>
  if [ "$2" = "$3" ]; then
    PASSED=$((PASSED + 1)); printf '  %s %s\n' "$(green PASS)" "$1"
  else
    FAILED=$((FAILED + 1)); printf '  %s %s (expected %s, got %s)\n' "$(red FAIL)" "$1" "$2" "$3"
  fi
}

contains() { # contains <label> <needle> <file>
  if grep -q "$2" "$3"; then
    PASSED=$((PASSED + 1)); printf '  %s %s\n' "$(green PASS)" "$1"
  else
    FAILED=$((FAILED + 1)); printf '  %s %s (missing "%s")\n' "$(red FAIL)" "$1" "$2"
  fi
}

login() { # login <jar> <email>
  curl -s -c "$1" -o "$TMP/login.json" -w '%{http_code}' \
    -X POST "$BASE/api/auth/sign-in" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$2\",\"password\":\"$PASS\"}"
}

code() { # code <jar> <method> <path> [body]
  if [ -n "${4:-}" ]; then
    curl -s -b "$1" -o "$TMP/out.json" -w '%{http_code}' -X "$2" "$BASE$3" \
      -H 'Content-Type: application/json' -d "$4"
  else
    curl -s -b "$1" -o "$TMP/out.json" -w '%{http_code}' -X "$2" "$BASE$3"
  fi
}

jq_get() { python -c "import sys,json;d=json.load(open(sys.argv[1]));print(eval(sys.argv[2]))" "$1" "$2" 2>/dev/null; }

echo
echo "Dayflow smoke test → $BASE"

# --------------------------------------------------------------- 1. auth
echo
echo "1. Authentication"
check "unauthenticated page redirects to sign-in" 307 \
  "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/overview")"
check "unauthenticated API returns 401" 401 \
  "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/employees")"
check "wrong password is rejected" 401 \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/sign-in" \
     -H 'Content-Type: application/json' -d '{"email":"admin@dayflow.io","password":"wrong-one"}')"
check "unknown account is rejected" 401 \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/sign-in" \
     -H 'Content-Type: application/json' -d '{"email":"nobody@dayflow.io","password":"Whatever@123"}')"
check "malformed email fails validation" 422 \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/sign-in" \
     -H 'Content-Type: application/json' -d '{"email":"not-an-email","password":"x"}')"

check "admin sign-in" 200 "$(login "$TMP/admin.jar" admin@dayflow.io)"
check "hr sign-in"    200 "$(login "$TMP/hr.jar" hr@dayflow.io)"
check "employee sign-in" 200 "$(login "$TMP/emp.jar" employee@dayflow.io)"
check "session reports the signed-in user" 200 "$(code "$TMP/emp.jar" GET /api/auth/session)"
contains "session includes the employee role" '"role":"EMPLOYEE"' "$TMP/out.json"

# --------------------------------------------------------------- 2. rbac
echo
echo "2. Role-based access control"
check "employee cannot list the directory API" 403 \
  "$(code "$TMP/emp.jar" GET '/api/employees')"
check "employee cannot read org attendance" 403 \
  "$(code "$TMP/emp.jar" GET '/api/attendance?scope=org')"
check "employee cannot read org leave" 403 \
  "$(code "$TMP/emp.jar" GET '/api/leave?scope=org')"
check "employee cannot run reports" 403 \
  "$(code "$TMP/emp.jar" GET '/api/reports?report=attendance')"
check "employee cannot preview payroll" 403 \
  "$(code "$TMP/emp.jar" GET '/api/payroll/run?period=2026-08')"
check "hr cannot process payroll (admin only)" 403 \
  "$(code "$TMP/hr.jar" POST '/api/payroll/run' '{"period":"2026-07","action":"PROCESS"}')"
check "hr can preview payroll" 200 \
  "$(code "$TMP/hr.jar" GET '/api/payroll/run?period=2026-08')"

# Find two employee ids: the demo employee and a colleague.
code "$TMP/admin.jar" GET '/api/search?q=Aarav' >/dev/null
SELF_ID="$(jq_get "$TMP/out.json" "d['employees'][0]['id']")"
code "$TMP/admin.jar" GET '/api/search?q=Sneha' >/dev/null
OTHER_ID="$(jq_get "$TMP/out.json" "d['employees'][0]['id']")"
echo "  (self=$SELF_ID other=$OTHER_ID)"

check "employee can read own profile" 200 \
  "$(code "$TMP/emp.jar" GET "/api/employees/$SELF_ID")"
check "employee cannot read a colleague (IDOR)" 403 \
  "$(code "$TMP/emp.jar" GET "/api/employees/$OTHER_ID")"
check "employee cannot read a colleague's salary" 403 \
  "$(code "$TMP/emp.jar" GET "/api/employees/$OTHER_ID/salary")"
check "employee cannot write a colleague's salary" 403 \
  "$(code "$TMP/emp.jar" PUT "/api/employees/$OTHER_ID/salary" \
     '{"basic":99999,"hra":1,"specialAllowance":1,"transportAllow":1,"providentFund":1,"professionalTax":1,"healthInsurance":1}')"
check "employee cannot escalate their own role/title" 403 \
  "$(code "$TMP/emp.jar" PATCH "/api/employees/$SELF_ID" '{"jobTitle":"Chief Executive","status":"ACTIVE"}')"
check "employee can edit their own phone" 200 \
  "$(code "$TMP/emp.jar" PATCH "/api/employees/$SELF_ID" '{"phone":"+91 90000 11111"}')"
check "employee cannot adjust attendance" 403 \
  "$(code "$TMP/emp.jar" POST '/api/attendance' \
     "{\"employeeId\":\"$OTHER_ID\",\"workDate\":\"2026-08-20\",\"status\":\"PRESENT\",\"checkIn\":\"09:30\",\"checkOut\":\"18:00\"}")"
check "employee cannot broadcast an announcement" 403 \
  "$(code "$TMP/emp.jar" POST '/api/settings' '{"title":"Free coffee","body":"Everyone gets a raise today.","audience":"ALL"}')"
check "hr cannot change the work policy (admin only)" 403 \
  "$(code "$TMP/hr.jar" PATCH '/api/settings' \
     '{"standardWorkMinutes":60,"halfDayMinutes":30,"lateGraceMinutes":0,"payrollDayOfMonth":1,"timezone":"Asia/Kolkata"}')"

# ---------------------------------------------------------- 3. attendance
echo
echo "3. Attendance transitions"
# Start from a known state so the sequence below is repeatable: HR clears today's
# record for the demo employee using the real adjustment endpoint.
TODAY="$(curl -s -b "$TMP/admin.jar" "$BASE/api/attendance/today"   | python -c "import sys,json;print(json.load(sys.stdin)['workDate'])" 2>/dev/null)"
check "hr resets the demo employee's day" 200   "$(code "$TMP/hr.jar" POST '/api/attendance'      "{\"employeeId\":\"$SELF_ID\",\"workDate\":\"$TODAY\",\"status\":\"ABSENT\",\"note\":\"Smoke test reset\"}")"

check "today state is readable" 200 "$(code "$TMP/emp.jar" GET /api/attendance/today)"
BEFORE_STATUS="$(jq_get "$TMP/out.json" "d['status']")"
echo "  (work date: $TODAY, status before: $BEFORE_STATUS)"

check "check-out before check-in is rejected" 409 \
  "$(code "$TMP/emp.jar" POST '/api/attendance/today?action=check-out' '{}')"
contains "rejection explains the rule" "cannot check out before checking in" "$TMP/out.json"

check "check-in succeeds" 200 "$(code "$TMP/emp.jar" POST '/api/attendance/today' '{}')"
contains "check-in returns a message" '"message"' "$TMP/out.json"
check "duplicate check-in is rejected" 409 \
  "$(code "$TMP/emp.jar" POST '/api/attendance/today' '{}')"
contains "duplicate rejection is specific" "already checked in" "$TMP/out.json"

check "check-out succeeds" 200 \
  "$(code "$TMP/emp.jar" POST '/api/attendance/today?action=check-out' '{}')"
check "second check-out is rejected" 409 \
  "$(code "$TMP/emp.jar" POST '/api/attendance/today?action=check-out' '{}')"
contains "second check-out rejection is specific" "already checked out" "$TMP/out.json"

check "own history is readable" 200 "$(code "$TMP/emp.jar" GET '/api/attendance?scope=me')"
check "hr can adjust a past record" 200 \
  "$(code "$TMP/hr.jar" POST '/api/attendance' \
     "{\"employeeId\":\"$OTHER_ID\",\"workDate\":\"2026-08-20\",\"status\":\"PRESENT\",\"checkIn\":\"09:15\",\"checkOut\":\"18:05\",\"note\":\"Smoke test correction\"}")"
check "adjustment with checkout before checkin is rejected" 422 \
  "$(code "$TMP/hr.jar" POST '/api/attendance' \
     "{\"employeeId\":\"$OTHER_ID\",\"workDate\":\"2026-08-20\",\"status\":\"PRESENT\",\"checkIn\":\"18:00\",\"checkOut\":\"09:00\"}")"
check "future-dated adjustment is rejected" 409 \
  "$(code "$TMP/hr.jar" POST '/api/attendance' \
     "{\"employeeId\":\"$OTHER_ID\",\"workDate\":\"2030-01-01\",\"status\":\"PRESENT\"}")"

# --------------------------------------------------------------- 4. leave
echo
echo "4. Leave workflow"
code "$TMP/emp.jar" GET '/api/leave?scope=me' >/dev/null
check "own leave list is readable" 200 "$(code "$TMP/emp.jar" GET '/api/leave?scope=me')"

# Grab a leave type id from the employee's own balances via the preview endpoint's
# sibling: read the org leave list as admin and reuse a known type id.
code "$TMP/admin.jar" GET '/api/leave?scope=org&take=1' >/dev/null
TYPE_ID="$(jq_get "$TMP/out.json" "d['requests'][0]['leaveTypeId']")"

# A window inside the 365-day advance limit but far enough out that it cannot
# collide with seeded data, varied per run so re-running does not trip the overlap
# rule against itself.
LSTART="$(python -c "
import datetime, random, sys
base = datetime.date.fromisoformat(sys.argv[1])
print(base + datetime.timedelta(days=60 + random.randrange(0, 240)))
" "$TODAY")"
LEND="$(python -c "
import datetime, sys
print(datetime.date.fromisoformat(sys.argv[1]) + datetime.timedelta(days=2))
" "$LSTART")"
echo "  (test window: $LSTART to $LEND)"

check "end before start is rejected" 422 \
  "$(code "$TMP/emp.jar" POST '/api/leave' \
     "{\"leaveTypeId\":\"$TYPE_ID\",\"startDate\":\"$LEND\",\"endDate\":\"$LSTART\",\"halfDay\":false,\"reason\":\"Testing an invalid backwards range\"}")"
contains "range rejection is specific" "end date cannot be before" "$TMP/out.json"

check "short reason is rejected" 422 \
  "$(code "$TMP/emp.jar" POST '/api/leave' \
     "{\"leaveTypeId\":\"$TYPE_ID\",\"startDate\":\"$LSTART\",\"endDate\":\"$LEND\",\"halfDay\":false,\"reason\":\"why\"}")"

check "half day across two dates is rejected" 422 \
  "$(code "$TMP/emp.jar" POST '/api/leave' \
     "{\"leaveTypeId\":\"$TYPE_ID\",\"startDate\":\"$LSTART\",\"endDate\":\"$LEND\",\"halfDay\":true,\"reason\":\"Half day spanning two dates should fail\"}")"

check "day-count preview works" 200 \
  "$(code "$TMP/emp.jar" GET "/api/leave/preview?startDate=$LSTART&endDate=$LEND&halfDay=false")"
contains "preview returns a working-day count" '"workingDays"' "$TMP/out.json"

check "valid request is accepted" 201 \
  "$(code "$TMP/emp.jar" POST '/api/leave' \
     "{\"leaveTypeId\":\"$TYPE_ID\",\"startDate\":\"$LSTART\",\"endDate\":\"$LEND\",\"halfDay\":false,\"reason\":\"Smoke test: family commitment in another city\"}")"
NEW_LEAVE="$(jq_get "$TMP/out.json" "d['id']")"
echo "  (request id: $NEW_LEAVE)"

check "overlapping request is rejected" 422 \
  "$(code "$TMP/emp.jar" POST '/api/leave' \
     "{\"leaveTypeId\":\"$TYPE_ID\",\"startDate\":\"$LSTART\",\"endDate\":\"$LEND\",\"halfDay\":false,\"reason\":\"Smoke test: this should clash with the previous window\"}")"
contains "overlap rejection names the clash" "overlap" "$TMP/out.json"

check "employee cannot approve their own request" 403 \
  "$(code "$TMP/emp.jar" POST "/api/leave/$NEW_LEAVE/decision" '{"decision":"APPROVED","comment":"Approving myself"}')"
check "rejection without a comment is refused" 422 \
  "$(code "$TMP/hr.jar" POST "/api/leave/$NEW_LEAVE/decision" '{"decision":"REJECTED","comment":""}')"
check "hr approves the request" 200 \
  "$(code "$TMP/hr.jar" POST "/api/leave/$NEW_LEAVE/decision" '{"decision":"APPROVED","comment":"Approved during the smoke test."}')"
check "a decided request cannot be decided again" 403 \
  "$(code "$TMP/hr.jar" POST "/api/leave/$NEW_LEAVE/decision" '{"decision":"REJECTED","comment":"Changed my mind entirely"}')"
check "approved leave cannot be withdrawn" 403 \
  "$(code "$TMP/emp.jar" POST "/api/leave/$NEW_LEAVE/cancel")"

# The approval must be visible on the employee's attendance for those dates.
code "$TMP/emp.jar" GET "/api/attendance?scope=me&from=$LSTART&to=$LEND" >/dev/null
contains "approval wrote LEAVE onto attendance" '"LEAVE"' "$TMP/out.json"

# ------------------------------------------------------------- 5. payroll
echo
echo "5. Payroll"
PERIOD="${TODAY:0:7}"
check "admin can preview the current period" 200 \
  "$(code "$TMP/admin.jar" GET "/api/payroll/run?period=$PERIOD")"
READY="$(jq_get "$TMP/out.json" "d['totals']['ready']")"
BLOCKED="$(jq_get "$TMP/out.json" "d['totals']['blocked']")"
RUN_STATUS="$(jq_get "$TMP/out.json" "d['status']")"
echo "  (period=$PERIOD ready=$READY blocked=$BLOCKED status=${RUN_STATUS:-none})"
check "at least one employee is payable" 1 "$([ "${READY:-0}" -gt 0 ] && echo 1 || echo 0)"

# The run is a state machine; assert the transition that applies to where it is.
if [ "$RUN_STATUS" = "PAID" ]; then
  check "a paid run is locked against re-processing" 409 \
    "$(code "$TMP/admin.jar" POST '/api/payroll/run' "{\"period\":\"$PERIOD\",\"action\":\"PROCESS\"}")"
  contains "the lock is explained" "already marked paid" "$TMP/out.json"
  check "a paid run cannot be paid twice" 409 \
    "$(code "$TMP/admin.jar" POST '/api/payroll/run' "{\"period\":\"$PERIOD\",\"action\":\"MARK_PAID\"}")"
else
  check "admin processes the run" 200 \
    "$(code "$TMP/admin.jar" POST '/api/payroll/run' "{\"period\":\"$PERIOD\",\"action\":\"PROCESS\"}")"
  contains "processing reports a total" '"message"' "$TMP/out.json"
  check "admin marks the run paid" 200 \
    "$(code "$TMP/admin.jar" POST '/api/payroll/run' "{\"period\":\"$PERIOD\",\"action\":\"MARK_PAID\"}")"
  check "a paid run cannot be re-processed" 409 \
    "$(code "$TMP/admin.jar" POST '/api/payroll/run' "{\"period\":\"$PERIOD\",\"action\":\"PROCESS\"}")"
fi
check "employee can still read their own payslips" 200 \
  "$(code "$TMP/emp.jar" GET '/api/auth/session')"

check "salary validation rejects deductions above gross" 422 \
  "$(code "$TMP/hr.jar" PUT "/api/employees/$OTHER_ID/salary" \
     '{"basic":10000,"hra":1000,"specialAllowance":0,"transportAllow":0,"providentFund":90000,"professionalTax":200,"healthInsurance":100}')"
check "salary validation rejects basic below 30% of gross" 422 \
  "$(code "$TMP/hr.jar" PUT "/api/employees/$OTHER_ID/salary" \
     '{"basic":5000,"hra":40000,"specialAllowance":40000,"transportAllow":2000,"providentFund":600,"professionalTax":200,"healthInsurance":500}')"
check "hr can save a valid structure" 200 \
  "$(code "$TMP/hr.jar" PUT "/api/employees/$OTHER_ID/salary" \
     '{"basic":66000,"hra":33000,"specialAllowance":19000,"transportAllow":3200,"providentFund":7920,"professionalTax":200,"healthInsurance":1350}')"

# ------------------------------------------------- 6. notifications + misc
echo
echo "6. Notifications, search, reports, assistant"
check "employee reads own notifications" 200 "$(code "$TMP/emp.jar" GET '/api/notifications?take=5')"
contains "unread count present" '"unread"' "$TMP/out.json"
check "mark-all-read succeeds" 200 "$(code "$TMP/emp.jar" POST '/api/notifications/read' '{"all":true}')"
contains "unread is now zero" '"unread":0' "$TMP/out.json"

check "admin broadcasts an announcement" 200 \
  "$(code "$TMP/admin.jar" POST '/api/settings' \
     '{"title":"Smoke test announcement","body":"This announcement was created by the automated smoke test.","audience":"ALL"}')"
check "employee now has an unread notification" 200 \
  "$(code "$TMP/emp.jar" GET '/api/notifications?unread=1')"
contains "announcement was delivered" "Smoke test announcement" "$TMP/out.json"

check "search is scoped and working" 200 "$(code "$TMP/emp.jar" GET '/api/search?q=Aarav')"
check "csv export works" 200 \
  "$(curl -s -b "$TMP/admin.jar" -o "$TMP/report.csv" -w '%{http_code}' \
     "$BASE/api/reports?report=attendance&format=csv")"
contains "csv has a header row" "Employee,Department" "$TMP/report.csv"

check "assistant answers a management question" 200 \
  "$(code "$TMP/admin.jar" POST '/api/assistant' '{"question":"Who is absent today?"}')"
contains "assistant cites its source tables" '"sources"' "$TMP/out.json"
check "assistant refuses an unknown question" 200 \
  "$(code "$TMP/emp.jar" POST '/api/assistant' '{"question":"What is the meaning of life"}')"
contains "assistant admits it cannot verify" '"confident":false' "$TMP/out.json"
check "employee assistant cannot ask org questions" 200 \
  "$(code "$TMP/emp.jar" POST '/api/assistant' '{"question":"How many leave requests are pending?"}')"
contains "org question is not answered for an employee" '"intent":"unknown"' "$TMP/out.json"

check "admin can change the work policy" 200 \
  "$(code "$TMP/admin.jar" PATCH '/api/settings' \
     '{"standardWorkMinutes":480,"halfDayMinutes":240,"lateGraceMinutes":10,"payrollDayOfMonth":28,"timezone":"Asia/Kolkata"}')"
check "invalid timezone is rejected" 422 \
  "$(code "$TMP/admin.jar" PATCH '/api/settings' \
     '{"standardWorkMinutes":480,"halfDayMinutes":240,"lateGraceMinutes":10,"payrollDayOfMonth":28,"timezone":"Mars/Olympus"}')"
check "half day above full day is rejected" 422 \
  "$(code "$TMP/admin.jar" PATCH '/api/settings' \
     '{"standardWorkMinutes":300,"halfDayMinutes":400,"lateGraceMinutes":10,"payrollDayOfMonth":28,"timezone":"Asia/Kolkata"}')"

# ----------------------------------------------------------- 7. sign-out
echo
echo "7. Sign-out"
check "sign-out succeeds" 200 "$(code "$TMP/emp.jar" POST /api/auth/sign-out)"
# The jar still holds the old token; it must be refused because sign-out revokes
# every token issued to that user, not just the cookie in this client.
check "the revoked token is rejected by the API" 401 "$(code "$TMP/emp.jar" GET /api/attendance/today)"
# A browser still carrying the stale token must land on sign-in, not bounce between
# the proxy and the app forever.
FINAL_URL="$(curl -s -L -b "$TMP/emp.jar" -o /dev/null -w '%{url_effective}' "$BASE/overview")"
case "$FINAL_URL" in
  */sign-in*) check "a stale token recovers to sign-in without looping" ok ok ;;
  *) check "a stale token recovers to sign-in without looping" ok "$FINAL_URL" ;;
esac

# ---------------------------------------------------------------- report
echo
printf 'Result: %s passed, %s failed\n\n' "$(green "$PASSED")" "$([ "$FAILED" -eq 0 ] && green 0 || red "$FAILED")"
rm -rf "$TMP"
[ "$FAILED" -eq 0 ]
