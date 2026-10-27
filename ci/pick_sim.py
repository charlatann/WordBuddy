"""Print the UDID and name of the newest available iOS simulator whose name starts with argv[1]."""
import json, re, subprocess, sys

prefix = sys.argv[1]
data = json.loads(subprocess.check_output(["xcrun", "simctl", "list", "devices", "available", "-j"]))["devices"]

def runtime_version(key):
    m = re.search(r"iOS-(\d+)-(\d+)", key)
    return (int(m.group(1)), int(m.group(2))) if m else (0, 0)

for key in sorted((k for k in data if "iOS" in k), key=runtime_version, reverse=True):
    devices = [d for d in data[key] if d["name"].startswith(prefix)]
    if devices:
        d = devices[0]
        print(f"{d['udid']}|{d['name']} (iOS {'.'.join(map(str, runtime_version(key)))})")
        sys.exit(0)
sys.exit(f"no {prefix} simulator found")
