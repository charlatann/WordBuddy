#!/bin/bash
# 在 iOS 模拟器的 Safari 中运行网页版自检。
# usage: ci/web_safari_test.sh "<device name prefix>" <out_dir> [port]
set -u
PREFIX="$1"; OUT="$2"; PORT="${3:-8000}"
mkdir -p "$OUT"

SIM=$(python3 ci/pick_sim.py "$PREFIX") || { echo "no simulator for $PREFIX"; exit 1; }
UDID="${SIM%%|*}"
echo "${SIM#*|}" > "$OUT/device.txt"
echo "Device: ${SIM#*|} ($UDID)"

xcrun simctl boot "$UDID" 2>/dev/null || true
xcrun simctl bootstatus "$UDID" -b
xcrun simctl ui "$UDID" appearance light
sleep 5

python3 ci/safari_server.py web "$PORT" "$UDID" "$OUT" 420 &
SERVER=$!
sleep 2

# 运行自检（结果和截图由页面回传）
xcrun simctl openurl "$UDID" "http://localhost:$PORT/index.html?selftest=ci"
wait $SERVER
STATUS=$?
echo "self-test exit: $STATUS"

# 额外截图：深色模式首页、正常模式（非自检）首页
python3 -m http.server "$PORT" --directory web >/dev/null 2>&1 &
HTTP=$!
sleep 1
xcrun simctl openurl "$UDID" "http://localhost:$PORT/index.html#/learn"
sleep 6
xcrun simctl io "$UDID" screenshot "$OUT/shots/20-正常打开.png"
xcrun simctl ui "$UDID" appearance dark
sleep 4
xcrun simctl io "$UDID" screenshot "$OUT/shots/21-深色模式.png"
xcrun simctl ui "$UDID" appearance light
kill $HTTP 2>/dev/null
xcrun simctl shutdown "$UDID" 2>/dev/null || true
exit $STATUS
