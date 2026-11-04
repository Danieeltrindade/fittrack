#!/bin/bash
# Roda um ou mais arquivos de teste e2e (ex.: ./run-one.sh t2_data t4_demo). Reconstrói o banco e sobe o servidor de teste.
cd "$(dirname "$0")"
./run-pg.sh fittrack_e2e >/dev/null
PORT=${PORT:-8765}
node e2e/server.js >/tmp/fittrack-e2e-server.log 2>&1 &
SRV=$!; trap 'kill $SRV 2>/dev/null' EXIT; sleep 1
rc=0
for t in "$@"; do echo "=== $t"; node e2e/$t.js || rc=1; done
exit $rc
