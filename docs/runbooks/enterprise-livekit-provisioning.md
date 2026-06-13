# Enterprise LiveKit Node Provisioning Runbook

> **Audience:** ops / on-call engineer provisioning a new Enterprise customer.
> **Time:** ~90 minutes end-to-end, including DNS propagation wait.
> **Frequency in v1:** 1–10 per year (manual is acceptable at this volume).
> **Automation status:** manual today; Terraform/Pulumi automation tracked
> as Phase 2 Enterprise work.

## Why dedicated nodes

Enterprise customers pay **$449.99/mo** for partitioned-data isolation,
1,000-attendee meetings, and 24/7 SLA. The architectural commitment is
that each Enterprise org runs against its **own LiveKit server, its own
Egress workers, its own Redis, and its own S3-compatible bucket**.
Customer audio/video and recordings never share a VM or storage bucket
with another customer.

The shared multi-tenant cluster (Hetzner CCX43, ~$160/mo, used for Free
/ Pro / Business) is **not** used for Enterprise traffic at any point.

---

## 0. Pre-flight checklist

Do not start provisioning until **all** of the following are true. Each
line is an SLA-critical preflight:

- [ ] Signed annual contract on file (Notion → Legal → Enterprise Contracts).
- [ ] Stripe subscription on `enterprise_monthly` price is **active**
      (Dashboard → Customers → search → status: active, not trialing).
- [ ] `organizations` row exists in Appwrite with:
      - `tier_override = 'enterprise'`
      - `commitment_months >= 12`
      - `signup_code` set (so admin can finalize team invite flow)
      - `expires_at` matching contract end date
- [ ] Customer-confirmed region: `eu-central` (Falkenstein), `us-east`
      (Ashburn), or `ap-southeast` (Singapore). Default `eu-central` if
      unstated. Customers in regulated jurisdictions (DE/FR/CH GDPR,
      US-East federal) must explicitly confirm.
- [ ] Customer-confirmed subdomain slug — 3–24 lowercase chars, hyphens
      allowed. e.g. `acme-health` → produces
      `lk-acme-health.deepvoiceai.co`.
- [ ] Recording retention policy agreed in writing (default: 90 days
      auto-purge; some healthcare customers require 7 years).
- [ ] 1Password vault entry created: `Enterprise / lk-<slug>` with
      placeholder fields for the secrets you'll generate below.

## 1. Provision Hetzner infrastructure

### 1.1 VM

```bash
# From the ops workstation with hcloud CLI configured (DVAI-Ops project)
export CUSTOMER_SLUG="acme-health"   # confirmed in §0
export REGION="fsn1"                 # fsn1 (eu-central), ash (us-east), sin (ap-southeast)

hcloud server create \
  --name "lk-${CUSTOMER_SLUG}" \
  --type ccx53 \
  --image ubuntu-24.04 \
  --location "${REGION}" \
  --ssh-key ops-bastion \
  --label tier=enterprise \
  --label customer="${CUSTOMER_SLUG}" \
  --label product=dvai-connect \
  --without-ipv4=false
```

CCX53 spec: 32 vCPU dedicated, 128 GB RAM, 600 GB NVMe, 32 TB traffic.
This is sized for 1,000-attendee rooms + 4 concurrent Egress workers
(each Egress instance needs 4 CPU per the LiveKit guidance).

Record the IPv4 in 1Password as `lk_node_ipv4`.

### 1.2 Object storage for recordings

```bash
hcloud load-balancer-type list  # confirm hcloud object storage availability in region
# At time of writing (2026-06-13) Hetzner Object Storage is in fsn1, hel1, nbg1.
# For ash / sin regions, use Cloudflare R2 (single bucket per customer, region-neutral).
```

For Hetzner Object Storage (fsn1):

```bash
hcloud object-storage bucket create \
  --name "recordings-${CUSTOMER_SLUG}" \
  --location "${REGION}" \
  --acl private
```

