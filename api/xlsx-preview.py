from __future__ import annotations

import base64
import json
import sys
from http.server import BaseHTTPRequestHandler
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from scripts.xlsx_preview import MAX_XLSX_BYTES, preview_xlsx_bytes


class handler(BaseHTTPRequestHandler):
    def _send(self, status: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self) -> None:
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            return self._send(400, {"error": {"code": "INVALID_LENGTH", "message": "Invalid request length."}})
        # Base64 adds ~4/3 overhead plus JSON envelope.
        if length < 2 or length > int(MAX_XLSX_BYTES * 1.5) + 4096:
            return self._send(413, {"error": {"code": "XLSX_TOO_LARGE", "message": "XLSX preview payload is too large."}})
        try:
            payload = json.loads(self.rfile.read(length))
            encoded = payload.get("xlsx_base64")
            if not isinstance(encoded, str) or not encoded:
                raise ValueError("xlsx_base64 is required")
            raw = base64.b64decode(encoded, validate=True)
            result = preview_xlsx_bytes(raw)
        except (ValueError, json.JSONDecodeError) as exc:
            return self._send(422, {"error": {"code": "INVALID_XLSX", "message": str(exc)}})
        except Exception:
            return self._send(500, {"error": {"code": "XLSX_PREVIEW_FAILED", "message": "XLSX preview failed."}})
        self._send(200, {"data": result})

    def do_GET(self) -> None:
        self._send(405, {"error": {"code": "METHOD_NOT_ALLOWED", "message": "Use POST."}})
