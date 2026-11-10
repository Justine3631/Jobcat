"""Jobcat local workspace. Run: python3 server.py"""
import argparse
import json
import sqlite3
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit
from resumes import slots, template_bytes, validate_resumes, export_pdf

ROOT = Path(__file__).resolve().parent
MAX_BODY = 64 * 1024 * 1024


def initial_state():
    return {"schemaVersion": 1, "jobs": [], "materials": [], "experiences": [], "searchRequests": [],
            "preferences": {"city": "", "localFloor": 0, "awayFloor": 0,
                            "salaryTarget": "", "directions": "", "cities": "", "notes": ""}}


def validate_state(state):
    if not isinstance(state, dict) or state.get("schemaVersion") != 1:
        raise ValueError("不支持的数据格式")
    for key in ("jobs", "materials", "experiences"):
        items = state.get(key)
        if not isinstance(items, list):
            raise ValueError(f"{key} 必须是列表")
        ids = [x.get("id") if isinstance(x, dict) else None for x in items]
        if any(not isinstance(i, str) or not i for i in ids) or len(ids) != len(set(ids)):
            raise ValueError(f"{key} 包含无效或重复 ID")
    if not isinstance(state.get("preferences"), dict):
        raise ValueError("缺少求职偏好")
    validate_resumes(state)
    stages = {"待判断", "准备中", "已沟通／已申请", "测评／面试中", "Offer", "已入职", "已结束"}
    for job in state["jobs"]:
        if not isinstance(job.get("title"), str) or not job["title"].strip():
            raise ValueError("岗位名称不能为空")
        if job.get("stage") not in stages or not isinstance(job.get("revision"), int):
            raise ValueError("岗位阶段或版本无效")
        for key in ("sources", "jdVersions", "activities", "interviews", "analyses", "materialIds"):
            if not isinstance(job.get(key), list):
                raise ValueError(f"岗位缺少 {key}")


class Workspace:
    def __init__(self, path):
        self.path = path
        path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as conn:
            conn.execute("CREATE TABLE IF NOT EXISTS workspace (id INTEGER PRIMARY KEY, revision INTEGER, body TEXT)")
            conn.execute("INSERT OR IGNORE INTO workspace VALUES (1, 0, ?)",
                         (json.dumps(initial_state(), ensure_ascii=False),))
            conn.execute("CREATE TABLE IF NOT EXISTS snapshots (revision INTEGER PRIMARY KEY, body TEXT)")

    def connect(self):
        return sqlite3.connect(self.path, timeout=10)

    def read(self):
        with self.connect() as conn:
            revision, body = conn.execute("SELECT revision, body FROM workspace WHERE id=1").fetchone()
            return {"revision": revision, "state": json.loads(body)}

    def write(self, expected, state):
        validate_state(state)
        body = json.dumps(state, ensure_ascii=False)
        with self.connect() as conn:
            conn.execute("BEGIN IMMEDIATE")
            revision, previous = conn.execute("SELECT revision, body FROM workspace WHERE id=1").fetchone()
            if expected != revision:
                return None
            conn.execute("INSERT OR REPLACE INTO snapshots VALUES (?, ?)", (revision, previous))
            conn.execute("DELETE FROM snapshots WHERE revision < ?", (max(0, revision - 9),))
            conn.execute("UPDATE workspace SET revision=?, body=? WHERE id=1", (revision + 1, body))
            return revision + 1


def handler_for(workspace):
    class Handler(SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(ROOT / "web"), **kwargs)

        def end_headers(self):
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self' blob: data:; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'")
            super().end_headers()

        def respond(self, status, value):
            body = json.dumps(value, ensure_ascii=False).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            if urlsplit(self.path).path == "/api/state":
                self.respond(200, workspace.read())
            else:
                super().do_GET()

        def do_POST(self):
            if self.path not in ('/api/resume-template', '/api/resume-pdf'):
                self.respond(404, {'error': '未找到接口'})
                return
            if self.headers.get('Origin') and self.headers['Origin'] != f"http://{self.headers.get('Host')}":
                self.respond(403, {'error': '请求来源不符'})
                return
            if self.headers.get_content_type() != 'application/json':
                self.respond(415, {'error': '仅接受 JSON 数据'})
                return
            try:
                length = int(self.headers.get('Content-Length', 0))
                if not 0 < length <= MAX_BODY:
                    raise ValueError('请求大小无效')
                payload = json.loads(self.rfile.read(length))
                if self.path == '/api/resume-template':
                    self.respond(200, {'slots': slots(template_bytes(payload))})
                    return
                current = workspace.read()
                if payload.get('revision') != current['revision']:
                    self.respond(409, {'error': '工作区已更新，请先保存或刷新，再生成 PDF'})
                    return
                version = next((r for r in current['state'].get('resumes', []) if r['id'] == payload.get('id')), None)
                if version is None:
                    raise ValueError('请先保存简历版本')
                template = next(t for t in current['state']['resumeTemplates'] if t['id'] == version['templateId'])
                if 'fields' in payload:
                    version = {**version, 'fields': payload['fields']}
                    validate_resumes({'resumeTemplates': [template], 'resumes': [version]})
                body = export_pdf(template, version)
                self.send_response(200)
                self.send_header('Content-Type', 'application/pdf')
                self.send_header('Content-Disposition', 'inline; filename="resume.pdf"')
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            except (ValueError, TypeError, KeyError, OSError) as exc:
                self.respond(400, {'error': str(exc)})

        def do_PUT(self):
            if self.path != "/api/state":
                self.respond(404, {"error": "未找到接口"})
                return
            # JSON + exact local origin prevent cross-origin form writes.
            origin = self.headers.get("Origin")
            if origin and origin != f"http://{self.headers.get('Host')}":
                self.respond(403, {"error": "请求来源不符"})
                return
            if self.headers.get_content_type() != "application/json":
                self.respond(415, {"error": "仅接受 JSON 数据"})
                return
            try:
                length = int(self.headers.get("Content-Length", 0))
                if length <= 0 or length > MAX_BODY:
                    self.respond(413, {"error": "文件过大，工作区总大小不能超过 64 MB"})
                    return
                data = json.loads(self.rfile.read(length))
                revision = workspace.write(data.get("revision"), data.get("state"))
                if revision is None:
                    self.respond(409, {"error": "另一页面已更新记录。请保留当前输入，刷新后重试。"})
                else:
                    self.respond(200, {"revision": revision})
            except (ValueError, TypeError, AttributeError) as exc:
                self.respond(400, {"error": str(exc)})
            except sqlite3.Error:
                self.respond(500, {"error": "本机数据库保存失败，请保留输入并重试"})

    return Handler


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8769)
    parser.add_argument("--data-dir", type=Path, default=ROOT / "data")
    args = parser.parse_args()
    workspace = Workspace(args.data_dir / "jobcat.sqlite3")
    server = ThreadingHTTPServer(("127.0.0.1", args.port), handler_for(workspace))
    print(f"Jobcat: http://127.0.0.1:{args.port}", flush=True)
    server.serve_forever()
