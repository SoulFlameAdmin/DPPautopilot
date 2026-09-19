#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
workflow = ROOT / ".github" / "workflows" / "vercel-deploy.yml"
text = workflow.read_text(encoding="utf-8")

def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)

require("workflow_dispatch:" in text, "F08 deploy workflow must be manual")
require("\n  push:" not in text, "F08 deploy workflow must not deploy on push")
require("\n  pull_request:" not in text, "F08 deploy workflow must not deploy on pull_request")
require("permissions:\n  contents: read" in text, "F08 deploy workflow permissions must be read-only")
require("actions/checkout@11d5960a326750d5838078e36cf38b85af677262" in text, "F08 checkout action pin missing")
require("actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02" in text, "F08 artifact action pin missing")
require("VERCEL_CLI_VERSION: 59.19.1" in text, "F08 Vercel CLI exact version missing")
require("VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}" in text, "F08 token must come from GitHub Actions secrets")
require("VERCEL_PROJECT_ID: prj_K0RSGrEkEr3XDouCTA3tdasbqH55" in text, "F08 wrong Vercel project")
require("VERCEL_ORG_ID: team_cKaIZfnCMzoiiq80J0MhV0A2" in text, "F08 wrong Vercel team")
require("DEPLOY_PRODUCTION" in text, "F08 production confirmation gate missing")
require("git rev-parse origin/main" in text, "F08 production must require exact current main")
require('vercel pull --yes --environment="$TARGET"' in text, "F08 Vercel environment pull missing")
require("vercel build --prod" in text and "vercel deploy --prebuilt --prod" in text, "F08 production path missing")
require("vercel deploy --prebuilt --token=" in text, "F08 preview path missing")
require('"$DEPLOYMENT_URL/"' in text, "F08 home smoke missing")
require('"$DEPLOYMENT_URL/data/master-plan.json"' in text, "F08 master-plan smoke missing")
require("f08-vercel-deployment-receipt.json" in text, "F08 deployment receipt missing")
require("--force" not in text, "F08 workflow must not force deployment operations")

print("F08_VERCEL_CLI_DEPLOY_PATH_PASS: manual exact-SHA deployment path is project-locked, secret-gated, prebuilt, smoke-tested and receipt-producing")