Generate access credentials and store in 1Password as `s3_access_key` /
`s3_secret_key` / `s3_endpoint` / `s3_bucket`.

For Cloudflare R2 (ash / sin):

1. CF dashboard → R2 → Create bucket → `dvai-recordings-${CUSTOMER_SLUG}`.
2. Manage API tokens → Create R2 Token → scoped to that one bucket,
   "Object Read & Write".
3. Endpoint: `https://<account_id>.r2.cloudflarestorage.com`.

### 1.3 Firewall

```bash
hcloud firewall create --name "lk-${CUSTOMER_SLUG}-fw"
hcloud firewall add-rule lk-${CUSTOMER_SLUG}-fw --direction in --protocol tcp --port 443
hcloud firewall add-rule lk-${CUSTOMER_SLUG}-fw --direction in --protocol tcp --port 80
hcloud firewall add-rule lk-${CUSTOMER_SLUG}-fw --direction in --protocol tcp --port 7881
hcloud firewall add-rule lk-${CUSTOMER_SLUG}-fw --direction in --protocol udp --port 3478
hcloud firewall add-rule lk-${CUSTOMER_SLUG}-fw --direction in --protocol udp --port 50000-60000
hcloud firewall apply-to-resource lk-${CUSTOMER_SLUG}-fw --type server --server "lk-${CUSTOMER_SLUG}"
```

SSH (port 22) is reachable only from the ops-bastion via Hetzner private
network — never expose 22 to public internet on Enterprise nodes.

## 2. DNS

Two `A` records in Cloudflare (DVAI master zone):

| Subdomain | Type | Target | TTL | Proxy |
|---|---|---|---|---|
| `lk-${CUSTOMER_SLUG}.deepvoiceai.co` | A | `<lk_node_ipv4>` | 300 | DNS only |
| `lk-turn-${CUSTOMER_SLUG}.deepvoiceai.co` | A | `<lk_node_ipv4>` | 300 | DNS only |

Both **must** be DNS-only (gray cloud). Cloudflare proxy on these breaks
both Caddy's Let's Encrypt challenge AND the TURN protocol.

Verify before proceeding:

```bash
host "lk-${CUSTOMER_SLUG}.deepvoiceai.co"
host "lk-turn-${CUSTOMER_SLUG}.deepvoiceai.co"
# Both should return <lk_node_ipv4>.
```

## 3. Generate LiveKit configuration

From the ops workstation:

```bash
docker pull livekit/generate
mkdir -p ~/lk-configs && cd ~/lk-configs
docker run --rm -it -v$PWD:/output livekit/generate
```

Answers to the interactive prompts:

