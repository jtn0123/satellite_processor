# Runbook: Branch Protection Rules

**Purpose:** document the branch protection rules that *should* be applied
to `main` and `release` on GitHub, and provide a CI check that verifies
the rules have not drifted.

**Why this exists:** branch protection is configured in the GitHub UI, not
in version control, so it is possible for a human to accidentally disable
a required check and nobody notice until a broken PR merges. This runbook
is the source of truth; the CI check in
[`.github/workflows/branch-protection-check.yml`](../../.github/workflows/branch-protection-check.yml)
fails loudly if the live configuration drifts from it.

---

## Desired rules

### `main` branch

| Setting | Value | Enforced by CI check |
|---------|-------|----------------------|
| Require status checks to pass | **Yes** | yes |
| Required status checks | Non-empty — see [§ Required checks](#required-checks) | yes (non-empty only) |
| Require branches to be up to date before merging | **Yes** | no |
| Do not allow bypassing the above settings | **Yes** (even for admins) | yes |
| Allow force pushes | **No** | yes |
| Allow deletions | **No** | yes |
| Require a pull request before merging | **Yes** | no |
| Required approving reviews | **0** — see [§ Solo-maintainer carve-outs](#solo-maintainer-carve-outs) | no |
| Require review from Code Owners | **No** (no CODEOWNERS) | no |
| Require conversation resolution before merging | **No** | no |
| Require signed commits | **No** | no |
| Require linear history | **No** | no |
| Require deployments to succeed | **No** | no |
| Lock branch | **No** | no |
| Restrict who can push to matching branches | **No** (protection via PR flow) | no |

### `release` branch

`release` is treated like a deploy lever rather than a development target.
It should only ever fast-forward from `main`.

| Setting | Value | Enforced by CI check |
|---------|-------|----------------------|
| Require status checks to pass | **Yes** | yes |
| Required status checks | Same as `main`, plus the Docker checks below | yes (non-empty only) |
| Require branches to be up to date before merging | **Yes** | no |
| Do not allow bypassing the above settings | **Yes** (even for admins) | yes |
| Allow force pushes | **No** | yes |
| Allow deletions | **No** | yes |
| Require a pull request before merging | **Yes** | no |
| Required approving reviews | **0** | no |
| Require conversation resolution before merging | **No** | no |
| Require signed commits | **No** | no |
| Require linear history | **No** | no |
| Restrict who can push | **No** — see [§ Solo-maintainer carve-outs](#solo-maintainer-carve-outs) | no |

The practical workflow: `git checkout release && git merge --ff-only main
&& git push`. If that fails because `main` is not a fast-forward ancestor,
you merged something directly into `release` by mistake; revert it from
`main` and start over.

---

## Required checks

These status check names must match the GitHub Actions job names in
[`.github/workflows/test.yml`](../../.github/workflows/test.yml) exactly.
Renaming a job without updating this list will silently turn off a gate.

- `Lint & Security Audit`
- `Backend Tests (Shard 1/4)`
- `Backend Tests (Shard 2/4)`
- `Backend Tests (Shard 3/4)`
- `Backend Tests (Shard 4/4)`
- `Integration & Migration Tests`
- `API Contract Validation`
- `Docker Compose Smoke Test`
- `Frontend Tests (Shard 1/2)`
- `Frontend Tests (Shard 2/2)`
- `Frontend Build`
- `E2E Tests (Shard 1/3)`
- `E2E Tests (Shard 2/3)`
- `E2E Tests (Shard 3/3)`

`SonarCloud Scan` is **not** in the required list — it is a non-blocking
advisory gate. See project notes on SonarQube being non-blocking.

Checks added on the `release` branch only (via `.github/workflows/docker.yml`):

- `Build & Push Images`
- `Trivy Container Scan`

> **Note:** if you rename or remove a job in the workflow, update this
> list **and** the live protection rule in the same PR. The CI check no
> longer diffs this list against the API — it only asserts the list is
> non-empty — so a renamed job now silently stops gating merges instead of
> turning the check red. Renaming a job is the moment to re-run the `gh api`
> call below.

---

## Solo-maintainer carve-outs

Three settings that a team repo would enable are deliberately **off** here,
and the CI drift check no longer asserts them:

- **Required approving reviews.** There is no second person to approve. A
  required-review rule on a solo repo is satisfied only by bypassing it,
  which is worse than not having it: it trains you to reach for the bypass.
- **Signed commits.** Every commit already comes from one account. Signing
  would add a key-management failure mode (expired key, new machine, agent
  commits) in exchange for attribution that is not in question.
- **Linear history.** Nice to have, but it makes the merge-queue-free
  workflow here noisier than it is worth, and nothing depends on it.

What *is* enforced is the part that actually catches mistakes: CI has to be
green, and that gate applies to admins too. `enforce_admins` is the load
bearing setting on this list — without it, every other rule is advisory for
the only person who can push.

- **Require up-to-date** ensures the CI that passed is the CI for the
  post-merge state, not stale results from a branch that diverged days
  ago. Not asserted by the check (GitHub reports it only as
  `required_status_checks.strict`, which is easy to read but has never
  been the thing that drifts).

---

## Applying the rules (one-time setup and any time they drift)

Branch protection can be configured either through the GitHub web UI
(Settings → Branches → Add rule) or via the API. For reproducibility,
the API is preferred.

### Via `gh` CLI

Save the below as `scripts/apply-branch-protection.sh` if you find
yourself running it repeatedly. One-shot version:

```bash
# main
gh api -X PUT "repos/jtn0123/satellite_processor/branches/main/protection" \
  --input - <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "contexts": [
      "Lint & Security Audit",
      "Backend Tests (Shard 1/4)",
      "Backend Tests (Shard 2/4)",
      "Backend Tests (Shard 3/4)",
      "Backend Tests (Shard 4/4)",
      "Integration & Migration Tests",
      "API Contract Validation",
      "Docker Compose Smoke Test",
      "Frontend Tests (Shard 1/2)",
      "Frontend Tests (Shard 2/2)",
      "Frontend Build",
      "E2E Tests (Shard 1/3)",
      "E2E Tests (Shard 2/3)",
      "E2E Tests (Shard 3/3)"
    ]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": null,
  "restrictions": null,
  "required_linear_history": false,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_conversation_resolution": false
}
JSON
```

Repeat the same payload against `branches/release/protection`, adding the
Docker build + Trivy checks to the `contexts` array.

---

## CI drift check

The companion workflow
[`.github/workflows/branch-protection-check.yml`](../../.github/workflows/branch-protection-check.yml)
runs on `pull_request` (and on a weekly schedule) and fails if any of the
following diverge from this document:

- `required_status_checks` has no contexts at all (every check advisory).
- `enforce_admins` is disabled.
- `allow_force_pushes` is enabled.
- `allow_deletions` is enabled.

It deliberately does **not** compare the required-check names against a
fixed list. That is what drifted last time: jobs get renamed and re-sharded
far more often than protection rules get revisited, so the hardcoded list
went stale and the check became noise. It logs the live list on every run
instead, so a human skimming the job output can spot a check that quietly
vanished.

If the check fails, either (a) re-apply the rules with the `gh` API call
above, or (b) update this runbook *and* the CI check in the same PR to
record the new intent. Do **not** silence the check.

---

## Known limitations

- The CI check needs a PAT or GitHub App token with `administration:read`
  on the repo. A vanilla `GITHUB_TOKEN` doesn't have enough scope to read
  branch protection. Token is injected via the `BRANCH_PROTECTION_TOKEN`
  repository secret. If the secret is unset the check is a no-op that
  logs a warning — so the gate fails *open*, not closed. If you care
  about strict drift detection, make sure the secret is populated.
- GitHub reports required checks in two places, the legacy flat
  `contexts` array and the newer `checks[].context`, and which one is
  populated depends on how the rule was created. The check unions both
  before deciding the list is empty. If GitHub adds a new setting that
  should be enforced, update both this doc and the check.
- CODEOWNERS is intentionally *not* required: this is a single-maintainer
  project. If the project grows to >1 active contributor, add a
  CODEOWNERS file and flip `require_code_owner_reviews` to `true`.
