const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/messengerController');

// Both public — Facebook calls these directly, authenticated by the verify
// token (GET, one-time handshake) / X-Hub-Signature-256 (POST, every call)
// instead of a bearer token. See server/services/messenger.js.
router.get('/webhook', ctrl.verify);
router.post('/webhook', ctrl.receive);

module.exports = router;
