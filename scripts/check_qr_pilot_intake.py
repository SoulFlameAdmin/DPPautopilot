#!/usr/bin/env python3
"""Offline intake preflight. Does not import, publish or certify battery data."""
import argparse
import csv
import json
import sys
from pathlib import Path

FIELDS = ('manufacturer_name', 'model_id', 'category', 'unique_identifier')


def check(csv_path, approval_path):
    errors = []
    with Path(csv_path).open(encoding='utf-8-sig', newline='') as handle:
        reader = csv.DictReader(handle)
        headers = reader.fieldnames or []
        if len(headers) != len(set(headers)):
            errors.append('Duplicate CSV headers')
        for field in FIELDS:
            if field not in headers:
                errors.append('Missing column: ' + field)
        rows = list(reader)
    if len(rows) != 10:
        errors.append('Pilot requires exactly 10 battery rows')
    for number, row in enumerate(rows, 2):
        if None in row or any(value is None for value in row.values()):
            errors.append(f'Row {number}: incorrect column count')
        for field in FIELDS:
            value = row.get(field)
            if not isinstance(value, str) or not value.strip():
                errors.append(f'Row {number}: missing {field}')
            elif value != value.strip():
                errors.append(f'Row {number}: surrounding whitespace in {field}')
    ids = [row.get('unique_identifier') for row in rows]
    if len(set(ids)) != len(ids):
        errors.append('Duplicate battery identifiers; model SKU is not a unit identifier')
    for field in ('manufacturer_name', 'model_id', 'category'):
        if len({row.get(field) for row in rows}) != 1:
            errors.append('Pilot must have one ' + field)
    approval = json.loads(Path(approval_path).read_text(encoding='utf-8'))
    if not isinstance(approval, dict):
        return errors + ['Approval must be a JSON object']
    for field in ('company_name', 'reviewer_name', 'uat_contact', 'approval_reference', 'category_review_reference'):
        if not isinstance(approval.get(field), str) or not approval[field].strip():
            errors.append('Missing approval field: ' + field)
    if approval.get('source_data_use_authorized') is not True:
        errors.append('Source data use must be explicitly authorized')
    public = approval.get('public_fields')
    if not isinstance(public, list) or not public or any(not isinstance(x, str) or x not in headers for x in public):
        errors.append('public_fields must explicitly name approved CSV columns')
    if approval.get('model_id') != (rows[0].get('model_id') if rows else None):
        errors.append('Approval model_id does not match intake')
    if approval.get('category') != (rows[0].get('category') if rows else None):
        errors.append('Approval category does not match intake')
    approved_ids = approval.get('authorized_identifiers')
    if not isinstance(approved_ids, list) or any(not isinstance(x, str) for x in approved_ids):
        errors.append('authorized_identifiers must be an explicit list')
    elif len(approved_ids) != 10 or len(set(approved_ids)) != 10 or set(approved_ids) != set(ids):
        errors.append('Approval must cover exactly the 10 supplied identifiers')
    return errors


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('csv')
    parser.add_argument('approval')
    args = parser.parse_args()
    try:
        errors = check(args.csv, args.approval)
    except (OSError, ValueError, csv.Error) as exc:
        print('INTAKE_BLOCKED: unreadable or malformed input', file=sys.stderr)
        return 1
    for error in errors:
        print('INTAKE_BLOCKED: ' + error, file=sys.stderr)
    if errors:
        return 1
    print('INTAKE_PREFLIGHT_PASS: structure and supplied approval match; no import/publication performed; category, legal scope and approval authenticity require human review')
    return 0


if __name__ == '__main__':
    sys.exit(main())
