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

# 预热 Safari：首次启动的功能提示弹窗出现过一次后，重启 Safari 通常不再出现
xcrun simctl openurl "$UDID" "http://example.com" || true
sleep 12
xcrun simctl io "$UDID" screenshot "$OUT/warmup.png" || true
xcrun simctl terminate "$UDID" com.apple.mobilesafari || true
sleep 3

python3 ci/safari_server.py web "$PORT" "$UDID" "$OUT" 600 &
SERVER=$!
sleep 2

# 运行自检（结果和截图由页面回传）
xcrun simctl openurl "$UDID" "http://localhost:$PORT/index.html?selftest=ci"
wait $SERVER
STATUS=$?
echo "self-test exit: $STATUS"

# 自检结束后页面会回到带演示进度的首页：截浅色和深色两张
sleep 2
xcrun simctl io "$UDID" screenshot "$OUT/shots/20-首页（有学习进度）.png"
xcrun simctl ui "$UDID" appearance dark
sleep 4
xcrun simctl io "$UDID" screenshot "$OUT/shots/21-深色模式.png"
xcrun simctl ui "$UDID" appearance light
xcrun simctl shutdown "$UDID" 2>/dev/null || true
exit $STATUS
