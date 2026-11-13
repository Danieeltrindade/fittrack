#!/bin/bash
# Roda todos os testes de navegador. Requer: Postgres 16 (servidor), psql, Node 18+ e Playwright com Chromium.
set -e
cd "$(dirname "$0")"
./run-pg.sh fittrack_e2e >/dev/null
PORT=${PORT:-8765}
node e2e/server.js >/tmp/fittrack-e2e-server.log 2>&1 &
SRV=$!; trap 'kill $SRV 2>/dev/null' EXIT; sleep 1
rc=0
for t in t1_auth t2_data t3_legacy t4_demo t5_isolation t6_responsive t7_file t8_features t9_demo_photos t10_loadchart t11_dashboard t12_freeworkout; do
  echo "=== $t"; node e2e/$t.js || rc=1
done
exit $rc
