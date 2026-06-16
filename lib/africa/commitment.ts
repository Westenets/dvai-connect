import 'server-only';
import type Stripe from 'stripe';
import { requireStripe } from '@/lib/stripe';

/**
 * Africa cohort 24-month commitment lock.
 *
 * Implementation strategy (the "4-layer lock"):
 *
 *   1. Stripe Subscription Schedule — the subscription is wrapped in a
 *      Schedule with a single 24-iteration phase. Stripe enforces:
 *      attempts to cancel during the locked phase are rejected at the
 *      API layer.
 *   2. Africa-only Customer Portal configuration — has
 *      subscription_cancel + subscription_update disabled. Customers
 *      who hit the portal can't even see the cancel button.
 *   3. App-side gate — our portal route detects Africa-cohort
 *      subscriptions and routes to the locked portal config above.
 *   4. Webhook-side audit cron (sidelined for follow-up) — periodic
 *      drift check that an Africa subscription still has its Schedule
 *      attached and hasn't been mutated by an over-permissioned
 *      manual ops action.
 *
 * Layer 1 is implemented here. Layer 2 + 3 are in
 * stripe-setup-2026-06-13.mjs and app/api/portal/route.ts. Layer 4 is
 * deferred.
 */

export const AFRICA_COMMITMENT_MONTHS = 24;

export interface WrapAfricaSubscriptionInput {
    subscriptionId: string;
    signupCode: string;
    /** ISO-8601 timestamp when the commitment phase ends.
     *  Pass null to let the function compute it as
     *  AFRICA_COMMITMENT_MONTHS from the subscription's current period
     *  start. We accept the computed value back from the caller because
     *  the same string is written to the subscriptions Appwrite row. */
    commitmentEndsAt: string | null;
}

export interface WrapAfricaSubscriptionResult {
    scheduleId: string;
    /** The computed (or passed-through) commitment end as an ISO string. */
    commitmentEndsAt: string;
}

/**
 * Wrap an existing Stripe subscription in a Subscription Schedule with
 * a 24-iteration commitment phase. After the phase completes the
 * schedule "releases" (end_behavior) and the subscription continues
 * unscheduled, at which point the customer may cancel via the
 * standard Customer Portal flow.
 *
 * Idempotent on the subscription side: if the subscription already
 * has a schedule attached, returns that schedule id without modifying
 * anything.
 */
export async function wrapAfricaSubscriptionWithCommitment(
    input: WrapAfricaSubscriptionInput,
): Promise<WrapAfricaSubscriptionResult> {
    const stripe = requireStripe();
    const sub = await stripe.subscriptions.retrieve(input.subscriptionId);

    if (sub.schedule) {
        const scheduleId = typeof sub.schedule === 'string' ? sub.schedule : sub.schedule.id;
        return {
            scheduleId,
            commitmentEndsAt: input.commitmentEndsAt ?? computeCommitmentEnd(sub),
        };
    }

    // Step 1: capture existing items as a plain array before any mutation.
    const items = sub.items.data.map((item) => ({
        price: item.price.id,
        quantity: item.quantity ?? 1,
    }));

    // Step 2: create the schedule from the existing subscription. By
    // default Stripe constructs a single-phase schedule that mirrors
    // the current state. We then update it to add the iteration lock.
    const created = await stripe.subscriptionSchedules.create({
        from_subscription: sub.id,
    });

    // Step 3: lock the phase to AFRICA_COMMITMENT_MONTHS months via
    // the `duration` param (replaces the deprecated `iterations`), and
    // set end_behavior so the subscription continues (releases) after.
    const computedEnd = input.commitmentEndsAt ?? computeCommitmentEnd(sub);
    const updated = await stripe.subscriptionSchedules.update(created.id, {
        end_behavior: 'release',
        phases: [
            {
                items,
                duration: { interval: 'month', interval_count: AFRICA_COMMITMENT_MONTHS },
                metadata: {
                    dvai_cohort_lock: 'true',
                    dvai_africa_cohort_code: input.signupCode,
                    dvai_commitment_months: String(AFRICA_COMMITMENT_MONTHS),
                },
            },
        ],
        metadata: {
            dvai_africa_cohort_code: input.signupCode,
        },
    });

    return { scheduleId: updated.id, commitmentEndsAt: computedEnd };
}

function computeCommitmentEnd(sub: Stripe.Subscription): string {
    // API 2026-05-27.dahlia moved current_period_* from Subscription to
    // SubscriptionItem (each item can now have its own billing period).
    // We always create single-item subscriptions, so item 0 holds the
    // canonical period.
    const startEpoch = sub.items.data[0]?.current_period_start ?? Math.floor(Date.now() / 1000);
    // Approximate end at start + 30 days/month for record-keeping; the
    // actual phase end is enforced by Stripe's billing engine via the
    // `duration` param on the schedule phase.
    const endEpoch = startEpoch + AFRICA_COMMITMENT_MONTHS * 30 * 86400;
    return new Date(endEpoch * 1000).toISOString();
}
