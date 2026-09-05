const Customer = require('../models/Customer');
const notifications = require('../services/notifications');

const MAX_BROADCAST_MESSAGE_LEN = 640; // ~4 SMS segments; keeps a marketing blast on-budget

// GET /api/customers?search=&channel=&priority=&tag=&page=&limit=
exports.listCustomers = async (req, res) => {
  const { search, channel, priority, tag, page = 1, limit = 24 } = req.query;
  const filter = {};

  if (search) {
    const re = { $regex: search, $options: 'i' };
    filter.$or = [{ name: re }, { phone: re }, { zilla: re }, { thana: re }, { address: re }, { comments: re }, { tags: re }];
  }
  if (channel) filter.channels = channel;
  if (priority) filter.priority = priority;
  if (tag) filter.tags = tag;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 24));

  const [customers, total] = await Promise.all([
    Customer.find(filter)
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    Customer.countDocuments(filter),
  ]);

  res.json({ customers, total, page: pageNum, pages: Math.ceil(total / limitNum) || 1 });
};

// GET /api/customers/:id
exports.getCustomer = async (req, res) => {
  const customer = await Customer.findById(req.params.id);
  if (!customer) return res.status(404).json({ message: 'Customer not found' });
  res.json(customer);
};

// POST /api/customers
exports.createCustomer = async (req, res) => {
  const { name, phone, zilla, thana, address, comments, channels, priority, tags } = req.body;
  const customer = await Customer.create({ name, phone, zilla, thana, address, comments, channels, priority, tags });
  res.status(201).json(customer);
};

// PUT /api/customers/:id
exports.updateCustomer = async (req, res) => {
  const customer = await Customer.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });
  if (!customer) return res.status(404).json({ message: 'Customer not found' });
  res.json(customer);
};

// DELETE /api/customers/:id
exports.deleteCustomer = async (req, res) => {
  const customer = await Customer.findByIdAndDelete(req.params.id);
  if (!customer) return res.status(404).json({ message: 'Customer not found' });
  res.json({ message: 'Customer deleted' });
};

// POST /api/customers/message  { customerId, message }
// One customer — for a direct "message this person" action from their card.
exports.sendCustomerMessage = async (req, res) => {
  const { customerId, message } = req.body;
  const text = String(message || '').trim();
  if (!text) return res.status(400).json({ message: 'Message text is required.' });
  if (text.length > MAX_BROADCAST_MESSAGE_LEN) {
    return res.status(400).json({ message: `Message is too long (max ${MAX_BROADCAST_MESSAGE_LEN} characters).` });
  }

  const customer = await Customer.findById(customerId);
  if (!customer) return res.status(404).json({ message: 'Customer not found.' });

  const result = await notifications.sendMarketingSms([customer.phone], text);
  if (result.sent === 0) {
    return res.status(502).json({ message: 'Could not send the message. Check the SMS logs for details.', ...result });
  }
  res.json(result);
};

// POST /api/customers/broadcast  { customerIds: [...], message }
// Marketing blast: one message to many customers at once (BulkSMSBD's
// one-to-many mode — see server/services/sms.js#sendBulkSms).
exports.sendBroadcast = async (req, res) => {
  const { customerIds, message } = req.body;
  const text = String(message || '').trim();
  if (!text) return res.status(400).json({ message: 'Message text is required.' });
  if (text.length > MAX_BROADCAST_MESSAGE_LEN) {
    return res.status(400).json({ message: `Message is too long (max ${MAX_BROADCAST_MESSAGE_LEN} characters).` });
  }
  if (!Array.isArray(customerIds) || customerIds.length === 0) {
    return res.status(400).json({ message: 'Select at least one customer to message.' });
  }
  if (customerIds.length > 2000) {
    return res.status(400).json({ message: 'Please send to at most 2000 recipients at a time.' });
  }

  const customers = await Customer.find({ _id: { $in: customerIds } }).select('phone');
  const numbers = customers.map((c) => c.phone).filter(Boolean);
  if (numbers.length === 0) {
    return res.status(400).json({ message: 'None of the selected customers have a phone number on file.' });
  }

  const result = await notifications.sendMarketingSms(numbers, text);
  res.json(result);
};
