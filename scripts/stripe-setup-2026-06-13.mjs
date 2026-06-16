#!/usr/bin/env node
/**
 * Stripe Sandbox Setup — 2026-06-13
 *
 * Idempotent setup for the dvai-meet pricing model. Creates / updates:
 *   - 5 Products (Free / Pro Africa / Pro Mainstream / Business / Enterprise)
 *   - 5 base monthly recurring Prices
 *   - 2 Billing Meters (business_extra_hours, concurrent_big_room_session)
 *   - 2 metered Prices linked to those meters
 *   - 1 Webhook Endpoint pointed at the production URL
 *   - 2 Customer Portal Configurations (default + Africa with cancel disabled)
 *
 * Idempotency uses `metadata.dvai_key` on Products and `lookup_key` on
 * Prices — re-running the script is safe and updates display fields
 * but never duplicates billing items.
 *
 * USAGE:
 *   STRIPE_SECRET_KEY=sk_test_... \\
 *   STRIPE_WEBHOOK_TARGET_URL=https://connect.deepvoiceai.co/api/webhooks/stripe \\
 *   STRIPE_PORTAL_RETURN_URL=https://connect.deepvoiceai.co/settings \\
 *     node scripts/stripe-setup-2026-06-13.mjs
 *
 * Pulls keys from sandbox. After it runs, copy the printed env-var block
 * into your meet app's .env.local (and the same env vars into your
 * deploy host's secret manager).
 *
 * Requires the `stripe` Node SDK to be installed in the project (it gets
 * reused by Task 1 PR 3b — webhook handler, Embedded Checkout, etc.).
 */

import Stripe from 'stripe';

const SECRET = process.env.STRIPE_SECRET_KEY;
const WEBHOOK_URL = process.env.STRIPE_WEBHOOK_TARGET_URL;
const PORTAL_RETURN_URL =
    process.env.STRIPE_PORTAL_RETURN_URL ?? 'https://connect.deepvoiceai.co/settings';

if (!SECRET) {
    console.error(
        '[stripe-setup] STRIPE_SECRET_KEY is required. ' +
            'Get it from Dashboard → Developers → API keys (use the sk_test_... key for sandbox).',
    );
    process.exit(1);
}
if (!WEBHOOK_URL) {
    console.error(
        '[stripe-setup] STRIPE_WEBHOOK_TARGET_URL is required. ' +
            'For dev, use the URL you ran with `stripe listen --forward-to <url>` ' +
            '(or run with --skip-webhook to skip).',
    );
    process.exit(1);
}

const stripe = new Stripe(SECRET, { apiVersion: '2026-05-27.dahlia' });

// ---------- Spec ----------

// Product names are prefixed `DVAI Connect — ` so they're disambiguated
// in the Stripe dashboard from sibling DVAI products (DVAI Bridge, etc.).
const PRODUCT_PREFIX = 'DVAI Connect — ';

const PRODUCTS = [
    {
        dvaiKey: 'free',
        name: `${PRODUCT_PREFIX}Free`,
        description:
            '$0. 40-minute meetings, up to 10 participants, no recording. E2EE included on every plan.',
        price: null, // No paid Stripe price for Free tier
        lookupKey: null,
    },
    {
        dvaiKey: 'pro_africa',
        name: `${PRODUCT_PREFIX}Pro (Africa Cohort)`,
        description:
            '$14.99/mo per member. 1-hour meetings, up to 100 participants, cloud recording, 1 meeting agent, notetaking. 24-month minimum commitment. Available only to Africa SAV / BAM / PAIN / TEF cohorts by special arrangement.',
        price: 1499, // cents
        lookupKey: 'pro_africa_monthly',
    },
    {
        dvaiKey: 'pro',
        name: `${PRODUCT_PREFIX}Pro`,
        description:
            '$18.99/mo per org. 1-hour meetings, up to 100 participants, cloud recording, 1 meeting agent, notetaking. E2EE on every plan.',
        price: 1899,
        lookupKey: 'pro_monthly',
    },
    {
        dvaiKey: 'business',
        name: `${PRODUCT_PREFIX}Business`,
        description:
            '$48.99/mo per org. 1-hour meetings (extra 1-hour blocks at $35/hr), up to 300 participants, cloud recording, 1 meeting agent, notetaking, custom branding, admin dashboard.',
        price: 4899,
        lookupKey: 'business_monthly',
    },
    {
        dvaiKey: 'enterprise',
        name: `${PRODUCT_PREFIX}Enterprise`,
        description:
            '$449.99/mo per org. 3-hour meetings, up to 1,000 participants, cloud recording, 1 meeting agent, notetaking, dedicated LiveKit node, partitioned data security, 24/7 support, custom branding, admin dashboard. Additional fee per concurrent 1,000-attendee session.',
        price: 44999,
        lookupKey: 'enterprise_monthly',
    },
];

