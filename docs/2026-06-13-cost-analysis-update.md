# Cost & Pricing Analysis — 2026-06-13 Update

> **Companion to** `docs/dvai-connect-cost-and-pricing-analysis.docx`.
> The infrastructure benchmarks, market context, multi-tenancy strategy,
> and operational cost components in the original docx remain valid.
> This update supersedes the **§ Recommended pricing**, **§ Realistic
> blended cost per user/month**, **§ Real-world growth scenarios**,
> **§ Why these prices defended individually**, and the STT-specific
> sections of the original.

## What changed

1. **Pricing replaced with Tab 2 of the 2026-06-13 source MD.** New SKUs:
   `$0 Free / $14.99 Pro Africa per-member / $18.99 Pro Mainstream per-org /
$48.99 Business per-org / $449.99 Enterprise per-org`.
2. **Team tier removed entirely.** No `$20/seat` middle SKU. Pro
   Mainstream is the entry paid tier.
3. **Pro split into two SKUs.** Pro Africa is a cohort-restricted
   per-member subscription (24-month commitment, partner program for
   SAV/BAM/PAIN/TEF cohorts). Pro Mainstream is the standard per-org
   subscription anyone can buy.
4. **Deepgram / cloud STT removed from the product entirely.** The
   privacy MOAT extends to transcription: audio never leaves the device.
   Local Whisper is the primary; Web Speech API is the fallback when
   local can't run. No cloud STT line items in the cost model anymore.
5. **Dedicated LiveKit node for Enterprise is now real (not label-only).**
   Per-customer LiveKit deployment, $250+/month real infrastructure cost
   per Enterprise contract.
6. **Apple Intelligence backend on iOS 26+** (Capacitor Phase 1 of the
   mobile ADR). iOS 15.4–25 users get AI features disabled with a
   user-facing explainer.
7. **Hourly overage and concurrent big-room fees are admin-modifiable**
   from the panel; defaults $35/hr and TBD respectively.

---

## Cost components — refresher (with STT removed)

The original docx's operational-cost table stands, MINUS the cloud STT
line item:

| Cost component                                                  | Per-tier estimate (per month)                                                    |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Compute share (Hetzner CCX43 base + CCX53 Enterprise dedicated) | Free ~$0.05, Pro $2, Business $5, Enterprise $25–50 (with multi-tenancy savings) |
| ~~Cloud STT (Deepgram Nova-3)~~                                 | ~~$0.26/hr~~ — **REMOVED**                                                       |
| Stripe fees                                                     | Pro $0.88, Business $1.16, Enterprise $11.90 per renewal                         |
| Recording storage                                               | Pro $0.60, Business $1.50, Enterprise $5 (Hetzner block storage)                 |
| Email + notifications                                           | $0.10 – $0.30/user/month                                                         |
| Monitoring (NewRelic / Datadog)                                 | $50–150/month flat                                                               |
| Compliance tooling (Vanta / Drata)                              | $1,000–3,000/month flat                                                          |
| SOC2 Type II audit                                              | $15K–30K/year amortized                                                          |
| CDN / DNS / SSL                                                 | ~$50/month flat                                                                  |
| Customer support tooling                                        | $74–250/month flat                                                               |

## Realistic blended cost per user/month (UPDATED — no STT)

The STT line drops out entirely. New per-user/month costs at the
expected operational scale:

| Tier                     | Compute                    | Storage | Stripe | Overhead | **Total**   | Notes                                                               |
| ------------------------ | -------------------------- | ------- | ------ | -------- | ----------- | ------------------------------------------------------------------- |
| Free                     | $0.05                      | $0      | $0     | $0.05    | **$0.10**   | Was $0.23 with STT trial; drops with STT removed.                   |
| Pro Africa (per member)  | $1.50                      | $0.50   | $0.58  | $0.50    | **$3.08**   | $14.99/mo per member → 79% margin.                                  |
| Pro Mainstream (per org) | $2.00                      | $0.60   | $0.88  | $1.00    | **$4.48**   | $18.99/mo per org → 76% margin.                                     |
| Business (per org)       | $5.00                      | $1.50   | $1.16  | $1.00    | **$8.66**   | $48.99/mo per org → 82% margin.                                     |
| Enterprise (per org)     | $250 (real dedicated node) | $5      | $11.90 | $2.00    | **$268.90** | $449.99/mo per org → **40% margin** (real isolation has real cost). |

