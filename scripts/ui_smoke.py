from __future__ import annotations

import json
import sys
from pathlib import Path


def fail(message: str) -> None:
    print(f"UI_SMOKE_FAIL: {message}")
    raise SystemExit(1)


def main() -> None:
    if len(sys.argv) != 3:
        fail("usage: ui_smoke.py <rendered-dom.html> <screenshot.png>")

    dom_path = Path(sys.argv[1])
    screenshot_path = Path(sys.argv[2])
    if not dom_path.is_file():
        fail(f"rendered DOM missing: {dom_path}")
    if not screenshot_path.is_file():
        fail(f"screenshot missing: {screenshot_path}")

    dom = dom_path.read_text(encoding="utf-8", errors="replace")
    screenshot_size = screenshot_path.stat().st_size

    required_dom = {
        "burger menu": 'id="menuToggle"',
        "stages button": 'id="stagesButton"',
        "Bulgarian stages label": "Етапи",
        "open plan overlay": 'id="planOverlay" aria-hidden="false"',
        "DAVID current task": 'id="currentTask"',
        "Demo gate": 'data-stage="DEMO"',
        "MVP gate": 'data-stage="MVP"',
        "Proposal gate": 'data-stage="PROPOSAL"',
        "Production gate": 'data-stage="PRODUCTION"',
        "Expanded gate": 'data-stage="EXPANDED"',
        "Foundation plan phase": 'data-phase="FOUNDATION"',
        "D01 plan task": "D01",
    }
    for label, marker in required_dom.items():
        if marker not in dom:
            fail(f"missing rendered marker for {label}: {marker}")

    # Chrome --dump-dom includes the page's <script> source. Check actual rendered
    # element state rather than generic error strings that also exist in handlers.
    rendered_error_markers = [
        'id="planContent"><div class="error">',
        'id="currentTask">Worker status unavailable<',
    ]
    for marker in rendered_error_markers:
        if marker in dom:
            fail(f"rendered dashboard contains runtime error state: {marker}")

    if screenshot_size < 10_000:
        fail(f"screenshot is unexpectedly small: {screenshot_size} bytes")

    plan = json.loads(Path("data/master-plan.json").read_text(encoding="utf-8"))
    worker = json.loads(Path("data/worker-status.json").read_text(encoding="utf-8"))
    gate_ids = [gate.get("id") for gate in plan.get("gates", [])]
    for gate_id in ["FOUNDATION", "DEMO", "MVP", "PROPOSAL", "PRODUCTION", "EXPANDED"]:
        if gate_id not in gate_ids:
            fail(f"master plan gate missing: {gate_id}")

    for key in ["currentTask", "currentGate", "lastCompletedTask", "nextTask", "state"]:
        if not worker.get(key):
            fail(f"worker field empty: {key}")

    print(
        "UI_SMOKE_PASS: browser rendered dashboard, stages overlay, five product boundaries, "
        f"DAVID status, and screenshot ({screenshot_size} bytes)"
    )


if __name__ == "__main__":
    main()