const METERS = [
    {
        displayName: 'Business Hourly Overage',
        eventName: 'business_extra_hours',
        meterKey: 'business_extra_hours',
        priceLookupKey: 'business_extra_hour',
        unitAmount: 3500, // $35 / hour overage on Business tier
        meteredProductName: `${PRODUCT_PREFIX}Business — Extra Hour`,
        productDvaiKey: 'business_overage_hour',
    },
    {
        displayName: 'Enterprise Concurrent Big-Room Session',
        eventName: 'concurrent_big_room_session',
        meterKey: 'concurrent_big_room_session',
        priceLookupKey: 'enterprise_concurrent_big_room',
        unitAmount: 5000, // $50 / session as a sandbox default; admin-modifiable
        meteredProductName: `${PRODUCT_PREFIX}Enterprise — Concurrent Big-Room Fee`,
        productDvaiKey: 'enterprise_big_room_session',
    },
];

const WEBHOOK_EVENTS = [
    'checkout.session.completed',
    'invoice.paid',
    'invoice.payment_failed',
    'customer.subscription.created',
    'customer.subscription.updated',
    'customer.subscription.deleted',
    'customer.subscription.trial_will_end',
];

const PORTAL_FEATURES_DEFAULT = {
    payment_method_update: { enabled: true },
    customer_update: {
        enabled: true,
        allowed_updates: ['email', 'tax_id', 'address', 'name'],
    },
    invoice_history: { enabled: true },
    subscription_cancel: {
        enabled: true,
        mode: 'at_period_end',
        cancellation_reason: {
            enabled: true,
            options: ['too_expensive', 'missing_features', 'switched_service', 'unused', 'other'],
        },
    },
    subscription_update: {
        enabled: true,
        default_allowed_updates: ['quantity'],
        proration_behavior: 'create_prorations',
        products: [], // populated after Pro / Business / Enterprise prices exist
    },
};

// ---------- Helpers ----------

async function findProductByDvaiKey(dvaiKey) {
    const all = await stripe.products.search({
        query: `metadata['dvai_key']:'${dvaiKey}'`,
    });
    return all.data[0] ?? null;
}

async function findPriceByLookupKey(lookupKey) {
    const all = await stripe.prices.list({ lookup_keys: [lookupKey], limit: 1 });
    return all.data[0] ?? null;
}

async function ensureProduct({ dvaiKey, name, description }) {
    const existing = await findProductByDvaiKey(dvaiKey);
    if (existing) {
        const updated = await stripe.products.update(existing.id, {
            name,
            description,
        });
        console.log(`  · product ${dvaiKey} (${updated.id}) updated`);
        return updated;
    }
    const created = await stripe.products.create({
        name,
        description,
        metadata: { dvai_key: dvaiKey },
    });
    console.log(`  + product ${dvaiKey} (${created.id}) created`);
    return created;
}

async function ensureBasePrice(product, { lookupKey, price }) {
    if (!lookupKey || price === null) return null;
    const existing = await findPriceByLookupKey(lookupKey);
    if (existing && existing.product === product.id && existing.unit_amount === price) {
        console.log(`  · price ${lookupKey} (${existing.id}) already correct`);
        return existing;
    }
    // Stripe doesn't allow editing an active recurring price's amount. If
    // it exists but doesn't match, deactivate it and create a new one,
    // transferring the lookup_key.
    if (existing && existing.active) {
        await stripe.prices.update(existing.id, {
            lookup_key: null,
            active: false,
        });
        console.log(`  ~ price ${lookupKey} (${existing.id}) deactivated (amount changed)`);
    }
    const created = await stripe.prices.create({
        product: product.id,
        unit_amount: price,
        currency: 'usd',
        recurring: { interval: 'month' },
        tax_behavior: 'exclusive',
        lookup_key: lookupKey,
        transfer_lookup_key: true,
    });
    console.log(`  + price ${lookupKey} (${created.id}) created`);
    return created;
}

async function ensureMeter({ displayName, eventName, meterKey }) {
    // List existing meters and check by event_name.
    const all = await stripe.billing.meters.list({ limit: 100 });
    const existing = all.data.find((m) => m.event_name === eventName);
    if (existing) {
        console.log(`  · meter ${meterKey} (${existing.id}) already exists`);
        return existing;
    }
    const created = await stripe.billing.meters.create({
        display_name: displayName,
        event_name: eventName,
        default_aggregation: { formula: 'sum' },
        customer_mapping: {
            event_payload_key: 'stripe_customer_id',
            type: 'by_id',
        },
        value_settings: {
            event_payload_key: 'value',
        },
    });
    console.log(`  + meter ${meterKey} (${created.id}) created`);
    return created;
}