| Prompt | Value |
|---|---|
| Primary domain | `lk-${CUSTOMER_SLUG}.deepvoiceai.co` |
| TURN domain | `lk-turn-${CUSTOMER_SLUG}.deepvoiceai.co` |
| Enable Redis | **yes** (required for Egress coordination) |
| Enable Egress | **yes** |
| Enable Ingress | **no** (we don't currently support RTMP / WHIP) |
| LiveKit API key | press Enter to auto-generate |
| LiveKit API secret | press Enter to auto-generate |

This produces `~/lk-configs/lk-${CUSTOMER_SLUG}.deepvoiceai.co/` with:

- `caddy.yaml`, `docker-compose.yaml`, `livekit.yaml`, `redis.conf`
- `cloud-init.${CUSTOMER_SLUG}.yaml`
- a generated API key (`APIxxxxxxxxxxxxxx`) and secret (`secret_value`)

**Immediately** copy the API key + secret into 1Password
(`livekit_api_key` / `livekit_api_secret`). These are the credentials
the meet app uses to mint participant JWTs and call the LiveKit
server-side API.

## 4. Patch generated config for Egress + S3

Edit `~/lk-configs/lk-${CUSTOMER_SLUG}.deepvoiceai.co/docker-compose.yaml`.
The generator does not wire the Egress S3 destination — add it.

Locate the `egress:` service block and add the following under
`environment:`:

```yaml
    environment:
      - EGRESS_CONFIG_BODY=|
          api_key: <livekit_api_key>          # from §3
          api_secret: <livekit_api_secret>    # from §3
          ws_url: ws://livekit:7880
          redis:
            address: redis:6379
          s3:
            access_key: <s3_access_key>       # from §1.2
            secret: <s3_secret_key>
            endpoint: <s3_endpoint>
            region: <region>                   # eu-central-1 / auto for R2
            bucket: <s3_bucket>
            force_path_style: true             # required for Hetzner OS and R2
          enable_chrome_sandbox: true
    cap_add:
      - SYS_ADMIN
    security_opt:
      - "seccomp=/etc/dvai/chrome-sandboxing-seccomp-profile.json"
    deploy:
      replicas: 4    # tuned for 4 concurrent recordings; bump for higher SLA
```

Download the Chrome seccomp profile to embed in the cloud-init:

```bash
curl -sSL https://raw.githubusercontent.com/livekit/egress/main/chrome-sandboxing-seccomp-profile.json \
  -o ~/lk-configs/chrome-sandboxing-seccomp-profile.json
```

Then under the `write_files:` block in `cloud-init.${CUSTOMER_SLUG}.yaml`,
add an entry that writes this profile to `/etc/dvai/`.

## 5. Boot the VM

```bash
hcloud server reset --image ubuntu-24.04 "lk-${CUSTOMER_SLUG}" \
  --user-data-from-file ~/lk-configs/lk-${CUSTOMER_SLUG}.deepvoiceai.co/cloud-init.${CUSTOMER_SLUG}.yaml
```

(Or for a fresh server creation, pass `--user-data-from-file` to the
original `hcloud server create` in §1.1 and skip this step.)

Wait ~5 minutes for cloud-init to run, then SSH from the bastion:

```bash
ssh root@lk-${CUSTOMER_SLUG}.deepvoiceai.co
systemctl status livekit-docker        # should be active (running)
cd /opt/livekit && docker compose logs --tail=200 caddy | grep "certificate obtained"
```

Look for: `livekit-caddy-1    | {"level":"info","ts":...,"logger":"tls.obtain","msg":"certificate obtained successfully","identifier":"lk-${CUSTOMER_SLUG}.deepvoiceai.co"}`

If TLS issuance fails, the most common causes are: DNS not yet
propagated (re-run `host` from §2), Cloudflare proxy still on (gray it),
or the firewall blocking port 80.

## 6. Smoke test

From the ops workstation:

```bash
# Health
curl -sS https://lk-${CUSTOMER_SLUG}.deepvoiceai.co/
# Expect: 404 (LiveKit doesn't serve a default page)

# WebSocket (requires installing livekit-cli once: npm i -g @livekit/livekit-cli)
livekit-cli room list \
  --url wss://lk-${CUSTOMER_SLUG}.deepvoiceai.co \
  --api-key "<livekit_api_key>" \
  --api-secret "<livekit_api_secret>"
# Expect: empty list, no auth error

# End-to-end test meeting
livekit-cli load-test \
  --url wss://lk-${CUSTOMER_SLUG}.deepvoiceai.co \
  --api-key "<livekit_api_key>" \
  --api-secret "<livekit_api_secret>" \
  --duration 30s --publishers 2 --subscribers 4
# Expect: clean run, no packet loss reported

# Recording test (uses Egress)
livekit-cli start-room-composite-egress \
  --url wss://lk-${CUSTOMER_SLUG}.deepvoiceai.co \
  --api-key "<livekit_api_key>" \
  --api-secret "<livekit_api_secret>" \
  --room load-test \
  --s3-bucket "<s3_bucket>" --s3-key "smoketest/test.mp4"
# Then verify the file lands in your S3 bucket.
```

Delete the test recording from S3 after verification.

## 7. Wire the app side

Update the customer's Appwrite `organizations` row (server-side, via the
admin panel once PR 3e ships, or directly via `node-appwrite` until
then):

