#!/usr/bin/env node
/**
 * Appwrite migration: 2026-06-13
 * Creates 6 new collections for the pricing + admin panel work.
 *
 *   subscriptions   — per-user Stripe subscription state mirror
 *   stripe_events   — webhook idempotency log
 *   organizations   — cohort / signup-code primitive (Africa cohorts + future)
 *   active_rooms    — live LiveKit room state mirror for admin monitor
 *   session_logs    — per-join IP + UA audit log
 *   org_branding    — per-org branding (Business / Enterprise tiers)
 *
 * Permissions: NONE at the collection level. All access goes through
 * server-side API routes that authenticate with APPWRITE_API_KEY. This
 * is safer than relying on document-security at v1 — we can tighten
 * (or open up specific collections like `pricing_tiers`) once the admin
 * panel ships and we have concrete read patterns.
 *
 * IDEMPOTENT: re-running is safe. The script catches the "already exists"
 * error from each createCollection / createAttribute / createIndex call
 * and continues. To re-create from scratch, delete the collections in
 * the Appwrite Console first.
 *
 * USAGE:
 *   APPWRITE_API_KEY=<server_api_key> \\
 *   NEXT_PUBLIC_APPWRITE_ENDPOINT=https://api.mega-voice-command.com/v1 \\
 *   NEXT_PUBLIC_APPWRITE_PROJECT=mvc-auth \\
 *   APPWRITE_DATABASE_ID=dvai-connect \\
 *     node scripts/appwrite-migrate-2026-06-13.mjs
 *
 * The first three env vars match the .env.local in this repo, so an
 * easier invocation is:
 *
 *   set -a; source .env.local; set +a; \\
 *   APPWRITE_API_KEY=<server_api_key> \\
 *     node scripts/appwrite-migrate-2026-06-13.mjs
 *
 * APPWRITE_API_KEY is NOT in .env.local — it's the Appwrite admin/server
 * API key with scope "databases.write" (and "collections.write",
 * "attributes.write", "indexes.write" — typically all granted in one
 * "Server" key). Generate from Appwrite Console → Project → API Keys.
 */

import { Client, Databases, IndexType } from 'node-appwrite';

const ENDPOINT = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;
const PROJECT = process.env.NEXT_PUBLIC_APPWRITE_PROJECT;
const API_KEY = process.env.APPWRITE_API_KEY;
const DB_ID = process.env.APPWRITE_DATABASE_ID || 'dvai-connect';

if (!ENDPOINT || !PROJECT || !API_KEY) {
    console.error(
        '[migrate] Missing env vars. Need NEXT_PUBLIC_APPWRITE_ENDPOINT, ' +
            'NEXT_PUBLIC_APPWRITE_PROJECT, and APPWRITE_API_KEY.',
    );
    process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT).setKey(API_KEY);
const databases = new Databases(client);

// ---------- Helpers --------------------------------------------------------

const ALREADY_EXISTS = /already exists|exists already|attribute_already_exists|index_already_exists/i;

async function ignoreExists(label, fn) {
    try {
        await fn();
        console.log(`  ✓ ${label}`);
    } catch (err) {
        const msg = err?.message ?? String(err);
        if (ALREADY_EXISTS.test(msg)) {
            console.log(`  · ${label} (already exists)`);
        } else {
            console.error(`  ✗ ${label}: ${msg}`);
            throw err;
        }
    }
}

async function ensureCollection(id, name) {
    await ignoreExists(`collection ${id}`, () =>
        databases.createCollection(DB_ID, id, name, [], false),
    );
}

async function strAttr(collId, name, size, required) {
    await ignoreExists(`${collId}.${name} (string)`, () =>
        databases.createStringAttribute(DB_ID, collId, name, size, required, undefined, false),
    );
}

async function intAttr(collId, name, required) {
    await ignoreExists(`${collId}.${name} (integer)`, () =>
        databases.createIntegerAttribute(DB_ID, collId, name, required),
    );
}

// Appwrite enforces: `required: true` and a default value are mutually
// exclusive — pass one or the other. For fields that have a sensible
// default ("isActive defaults to true"), use `required: false` so the
// default takes effect when callers omit the field.
async function boolAttr(collId, name, required, defaultValue) {
    if (required && defaultValue !== undefined && defaultValue !== null) {
        throw new Error(
            `boolAttr ${collId}.${name}: pass either required=true OR a default value, not both`,
        );
    }
    await ignoreExists(`${collId}.${name} (boolean)`, () =>
        databases.createBooleanAttribute(
            DB_ID,
            collId,
            name,
            required,
            defaultValue,
        ),
    );
}

