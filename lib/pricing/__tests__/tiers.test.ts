import { describe, it, expect } from 'vitest';
import {
    TIERS,
    VISIBLE_PUBLIC_TIER_IDS,
    getTier,
    tierAllowsRecording,
    tierAllowsAgents,
    tierAllowsAttendees,
    tierMeetingMaxSeconds,
} from '../tiers';

describe('TIERS — locked pricing (Tab 2)', () => {
    it('has exactly 5 SKUs', () => {
        expect(Object.keys(TIERS)).toHaveLength(5);
    });

    it('Free is $0 with 40-min cap and no recording', () => {
        expect(TIERS.free.basePriceUsd).toBe(0);
        expect(TIERS.free.meetingMaxMinutes).toBe(40);
        expect(TIERS.free.attendeeCap).toBe(10);
        expect(TIERS.free.cloudRecording).toBe(false);
        expect(TIERS.free.meetingAgentQuota).toBe(0);
    });

    it('Pro Africa is $14.99 with 24-mo commitment, cohort-restricted', () => {
        expect(TIERS.pro_africa.basePriceUsd).toBe(14.99);
        expect(TIERS.pro_africa.hasCommitment).toBe(true);
        expect(TIERS.pro_africa.cohortRestricted).toBe(true);
        expect(TIERS.pro_africa.meetingMaxMinutes).toBe(60);
        expect(TIERS.pro_africa.attendeeCap).toBe(100);
    });

    it('Pro Mainstream is $18.99 with no commitment', () => {
        expect(TIERS.pro.basePriceUsd).toBe(18.99);
        expect(TIERS.pro.hasCommitment).toBe(false);
        expect(TIERS.pro.cohortRestricted).toBe(false);
        expect(TIERS.pro.cloudRecording).toBe(true);
        expect(TIERS.pro.meetingAgentQuota).toBe(1);
    });

    it('Business is $48.99 with 300 attendees + custom branding + admin dashboard', () => {
        expect(TIERS.business.basePriceUsd).toBe(48.99);
        expect(TIERS.business.attendeeCap).toBe(300);
        expect(TIERS.business.customBranding).toBe(true);
        expect(TIERS.business.adminDashboard).toBe(true);
    });

    it('Enterprise is $449.99 with 1000 attendees + 3-hour meetings + dedicated node + 24/7 support', () => {
        expect(TIERS.enterprise.basePriceUsd).toBe(449.99);
        expect(TIERS.enterprise.attendeeCap).toBe(1000);
        expect(TIERS.enterprise.meetingMaxMinutes).toBe(180);
        expect(TIERS.enterprise.dedicatedNode).toBe(true);
        expect(TIERS.enterprise.support).toBe('24-7');
    });

    it('every tier has E2EE on', () => {
        for (const tier of Object.values(TIERS)) {
            expect(tier.e2ee).toBe(true);
        }
    });

    it('public pricing page hides Pro Africa', () => {
        expect(VISIBLE_PUBLIC_TIER_IDS).toContain('free');
        expect(VISIBLE_PUBLIC_TIER_IDS).toContain('pro');
        expect(VISIBLE_PUBLIC_TIER_IDS).toContain('business');
        expect(VISIBLE_PUBLIC_TIER_IDS).toContain('enterprise');
        expect(VISIBLE_PUBLIC_TIER_IDS).not.toContain('pro_africa');
    });
});

describe('tier feature-gate helpers', () => {
    it('getTier returns the tier definition', () => {
        expect(getTier('free').displayName).toBe('Free');
        expect(getTier('enterprise').displayName).toBe('Enterprise');
    });

    it('tierAllowsRecording: false for Free, true for all paid', () => {
        expect(tierAllowsRecording('free')).toBe(false);
        expect(tierAllowsRecording('pro_africa')).toBe(true);
        expect(tierAllowsRecording('pro')).toBe(true);
        expect(tierAllowsRecording('business')).toBe(true);
        expect(tierAllowsRecording('enterprise')).toBe(true);
    });

    it('tierAllowsAgents: Free always rejected (quota 0), paid allow first agent', () => {
        expect(tierAllowsAgents('free', 0)).toBe(false);
        expect(tierAllowsAgents('pro', 0)).toBe(true);
        expect(tierAllowsAgents('pro', 1)).toBe(false); // quota 1 reached
        expect(tierAllowsAgents('enterprise', 0)).toBe(true);
    });

    it('tierAllowsAttendees: enforces caps 10/100/100/300/1000', () => {
        expect(tierAllowsAttendees('free', 9)).toBe(true);
        expect(tierAllowsAttendees('free', 10)).toBe(false);
        expect(tierAllowsAttendees('pro', 99)).toBe(true);
        expect(tierAllowsAttendees('pro', 100)).toBe(false);
        expect(tierAllowsAttendees('business', 299)).toBe(true);
        expect(tierAllowsAttendees('business', 300)).toBe(false);
        expect(tierAllowsAttendees('enterprise', 999)).toBe(true);
        expect(tierAllowsAttendees('enterprise', 1000)).toBe(false);
    });

    it('tierMeetingMaxSeconds: 40min Free, 60min Pro/Pro-Africa/Business, 180min Enterprise', () => {
        expect(tierMeetingMaxSeconds('free')).toBe(40 * 60);
        expect(tierMeetingMaxSeconds('pro_africa')).toBe(60 * 60);
        expect(tierMeetingMaxSeconds('pro')).toBe(60 * 60);
        expect(tierMeetingMaxSeconds('business')).toBe(60 * 60);
        expect(tierMeetingMaxSeconds('enterprise')).toBe(180 * 60);
    });
});
