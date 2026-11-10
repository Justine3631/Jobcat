import copy
import json
import sys
import tempfile
import threading
import unittest
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

    def test_http_write_guards_and_static_boundary(self):
        server = ThreadingHTTPServer(("127.0.0.1", 0), handler_for(self.workspace))
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        base = f"http://127.0.0.1:{server.server_port}"
        try:
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
