require('dotenv').config();

module.exports = {
    app_name: [process.env.NEW_RELIC_APP_NAME],
    license_key: process.env.NEW_RELIC_LICENSE_KEY,
    agent_enabled: process.env.NODE_ENV === 'production',
    ai_monitoring: {
        enabled: true,
    },
    span_events: {
        max_samples_stored: 10000,
    },
    custom_insights_events: {
        max_samples_stored: 100000,
    },
    distributed_tracing: {
        enabled: true,
    },
    transaction_tracer: {
        enabled: true,
    },
    logging: {
        enabled: process.env.NODE_ENV === 'production',
        level: 'info',
    },
};
