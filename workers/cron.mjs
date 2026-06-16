#!/usr/bin/env node
/**
 * In-process cron worker for the meet app.
 *
 * Runs as its own PM2 process alongside the Next.js server. Triggers
 * the same /api/cron/* HTTP endpoints that a Vercel cron would hit —
 * the actual business logic lives in the API routes so it's
 * trivially also callable from `curl` or from a sysv cron entry if
 * you ever want to move scheduling out of the app.
 *
 * Why a separate process and not setInterval inside Next.js:
 *   - Next.js App Router has no "startup" hook that runs once at
 *     server boot. Hot-reload and worker-thread layouts can cause
 *     setIntervals registered in module scope to fire multiple times
 *     per process or never fire at all.
 *   - PM2 supervises this process independently — if a cron callback
 *     throws and crashes the worker, the web app is unaffected.
 *
 * Schedules (UTC):
 *   * /1 * * * *  →  /api/cron/process-stripe-events
 *   0 9 * * *     →  /api/cron/audit-stripe-config
 *
 * To add a new cron, just register another `cron.schedule(...)`.
 *
 * Env vars (read from same .env.local Next.js uses):
 *   APP_BASE_URL=https://connect.deepvoiceai.co  (or http://localhost:3000 in dev)
 *   CRON_SECRET=<long random string>
 *
 * Both must match what the API routes expect.
 */

import dotenv from 'dotenv';
import cron from 'node-cron';

// Match Next.js's env-file loading order so this worker reads the
// SAME CRON_SECRET (and APPWRITE_API_KEY, STRIPE_*, etc.) as the
// `next start` process. dotenv is first-wins by default, so list the
// highest-priority files first.
//
// Without this, `import 'dotenv/config'` only reads `.env`, missing
// the `.env.local` / `.env.production` where prod secrets actually
// live — silently causing every cron tick to 401 against the API.
const NODE_ENV = process.env.NODE_ENV ?? 'development';
for (const f of [
    `.env.${NODE_ENV}.local`,
    '.env.local',
    `.env.${NODE_ENV}`,
    '.env',
]) {
    dotenv.config({ path: f });
}

const BASE_URL = (process.env.APP_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const CRON_SECRET = process.env.CRON_SECRET ?? '';

if (!CRON_SECRET && process.env.CRON_SECRET_DEV_BYPASS !== '1') {
    console.warn(
        '[cron] CRON_SECRET is not set. The API routes will reject our calls. ' +
            'Set CRON_SECRET in .env.local, or CRON_SECRET_DEV_BYPASS=1 for local dev only.',
    );
}

async function hit(path) {
    const url = `${BASE_URL}${path}`;
    const headers = CRON_SECRET
        ? { Authorization: `Bearer ${CRON_SECRET}` }
        : {};
    const startedAt = Date.now();
    try {
        const res = await fetch(url, { method: 'POST', headers });
        const ms = Date.now() - startedAt;
        const body = await res.text();
        const summary = body.length > 600 ? body.slice(0, 600) + '…' : body;
        const tag = res.ok ? '✓' : '✗';
        console.log(`[cron] ${tag} ${path} → ${res.status} (${ms}ms) ${summary}`);
    } catch (err) {
        const ms = Date.now() - startedAt;
        console.error(`[cron] ✗ ${path} → network error after ${ms}ms:`, err?.message ?? err);
    }
}

// Drain pending Stripe webhook events every minute. This is the
// consumer side of /api/webhooks/stripe — the webhook ack-stores
// events and this loop applies them to the subscriptions collection.
cron.schedule('* * * * *', () => hit('/api/cron/process-stripe-events'));

// Daily Africa portal drift audit at 09:00 UTC. Verifies the
// Subscription Schedules attached to Africa cohort subscriptions
// still enforce the 24-month commitment, and that the Africa portal
// configuration still has cancel + plan-change disabled.
cron.schedule('0 9 * * *', () => hit('/api/cron/audit-stripe-config'));

console.log(`[cron] worker started. base=${BASE_URL} secret=${CRON_SECRET ? 'set' : 'unset (dev-bypass)'}`);

// Heartbeat once a minute so PM2 logs show liveness during quiet
// periods.
setInterval(() => {
    console.log('[cron] heartbeat', new Date().toISOString());
}, 60_000);