async function ensureMeteredPrice(product, meter, { priceLookupKey, unitAmount }) {
    const existing = await findPriceByLookupKey(priceLookupKey);
    if (existing && existing.product === product.id && existing.unit_amount === unitAmount) {
        console.log(`  · metered price ${priceLookupKey} (${existing.id}) already correct`);
        return existing;
    }
    if (existing && existing.active) {
        await stripe.prices.update(existing.id, {
            lookup_key: null,
            active: false,
        });
        console.log(`  ~ metered price ${priceLookupKey} (${existing.id}) deactivated (amount changed)`);
    }
    const created = await stripe.prices.create({
        product: product.id,
        unit_amount: unitAmount,
        currency: 'usd',
        recurring: {
            interval: 'month',
            usage_type: 'metered',
            meter: meter.id,
        },
        tax_behavior: 'exclusive',
        lookup_key: priceLookupKey,
        transfer_lookup_key: true,
    });
    console.log(`  + metered price ${priceLookupKey} (${created.id}) created`);
    return created;
}

async function ensureWebhookEndpoint() {
    const all = await stripe.webhookEndpoints.list({ limit: 100 });
    const existing = all.data.find((w) => w.url === WEBHOOK_URL);
    if (existing) {
        const updated = await stripe.webhookEndpoints.update(existing.id, {
            enabled_events: WEBHOOK_EVENTS,
            description: 'DVAI Connect (managed by stripe-setup-2026-06-13.mjs)',
        });
        console.log(`  · webhook endpoint (${updated.id}) for ${WEBHOOK_URL} already exists`);
        return { endpoint: updated, secret: null };
    }
    const created = await stripe.webhookEndpoints.create({
        url: WEBHOOK_URL,
        enabled_events: WEBHOOK_EVENTS,
        description: 'DVAI Connect (managed by stripe-setup-2026-06-13.mjs)',
    });
    console.log(`  + webhook endpoint (${created.id}) created`);
    console.log(`    └ signing secret: ${created.secret}`);
    return { endpoint: created, secret: created.secret };
}

async function ensurePortalConfiguration({ key, isAfricaCohort, productsWithPrices }) {
    // Search existing configurations by metadata.
    const all = await stripe.billingPortal.configurations.list({ limit: 100 });
    const existing = all.data.find((c) => c.metadata?.dvai_key === key);
    const features = JSON.parse(JSON.stringify(PORTAL_FEATURES_DEFAULT));
    if (isAfricaCohort) {
        // Africa cohort is bound to one SKU + 24-month commit. Disable
        // both subscription changes AND in-portal cancellation. Customers
        // can still update payment method, billing details, and view
        // invoices.
        features.subscription_cancel = { enabled: false };
        features.subscription_update = { enabled: false };
    } else {
        // Stripe requires explicit price IDs per product (not empty arrays).
        features.subscription_update.products = productsWithPrices;
    }
    if (existing) {
        const updated = await stripe.billingPortal.configurations.update(existing.id, {
            business_profile: {
                headline: isAfricaCohort
                    ? 'Manage your DVAI Connect Pro (Africa Cohort) subscription'
                    : 'Manage your DVAI Connect subscription',
            },
            features,
            default_return_url: PORTAL_RETURN_URL,
            metadata: { dvai_key: key },
        });
        console.log(`  · portal config ${key} (${updated.id}) updated`);
        return updated;
    }
    const created = await stripe.billingPortal.configurations.create({
        business_profile: {
            headline: isAfricaCohort
                ? 'Manage your Pro Africa cohort subscription'
                : 'Manage your dvai-meet subscription',
        },
        features,
        default_return_url: PORTAL_RETURN_URL,
        metadata: { dvai_key: key },
    });
    console.log(`  + portal config ${key} (${created.id}) created`);
    return created;
}

// ---------- Run ----------

