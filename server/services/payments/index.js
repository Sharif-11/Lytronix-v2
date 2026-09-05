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

module.exports = { registerGateway, getGateway, listGateways }
