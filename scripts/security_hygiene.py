#!/usr/bin/env python3
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]

FORBIDDEN_TRACKED_NAMES = {".env", ".env.local", ".env.production", ".env.development"}
PATTERNS = {
    "private key": re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    "OpenAI-style secret": re.compile(r"\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b"),
    "Supabase service role assignment": re.compile(r"SUPABASE_SERVICE_ROLE_KEY\s*=\s*[^\s<>{}]+", re.I),
    "database password URL": re.compile(r"postgres(?:ql)?://[^\s:@]+:[^\s@]+@", re.I),
}
TEXT_SUFFIXES = {".md", ".txt", ".json", ".yml", ".yaml", ".js", ".ts", ".tsx", ".jsx", ".html", ".css", ".py", ".toml", ".ini", ".cfg", ".sh", ".ps1"}


def main():
    violations = []
    for path in ROOT.rglob("*"):
        if not path.is_file() or ".git" in path.parts:
            continue
        rel = path.relative_to(ROOT).as_posix()
        if path.name in FORBIDDEN_TRACKED_NAMES:
            violations.append(f"tracked secret file: {rel}")
            continue
        if path.suffix.lower() not in TEXT_SUFFIXES and path.name not in {".gitignore"}:
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        for label, pattern in PATTERNS.items():
            if pattern.search(text):
                violations.append(f"{label}: {rel}")
    if violations:
        raise SystemExit("SECURITY HYGIENE FAIL:\n- " + "\n- ".join(sorted(set(violations))))
    print("PASS: no obvious committed secrets or forbidden environment files detected")


if __name__ == "__main__":
    main()
