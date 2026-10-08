#!/usr/bin/env python3
"""Read-only production availability gate for SoulFlame DPP / Twins.

A Vercel deployment marked READY is not evidence that its public routes
are reachable. Run from an external network before marking a release GREEN.
Uses only Python stdlib; no secrets, tokens, or mutations.
"""
from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from typing import Any

DEFAULT_ROUTES = (
    ("dpp_home", "https://dpp-autopilot.vercel.app/"),
    ("twins_dpp_api", "https://soulflame-twins.vercel.app/api/dpp-dashboard-link"),
)
BAD_BODY_MARKERS = ("DEPLOYMENT_DISABLED", "Payment required")


def probe(name: str, url: str, timeout: float = 12.0) -> dict[str, Any]:
    result: dict[str, Any] = {
        "name": name,
        "url": url,
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "pass": False,
        "http_status": None,
        "failure": None,
    }
    request = urllib.request.Request(
        url,
        headers={"User-Agent": "SoulFlame-DPP-Release-Gate/1.0", "Accept": "text/html,application/json"},
        method="GET",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            status = int(response.status)
            body = response.read(16_384).decode("utf-8", errors="replace")
            result["http_status"] = status
            if status != 200:
                result["failure"] = "HTTP_STATUS_NOT_200"
            elif any(marker.lower() in body.lower() for marker in BAD_BODY_MARKERS):
                result["failure"] = "VERCEL_DEPLOYMENT_DISABLED"
            elif not body.strip():
                result["failure"] = "EMPTY_BODY"
            elif name == "twins_dpp_api":
                try:
                    payload = json.loads(body)
                    if payload.get("ok") is not True:
                        result["failure"] = "TWINS_API_HEALTH_NOT_OK"
                except (ValueError, TypeError, AttributeError):
                    result["failure"] = "TWINS_API_NON_JSON"
            if result["failure"] is None:
                result["pass"] = True
    except urllib.error.HTTPError as exc:
        result["http_status"] = exc.code
        server_error = exc.headers.get("x-vercel-error", "") if exc.headers else ""
        result["failure"] = server_error or f"HTTP_{exc.code}"
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        result["failure"] = f"NETWORK_ERROR:{type(exc).__name__}"
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dpp-url", default=DEFAULT_ROUTES[0][1])
    parser.add_argument("--twins-url", default=DEFAULT_ROUTES[1][1])
    parser.add_argument("--timeout", type=float, default=12.0)
    args = parser.parse_args(argv)
    # Restrict to HTTPS to prevent credentials being used or downgrades.
    targets = (("dpp_home", args.dpp_url), ("twins_dpp_api", args.twins_url))
    if any(not u.startswith("https://") for _, u in targets):
        print("FAIL: all probe URLs must use HTTPS", file=sys.stderr)
        return 2
    results = [probe(name, url, args.timeout) for name, url in targets]
    print(json.dumps({"schema_version": 1, "all_pass": all(r["pass"] for r in results), "checks": results}, ensure_ascii=False, indent=2))
    return 0 if all(r["pass"] for r in results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
