#!/usr/bin/env bash
# Ba Zhuang verification. Everything a judge (or a fresh clone) can re-run.
#   bash scripts/verify.sh          # typecheck + unit + build + hygiene + e2e
#   bash scripts/verify.sh --fast   # skips the build and the browser pass
set -uo pipefail

FAST=0
[ "${1:-}" = "--fast" ] && FAST=1

if ! command -v npm >/dev/null 2>&1; then
  export PATH="/c/Users/张一/.workbuddy/binaries/node/versions/22.22.2-6:$PATH"
fi

fail=0
say() { printf '%-50s %s\n' "$1" "$2"; }
ok() { say "$1" "PASS"; }
bad() { say "$1" "FAIL"; fail=$((fail + 1)); }

echo "Ba Zhuang verification $( [ $FAST -eq 1 ] && echo '(fast)' || echo '(full)' )"
echo "---------------------------------------------------------"

command -v node >/dev/null 2>&1 && ok "node available" || bad "node available"
command -v npm >/dev/null 2>&1 && ok "npm available" || bad "npm available"

if npx tsc --noEmit --pretty false >/tmp/bz-tsc.log 2>&1; then ok "typescript type check"; else bad "typescript type check"; tail -6 /tmp/bz-tsc.log; fi

if npx vitest run --pool=forks --poolOptions.forks.singleFork --reporter=dot >/tmp/bz-unit.log 2>&1; then ok "simulation + save unit checks (27)"; else bad "simulation unit checks"; tail -16 /tmp/bz-unit.log; fi

if [ $FAST -eq 0 ]; then
  if npm run build >/tmp/bz-build.log 2>&1; then ok "production build"; else bad "production build"; tail -12 /tmp/bz-build.log; fi
  [ -f dist/index.html ] && ok "dist/index.html exists" || bad "dist/index.html exists"
  if grep -q 'src="\./assets/' dist/index.html && grep -q 'href="\./assets/' dist/index.html; then
    ok "asset paths are relative"
  else
    bad "asset paths are relative"
  fi
fi

[ -f LICENSE ] && grep -qi "MIT License" LICENSE && ok "MIT licence present" || bad "MIT licence present"
[ -f README.md ] && grep -q "npm run build" README.md && ok "README has run instructions" || bad "README has run instructions"
[ -f docs/00-BRIEF.md ] && ok "docs/00-BRIEF.md" || bad "docs/00-BRIEF.md"
[ -f docs/01-SPEC.md ] && ok "docs/01-SPEC.md" || bad "docs/01-SPEC.md"
[ -f docs/04-PROOF.md ] && ok "docs/04-PROOF.md" || bad "docs/04-PROOF.md"
[ -f docs/05-SUBMISSION.md ] && ok "docs/05-SUBMISSION.md" || bad "docs/05-SUBMISSION.md"
[ -f docs/07-UI.md ] && ok "docs/07-UI.md" || bad "docs/07-UI.md"

if grep -rIn --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist -E "(sk-[a-zA-Z0-9]{16,}|AKIA[0-9A-Z]{16}|ghp_[a-zA-Z0-9]{20,})" . >/tmp/bz-secrets.log 2>&1; then
  bad "no api keys committed"; head -3 /tmp/bz-secrets.log
else
  ok "no api keys committed"
fi

# AC-14: the build must not reach for anything outside itself.
if [ $FAST -eq 0 ]; then
  if grep -rIoE "https?://[a-zA-Z0-9./_-]+" dist/assets/*.js | grep -vE "www\.w3\.org|schema\.org" | head -3 > /tmp/bz-ext.log; then
    if [ -s /tmp/bz-ext.log ]; then bad "no external URLs in the bundle"; cat /tmp/bz-ext.log; else ok "no external URLs in the bundle"; fi
  else
    ok "no external URLs in the bundle"
  fi
fi

if [ $FAST -eq 0 ]; then
  python -m http.server 4317 --bind 127.0.0.1 --directory dist >/dev/null 2>&1 &
  SRV=$!
  for _ in $(seq 1 40); do
    if curl -s --noproxy '*' "http://127.0.0.1:4317/" | grep -q "把桩"; then break; fi
    sleep 0.25
  done
  if ! curl -s --noproxy '*' "http://127.0.0.1:4317/" | grep -q "把桩"; then
    bad "static server serves this build (port 4317 busy?)"
  fi
  if BASE_URL=http://127.0.0.1:4317/ node scripts/e2e.mjs >/tmp/bz-e2e.log 2>&1; then
    ok "browser end-to-end (25 checks)"
  else
    bad "browser end-to-end"; tail -18 /tmp/bz-e2e.log
  fi
  kill $SRV 2>/dev/null || true
fi

echo "---------------------------------------------------------"
if [ $fail -eq 0 ]; then echo "all checks passed"; else echo "$fail check(s) failed"; fi
exit $(( fail > 0 ? 1 : 0 ))
