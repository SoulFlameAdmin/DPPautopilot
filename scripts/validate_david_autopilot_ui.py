#!/usr/bin/env python3
from __future__ import annotations
import sys
from pathlib import Path

def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)

def main() -> None:
    require(len(sys.argv) == 2, "usage: validate_david_autopilot_ui.py <dom>")
    dom=Path(sys.argv[1]).read_text(encoding="utf-8",errors="replace")
    required=[
        'data-autopilot-ready="true"',
        'data-external-delivery="disabled"',
        'data-registry-network="disabled"',
        'data-queue="actions"',
        'data-queue="sources"',
        'data-queue="supplier"',
        'data-queue="registry"',
        'data-side-effect-disabled="supplier-send"',
        'data-side-effect-disabled="registry-submit"',
        'disabled=""',
        'model.identification.manufacturer.contact',
        'model.carbon_footprint',
        'confidence 0.95',
        'cf-report-demo-001',
        'carbon_footprint_v1',
        'awaiting_response',
        'MAIL-RECEIPT-DEMO-001',
        'retry_wait',
        'TEMP_VALIDATION',
        '2026-09-24T10:00:00Z',
        'networkSubmissionAllowed=false',
        'externalDeliveryAllowed=false',
        'data-audit-queue="supplier"',
        'data-audit-queue="registry"',
        'DAVID AUTOPILOT UI PASS · read-only queues · audit visible · retry visible · external side effects disabled',
    ]
    for marker in required:
        require(marker in dom,f"DAVID Autopilot UI missing evidence: {marker}")
    require(dom.count('class="queue-item"') >= 5,"expected rendered queue entries")
    require(dom.count('<li data-audit-queue=') >= 5,"expected audit timeline events")
    print("DAVID_AUTOPILOT_UI_PASS: action/source/supplier/registry queues render with approval boundaries, provenance, audit history, retry state, and disabled external side effects")

if __name__=="__main__":
    main()
