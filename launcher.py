"""Start the local workspace independently of a terminal or chat session."""
import argparse
import json
import subprocess
import sys
import time
import webbrowser
from pathlib import Path
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parent
URL = "http://127.0.0.1:8769"


def ready():
    try:
        with urlopen(URL + "/api/state", timeout=1) as response:
            return json.load(response)["state"]["schemaVersion"] == 1
    except (OSError, ValueError, KeyError):
        return False


def start():
    if ready():
        return
    data = ROOT / "data"
    data.mkdir(exist_ok=True)
    with (data / "server.log").open("ab") as log:
        process = subprocess.Popen([sys.executable, str(ROOT / "server.py")], cwd=ROOT,
                                   stdin=subprocess.DEVNULL, stdout=log, stderr=log,
                                   start_new_session=True, close_fds=True)
    (data / "server.pid").write_text(str(process.pid))
    for _ in range(30):
        if ready():
            return
        if process.poll() is not None:
            break
        time.sleep(0.1)
    raise SystemExit("Jobcat 启动失败，请查看 data/server.log。原有记录不会被重置。")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--no-browser", action="store_true")
    args = parser.parse_args()
    start()
    print("Jobcat 已就绪：" + URL)
    if not args.no_browser:
        webbrowser.open(URL)