```js
await databases.updateRow('dvai-connect', 'organizations', <orgId>, {
  livekit_url: 'wss://lk-${CUSTOMER_SLUG}.deepvoiceai.co',
  livekit_api_key_ref: '1password://Enterprise/lk-${CUSTOMER_SLUG}/livekit_api_key',
  livekit_api_secret_ref: '1password://Enterprise/lk-${CUSTOMER_SLUG}/livekit_api_secret',
  livekit_region: '${REGION}',
  recording_bucket: '<s3_bucket>',
  recording_bucket_endpoint: '<s3_endpoint>',
  recording_retention_days: 90,
});
```

**Code changes required for runtime to use these per-org values**
(tracked separately in the PR 3e admin scope, not yet shipped at time of
runbook authoring 2026-06-13):

- `lib/getLiveKitURL.ts` → new helper `getLiveKitURLForOrg(orgId)` that
  reads `organizations.livekit_url` and falls back to `process.env.LIVEKIT_URL`
  for Free / Pro / Business.
- `app/api/connection-details/route.ts` → resolve `API_KEY` / `API_SECRET`
  from the org's secret refs when tier=enterprise; the current
  process-wide env vars only serve the shared cluster.
- `lib/recording/storage.ts` → resolve recording bucket per org instead
  of the single default bucket.

Until those land, Enterprise customers route through the shared cluster
with their dedicated node sitting unused. **Do not announce go-live to
the customer until all three code paths read per-org config.**

## 8. Monitoring & alerts

### 8.1 Hetzner-side (infrastructure)

- Cloud Monitoring dashboard: filter by label `customer=${CUSTOMER_SLUG}`.
- Alerts (configured in Hetzner Cloud Console):
  - CPU > 80% sustained 10 min
  - Memory > 85% sustained 10 min
  - Outbound network > 800 Mbps sustained 5 min (CCX53 has 1 Gbps shared)
  - Disk usage > 75%

### 8.2 LiveKit-side (application)

LiveKit exposes Prometheus metrics on port 6789 (internal only, accessed
via Hetzner private network from the ops monitoring host). Subscribe the
monitoring host to scrape it and forward to the central Grafana.

Key dashboards to bookmark:

- `livekit_room_participant_total` per room (alert >900 — approaching cap)
- `livekit_egress_available` (alert <2 — Egress capacity)
- `livekit_node_packet_loss` (alert >0.5% — quality degradation)

### 8.3 Customer-facing status

