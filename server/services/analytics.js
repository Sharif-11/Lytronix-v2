const AnalyticsEvent = require('../models/AnalyticsEvent');

// Fire-and-forget event recording. Never throws into the caller — a failed
// analytics write must not break a checkout or a page load.
function record(event) {
  return AnalyticsEvent.create({ at: new Date(), ...event }).catch((err) => {
    console.error('analytics.record failed:', err.message);
  });
}

module.exports = { record };