async function dtAttr(collId, name, required) {
    await ignoreExists(`${collId}.${name} (datetime)`, () =>
        databases.createDatetimeAttribute(DB_ID, collId, name, required),
    );
}

async function enumAttr(collId, name, elements, required) {
    await ignoreExists(`${collId}.${name} (enum)`, () =>
        databases.createEnumAttribute(DB_ID, collId, name, elements, required),
    );
}

async function ensureIndex(collId, key, type, attrs, orders) {
    await ignoreExists(`${collId} index ${key}`, () =>
        databases.createIndex(DB_ID, collId, key, type, attrs, orders),
    );
}

// ---------- Schema ---------------------------------------------------------

async function migrateSubscriptions() {
    console.log('subscriptions');
    await ensureCollection('subscriptions', 'subscriptions');
    await strAttr('subscriptions', 'userId', 64, true);
    await strAttr('subscriptions', 'orgId', 64, false);
    await strAttr('subscriptions', 'stripeCustomerId', 128, true);
    await strAttr('subscriptions', 'stripeSubscriptionId', 128, true);
    await strAttr('subscriptions', 'stripeScheduleId', 128, false);
    await enumAttr(
        'subscriptions',
        'tier',
        ['free', 'pro_africa', 'pro', 'business', 'enterprise'],
        true,
    );
    await enumAttr(
        'subscriptions',
        'status',
        ['active', 'past_due', 'canceled', 'trialing', 'incomplete', 'unpaid'],
        true,
    );
    await dtAttr('subscriptions', 'currentPeriodStart', true);
    await dtAttr('subscriptions', 'currentPeriodEnd', true);
    await boolAttr('subscriptions', 'cancelAtPeriodEnd', false, false);
    await boolAttr('subscriptions', 'isAfricaCohort', false, false);
    await strAttr('subscriptions', 'africaCohortCode', 64, false);
    await dtAttr('subscriptions', 'africaCommitmentEnd', false);
    await strAttr('subscriptions', 'priceId', 128, true);
    await ensureIndex('subscriptions', 'idx_userId', IndexType.Key, ['userId'], ['ASC']);
    await ensureIndex('subscriptions', 'idx_orgId', IndexType.Key, ['orgId'], ['ASC']);
    await ensureIndex('subscriptions', 'idx_stripeCustomerId', IndexType.Unique, ['stripeCustomerId'], ['ASC']);
    await ensureIndex('subscriptions', 'idx_stripeSubscriptionId', IndexType.Unique, ['stripeSubscriptionId'], ['ASC']);
    await ensureIndex('subscriptions', 'idx_status', IndexType.Key, ['status'], ['ASC']);
}

async function migrateStripeEvents() {
    console.log('stripe_events');
    await ensureCollection('stripe_events', 'stripe_events');
    await strAttr('stripe_events', 'eventId', 128, true);
    await strAttr('stripe_events', 'type', 64, true);
    await strAttr('stripe_events', 'payload', 1048576, true); // 1 MiB JSON
    await boolAttr('stripe_events', 'processed', false, false);
    await dtAttr('stripe_events', 'processedAt', false);
    await strAttr('stripe_events', 'error', 2048, false);
    await ensureIndex('stripe_events', 'idx_eventId', IndexType.Unique, ['eventId'], ['ASC']);
    await ensureIndex('stripe_events', 'idx_processed', IndexType.Key, ['processed'], ['ASC']);
}

async function migrateOrganizations() {
    console.log('organizations');
    await ensureCollection('organizations', 'organizations');
    await strAttr('organizations', 'appwriteTeamId', 64, true);
    await strAttr('organizations', 'name', 128, true);
    await strAttr('organizations', 'country', 8, true);            // ISO 3166-1 alpha-2
    await strAttr('organizations', 'program_name', 32, true);
    await strAttr('organizations', 'signup_code', 64, true);
    await strAttr('organizations', 'tier_override', 32, false);
    await intAttr('organizations', 'commitment_months', false);
    await intAttr('organizations', 'max_seats', true);
    await intAttr('organizations', 'signup_count', true);
    await dtAttr('organizations', 'expires_at', false);
    await boolAttr('organizations', 'is_active', false, true);
    await strAttr('organizations', 'primary_contact_name', 128, false);
    await strAttr('organizations', 'primary_contact_email', 128, false);
    await strAttr('organizations', 'billing_contact_email', 128, false);
    await strAttr('organizations', 'notes', 2048, false);
    await strAttr('organizations', 'createdBy', 64, true);
    await ensureIndex('organizations', 'idx_signup_code', IndexType.Unique, ['signup_code'], ['ASC']);
    await ensureIndex('organizations', 'idx_appwriteTeamId', IndexType.Unique, ['appwriteTeamId'], ['ASC']);
    await ensureIndex('organizations', 'idx_is_active', IndexType.Key, ['is_active'], ['ASC']);
}

