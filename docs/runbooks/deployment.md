# Runbook: Deployment

**Audience:** the on-call human (today, that's the sole maintainer).
**Scope:** production deploys of the API and frontend Docker images to the
self-hosted Docker host behind Cloudflare Tunnel.
**Sibling doc:** [`docs/deployment.md`](../deployment.md) — static
architecture / Cloudflare setup. This runbook is the *operational* side:
how do I ship, roll back, or unstick a deploy right now?

---

## TL;DR

- **Normal deploy:** push to `release` → GitHub Actions builds images →
  Watchtower on the host pulls them within ~3 minutes → done.
- **Manual deploy:** SSH, `docker compose pull && docker compose up -d`.
- **Rollback:** retag the previous image as `latest` on GHCR *or* pin the
  compose file to a specific SHA / version tag and redeploy.
- **Watchtower stuck:** check logs, restart the watchtower container, then
  fall back to manual deploy.

---

## 1. How auto-deploys work

1. A commit lands on the `release` branch.
2. [`.github/workflows/docker.yml`](../../.github/workflows/docker.yml)
   triggers on `push` to `release`. It:
   - Reads `VERSION` and tags the resulting images as `latest`,
     `<git-sha>`, and `v<VERSION>`.
   - Builds **`ghcr.io/jtn0123/satellite-processor-api`** from
     `backend/Dockerfile`.
   - Builds **`ghcr.io/jtn0123/satellite-processor-frontend`** from
     `frontend/Dockerfile`.
   - Runs a Trivy container scan; the job fails on HIGH or CRITICAL
     fixable vulns.
3. On the production host, **Watchtower** runs as a Docker container and
   polls GHCR every ~3 minutes. When it sees a new digest for any image
   whose container carries the Watchtower enable label, it:
   - Pulls the new image.
   - Stops the running container.
   - Starts a new one with the same compose config.
   - Leaves the old image around for one cycle in case we need to roll
     back by tag.

The exact Watchtower command is documented near the bottom of
`.github/workflows/docker.yml` (lines ~121-123):

> *"Deployment is handled automatically by Watchtower on the production
> host. Watchtower polls GHCR every 3 minutes with label-based filtering
> and pulls new images once they are pushed by the build-and-push job
> above."*

---

## 2. Normal deploy — happy path

You only need to do this on your laptop:

```bash
# 1. Make sure main is green and everything you want shipped is merged.
git checkout main
git pull

# 2. Fast-forward release to main.
git checkout release
git merge --ff-only main
git push origin release
```

That's it. The GitHub Action takes ~4-6 minutes to build and push; then
Watchtower picks it up within 3 minutes. Total time from `git push` to
new containers running: **~10 minutes**.

### Verifying the deploy

After ~10 minutes:

```bash
# From anywhere with the API key:
curl -sS -H "X-API-Key: $API_KEY" https://sat-api.example.com/api/health | jq .

# From the host:
docker compose ps
docker compose logs --tail=100 api frontend
```

The API `/api/health` response includes the build SHA and version; confirm
they match the commit you just pushed.

---

## 3. Manual deploy (bypassing Watchtower)

Use this when:

- Watchtower is broken (see §5).
- You need to force a pull immediately instead of waiting ~3 min.
- You are deploying a locally built image for testing (not recommended on
  prod, but sometimes necessary).

```bash
ssh <prod-host>
cd /srv/satellite-processor   # wherever docker-compose.yml lives

# Pull latest from GHCR and recreate containers.
docker compose pull api frontend
docker compose up -d api frontend

# Tail logs for 30s to make sure nothing is crashlooping.
docker compose logs -f --tail=50 api frontend
```

If the API fails to start because of an Alembic migration, see
[`docs/deployment.md`](../deployment.md#alembic-migrations) for the
`alembic stamp head` escape hatch.

---

## 4. Rollback procedures

### 4a. Fast rollback — redeploy the previous tag

Every image is pushed with three tags: `latest`, the git SHA, and
`v<VERSION>`. To roll back:

```bash
ssh <prod-host>
cd /srv/satellite-processor

# Find the previous good version.
docker images ghcr.io/jtn0123/satellite-processor-api --format '{{.Tag}} {{.CreatedAt}}'

# Pin the compose file (or use an env var override) to that tag.
# Example: edit docker-compose.yml so the api image line becomes
#   image: ghcr.io/jtn0123/satellite-processor-api:v1.42.14
# Same for frontend.

docker compose up -d api frontend
docker compose logs -f --tail=50 api frontend
```

**Important:** while the tag is pinned, Watchtower will **not** upgrade
the container (it only upgrades `latest`). Leave a TODO to un-pin once
the root cause is fixed.

### 4b. Slow rollback — revert the commit

If the breaking change is in code (not config):

```bash
git checkout main
git revert <bad-sha>
git push

git checkout release
git merge --ff-only main
git push origin release
```

Watchtower will pick up the new `latest` in ~3 minutes. Prefer this over
pinning if you can afford the build time — pinning has a habit of being
forgotten.

### 4c. Database rollback

Only if the bad deploy included an Alembic migration that needs undoing:

```bash
docker compose exec api alembic downgrade -1
```

**Test `downgrade` in dev before running it in prod.** Some migrations
are destructive (dropping columns) and cannot be rolled back without
data loss.

---

## 5. Watchtower troubleshooting

### Symptom: new images are on GHCR but prod is still running old code.

1. **Check Watchtower is running.**
   ```bash
   docker ps --filter name=watchtower
   docker logs watchtower --tail=200
   ```
2. **Look for auth failures.** Watchtower needs a GHCR pull token. If
   you see `401 Unauthorized` or `denied: denied`:
   - Confirm `~/.docker/config.json` on the host has a valid GHCR
     credential, or that `REPO_USER` / `REPO_PASS` env vars are set on
     the Watchtower container.
   - Rotate the GHCR PAT if the current one is expired.
3. **Look for rate limiting.** GHCR has generous limits, but if you've
   been churning deploys, you may hit them. Watchtower will log
   `429 Too Many Requests`.
4. **Force a poll cycle.**
   ```bash
   docker kill --signal=SIGHUP watchtower
   ```
   (Watchtower treats SIGHUP as "run now" in recent versions. If it
   doesn't, just `docker restart watchtower`.)
5. **If Watchtower itself is broken**, fall back to the manual deploy
   in §3 and file a follow-up to debug Watchtower separately. Do not
   block a deploy on Watchtower.

---

## 6. Incident response

If a deploy breaks production:

### Step 1: Stop the bleeding (≤5 min)

- **Is the API returning 5xx?** Roll back with §4a (fast redeploy of
  previous tag). Do this *first*, debug *after*.
- **Is the frontend blank but API healthy?** Roll back the frontend
  image only: `docker compose up -d frontend` with the previous tag.
- **Is the worker crashlooping?** The API will still serve reads; users
  just can't start new jobs. You can roll back at leisure.

### Step 2: Communicate (≤10 min)

- This is a solo project, so "communicate" = **write it down** in the
  relevant Linear issue or open a new one. Future-you will thank you.
- If there are external users, post a banner in the frontend
  (`VITE_STATUS_BANNER` env var) announcing the degradation.

### Step 3: Diagnose (no time limit, but don't skip it)

- Pull logs from the failing container:
  ```bash
  docker compose logs api > /tmp/api.log
  docker compose logs worker > /tmp/worker.log
  ```
- Check Prometheus / Grafana if wired up — error rate, task failure
  rate, Redis connection count, DB pool saturation.
- Check Alembic current revision vs expected (`alembic current`).
- Look for OOM kills: `dmesg -T | grep -i killed`.

### Step 4: Fix forward

- Write a reproducing test (see the in-memory test strategy in
  [ADR 0005](../adr/0005-in-memory-sqlite-fakeredis-tests.md)).
- Open a PR, get it through CI, merge to `main`, then ship to `release`.
- **Un-pin** any image tags that were pinned during the rollback.
- Write a short postmortem in the Linear issue: what broke, why, what
  we did, what we'll do differently. Even a 5-line version is worth it.

### Step 5: Prevent recurrence

Common improvements that fall out of post-mortems, in rough order of
value for this project:

- Add a CI check that would have caught it.
- Add a smoke test to the Docker build job (`.github/workflows/docker.yml`
  already has a best-effort `health-check-api` step — extend it).
- Add a Prometheus alert that fires before humans notice.
- Update this runbook with the new failure mode.

---

## 7. Pre-deploy checklist

Before merging to `release`:

- [ ] All CI on `main` is green (tests, lint, frontend build, pip-audit).
- [ ] Alembic migrations (if any) have been tested with both `upgrade
      head` and `downgrade -1`.
- [ ] `VERSION` file has been bumped per the
      [user global CLAUDE.md](../../CLAUDE.md) conventions.
- [ ] Frontend build locally succeeds with `npm run build`.
- [ ] You are not shipping right before you plan to disappear for the
      weekend (soft rule, hard-learned).

---

## 8. Related docs and configs

- [`docs/deployment.md`](../deployment.md) — static architecture,
  Cloudflare Tunnel, compose / env var reference.
- [`docs/runbooks/branch-protection.md`](./branch-protection.md) — the
  required-check rules that gate `main` and `release`.
- [`docs/adr/`](../adr/README.md) — architectural decision records.
- [`.github/workflows/docker.yml`](../../.github/workflows/docker.yml) —
  image build + Trivy scan + Watchtower handoff comment.
- [`.github/workflows/test.yml`](../../.github/workflows/test.yml) — CI
  test matrix (backend shards, frontend, lint, pip-audit).
