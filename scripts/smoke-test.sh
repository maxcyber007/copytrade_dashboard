#!/usr/bin/env bash
# End-to-end smoke test for Phase 1-2 (setup, database, authentication).
# Usage:  ./scripts/smoke-test.sh [base-url]        default: http://localhost:3000
#
# Runs against a live server. Creates two throwaway accounts with random emails,
# so it is safe to run repeatedly against a development database.

set -uo pipefail

BASE="${1:-http://localhost:3000}"
JAR="$(mktemp)"
BODY="$(mktemp)"
PASS=0
FAIL=0
SKIPPED=0

cleanup() { rm -f "$JAR" "$BODY"; }
trap cleanup EXIT

green() { printf '\033[32m%s\033[0m' "$1"; }
red()   { printf '\033[31m%s\033[0m' "$1"; }

check() { # check <description> <condition-result> [detail]
  if [ "$2" = "0" ]; then
    printf '  %s %s\n' "$(green PASS)" "$1"
    PASS=$((PASS + 1))
  else
    printf '  %s %s\n' "$(red FAIL)" "$1"
    [ -n "${3:-}" ] && printf '        %s\n' "$3"
    FAIL=$((FAIL + 1))
  fi
}

skip() { # skip <description> <reason>
  printf '  \033[33mSKIP\033[0m %s\n        %s\n' "$1" "$2"
  SKIPPED=$((SKIPPED + 1))
}

# request <method> <path> [json-body] [cookie-mode: none|save|send]
# Writes the response body to $BODY and echoes the status code.
request() {
  local method="$1" path="$2" data="${3:-}" cookie="${4:-none}"
  local args=(-s -o "$BODY" -w '%{http_code}' -X "$method" "$BASE$path")
  [ -n "$data" ] && args+=(-H 'Content-Type: application/json' -d "$data")
  case "$cookie" in
    save) args+=(-c "$JAR") ;;
    send) args+=(-b "$JAR") ;;
    both) args+=(-b "$JAR" -c "$JAR") ;;
  esac
  curl "${args[@]}"
}

body_has() { grep -q "$1" "$BODY"; }

RAND="$(date +%s)$RANDOM"
EMAIL="smoke-$RAND@example.com"
EMAIL2="smoke2-$RAND@example.com"
PASSWORD="SmokeTest123"

echo
echo "Smoke test against $BASE"
echo

# --------------------------------------------------------------------------
echo "Health"
STATUS=$(request GET /api/health)
check "GET /api/health returns 200" "$([ "$STATUS" = "200" ] && echo 0 || echo 1)" "got $STATUS"
check "database reports up" "$(body_has '"database":{"status":"up"' && echo 0 || echo 1)" "$(cat "$BODY")"
check "redis reports up" "$(body_has '"redis":{"status":"up"' && echo 0 || echo 1)" "$(cat "$BODY")"
check "trading provider reported" "$(body_has '"tradingProvider"' && echo 0 || echo 1)" "$(cat "$BODY")"

# --------------------------------------------------------------------------
echo
echo "Registration"
# The register endpoint is rate limited to 5 requests per hour per IP, and the
# limiter runs before validation, so every call below spends budget. Calls that
# run out of budget are skipped rather than reported as failures. Reset with:
#   redis-cli --scan --pattern 'ratelimit:register:*' | xargs -r redis-cli del
reg_check() { # reg_check <description> <expected-status> <json> [cookie-mode]
  local desc="$1" expected="$2" json="$3" cookie="${4:-none}"
  local status
  status=$(request POST /api/auth/register "$json" "$cookie")
  if [ "$status" = "429" ]; then
    skip "$desc" "register rate limit reached for this IP"
    return 1
  fi
  check "$desc" "$([ "$status" = "$expected" ] && echo 0 || echo 1)" "got $status: $(cat "$BODY")"
}

if reg_check "weak password returns 400" 400 "{\"email\":\"weak-$RAND@example.com\",\"password\":\"short\"}"; then
  check "weak password lists field errors" "$(body_has 'VALIDATION_ERROR' && echo 0 || echo 1)" "$(cat "$BODY")"
fi

reg_check "malformed email returns 400" 400 "{\"email\":\"not-an-email\",\"password\":\"$PASSWORD\"}" || true

if reg_check "valid registration returns 201" 201 "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"name\":\"Smoke\"}" save; then
  check "response carries a role" "$(body_has '"role":"' && echo 0 || echo 1)" "$(cat "$BODY")"
  check "response never returns a password field" "$(body_has 'password' && echo 1 || echo 0)" "$(cat "$BODY")"
  check "session cookie is HttpOnly" "$(grep -q '#HttpOnly_.*ct_session' "$JAR" && echo 0 || echo 1)" "$(cat "$JAR")"
  reg_check "duplicate email returns 409" 409 "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" || true
else
  echo
  echo "  The remaining checks need an account created by this run."
  echo "  Wait for the rate limit window to expire, or clear it:"
  echo "    redis-cli --scan --pattern 'ratelimit:register:*' | xargs -r redis-cli del"
  echo
  exit 1
