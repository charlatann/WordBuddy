"""Local test server for the WordBuddy web app running in iOS Simulator Safari.

Serves the web/ folder, takes simulator screenshots when the page asks (POST /__shot?name=...),
and saves the self-test report (POST /__report), then exits.

usage: python3 ci/safari_server.py <web_root> <port> <simulator_udid> <out_dir> <timeout_sec>
"""
import json, os, subprocess, sys, threading, time
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

root, port, udid, out, timeout = sys.argv[1], int(sys.argv[2]), sys.argv[3], sys.argv[4], int(sys.argv[5])
os.makedirs(os.path.join(out, "shots"), exist_ok=True)
done = threading.Event()
log = open(os.path.join(out, "server.log"), "a")


def screenshot(name):
    path = os.path.join(out, "shots", f"{name}.png")
    subprocess.run(["xcrun", "simctl", "io", udid, "screenshot", path], capture_output=True, timeout=30)
    return path


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map,
                      ".js": "text/javascript", ".mjs": "text/javascript",
                      ".webmanifest": "application/manifest+json", ".json": "application/json"}

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        log.write("%s %s\n" % (time.strftime("%H:%M:%S"), fmt % args)); log.flush()

    def do_POST(self):
        url = urlparse(self.path)
        body = self.rfile.read(int(self.headers.get("Content-Length") or 0))
        if url.path == "/__shot":
            name = parse_qs(url.query).get("name", ["shot"])[0]
            screenshot(name)
        elif url.path == "/__report":
            with open(os.path.join(out, "report.json"), "wb") as f:
                f.write(body)
            threading.Timer(6, done.set).start()   # 留时间给最后一张截图
        self.send_response(200)
        self.send_header("Content-Type", "text/plain")
        self.send_header("Content-Length", "2")
        self.end_headers()
        self.wfile.write(b"ok")


server = ThreadingHTTPServer(("127.0.0.1", port), partial(Handler, directory=root))
threading.Thread(target=server.serve_forever, daemon=True).start()
print(f"serving {root} on :{port}", flush=True)
finished = done.wait(timeout)
if not finished:
    screenshot("timeout")
    print("timed out waiting for report", flush=True)
server.shutdown()
sys.exit(0 if finished else 2)
