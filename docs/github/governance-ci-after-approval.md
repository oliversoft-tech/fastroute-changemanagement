# Governance CI only after PR approval

Use this workflow in each impacted repository (`fastroute-domain`, `fastroute-api`, `fastroute-mobile-hybrid`) so central CI runs only after code review approval.

```yaml
name: Governance CI After Approval

on:
  pull_request_review:
    types: [submitted]

permissions:
  contents: read

jobs:
  dispatch-governance-ci:
    if: >
      github.event.review.state == 'approved' &&
      startsWith(github.event.pull_request.head.ref, 'codex/governance-')
    runs-on: ubuntu-latest
    steps:
      - name: Dispatch governance-ci (approved)
        env:
          ORCHESTRATOR_OWNER: oliversoft-tech
          ORCHESTRATOR_REPO: fastroute-changemanagement
          GH_TOKEN: ${{ secrets.CROSS_REPO_PAT }}
        run: |
          set -euo pipefail

          SOURCE_REPO="${GITHUB_REPOSITORY#*/}"
          HEAD_SHA="${{ github.event.pull_request.head.sha }}"
          HEAD_REF="${{ github.event.pull_request.head.ref }}"

          payload=$(cat <<JSON
          {
            "event_type": "governance-ci",
            "client_payload": {
              "source_repo": "${SOURCE_REPO}",
              "source_sha": "${HEAD_SHA}",
              "head_sha": "${HEAD_SHA}",
              "head_ref": "${HEAD_REF}",
              "approved": true
            }
          }
          JSON
          )

          curl -sS -X POST \
            -H "Authorization: Bearer ${GH_TOKEN}" \
            -H "Accept: application/vnd.github+json" \
            -H "X-GitHub-Api-Version: 2022-11-28" \
            https://api.github.com/repos/${ORCHESTRATOR_OWNER}/${ORCHESTRATOR_REPO}/dispatches \
            -d "${payload}"
```

Notes:
- Keep existing push-triggered governance dispatch disabled for `codex/governance-*` branches.
- Central workflow now expects `client_payload.approved=true` for `governance-ci` runs.
- For `fastroute-mobile-hybrid`, `governance-ci` also runs mobile UI gates:
  - Android Robo (Firebase Test Lab)
  - iOS simulator crawler (`test:ui:ios:crawler`)
