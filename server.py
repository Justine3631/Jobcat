"""Jobcat local workspace. Run: python3 server.py"""
import argparse
import base64
from contextlib import closing
from datetime import datetime
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
    def fail(path, message):
        raise ValueError(f"{path}：{message}")

    def records(value, path):
        if not isinstance(value, list):
            fail(path, '必须是列表')
        if any(not isinstance(item, dict) for item in value):
            fail(path, '记录必须是对象')
        return value

    def collection(key):
        rows = records(state.get(key), key)
        ids = [row.get('id') for row in rows]
        if any(not isinstance(i, str) or not i for i in ids) or len(set(ids)) != len(ids):
            fail(key, '包含无效或重复ID')
        return rows

    def strings(row, keys, path, required=False):
        for key in keys:
            if (required or key in row) and not isinstance(row.get(key), str):
                fail(f'{path}.{key}', '必须是文字')

    def dates(row, keys, path):
        for key in keys:
            value = row.get(key)
            if value:
                try:
                    datetime.fromisoformat(value.replace('Z', '+00:00'))
                except (ValueError, AttributeError, TypeError):
                    fail(f'{path}.{key}', '日期无效')

    def references(value, known, path):
        if not isinstance(value, list) or any(not isinstance(i, str) or i not in known for i in value):
            fail(path, '包含丢失的记录关联')

    if not isinstance(state, dict) or type(state.get('schemaVersion')) is not int or state.get('schemaVersion') != 1:
        raise ValueError('不支持的数据格式')
    if not isinstance(state.get('preferences'), dict):
        raise ValueError('缺少求职偏好')
    state.setdefault('searchRequests', [])
    jobs, materials, experiences, requests = [collection(k) for k in ('jobs', 'materials', 'experiences', 'searchRequests')]
    job_ids, material_ids = {j['id'] for j in jobs}, {m['id'] for m in materials}
    for index, request in enumerate(requests):
        path = f'searchRequests[{index}]'
        strings(request, ('title','directions','cities','salary','channels','notes','status','report','createdAt','updatedAt'), path, True)
        dates(request, ('createdAt','updatedAt'), path)
        references(request.get('resultIds'), job_ids, path + '.resultIds')
    for index, material in enumerate(materials):
        path = f'materials[{index}]'
        strings(material, ('name','text'), path, True)
        attachment = material.get('file')
        if attachment is not None:
            if not isinstance(attachment, dict):
                fail(path + '.file', '附件格式无效')
            strings(attachment, ('name','data'), path + '.file', True)
            try:
                prefix, payload = attachment['data'].split(',', 1)
                if not prefix.startswith('data:') or not prefix.endswith(';base64'):
                    raise ValueError()
                base64.b64decode(payload, validate=True)
            except (ValueError, TypeError):
                fail(path + '.file', '附件编码无效')
    for index, experience in enumerate(experiences):
        strings(experience, ('title','text'), f'experiences[{index}]', True)
    validate_resumes(state)
    for index, template in enumerate(state.get('resumeTemplates', [])):
        if not isinstance(template.get('slots'), list):
            fail(f'resumeTemplates[{index}].slots', '缺少文字段落')
        for slot in records(template['slots'], f'resumeTemplates[{index}].slots'):
            strings(slot, ('key','text','section'), '简历段落', True)
            if type(slot.get('heading')) is not bool:
                fail('简历段落.heading', '标题标记无效')
    stages = {'待判断','准备中','已沟通／已申请','测评／面试中','Offer','已入职','已结束'}
    for index, job in enumerate(jobs):
        path = f'jobs[{index}]'
        if not isinstance(job.get('title'), str) or not job['title'].strip():
            fail(path + '.title', '岗位名称不能为空')
        if job.get('stage') not in stages or type(job.get('revision')) is not int:
            fail(path, '岗位阶段或版本无效')
        if 'focus' in job and type(job['focus']) is not bool:
            fail(path + '.focus', '重点标记无效')
        strings(job, ('company','city','direction','salary','hiring','decision','reason','concerns','questions','nextAction','nextDate','closeReason','offerType','offerNotes','createdAt','updatedAt','userReason','userConcerns','userQuestions','keyRequirement','jdCompleteness'), path)
        dates(job, ('createdAt','updatedAt','nextDate'), path)
        for key in ('sources','jdVersions','activities','interviews','analyses'):
            records(job.get(key), path + '.' + key)
        references(job.get('materialIds'), material_ids, path + '.materialIds')
        for source in job['sources']:
            strings(source, ('platform','url'), path + '.sources', True)
        for version in job['jdVersions']:
            strings(version, ('id','text'), path + '.jdVersions', True)
            dates(version, ('date',), path + '.jdVersions')
        for activity in job['activities']:
            strings(activity, ('type','text','date'), path + '.activities', True)
            dates(activity, ('date',), path + '.activities')
            references(activity.get('materialIds'), material_ids, path + '.activities.materialIds')
        for interview in job['interviews']:
            strings(interview, ('id','round'), path + '.interviews', True)
            if interview.get('status') not in ('待进行','已完成','已取消'):
                fail(path + '.interviews.status', '面试状态无效')
            dates(interview, ('date',), path + '.interviews')
        for analysis in job['analyses']:
            strings(analysis, ('id','text'), path + '.analyses', True)
            dates(analysis, ('date',), path + '.analyses')


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

    def revision(self):
        with closing(self.connect()) as conn:
            return conn.execute("SELECT revision FROM workspace WHERE id=1").fetchone()[0]

    def write(self, expected, state, allow_restore=False):
        validate_state(state)
        body = json.dumps(state, ensure_ascii=False, allow_nan=False)
        with self.connect() as conn:
            conn.execute("BEGIN IMMEDIATE")
            revision, previous = conn.execute("SELECT revision, body FROM workspace WHERE id=1").fetchone()
            if expected != revision:
                return None
            if not allow_restore:
                old = json.loads(previous)
                locked = {m['id'] for m in old['materials'] if m.get('isSubmission')}
                locked.update(mid for j in old['jobs'] for a in j['activities']
                              if a.get('type') in ('正式投递', '发送简历') for mid in a.get('materialIds', []))
                incoming = {m['id']: m for m in state['materials']}
                for material in old['materials']:
                    if material['id'] in locked and material.get('file') and incoming.get(material['id']) != material:
                        raise ValueError('已投递原件不能覆盖或删除；请复制草稿或创建新的提交记录')
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
            elif urlsplit(self.path).path == "/api/revision":
                self.respond(200, {"revision": workspace.revision()})
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
                if not isinstance(payload, dict):
                    raise ValueError('请求必须是JSON对象')
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
                revision = workspace.write(data.get("revision"), data.get("state"), allow_restore=data.get('restore') is True)
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
