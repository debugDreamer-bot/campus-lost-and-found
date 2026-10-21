"""Serves the frontend on http://localhost:8080 and tells browsers to always
re-check files, so edits show up on a normal refresh.

Usage: python3 dev-server.py [port]
"""
import http.server
import sys
from functools import partial
from pathlib import Path


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()


port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
handler = partial(NoCacheHandler, directory=str(Path(__file__).parent))
with http.server.ThreadingHTTPServer(("127.0.0.1", port), handler) as server:
    print(f"Frontend running at http://localhost:{port}")
    server.serve_forever()
