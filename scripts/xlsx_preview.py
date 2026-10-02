#!/usr/bin/env python3
from __future__ import annotations

import io
import posixpath
import re
import zipfile
import xml.etree.ElementTree as ET
from typing import Any

MAX_XLSX_BYTES = 10 * 1024 * 1024
MAX_ARCHIVE_ENTRIES = 250
MAX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024
MAX_PREVIEW_ROWS = 20
MAX_COLUMNS = 200

NS_MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
NS_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
NS_PKG_REL = "http://schemas.openxmlformats.org/package/2006/relationships"


def _q(ns: str, tag: str) -> str:
    return f"{{{ns}}}{tag}"


def _column_index(cell_ref: str) -> int:
    match = re.match(r"^([A-Z]+)", cell_ref.upper())
    if not match:
        return 0
    value = 0
    for ch in match.group(1):
        value = value * 26 + (ord(ch) - 64)
    return max(0, value - 1)


def _text(node: ET.Element | None) -> str:
    if node is None:
        return ""
    return "".join(node.itertext())


def _safe_zip(data: bytes) -> zipfile.ZipFile:
    if not isinstance(data, (bytes, bytearray)) or len(data) < 4:
        raise ValueError("XLSX payload is empty or invalid")
    if len(data) > MAX_XLSX_BYTES:
        raise ValueError("XLSX file exceeds 10 MiB preview limit")
    stream = io.BytesIO(bytes(data))
    if not zipfile.is_zipfile(stream):
        raise ValueError("file is not a valid XLSX/ZIP container")
    stream.seek(0)
    zf = zipfile.ZipFile(stream)
    infos = zf.infolist()
    if len(infos) > MAX_ARCHIVE_ENTRIES:
        zf.close()
        raise ValueError("XLSX archive contains too many entries")
    total = sum(info.file_size for info in infos)
    if total > MAX_UNCOMPRESSED_BYTES:
        zf.close()
        raise ValueError("XLSX archive expands beyond preview safety limit")
    names = set(zf.namelist())
    if "xl/workbook.xml" not in names or "xl/_rels/workbook.xml.rels" not in names:
        zf.close()
        raise ValueError("XLSX workbook metadata is missing")
    return zf


def _shared_strings(zf: zipfile.ZipFile) -> list[str]:
    if "xl/sharedStrings.xml" not in zf.namelist():
        return []
    root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
    return [_text(si) for si in root.findall(_q(NS_MAIN, "si"))]


def _sheet_targets(zf: zipfile.ZipFile) -> list[tuple[str, str]]:
    workbook = ET.fromstring(zf.read("xl/workbook.xml"))
    rels = ET.fromstring(zf.read("xl/_rels/workbook.xml.rels"))
    rel_map = {
        rel.attrib["Id"]: rel.attrib["Target"]
        for rel in rels.findall(_q(NS_PKG_REL, "Relationship"))
        if "Id" in rel.attrib and "Target" in rel.attrib
    }
    result: list[tuple[str, str]] = []
    sheets = workbook.find(_q(NS_MAIN, "sheets"))
    if sheets is None:
        return result
    for sheet in sheets.findall(_q(NS_MAIN, "sheet")):
        name = sheet.attrib.get("name", "").strip()
        rid = sheet.attrib.get(_q(NS_REL, "id"), "")
        target = rel_map.get(rid)
        if not name or not target:
            continue
        if target.startswith("/"):
            path = target.lstrip("/")
        else:
            path = posixpath.normpath(posixpath.join("xl", target))
        if not path.startswith("xl/") or ".." in path.split("/"):
            raise ValueError("unsafe XLSX worksheet relationship")
        result.append((name, path))
    return result


def _cell_value(cell: ET.Element, shared: list[str]) -> Any:
    kind = cell.attrib.get("t")
    if kind == "inlineStr":
        return _text(cell.find(_q(NS_MAIN, "is")))
    v = cell.find(_q(NS_MAIN, "v"))
    raw = "" if v is None or v.text is None else v.text
    if kind == "s":
        try:
            return shared[int(raw)]
        except (ValueError, IndexError):
            raise ValueError("invalid shared-string reference") from None
    if kind == "b":
        return raw == "1"
    if kind in {"str", "e"}:
        return raw
    if raw == "":
        return ""
    try:
        number = float(raw)
        return int(number) if number.is_integer() else number
    except ValueError:
        return raw


def _preview_sheet(zf: zipfile.ZipFile, path: str, shared: list[str]) -> dict[str, Any]:
    if path not in zf.namelist():
        raise ValueError(f"worksheet part is missing: {path}")
    root = ET.fromstring(zf.read(path))
    sheet_data = root.find(_q(NS_MAIN, "sheetData"))
    rows_out: list[list[Any]] = []
    if sheet_data is not None:
        for row in sheet_data.findall(_q(NS_MAIN, "row"))[: MAX_PREVIEW_ROWS + 1]:
            values: list[Any] = []
            for cell in row.findall(_q(NS_MAIN, "c")):
                index = _column_index(cell.attrib.get("r", "A1"))
                if index >= MAX_COLUMNS:
                    raise ValueError("worksheet exceeds 200-column preview limit")
                while len(values) <= index:
                    values.append("")
                values[index] = _cell_value(cell, shared)
            rows_out.append(values)

    if not rows_out:
        return {"headers": [], "rows": [], "row_count_previewed": 0}

    width = max(len(row) for row in rows_out)
    rows_out = [row + [""] * (width - len(row)) for row in rows_out]
    headers = [str(value).strip() for value in rows_out[0]]
    if not headers or any(not value for value in headers):
        raise ValueError("worksheet header row contains blank column names")
    if len(set(headers)) != len(headers):
        raise ValueError("worksheet header row contains duplicate column names")
    data_rows = rows_out[1: MAX_PREVIEW_ROWS + 1]
    return {
        "headers": headers,
        "rows": data_rows,
        "row_count_previewed": len(data_rows),
    }


def preview_xlsx_bytes(data: bytes) -> dict[str, Any]:
    zf = _safe_zip(data)
    try:
        shared = _shared_strings(zf)
        sheets = []
        for name, path in _sheet_targets(zf):
            preview = _preview_sheet(zf, path, shared)
            sheets.append({"name": name, **preview})
        if not sheets:
            raise ValueError("XLSX workbook contains no readable worksheets")
        return {
            "format": "xlsx",
            "sheet_count": len(sheets),
            "sheets": sheets,
            "limits": {
                "max_file_bytes": MAX_XLSX_BYTES,
                "max_preview_rows": MAX_PREVIEW_ROWS,
                "max_columns": MAX_COLUMNS,
            },
        }
    finally:
        zf.close()
