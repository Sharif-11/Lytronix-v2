const gateways = {}

// Any automated gateway (bKash tokenized checkout, SSLCommerz, ...) plugs in
// here with { isConfigured(), initiate({ order, payment }), verify(payload) }.
// See services/payments/bkash.js for the shape.
function registerGateway(name, implementation) {
  gateways[name] = implementation
}

function getGateway(name) {
  return gateways[name]
}

function listGateways() {
  return Object.keys(gateways).map(name => ({ name, isConfigured: gateways[name].isConfigured() }))
}

// Whether the automated bKash checkout is live (configured + explicitly
// switched on). Used to decide if an unpaid order can be offered a "pay now"
// button on the tracking / my-orders screens.
function bkashAutoEnabled() {
  const g = gateways.bkash
  return Boolean(g && typeof g.isEnabled === 'function' && g.isEnabled())
}

module.exports = { registerGateway, getGateway, listGateways, bkashAutoEnabled }