- Add the node to status.deepvoiceai.co as `Enterprise — ${CUSTOMER_SLUG}`
  (private component, visible only to customer's notified contacts).
- Trigger a `customer.enterprise.provisioned` event into Slack #ops so
  the rest of the team knows.

## 9. Customer handoff

Email the customer's admin (template: `templates/enterprise-go-live.eml`):

- Their dedicated LiveKit URL (`wss://lk-${CUSTOMER_SLUG}.deepvoiceai.co`)
- Confirmation that this URL is theirs alone and audio/video data never
  hits a shared server.
- The recording bucket they own (`<s3_bucket>`, region `${REGION}`).
- Recording retention period (90 days default, or contracted value).
- Support channels: dedicated Slack Connect channel + 24/7 phone
  (PagerDuty rotation for Enterprise tier).
- Status page link.

Do **not** send raw API key / secret to the customer — those are
server-side only; participants get short-lived JWTs from the meet app.

## 10. Decommissioning (subscription cancellation)

Triggered when the Stripe `customer.subscription.deleted` webhook fires
on an Enterprise org. The webhook handler (PR 3b) flags the org
`is_active=false` and creates an ops ticket; **do not auto-tear down**.
A human runs this checklist:

- [ ] Confirm with the customer's admin via written email that they want
      teardown to proceed (some renew within 7 days).
- [ ] Confirm recordings are exported or the customer has rejected
      export. Default retention window is 30 days post-cancellation
      regardless of original retention policy.
- [ ] Snapshot the recordings bucket to cold storage:
      ```bash
      hcloud object-storage bucket sync \
        "recordings-${CUSTOMER_SLUG}" \
        "archive-recordings-${CUSTOMER_SLUG}-$(date -u +%Y%m%d)"
      ```
      Set archive bucket lifecycle to delete after 365 days (legal hold
      flag overrides this — coordinate with Legal).
- [ ] Stop and remove the VM:
      ```bash
      hcloud server delete "lk-${CUSTOMER_SLUG}"
      hcloud firewall delete "lk-${CUSTOMER_SLUG}-fw"
      ```
- [ ] Delete DNS records (both `lk-` and `lk-turn-` subdomains).
- [ ] Move the 1Password vault entry to `Enterprise / Archived /` and
      add `decommissioned_at` field.
- [ ] Set the Appwrite `organizations` row to `is_active=false` and
      blank `livekit_url` (so any residual logic falls back to shared
      cluster, though no users should be able to log in past the
      Stripe-revoked sessions).
- [ ] Close the ops ticket with a summary of dates + archive bucket
      location.

## 11. Re-provisioning (returning customer)

If a previously-cancelled customer returns within 12 months:

- Restore from the archive bucket (objects are still in cold storage).
- Re-run §1–§9 with the same `CUSTOMER_SLUG`. DNS records can be
  recreated immediately; certificate issuance is identical to first
  provisioning.
- Append `restored_at` field to the new 1Password vault entry, link to
  the archived one.

---

## Appendix A — Quick reference

| What | Where |
|---|---|
| Hardware spec | Hetzner CCX53 (32 vCPU, 128 GB RAM) |
| Monthly real cost | ~$250 VM + ~$30 storage + ~$15 bandwidth ≈ **$295** |
| Customer monthly price | **$449.99** (Enterprise tier base) |
| Real margin per customer | ~35% gross (before overage and the concurrent-big-room metered fee) |
| Recording storage | Hetzner Object Storage (fsn1) or Cloudflare R2 (ash / sin) |
| TLS | Caddy + Let's Encrypt (automatic) |
| Auth | LiveKit API key + secret, server-minted JWTs (5-min TTL) |
| Source-of-truth | Appwrite `organizations` row + 1Password vault |
| LiveKit version | Pinned in `docker-compose.yaml` — upgrade per §12 |

## Appendix B — Upgrade cadence

LiveKit ships ~monthly. Schedule:

- **Test** the new version against the shared multi-tenant cluster
  first (which has weekly maintenance windows).
- After 2 weeks of clean shared-cluster operation, roll Enterprise nodes
  one at a time during the customer's contracted maintenance window.
- Patch path on each Enterprise node:
  ```bash
  ssh root@lk-${CUSTOMER_SLUG}.deepvoiceai.co
  cd /opt/livekit
  vim docker-compose.yaml    # bump image: livekit/livekit-server:v<X>
  docker compose pull && docker compose up -d
  docker compose logs --tail=100 livekit | grep "started"
  ```
- Notify customer 7 days in advance via the dedicated Slack Connect.

## Appendix C — Open automation work (Phase 2)

Captured here so the manual steps in this runbook become a single
`./provision-enterprise.sh ${CUSTOMER_SLUG} ${REGION}` invocation:

1. **Terraform / Pulumi module** that wraps §1, §2, §6 (DNS via
   Cloudflare provider, VM + firewall + bucket via Hetzner provider).
2. **`livekit/generate` fork** that takes flags instead of interactive
   prompts so it can run in CI.
3. **App-side per-org config resolver** (the three code changes in §7).
   Until this is shipped, Enterprise customers can technically be
   onboarded but won't actually route to their dedicated node.
4. **Decommission script** that follows §10 with `--dry-run` and
   `--confirm` flags. Ops still does the customer-facing email
   confirmation by hand.

Estimated effort: 2-3 engineer-weeks, scheduled when the 4th Enterprise
customer signs (volume justifies the automation cost).
