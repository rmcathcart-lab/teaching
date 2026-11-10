#!/bin/bash
# Serves the folder holding all five repos (teaching, math10c, math15, math20-1, robotics side by side) on 8811, plus the five mock backends.
# Run from anywhere: bash teaching/tests/servers.sh, then python3 teaching/tests/t_hub_flow.py (and t_ledgers.py, t_local.py).
# static server for all five sites + the five mock backends
SP=/tmp/teach_logs; mkdir -p $SP
for p in $(pgrep -x node) $(pgrep -x python3); do if tr "\0" " " < /proc/$p/cmdline | grep -q "mock_server.js\|http.server 8811"; then kill $p; fi; done; sleep 0.5
ROOT=$(cd "$(dirname "$0")/../.." && pwd); cd $ROOT && (nohup python3 -m http.server 8811 > $SP/static.log 2>&1 &)
cd $ROOT/math10c && (nohup node backend/mock_server.js 8765 20 > $SP/m10.log 2>&1 &)
cd $ROOT/math15 && (nohup node backend/mock_server.js 8766 20 > $SP/m15.log 2>&1 &)
cd $ROOT/math20-1 && (nohup node backend/mock_server.js 8767 20 > $SP/m201.log 2>&1 &)
cd $ROOT/robotics && (nohup node backend/mock_server.js 8790 > $SP/rl.log 2>&1 &)
cd $ROOT/teaching && (nohup node backend/mock_server.js 8770 > $SP/tm.log 2>&1 &)
sleep 1.2
curl -s "http://localhost:8766/?action=setroster&key=testkey&class=15-b&label=Math%2015%20-%20Block%20B&names=Ava%20Brown%0ABen%20Lee%0ACara%20Diaz&mode=add" >/dev/null
curl -s "http://localhost:8766/?action=setblock&key=testkey&class=15-b&block=B" >/dev/null
echo servers up
