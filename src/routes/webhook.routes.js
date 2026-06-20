const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/webhook.controller');

// Meta (Facebook + Instagram) webhooks - no auth, raw body for signature verification
router.get('/meta', ctrl.verifyMetaWebhook);
router.post('/meta', express.raw({ type: 'application/json' }), ctrl.handleMetaWebhook);

// WhatsApp Cloud API webhooks
router.get('/whatsapp', ctrl.verifyWhatsAppWebhook);
router.post('/whatsapp', express.raw({ type: 'application/json' }), ctrl.handleWhatsAppWebhook);

module.exports = router;
