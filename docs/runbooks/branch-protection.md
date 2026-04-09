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

| Setting | Value |
|---------|-------|
| Require a pull request before merging | **Yes** |
| Required approving reviews | **1** |
| Dismiss stale reviews on new commits | **Yes** |
| Require review from Code Owners | **No** (no CODEOWNERS yet) |
| Require status checks to pass | **Yes** |
| Require branches to be up to date before merging | **Yes** |
| Required status checks | See [§ Required checks](#required-checks) |
| Require conversation resolution before merging | **Yes** |
| Require signed commits | **Yes** |
| Require linear history | **Yes** (no merge commits; rebase or squash) |
| Require deployments to succeed | **No** |
| Lock branch | **No** |
| Do not allow bypassing the above settings | **Yes** (even for admins) |
| Restrict who can push to matching branches | **No** (protection via PR flow) |
| Allow force pushes | **No** |
| Allow deletions | **No** |

### `release` branch

`release` is treated like a deploy lever rather than a development target.
It should only ever fast-forward from `main`.

| Setting | Value |
|---------|-------|
| Require a pull request before merging | **Yes** |
| Required approving reviews | **1** |
| Dismiss stale reviews on new commits | **Yes** |
| Require status checks to pass | **Yes** |
| Require branches to be up to date before merging | **Yes** |
| Required status checks | Same as `main` (see below) |
| Require conversation resolution before merging | **Yes** |
| Require signed commits | **Yes** |
| Require linear history | **Yes** |
| Allow force pushes | **No** |
| Allow deletions | **No** |
| Restrict who can push | **Yes** — only repo admins, and only via fast-forward merge from `main` |

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
> list **in the same PR**. The CI check below compares this file to the
> GitHub API and will fail otherwise.

---

## Why these specific settings

- **Linear history** keeps `git log` readable and `git bisect` reliable.
  Merge commits are convenient in big team repos; in a solo-maintainer
  project they are pure noise.
- **Signed commits** means every commit on a protected branch is
  attributable. Enable with `git config commit.gpgsign true` or SSH-key
  signing (`gpg.format = ssh`). The user global
  [CLAUDE.md](../../CLAUDE.md) explicitly forbids bypassing signing
  (`--no-gpg-sign`) without an explicit ask.
- **Dismiss stale reviews** protects against the "LGTM, then three more
  commits" pattern.
- **Conversation resolution** catches unaddressed review comments from
  CodeRabbit and human reviewers.
- **No admin bypass** closes the "I'll just merge this one time" hole
  that has caused every regression I've shipped in a hurry.
- **Require up-to-date** ensures the CI that passed is the CI for the
  post-merge state, not stale results from a branch that diverged days
  ago.

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
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": false,
    "required_approving_review_count": 1
  },
  "restrictions": null,
  "required_linear_history": true,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_conversation_resolution": true,
  "required_signatures": true
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

- Required status check names.
- `required_linear_history` is disabled.
- `required_signatures` is disabled.
- `enforce_admins` is disabled.
- `allow_force_pushes` is enabled.
- Required review count drops below 1.

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
- GitHub's API occasionally changes the shape of the protection payload
  (e.g. renaming `required_signatures` to `required_signatures.enabled`).
  The CI check is tolerant of both shapes, but if GitHub adds a new
  setting that should be enforced, update both this doc and the check.
- CODEOWNERS is intentionally *not* required: this is a single-maintainer
  project. If the project grows to >1 active contributor, add a
  CODEOWNERS file and flip `require_code_owner_reviews` to `true`.
