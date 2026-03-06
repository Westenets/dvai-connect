require('dotenv').config();

module.exports = {
    app_name: [process.env.NEW_RELIC_APP_NAME],
    license_key: process.env.NEW_RELIC_LICENSE_KEY,
    logging: {
        enabled: true,
        level: 'info',
    },
};