const { PostHog } = require('posthog-node');

let posthogClient = null;

if (process.env.POSTHOG_KEY) {
  posthogClient = new PostHog(process.env.POSTHOG_KEY, {
    host: process.env.POSTHOG_HOST || 'https://us.i.posthog.com',
  });
}

module.exports = posthogClient;
