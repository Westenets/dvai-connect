#!/usr/bin/env node
/**
 * Appwrite migration: 2026-06-14 — pricing_tiers collection
 *
 * Additive companion to scripts/appwrite-migrate-2026-06-13.mjs.
 * Adds a single new collection that stores admin-editable display
 * overrides for each tier. The static defaults in
 * lib/pricing/tiers.ts remain the source of truth for behavior
 * (gates, caps, prices) — the overrides only customize what users see
 * on /pricing.
 *
 * Schema:
 *   tier              enum, required, unique
 *   displayName       string(64), optional
 *   badge             string(64), optional
 *   description       string(512), optional
 *   headlineCopy      string(1024), optional
 *   bulletJson        string(2048), optional — JSON array of strings
 *
 * Run with:
 *   node --env-file=.env.local scripts/appwrite-migrate-pricing-tiers-2026-06-14.mjs
 */

import { Client, Databases, IndexType } from 'node-appwrite';

const ENDPOINT = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;
const PROJECT = process.env.NEXT_PUBLIC_APPWRITE_PROJECT;
const API_KEY = process.env.APPWRITE_API_KEY;
const DB_ID = process.env.APPWRITE_DATABASE_ID || 'dvai-connect';

if (!ENDPOINT || !PROJECT || !API_KEY) {
    console.error('[migrate] Missing env vars (NEXT_PUBLIC_APPWRITE_ENDPOINT / NEXT_PUBLIC_APPWRITE_PROJECT / APPWRITE_API_KEY).');
    process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT).setKey(API_KEY);
const databases = new Databases(client);

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

async function main() {
    console.log(`Migrating database "${DB_ID}" on ${ENDPOINT} (project ${PROJECT})\n`);
    console.log('pricing_tiers');
    await ignoreExists('collection pricing_tiers', () =>
        databases.createCollection(DB_ID, 'pricing_tiers', 'pricing_tiers', [], false),
    );
    await ignoreExists('pricing_tiers.tier (enum)', () =>
        databases.createEnumAttribute(
            DB_ID,
            'pricing_tiers',
            'tier',
            ['free', 'pro_africa', 'pro', 'business', 'enterprise'],
            true,
        ),
    );
    await ignoreExists('pricing_tiers.displayName (string)', () =>
        databases.createStringAttribute(DB_ID, 'pricing_tiers', 'displayName', 64, false, undefined, false),
    );
    await ignoreExists('pricing_tiers.badge (string)', () =>
        databases.createStringAttribute(DB_ID, 'pricing_tiers', 'badge', 64, false, undefined, false),
    );
    await ignoreExists('pricing_tiers.description (string)', () =>
        databases.createStringAttribute(DB_ID, 'pricing_tiers', 'description', 512, false, undefined, false),
    );
    await ignoreExists('pricing_tiers.headlineCopy (string)', () =>
        databases.createStringAttribute(DB_ID, 'pricing_tiers', 'headlineCopy', 1024, false, undefined, false),
    );
    await ignoreExists('pricing_tiers.bulletJson (string)', () =>
        databases.createStringAttribute(DB_ID, 'pricing_tiers', 'bulletJson', 2048, false, undefined, false),
    );
    await ignoreExists('pricing_tiers idx_tier (unique)', () =>
        databases.createIndex(DB_ID, 'pricing_tiers', 'idx_tier', IndexType.Unique, ['tier'], ['ASC']),
    );
    console.log('\nMigration complete.');
}

main().catch((err) => {
    console.error('\nMigration FAILED:', err?.message ?? err);
    process.exit(1);
});
