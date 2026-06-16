import { describe, it, expect } from 'vitest';
import { EVENT_HANDLERS } from '../handlers';

describe('EVENT_HANDLERS dispatch table', () => {
    it('handles all Stripe events our webhook subscribes to', () => {
        // Set of events we registered the webhook for in
        // scripts/stripe-setup-2026-06-13.mjs.
        const SUBSCRIBED = [
            'checkout.session.completed',
            'invoice.paid',
            'invoice.payment_failed',
            'customer.subscription.created',
            'customer.subscription.updated',
            'customer.subscription.deleted',
        ];
        for (const t of SUBSCRIBED) {
            expect(EVENT_HANDLERS[t]).toBeTypeOf('function');
        }
    });

    it('returns undefined for unknown event types', () => {
        expect(EVENT_HANDLERS['fictional.event']).toBeUndefined();
        expect(EVENT_HANDLERS['']).toBeUndefined();
    });

    it('aliases invoice.payment_succeeded to the same handler as invoice.paid', () => {
        expect(EVENT_HANDLERS['invoice.payment_succeeded']).toBe(EVENT_HANDLERS['invoice.paid']);
    });

    it('uses the same handler for subscription.created and subscription.updated', () => {
        // Both feed through the same state-sync logic since the doc
        // shape is identical — a created subscription is just the first
        // "update" we observe.
        expect(EVENT_HANDLERS['customer.subscription.created']).toBe(
            EVENT_HANDLERS['customer.subscription.updated'],
        );
    });
});
