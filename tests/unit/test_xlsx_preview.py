#!/usr/bin/env python3
from __future__ import annotations

import io
import zipfile
import unittest

from scripts.xlsx_preview import preview_xlsx_bytes


def workbook_bytes() -> bytes:
    workbook = """<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
 <sheets>
  <sheet name="Batteries" sheetId="1" r:id="rId1"/>
  <sheet name="Suppliers" sheetId="2" r:id="rId2"/>
 </sheets>
</workbook>"""
    rels = """<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
 <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
 <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
</Relationships>"""
    strings = """<?xml version="1.0" encoding="UTF-8"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="8" uniqueCount="8">
 <si><t>manufacturer_name</t></si><si><t>rated_capacity_ah</t></si>
 <si><t>Acme Cells</t></si><si><t>Northstar</t></si>
 <si><t>supplier_name</t></si><si><t>country</t></si>
 <si><t>Cell Source Ltd</t></si><si><t>BG</t></si>
</sst>"""
    sheet1 = """<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
 <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>
 <row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>82.5</v></c></row>
 <row r="3"><c r="A3" t="s"><v>3</v></c><c r="B3"><v>90</v></c></row>
</sheetData></worksheet>"""
    sheet2 = """<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
 <row r="1"><c r="A1" t="s"><v>4</v></c><c r="B1" t="s"><v>5</v></c></row>
 <row r="2"><c r="A2" t="s"><v>6</v></c><c r="B2" t="s"><v>7</v></c></row>
</sheetData></worksheet>"""
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("xl/workbook.xml", workbook)
        zf.writestr("xl/_rels/workbook.xml.rels", rels)
        zf.writestr("xl/sharedStrings.xml", strings)
        zf.writestr("xl/worksheets/sheet1.xml", sheet1)
        zf.writestr("xl/worksheets/sheet2.xml", sheet2)
    return out.getvalue()


class XlsxPreviewTests(unittest.TestCase):
    def test_multisheet_headers_and_rows(self) -> None:
        result = preview_xlsx_bytes(workbook_bytes())
        self.assertEqual(result["format"], "xlsx")
        self.assertEqual(result["sheet_count"], 2)
        self.assertEqual([s["name"] for s in result["sheets"]], ["Batteries", "Suppliers"])
        self.assertEqual(result["sheets"][0]["headers"], ["manufacturer_name", "rated_capacity_ah"])
        self.assertEqual(result["sheets"][0]["rows"], [["Acme Cells", 82.5], ["Northstar", 90]])
        self.assertEqual(result["sheets"][1]["headers"], ["supplier_name", "country"])

    def test_rejects_non_xlsx(self) -> None:
        with self.assertRaises(ValueError):
            preview_xlsx_bytes(b"not-a-zip")


if __name__ == "__main__":
    unittest.main()