async function main() {
    console.log(`Connected to Stripe ${SECRET.startsWith('sk_test_') ? 'TEST mode' : 'LIVE mode'}\n`);

    console.log('Products + base prices');
    const productsByKey = {};
    const pricesByKey = {};
    for (const spec of PRODUCTS) {
        const product = await ensureProduct(spec);
        productsByKey[spec.dvaiKey] = product;
        if (spec.price !== null) {
            const price = await ensureBasePrice(product, spec);
            pricesByKey[spec.dvaiKey] = price;
        }
    }

    console.log('\nBilling meters + metered prices');
    const metersByKey = {};
    const meteredPricesByKey = {};
    for (const spec of METERS) {
        const meter = await ensureMeter(spec);
        metersByKey[spec.meterKey] = meter;
        const meteredProduct = await ensureProduct({
            dvaiKey: spec.productDvaiKey,
            name: spec.meteredProductName,
            description: `Metered usage tied to the ${spec.meterKey} meter.`,
        });
        const price = await ensureMeteredPrice(meteredProduct, meter, spec);
        meteredPricesByKey[spec.priceLookupKey] = price;
    }

    console.log('\nWebhook endpoint');
    const { endpoint: webhookEndpoint, secret: webhookSecret } = await ensureWebhookEndpoint();

    console.log('\nCustomer Portal configurations');
    // Default portal lets paid customers self-serve plan changes between
    // Pro / Business / Enterprise. Africa Cohort is intentionally NOT
    // included — customers reach that SKU via an admin-issued signup code,
    // not by self-upgrading.
    const defaultProductsWithPrices = ['pro', 'business', 'enterprise']
        .map((k) =>
            productsByKey[k] && pricesByKey[k]
                ? { product: productsByKey[k].id, prices: [pricesByKey[k].id] }
                : null,
        )
        .filter(Boolean);
    const portalDefault = await ensurePortalConfiguration({
        key: 'default',
        isAfricaCohort: false,
        productsWithPrices: defaultProductsWithPrices,
    });
    const portalAfrica = await ensurePortalConfiguration({
        key: 'africa',
        isAfricaCohort: true,
        productsWithPrices: [], // unused — subscription_update is disabled for Africa
    });

    // ---------- Output env block ----------
    console.log('\n=================================================');
    console.log('Setup complete. Add the following to .env.local:');
    console.log('=================================================');
    console.log(`# Stripe API key`);
    console.log(`STRIPE_SECRET_KEY=${SECRET}`);
    if (webhookSecret) {
        console.log(`# Webhook signing secret (preserve from output — Stripe only shows it once)`);
        console.log(`STRIPE_WEBHOOK_SECRET=${webhookSecret}`);
    } else {
        console.log(
            `# Webhook signing secret — already exists; fetch via Dashboard → Developers → Webhooks → click endpoint → "Reveal" signing secret`,
        );
        console.log(`# STRIPE_WEBHOOK_SECRET=whsec_...`);
    }
    console.log(`# Webhook endpoint id (for reference)`);
    console.log(`STRIPE_WEBHOOK_ENDPOINT_ID=${webhookEndpoint.id}`);
    console.log(``);
    console.log(`# Tier Price IDs (used by lib/pricing/tiers.ts via stripePriceIdEnvVar)`);
    for (const k of ['pro_africa', 'pro', 'business', 'enterprise']) {
        const p = pricesByKey[k];
        if (p) console.log(`STRIPE_PRICE_ID_${k.toUpperCase()}=${p.id}`);
    }
    console.log(``);
    console.log(`# Metered price IDs`);
    console.log(`STRIPE_PRICE_ID_BUSINESS_EXTRA_HOUR=${meteredPricesByKey.business_extra_hour?.id ?? ''}`);
    console.log(
        `STRIPE_PRICE_ID_ENTERPRISE_BIG_ROOM=${meteredPricesByKey.enterprise_concurrent_big_room?.id ?? ''}`,
    );
    console.log(``);
    console.log(`# Billing meter ids (referenced in app/api/livekit/webhook + meeting-end handler)`);
    console.log(`STRIPE_METER_BUSINESS_EXTRA_HOURS=${metersByKey.business_extra_hours?.id ?? ''}`);
    console.log(`STRIPE_METER_CONCURRENT_BIG_ROOM=${metersByKey.concurrent_big_room_session?.id ?? ''}`);
    console.log(``);
    console.log(`# Customer Portal configurations`);
    console.log(`STRIPE_PORTAL_CONFIG_DEFAULT=${portalDefault.id}`);
    console.log(`STRIPE_PORTAL_CONFIG_AFRICA=${portalAfrica.id}`);
    console.log(`=================================================`);
    console.log('\nNext steps:');
    console.log('  1. Copy the env block into your .env.local (and your prod host secret manager).');
    console.log('  2. Enable Stripe Tax in Dashboard → Tax → Settings (one-time, sandbox is free).');
    console.log('  3. (Optional) Enable Adaptive Pricing in Dashboard → Settings → Currency for EUR/GBP/INR display.');
    console.log('  4. Confirm the webhook endpoint shows up at Dashboard → Developers → Webhooks.');
    console.log('  5. For local dev forwarding: `stripe listen --forward-to localhost:3000/api/webhooks/stripe` (use the printed whsec_... for STRIPE_WEBHOOK_SECRET in local-dev only).');
}

main().catch((err) => {
    console.error('\nSetup FAILED:', err?.message ?? err);
    if (err?.raw) console.error('raw:', JSON.stringify(err.raw, null, 2));
    process.exit(1);
});