fi

# --------------------------------------------------------------------------
echo
echo "Session"
STATUS=$(request GET /api/auth/session "" send)
check "session with cookie returns the user" "$(body_has "$EMAIL" && echo 0 || echo 1)" "$(cat "$BODY")"

STATUS=$(request GET /api/auth/session)
check "session without cookie returns null user" "$(body_has '"user":null' && echo 0 || echo 1)" "$(cat "$BODY")"

# --------------------------------------------------------------------------
echo
echo "Login"
STATUS=$(request POST /api/auth/login "{\"email\":\"$EMAIL\",\"password\":\"WrongPass123\"}")
check "wrong password returns 401" "$([ "$STATUS" = "401" ] && echo 0 || echo 1)" "got $STATUS"
check "wrong password gives a generic message" "$(body_has 'INVALID_CREDENTIALS' && echo 0 || echo 1)" "$(cat "$BODY")"

STATUS=$(request POST /api/auth/login "{\"email\":\"nobody-$RAND@example.com\",\"password\":\"$PASSWORD\"}")
check "unknown email returns the same 401" "$([ "$STATUS" = "401" ] && echo 0 || echo 1)" "got $STATUS"

STATUS=$(request POST /api/auth/login "{\"email\":\"  ${EMAIL^^}  \",\"password\":\"$PASSWORD\"}" save)
check "login normalises case and whitespace" "$([ "$STATUS" = "200" ] && echo 0 || echo 1)" "got $STATUS: $(cat "$BODY")"

# --------------------------------------------------------------------------
echo
echo "Access control"
STATUS=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/dashboard")
check "/dashboard unauthenticated redirects (307)" "$([ "$STATUS" = "307" ] && echo 0 || echo 1)" "got $STATUS"

REDIRECT=$(curl -s -o /dev/null -w '%{redirect_url}' "$BASE/dashboard")
check "redirect target is /login" "$(echo "$REDIRECT" | grep -q '/login' && echo 0 || echo 1)" "got $REDIRECT"

STATUS=$(curl -s -b "$JAR" -o /dev/null -w '%{http_code}' "$BASE/dashboard")
check "/dashboard authenticated returns 200" "$([ "$STATUS" = "200" ] && echo 0 || echo 1)" "got $STATUS"

# A member must not reach the admin area (the first user in a fresh database is
# ADMIN, so only assert this when this account is actually a MEMBER).
request GET /api/auth/session "" send > /dev/null
if body_has '"role":"MEMBER"'; then
  REDIRECT=$(curl -s -b "$JAR" -o /dev/null -w '%{redirect_url}' "$BASE/admin/dashboard")
  check "member is redirected away from /admin" "$(echo "$REDIRECT" | grep -q '/dashboard' && echo 0 || echo 1)" "got $REDIRECT"
else
  echo "  SKIP member->admin check (this account is ADMIN: first user in an empty database)"
fi

# --------------------------------------------------------------------------
echo
echo "Security headers"
HEADERS=$(curl -s -D - -o /dev/null "$BASE/login")
check "X-Frame-Options: DENY" "$(echo "$HEADERS" | grep -qi 'x-frame-options: DENY' && echo 0 || echo 1)"
check "X-Content-Type-Options: nosniff" "$(echo "$HEADERS" | grep -qi 'x-content-type-options: nosniff' && echo 0 || echo 1)"
check "Referrer-Policy set" "$(echo "$HEADERS" | grep -qi 'referrer-policy' && echo 0 || echo 1)"
check "X-Powered-By hidden" "$(echo "$HEADERS" | grep -qi 'x-powered-by' && echo 1 || echo 0)"

# --------------------------------------------------------------------------
echo
echo "Rate limiting (burst against an unknown email so no real account is locked)"
CODES=""
for _ in $(seq 1 7); do
  CODES="$CODES $(request POST /api/auth/login "{\"email\":\"$EMAIL2\",\"password\":\"WrongPass123\"}")"
done
check "repeated failed logins end in 429" "$(echo "$CODES" | grep -q '429' && echo 0 || echo 1)" "codes:$CODES"

# --------------------------------------------------------------------------
echo
echo "Logout"
STATUS=$(request POST /api/auth/logout "" both)
check "logout returns 200" "$([ "$STATUS" = "200" ] && echo 0 || echo 1)" "got $STATUS"

request GET /api/auth/session "" send > /dev/null
check "session is revoked server-side" "$(body_has '"user":null' && echo 0 || echo 1)" "$(cat "$BODY")"

# --------------------------------------------------------------------------
echo
echo "-----------------------------------------"
printf 'Passed: %s   Failed: %s   Skipped: %s\n' "$(green "$PASS")" "$([ "$FAIL" -gt 0 ] && red "$FAIL" || echo "$FAIL")" "$SKIPPED"
echo "-----------------------------------------"
echo
[ "$FAIL" -eq 0 ]
