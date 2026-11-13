#!/usr/bin/env bash
# Build and publish dist/ to the gh-pages branch.
set -euo pipefail
cd "$(dirname "$0")/.."
REPO="${REPO:-https://github.com/hkmpn9s6dh-commits/hackathon-2026-ba-zhuang.git}"

npm run build
STAGE="$(mktemp -d)"
cp -r dist/* "$STAGE"/
touch "$STAGE/.nojekyll"
cd "$STAGE"
git init -q
git checkout -q -b gh-pages
git add -A
git -c user.name="ba-zhuang" -c user.email="ba-zhuang@users.noreply.github.com" commit -qm "deploy: $(date -u +%Y-%m-%dT%H:%MZ)"
git remote add origin "$REPO"
for i in 1 2 3 4 5 6; do
  if env -u http_proxy -u https_proxy -u HTTP_PROXY -u HTTPS_PROXY \
    git -c http.proxy= -c https.proxy= push -f origin gh-pages; then
    echo "deployed to $REPO (gh-pages)"; exit 0
  fi
  sleep 10
done
echo "deploy failed"; exit 1
