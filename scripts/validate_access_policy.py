#!/usr/bin/env python3
from __future__ import annotations

from passport_access import load_catalog, load_policy, validate_access_catalog

catalog = load_catalog()
policy = load_policy()

assert policy.get("version") == 1, "M10 access policy version must be 1"
assert policy.get("task") == "M10", "access policy must belong to M10"

allowed = set(policy.get("allowed_classes", []))
public = set(policy.get("public_projection_classes", []))
restricted = set(policy.get("restricted_projection_classes", []))

assert allowed == {"public", "public_identifier", "legitimate_interest", "authority_only"}, "M10 allowed class set changed"
assert public == {"public", "public_identifier"}, "M10 public projection classes changed"
assert restricted == {"legitimate_interest", "authority_only"}, "M10 restricted class set changed"
assert not (public & restricted), "M10 public/restricted classes overlap"
assert public | restricted == allowed, "M10 policy does not classify every allowed access class"

counts = validate_access_catalog(catalog, policy)
assert sum(counts.values()) == len(catalog["fields"]) == 42, "M10 every field must carry exactly one valid access class"

print(
    "M10_ACCESS_POLICY_PASS: 42/42 catalog fields have explicit allowed access classes; "
    "public projection classes are disjoint from legitimate-interest/authority-only classes"
)
