import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
data = json.loads((ROOT / "data" / "dpp-crypto-status.json").read_text(encoding="utf-8"))
assert data["totalPoints"] == 25
assert len(data["points"]) == 25
assert [p["id"] for p in data["points"]] == [f"CR{i:02d}" for i in range(1, 26)]
allowed = {"green", "yellow", "red", "blocked"}
assert all(p["status"] in allowed for p in data["points"])
counts = {k: sum(p["status"] == k for p in data["points"]) for k in allowed}
assert counts == data["counts"]
assert data["greenPercent"] == round((counts["green"] / 25) * 100)
for key in ["currentTask","nextTask","branch","pullRequest","trackedCommitSha","ci","updatedAt"]:
    assert key in data
page = (ROOT / "demo" / "dpp-crypto-progress.html").read_text(encoding="utf-8")
assert "dpp-crypto-progress.js" in page
script = (ROOT / "assets" / "csp" / "dpp-crypto-progress.js").read_text(encoding="utf-8")
assert "/data/dpp-crypto-status.json" in script
assert "CR25" in script
print("DPP_CRYPTO_PROGRESS_PASS")
