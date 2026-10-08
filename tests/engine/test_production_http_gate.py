#!/usr/bin/env python3
"""Unit tests for the DPP release probe: no network or production writes."""
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import unittest
from unittest.mock import patch
from urllib.error import HTTPError, URLError

SOURCE = Path(__file__).resolve().parents[2] / "tools/engine/production_http_gate.py"
spec = importlib.util.spec_from_file_location("production_http_gate", SOURCE)
gate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)


class Response:
    def __init__(self, body, status=200):
        self.status = status
        self.body = body.encode("utf-8")
    def __enter__(self):
        return self
    def __exit__(self, *_):
        return None
    def read(self, n):
        return self.body[:n]


class ProductionProbeTests(unittest.TestCase):
    def test_dpp_ready_http_200_is_pass(self):
        with patch.object(gate.urllib.request, "urlopen", return_value=Response("<html>ready</html>")):
            result = gate.probe("dpp_home", "https://dpp-autopilot.vercel.app/")
        self.assertTrue(result["pass"])
        self.assertEqual(result["http_status"], 200)

    def test_vercel_disabled_402_fails_despite_metadata_ready(self):
        error = HTTPError(
            "https://dpp-autopilot.vercel.app/", 402, "Payment Required",
            {"x-vercel-error": "DEPLOYMENT_DISABLED"}, None
        )
        with patch.object(gate.urllib.request, "urlopen", side_effect=error):
            result = gate.probe("dpp_home", "https://dpp-autopilot.vercel.app/")
        self.assertFalse(result["pass"])
        self.assertEqual(result["http_status"], 402)
        self.assertEqual(result["failure"], "DEPLOYMENT_DISABLED")

    def test_soft_disabled_response_fails(self):
        with patch.object(gate.urllib.request, "urlopen", return_value=Response("Payment required\nDEPLOYMENT_DISABLED")):
            result = gate.probe("dpp_home", "https://dpp-autopilot.vercel.app/")
        self.assertFalse(result["pass"])
        self.assertEqual(result["failure"], "VERCEL_DEPLOYMENT_DISABLED")

    def test_twins_api_health_true_passes(self):
        with patch.object(gate.urllib.request, "urlopen", return_value=Response('{"ok":true,"g mailConfigured":false}')):
            result = gate.probe("twins_dpp_api", "https://soulflame-twins.vercel.app/api/dpp-dashboard-link")
        self.assertTrue(result["pass"])

    def test_twins_api_html_fails(self):
        with patch.object(gate.urllib.request, "urlopen", return_value=Response("<html>protected</html>")):
            result = gate.probe("twins_dpp_api", "https://soulflame-twins.vercel.app/api/dpp-dashboard-link")
        self.assertFalse(result["pass"])
        self.assertEqual(result["failure"], "TWINS_API_NON_JSON")

    def test_network_error_is_not_success(self):
        with patch.object(gate.urllib.request, "urlopen", side_effect=URLError("connection refused")):
            result = gate.probe("dpp_home", "https://dpp-autopilot.vercel.app/")
        self.assertFalse(result["pass"])
        self.assertTrue(result["failure"].startswith("NETWORK_ERROR"))

    def test_main_fails_when_only_one_site_is_healthy(self):
        def mock_fetch(request, timeout):
            return Response("<html>up</html>" if request.full_url.endswith(".app/") else "Payment required")
        with patch.object(gate.urllib.request, "urlopen", side_effect=mock_fetch):
            with contextlib.redirect_stdout(io.StringIO()) as output:
                rc = gate.main([])
        self.assertEqual(rc, 1)
        data = json.loads(output.getvalue())
        self.assertFalse(data["all_pass"])
        self.assertEqual(sum(x["pass"] for x in data["checks"]), 1)


if __name__ == "__main__":
    unittest.main()
