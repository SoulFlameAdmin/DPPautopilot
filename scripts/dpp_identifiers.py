#!/usr/bin/env python3
from __future__ import annotations

import re

_MODEL_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")
_SERIAL_RE = re.compile(r"^[0-9]{1,12}$")
_URN_RE = re.compile(r"^urn:dpp:demo:battery:([A-Za-z0-9][A-Za-z0-9._-]{0,63}):([0-9]{6,12})$")


def make_demo_identifier(model_id: str, serial: int | str) -> str:
    """Create a deterministic synthetic/demo identifier.

    This namespace is deliberately `urn:dpp:demo:` and must never be presented
    as a production Registry identifier.
    """
    if not isinstance(model_id, str) or not _MODEL_RE.fullmatch(model_id):
        raise ValueError("model_id must match [A-Za-z0-9][A-Za-z0-9._-]{0,63}")
    if isinstance(serial, bool):
        raise ValueError("serial must be a positive integer")
    raw = str(serial)
    if not _SERIAL_RE.fullmatch(raw):
        raise ValueError("serial must contain 1-12 decimal digits")
    numeric = int(raw)
    if numeric <= 0:
        raise ValueError("serial must be greater than zero")
    normalized = f"{numeric:06d}"
    if len(normalized) > 12:
        raise ValueError("serial exceeds 12 digits")
    return f"urn:dpp:demo:battery:{model_id}:{normalized}"


def parse_demo_identifier(identifier: str) -> tuple[str, int]:
    if not isinstance(identifier, str):
        raise ValueError("identifier must be a string")
    match = _URN_RE.fullmatch(identifier)
    if not match:
        raise ValueError("invalid demo DPP battery identifier")
    model_id, serial = match.groups()
    value = int(serial)
    if value <= 0:
        raise ValueError("serial must be greater than zero")
    return model_id, value


def is_demo_identifier(identifier: str) -> bool:
    try:
        parse_demo_identifier(identifier)
        return True
    except ValueError:
        return False
