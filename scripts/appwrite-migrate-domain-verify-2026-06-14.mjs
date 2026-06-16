#!/usr/bin/env node
/**
 * Appwrite migration: 2026-06-14 — custom-domain DNS verification fields
 *
 * Adds five fields to the existing org_branding collection. All are
 * optional — pre-existing rows continue to work, and the fields stay
 * empty until an admin enters a customDomain on the branding form.
 *
 *   customDomainVerificationToken    string(64), optional
 *   customDomainVerificationStatus   enum,        optional
 *       ('pending' | 'verified' | 'failed')
 *   customDomainVerifiedAt           datetime,    optional
 *   customDomainCheckedAt            datetime,    optional
 *   customDomainVerificationError    string(1024), optional
 *
 * Idempotent — re-running is safe.
 *
 * Run with:
 *   node --env-file=.env.local scripts/appwrite-migrate-domain-verify-2026-06-14.mjs
 */

import { Client, Databases } from 'node-appwrite';

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

const ALREADY_EXISTS = /already exists|attribute_already_exists/i;

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
    console.log('org_branding (additive)');
    await ignoreExists('customDomainVerificationToken (string)', () =>
        databases.createStringAttribute(DB_ID, 'org_branding', 'customDomainVerificationToken', 64, false, undefined, false),
    );
    await ignoreExists('customDomainVerificationStatus (enum)', () =>
        databases.createEnumAttribute(DB_ID, 'org_branding', 'customDomainVerificationStatus', ['pending', 'verified', 'failed'], false),
    );
    await ignoreExists('customDomainVerifiedAt (datetime)', () =>
        databases.createDatetimeAttribute(DB_ID, 'org_branding', 'customDomainVerifiedAt', false),
    );
    await ignoreExists('customDomainCheckedAt (datetime)', () =>
        databases.createDatetimeAttribute(DB_ID, 'org_branding', 'customDomainCheckedAt', false),
    );
    await ignoreExists('customDomainVerificationError (string)', () =>
        databases.createStringAttribute(DB_ID, 'org_branding', 'customDomainVerificationError', 1024, false, undefined, false),
    );
    console.log('\nMigration complete.');
}

main().catch((err) => {
    console.error('\nMigration FAILED:', err?.message ?? err);
    process.exit(1);
});
