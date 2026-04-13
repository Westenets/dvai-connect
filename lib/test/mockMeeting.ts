/**
 * Realistic mock meeting transcript for pipeline testing.
 * Contains 30 speaker turns with embedded action items and unanswered questions.
 */

export const MOCK_MEETING_ROOM = 'test-room-pipeline-sim';

export const MOCK_UTTERANCES: { speaker: string; text: string }[] = [
    { speaker: 'Sarah Chen', text: "Good morning everyone. Let's kick off the Q4 planning session. I'd like to review our infrastructure goals first." },
    { speaker: 'Mike Ross', text: "Morning Sarah. I finished the preliminary performance audit for the API gateway. Results are in the shared doc." },
    { speaker: 'Alex Reed', text: "Great. Can someone send me the link to that doc? I don't have access yet." },
    { speaker: 'Sarah Chen', text: "Sure Alex, I'll send it right after this call. Mike, what were the main bottlenecks you found?" },
    { speaker: 'Mike Ross', text: "The main issue is the database connection pooling at peak load. We're hitting limits around 2000 concurrent connections." },
    { speaker: 'Priya Patel', text: "We had a similar problem last year. We solved it by switching to PgBouncer. Should we consider that again?" },
    { speaker: 'Mike Ross', text: "That's a good point Priya. I'll put together a benchmark comparison of PgBouncer versus our current setup by end of this week." },
    { speaker: 'Sarah Chen', text: "Perfect. Mike, make that your top priority. Alex, can you coordinate with DevOps to get us a staging environment for testing?" },
    { speaker: 'Alex Reed', text: "I'll set that up. What size should the staging env be? Should it mirror production?" },
    { speaker: 'Sarah Chen', text: "Yes, mirror production so results are reliable. What's the timeline for that, Alex?" },
    { speaker: 'Alex Reed', text: "I can have it ready by Wednesday afternoon." },
    { speaker: 'Priya Patel', text: "There's another issue we haven't discussed — the WebSocket reconnection logic is causing session drops during mobile network switches." },
    { speaker: 'Mike Ross', text: "How often are we seeing that? Do we have metrics?" },
    { speaker: 'Priya Patel', text: "About 8% of mobile sessions have at least one disconnect. I'll share the Grafana dashboard link after the call." },
    { speaker: 'Sarah Chen', text: "That 8% is too high. Priya, can you own the investigation and come back with a fix proposal by Friday?" },
    { speaker: 'Priya Patel', text: "Yes, I'll look into it. Is there prior work on this I can reference?" },
    { speaker: 'Mike Ross', text: "I think there's a GitHub issue from June. Let me find the link and post it in Slack." },
    { speaker: 'Alex Reed', text: "Also, I noticed our CDN caching rules haven't been updated since March. That might be affecting latency in the EU region." },
    { speaker: 'Sarah Chen', text: "Good catch. Alex, add a CDN cache audit to your task list alongside the staging environment." },
    { speaker: 'Alex Reed', text: "Will do. Should I loop in the frontend team on the CDN changes or handle it independently?" },
    { speaker: 'Sarah Chen', text: "Loop in the frontend team — they'll need to update cache busting strategies too." },
    { speaker: 'Priya Patel', text: "One more concern — do we have a fallback plan if the staging environment isn't ready before the load test on Thursday?" },
    { speaker: 'Sarah Chen', text: "That's a valid concern. Mike, is there any flexibility to run the load test on a subset of production traffic if staging isn't ready?" },
    { speaker: 'Mike Ross', text: "It's possible but risky. We'd need a careful traffic routing plan. I haven't thought through all the implications yet." },
    { speaker: 'Alex Reed', text: "I'll do my best to have staging up by Tuesday to give us buffer time." },
    { speaker: 'Sarah Chen', text: "Alright. Let's also make sure we document all config changes as we go — we've been bad about that this quarter." },
    { speaker: 'Mike Ross', text: "Agreed. I'll create a Confluence page for the infrastructure changes log today." },
    { speaker: 'Priya Patel', text: "Should we have a Slack channel specifically for Q4 infra work so we don't pollute the general channel?" },
    { speaker: 'Sarah Chen', text: "Yes, great idea. Priya please create the channel and invite the core team." },
    { speaker: 'Sarah Chen', text: "Alright, let's wrap up. Quick summary: Mike — PgBouncer benchmark by Friday. Alex — staging env by Wednesday, CDN audit ongoing. Priya — WebSocket fix proposal by Friday, create the Q4 infra Slack channel today. I'll send the doc link to Alex now." },
];

/** Keywords that MUST appear in action items output for the test to pass */
export const EXPECTED_ACTION_KEYWORDS = ['staging', 'benchmark', 'websocket', 'cdn', 'slack', 'pgbouncer'];

/**
 * Keywords that MUST appear in questions output for the test to pass.
 *
 * Only keywords from genuinely unanswered/open questions:
 * - "staging" — readiness concerns remain open
 * - "risky" / "risk" — Mike flagged production load testing as risky without a full plan
 * - "traffic" / "routing" — the traffic routing plan was left unresolved
 *
 * Excluded: "size" (Sarah answered: mirror production), "prior" (Mike answered:
 * GitHub issue from June), "fallback" (concept captured but models use varied wording).
 */
export const EXPECTED_QUESTION_KEYWORDS = ['staging', 'risk'];