Notes:

- Enterprise margin drops materially with the real-dedicated-node decision
  (was 50–70% in the prior label-only model). $268/month real infra cost +
  the $250 base CCX53 + overhead. At $449.99/month list, gross margin is
  ~40%. The absolute dollar profit per Enterprise customer is still ~$180/month;
  still attractive but the cushion is thinner. **Plan**: move toward
  pre-scheduled-node-spin-up automation (per the original docx's
  "Internal Orchestrator" To-Do) to push utilization on the CCX53 node from
  one customer per node to multi-customer-per-node-with-isolation-via-tenant-key.
  When that lands, Enterprise margin climbs back to 60-70%.

## Recommended pricing — LOCKED (Tab 2)

| Tier               | Monthly         | Min seats | Worst-case cost | Margin        | Sales motion                         |
| ------------------ | --------------- | --------- | --------------- | ------------- | ------------------------------------ |
| **Free**           | $0              | 1         | $0.10           | (loss leader) | Self-serve                           |
| **Pro Africa**     | $14.99 / member | 1         | $3.08 / member  | 79%           | Self-serve (cohort-gated invite URL) |
| **Pro Mainstream** | $18.99 / org    | 1         | $4.48 / org     | 76%           | Self-serve                           |
| **Business**       | $48.99 / org    | 1         | $8.66 / org     | 82%           | Sales-assisted                       |
| **Enterprise**     | $449.99 / org   | 1         | $268.90 / org   | 40%           | Sales-led, annual only               |

## Real-world growth scenarios (UPDATED with Tab 2 pricing)

### Scenario A — Starting out (early growth, 500 free + small paid base)

User base: 500 Free, 20 Pro Mainstream, 5 Business, 0 Enterprise.

| Line item                                  | Calculation            | Monthly          |
| ------------------------------------------ | ---------------------- | ---------------- |
| Pro Mainstream                             | 20 × $18.99            | $380             |
| Business                                   | 5 × $48.99             | $245             |
| **Revenue**                                |                        | **$625**         |
| Base cluster                               | Hetzner CCX43          | $160             |
| Fixed (DB / LB / Auth)                     | flat                   | $30              |
| Storage (paid users only)                  | ~25 orgs × $1          | $25              |
| Stripe fees                                | 20 × $0.88 + 5 × $1.16 | $24              |
| Email + monitoring + CDN + support         | flat                   | $200             |
| Compliance (deferred until 1st Enterprise) | —                      | $0               |
| **Cost**                                   |                        | **$439**         |
| **Net profit**                             | $625 − $439            | **$186 / month** |

Margin ≈ 30% at this stage. Tighter than the previous model because the
Team tier ($20/seat × 5 seats × 5 customers = $500/mo) is gone. Make this
up with mass-market Pro Mainstream volume.

### Scenario B — Scaling up

User base: 2,000 Free, 100 Pro Mainstream, 50 Pro Africa, 20 Business,
2 Enterprise.

| Line item                          | Calculation       | Monthly            |
| ---------------------------------- | ----------------- | ------------------ |
| Pro Mainstream                     | 100 × $18.99      | $1,899             |
| Pro Africa                         | 50 × $14.99       | $750               |
| Business                           | 20 × $48.99       | $980               |
| Enterprise                         | 2 × $449.99       | $900               |
| **Revenue**                        |                   | **$4,529**         |
| Base cluster + overflow            | 2 × CCX43         | $320               |
| Enterprise dedicated nodes         | 2 × CCX53         | $500               |
| Fixed                              | flat              | $30                |
| Storage                            | ~170 orgs × $1.50 | $255               |
| Stripe fees                        | various           | $250               |
| Email + monitoring + CDN + support | scaled            | $400               |
| Compliance (Vanta active)          | flat              | $1,500             |
| **Cost**                           |                   | **$3,255**         |
| **Net profit**                     | $4,529 − $3,255   | **$1,274 / month** |

Margin ≈ 28%. Enterprise dedicated-node costs eat into the margin here.
At this stage the compliance tooling investment is also fully active in
preparation for SOC2 Type II audit.

### Scenario C — High scale

User base: 10,000 Free, 500 Pro Mainstream, 500 Pro Africa, 100 Business,
10 Enterprise. Concurrent big-room overage on ~5% of Enterprise meetings.

