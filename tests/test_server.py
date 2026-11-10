import copy
import json
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from server import Workspace, handler_for, ThreadingHTTPServer


class StorageTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name) / "workspace.sqlite3"
        self.workspace = Workspace(self.path)

    def tearDown(self):
        self.temp.cleanup()

    def test_persistence_conflict_and_recovery_snapshot(self):
        original = self.workspace.read()
        next_state = copy.deepcopy(original["state"])
        next_state["preferences"]["notes"] = "Changed"
        self.assertEqual(self.workspace.write(0, next_state), 1)
        self.assertIsNone(self.workspace.write(0, original["state"]))
        reopened = Workspace(self.path)
        self.assertEqual(reopened.read()["state"]["preferences"]["notes"], "Changed")
        with reopened.connect() as conn:
            snapshot = json.loads(conn.execute("SELECT body FROM snapshots WHERE revision=0").fetchone()[0])
            self.assertEqual(snapshot, original["state"])

    def test_invalid_state_does_not_replace_records(self):
        invalid = self.workspace.read()["state"]
        invalid["jobs"] = [{"id": "one"}]
        with self.assertRaises(ValueError):
            self.workspace.write(0, invalid)
        self.assertEqual(self.workspace.read()["revision"], 0)

    def test_invalid_collections_dates_and_references_do_not_write(self):
        original = self.workspace.read()['state']
        job = {'id':'job','title':'运营','stage':'待判断','revision':1,
               'sources':[],'jdVersions':[],'activities':[],'interviews':[],
               'analyses':[],'materialIds':[]}
        invalid_states = []
        for key in ('searchRequests','jobs','materials','experiences'):
            state = copy.deepcopy(original);state[key] = 'not-a-list';invalid_states.append(state)
        state = copy.deepcopy(original);state['jobs']=[{**job,'materialIds':['missing']}];invalid_states.append(state)
        state = copy.deepcopy(original);state['jobs']=[{**job,'nextDate':'not-a-date'}];invalid_states.append(state)
        state = copy.deepcopy(original);state['jobs']=[{**job,'activities':[{'type':'正式投递','date':'2026-11-10','text':'已提交','materialIds':['missing']}]}];invalid_states.append(state)
        state = copy.deepcopy(original);state['jobs']=[{**job,'interviews':[{'id':'one','round':'一面','status':'wrong'}]}];invalid_states.append(state)
        state = copy.deepcopy(original);state['schemaVersion']=True;invalid_states.append(state)
        state = copy.deepcopy(original);state['preferences']['localFloor']=float('nan');invalid_states.append(state)
        for state in invalid_states:
            with self.subTest(state=state), self.assertRaises(ValueError):
                self.workspace.write(0,state)
            self.assertEqual(self.workspace.read(),{'revision':0,'state':original})

    def test_valid_linked_records_can_be_saved(self):
        state=self.workspace.read()['state']
        state['materials']=[{'id':'cv','name':'简历','text':'内容'}]
        state['jobs']=[{'id':'job','title':'运营','stage':'已沟通／已申请','revision':1,
            'sources':[{'platform':'官网','url':'https://example.com'}],
            'jdVersions':[{'id':'jd','text':'JD','date':'2026-11-10T09:00:00Z'}],
            'activities':[{'type':'正式投递','text':'提交','date':'2026-11-10T10:00','materialIds':['cv']}],
            'interviews':[{'id':'one','round':'一面','status':'待进行','date':'2026-11-11T10:00'}],
            'analyses':[],'materialIds':['cv']}]
        state['searchRequests']=[{'id':'search','title':'本轮','directions':'运营','cities':'深圳','salary':'面议','channels':'官网','notes':'','status':'已完成','report':'一条','createdAt':'2026-11-10','updatedAt':'2026-11-10','resultIds':['job']}]
        self.assertEqual(self.workspace.write(0,state),1)

    def test_submitted_files_are_immutable_but_explicit_restore_is_supported(self):
        state=self.workspace.read()['state']
        state['materials']=[{'id':'pdf','name':'原件','text':'已投递','kind':'简历','isSubmission':True,'file':{'name':'actual.pdf','data':'data:application/pdf;base64,JVBERi0='}}]
        self.workspace.write(0,state)
        changed=copy.deepcopy(state);changed['materials'][0]['file']['data']='data:application/pdf;base64,JVBERi0x'
        with self.assertRaises(ValueError):self.workspace.write(1,changed)
        deleted=copy.deepcopy(state);deleted['materials']=[]
        with self.assertRaises(ValueError):self.workspace.write(1,deleted)
        self.assertEqual(self.workspace.read()['revision'],1)
        self.assertEqual(self.workspace.write(1,changed,allow_restore=True),2)
        self.assertEqual(self.workspace.read()['state'],changed)

    def test_http_write_guards_and_static_boundary(self):
        server = ThreadingHTTPServer(("127.0.0.1", 0), handler_for(self.workspace))
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        base = f"http://127.0.0.1:{server.server_port}"
        try:
            with patch.object(self.workspace,'read',side_effect=AssertionError('revision must not load attachments')):
                self.assertEqual(json.load(urlopen(base+'/api/revision')),{'revision':0})
            for payload in ([], {'data': None}):
                with self.assertRaises(HTTPError) as error:
                    urlopen(Request(base+'/api/resume-template',data=json.dumps(payload).encode(),headers={'Content-Type':'application/json'}))
                self.assertEqual(error.exception.code,400)
                self.assertEqual(self.workspace.revision(),0)
            payload = json.dumps(self.workspace.read()).encode()
            with self.assertRaises(HTTPError) as error:
                urlopen(Request(base + "/api/state", data=payload, method="PUT", headers={"Content-Type":"application/json", "Origin":"https://example.com"}))
            self.assertEqual(error.exception.code, 403)
            with self.assertRaises(HTTPError) as error:
                urlopen(base + "/data/jobcat.sqlite3")
            self.assertEqual(error.exception.code, 404)
            response = urlopen(Request(base + "/api/state", data=payload, method="PUT", headers={"Content-Type":"application/json", "Origin":base}))
            self.assertEqual(json.load(response)["revision"], 1)
            with self.assertRaises(HTTPError) as error:
                urlopen(Request(base + "/api/state", data=payload, method="PUT", headers={"Content-Type":"application/json"}))
            self.assertEqual(error.exception.code, 409)
        finally:
            server.shutdown()
            server.server_close()


if __name__ == "__main__":
    unittest.main()