async function migrateActiveRooms() {
    console.log('active_rooms');
    await ensureCollection('active_rooms', 'active_rooms');
    await strAttr('active_rooms', 'roomSid', 64, true);
    await strAttr('active_rooms', 'roomName', 256, true);
    await strAttr('active_rooms', 'creatorOrgId', 64, false);
    await intAttr('active_rooms', 'participantCount', true);
    await boolAttr('active_rooms', 'isRecording', false, false);
    await strAttr('active_rooms', 'region', 32, false);
    await dtAttr('active_rooms', 'lastEventAt', true);
    await ensureIndex('active_rooms', 'idx_roomSid', IndexType.Unique, ['roomSid'], ['ASC']);
    await ensureIndex('active_rooms', 'idx_creatorOrgId', IndexType.Key, ['creatorOrgId'], ['ASC']);
    await ensureIndex('active_rooms', 'idx_lastEventAt', IndexType.Key, ['lastEventAt'], ['DESC']);
}

async function migrateSessionLogs() {
    console.log('session_logs');
    await ensureCollection('session_logs', 'session_logs');
    await strAttr('session_logs', 'sessionId', 128, true);
    await strAttr('session_logs', 'identity', 64, true);
    await strAttr('session_logs', 'orgId', 64, false);
    await strAttr('session_logs', 'ip', 64, false);
    await strAttr('session_logs', 'userAgent', 512, false);
    await dtAttr('session_logs', 'joinedAt', true);
    await dtAttr('session_logs', 'leftAt', false);
    await strAttr('session_logs', 'roomSid', 64, true);
    await ensureIndex('session_logs', 'idx_sessionId', IndexType.Unique, ['sessionId'], ['ASC']);
    await ensureIndex('session_logs', 'idx_roomSid', IndexType.Key, ['roomSid'], ['ASC']);
    await ensureIndex('session_logs', 'idx_identity', IndexType.Key, ['identity'], ['ASC']);
}

async function migrateOrgBranding() {
    console.log('org_branding');
    await ensureCollection('org_branding', 'org_branding');
    await strAttr('org_branding', 'appwriteTeamId', 64, true);
    await strAttr('org_branding', 'logoUrl', 512, false);
    await strAttr('org_branding', 'darkLogoUrl', 512, false);
    await strAttr('org_branding', 'primaryColor', 16, false);
    await strAttr('org_branding', 'accentColor', 16, false);
    await strAttr('org_branding', 'customDomain', 256, false);
    await strAttr('org_branding', 'loginScreenCopy', 1024, false);
    await strAttr('org_branding', 'emailFromName', 128, false);
    await strAttr('org_branding', 'emailFromAddress', 128, false);
    await ensureIndex('org_branding', 'idx_appwriteTeamId', IndexType.Unique, ['appwriteTeamId'], ['ASC']);
}

// ---------- Run ------------------------------------------------------------

async function main() {
    console.log(`Migrating database "${DB_ID}" on ${ENDPOINT} (project ${PROJECT})\n`);

    await migrateSubscriptions();
    await migrateStripeEvents();
    await migrateOrganizations();
    await migrateActiveRooms();
    await migrateSessionLogs();
    await migrateOrgBranding();

    console.log('\nMigration complete.');
    console.log(
        'Reminder: collection permissions are intentionally empty — all 6' +
            ' collections are read/written server-side only via' +
            ' APPWRITE_API_KEY. The public /pricing page is a server' +
            ' component that reads lib/pricing/tiers.ts (static) and the' +
            ' future pricing_tiers collection (server-side merge), so no' +
            ' browser-side Appwrite reads are required.',
    );
}

main().catch((err) => {
    console.error('\nMigration FAILED:', err?.message ?? err);
    process.exit(1);
});
