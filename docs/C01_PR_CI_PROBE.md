# C01 PR CI Probe

This draft-only branch exists solely to prove that the canonical GitHub Actions workflow is triggered by a real `pull_request` event.

- Base: `main`
- Expected workflow: `CI`
- Expected job: `validate`
- Merge intent: **none**
- Cleanup: close the probe PR after evidence is captured.

No production/runtime/deployment behavior is changed by this file.