| Line item                            | Calculation                        | Monthly             |
| ------------------------------------ | ---------------------------------- | ------------------- |
| Pro Mainstream                       | 500 × $18.99                       | $9,495              |
| Pro Africa                           | 500 × $14.99                       | $7,495              |
| Business                             | 100 × $48.99                       | $4,899              |
| Enterprise                           | 10 × $449.99                       | $4,500              |
| Business hourly overage              | est. 10% of customers exceed 60min | $1,000              |
| Enterprise concurrent big-room       | est. 5% × admin-set rate           | $500                |
| **Revenue**                          |                                    | **$27,889**         |
| Multi-tenant cluster                 | 10K+ users                         | $1,200              |
| Enterprise dedicated nodes           | 10 × CCX53                         | $2,500              |
| Bandwidth + DB                       | overage                            | $300                |
| Storage                              | ~1,100 orgs × $1.50                | $1,650              |
| Stripe fees                          | various                            | $1,300              |
| Email + monitoring + CDN + support   | scaled                             | $1,000              |
| Compliance (Drata + audit amortized) | flat                               | $3,500              |
| **Cost**                             |                                    | **$11,450**         |
| **Net profit**                       | $27,889 − $11,450                  | **$16,439 / month** |

Margin ≈ 59%. Once compliance investment is amortized over ~1,100 paid
customers and the Enterprise tier's absolute dollar contribution is
material, margins recover.

Annualized ARR ≈ $335K at this stage.

## Why these prices — defended individually (UPDATED)

### Free at $0

Same loss-leader rationale as before. Per-user cost drops to ~$0.10/mo
with STT removed (was $0.23 with the 30-min trial). 10K free users now
cost ~$1K/mo total — covered by ~50 Pro Mainstream users (3-5%
conversion still puts us above the cost-coverage threshold).

### Pro Africa at $14.99 per member

Concession pricing for cohort programs (SAV/BAM/PAIN/TEF). Per-member
(not per-org) so 100 members of a cohort = 100 × $14.99 = $1,499/month
in MRR from that one partnership. 24-month commit means $35,975 in
contracted ARR per 100-member cohort.

### Pro Mainstream at $18.99 per org

Above Zoom Pro ($14.99) — premium positioning justified by E2EE on every
plan + always-on-device AI. Sweet spot for the privacy-conscious
individual professional or small team.

### Business at $48.99 per org

Below the typical $30-60/seat Business SaaS tier (because we charge flat
per-org, not per-seat). Trades per-seat revenue for higher conversion
volume in the SMB segment. Custom branding + admin dashboard + hourly
overage capture from larger meetings make up the per-seat-revenue
shortfall.

### Enterprise at $449.99 per org + dedicated node

Real per-customer LiveKit deployment. Annual contracts only ($5,400/yr
list, deals typically negotiate to $5K-15K/yr with seat / usage
commitments). 24/7 support, SOC2 / HIPAA compliance, custom branding,
admin dashboard, dedicated infrastructure with partitioned data
security. The 40% margin is acceptable for v1; the orchestrator
automation work moves it back to 60-70% in year 2.

## Key risks (UPDATED)

The risk list from the original docx still applies. Two additional risks
from the 2026-06-13 changes:

1. **Pro Africa cohort scaling.** Per-member pricing scales linearly with
   cohort size, which is great for revenue but means we need the seat-cap
   enforcement working perfectly. A leak (someone signs up after seats
   are exhausted) is per-member revenue loss, not per-org. Test this
   mechanism rigorously before partner launches.
2. **Enterprise margin compression with real dedicated nodes.** The
   prior label-only-with-quota approach was 50-70% margin; real
   per-customer infrastructure drops it to 40% in v1. Plan: ship the
   orchestrator automation in year 2 to amortize CCX53 cost across
   multiple Enterprise customers per node (with tenant-key data
   isolation). Until then, manual ops time per Enterprise customer is
   the bottleneck on Enterprise tier scale.

## What's next

- Apply the new pricing to Stripe (set up products + prices at the new
  values + the four Africa cohort product variants).
- Update the public-facing pricing page copy with the Tab 2 numbers and
  the hero "We cannot see what's said in your meetings."
- Refresh the original docx with these numbers when time permits. The
  generator script is at `C:/Users/DK/AppData/Local/Temp/docx-gen-win/`
  (may have been cleaned up; re-create from `generate.js` history if
  needed).
