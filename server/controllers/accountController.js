const CustomerAccount = require('../models/CustomerAccount')
const Cart = require('../models/Cart')
const SavedProduct = require('../models/SavedProduct')
const Product = require('../models/Product')
const Order = require('../models/Order')
const Payment = require('../models/Payment')
const { bkashAutoEnabled } = require('../services/payments')

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100

// Up-front amount collectable online: outstanding balance minus the
// cash-on-delivery leg (pricing.cashOnAmount already bundles delivery for
// advance orders). Mirrors orderController.onlinePayAmount.
const onlinePayAmount = (o) => {
  const p = (o && o.pricing) || {}
  const due = p.due != null ? round2(p.due) : round2(p.grandTotal)
  return round2(Math.max(0, due - Math.max(0, round2(p.cashOnAmount))))
}

// Order still awaiting payment → can be paid online with automated bKash
// (only the up-front amount; the delivery-time cash leg is never charged online).
const canPayOnline = (o) => o && o.status === 'unverified' && onlinePayAmount(o) > 0 && bkashAutoEnabled()

// ---------- Profile ----------

// GET /api/account/me
exports.getMe = async (req, res) => {
  res.json({ customer: req.customer.toSafeJSON() })
}

// PATCH /api/account/profile   { name }
exports.updateProfile = async (req, res) => {
  const { name } = req.body
  if (name !== undefined) req.customer.name = String(name).trim()
  await req.customer.save()
  res.json({ customer: req.customer.toSafeJSON() })
}

// POST /api/account/password   { currentPassword?, newPassword }
// Set (first time) or change the optional password used to skip OTP. Changing
// it signs other devices out; this device gets a fresh token pair back.
exports.setPassword = async (req, res) => {
  const { issueCustomerTokens } = require('../middleware/customerAuth')
  const newPassword = String(req.body.newPassword || '')
  if (newPassword.length < 6) {
    return res.status(400).json({ message: 'পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।' })
  }

  const account = await CustomerAccount.findById(req.customer._id).select('+passwordHash')
  if (!account) return res.status(404).json({ message: 'Account not found.' })

  // A real (self-chosen) password requires the current one to change it.
  // A first-time set, or replacing an auto-generated temp password, does not.
  if (account.passwordHash && !account.tempPassword) {
    const ok = await account.comparePassword(String(req.body.currentPassword || ''))
    if (!ok) return res.status(400).json({ message: 'বর্তমান পাসওয়ার্ড সঠিক নয়।' })
  }

  await account.setPassword(newPassword, { temp: false })
  account.tokenVersion = (account.tokenVersion || 0) + 1
  await account.save()

  res.json({ ...issueCustomerTokens(account), customer: account.toSafeJSON() })
}

// DELETE /api/account/password   — remove the password, go back to OTP-only.
exports.removePassword = async (req, res) => {
  const { issueCustomerTokens } = require('../middleware/customerAuth')
  const account = await CustomerAccount.findById(req.customer._id).select('+passwordHash')
  if (!account) return res.status(404).json({ message: 'Account not found.' })
  account.passwordHash = ''
  account.tempPassword = false
  account.tokenVersion = (account.tokenVersion || 0) + 1
  await account.save()
  res.json({ ...issueCustomerTokens(account), customer: account.toSafeJSON() })
}

// ---------- Addresses ----------

const ADDR_FIELDS = ['label', 'name', 'phone', 'zilla', 'policeStation', 'address', 'isDefault']
function pickAddress(body) {
  const out = {}
  ADDR_FIELDS.forEach(f => {
    if (body[f] !== undefined) out[f] = body[f]
  })
  return out
}

// POST /api/account/addresses
exports.addAddress = async (req, res) => {
  const addr = pickAddress(req.body)
  if (!addr.address || !addr.zilla) {
    return res.status(400).json({ message: 'District and address are required.' })
  }
  if (addr.isDefault) req.customer.addresses.forEach(a => (a.isDefault = false))
  if (req.customer.addresses.length === 0) addr.isDefault = true
  req.customer.addresses.push(addr)
  await req.customer.save()
  res.status(201).json({ customer: req.customer.toSafeJSON() })
}

// PATCH /api/account/addresses/:addrId
exports.updateAddress = async (req, res) => {
  const addr = req.customer.addresses.id(req.params.addrId)
  if (!addr) return res.status(404).json({ message: 'Address not found.' })

  const patch = pickAddress(req.body)
  if (patch.isDefault) req.customer.addresses.forEach(a => (a.isDefault = false))
  Object.assign(addr, patch)
  await req.customer.save()
  res.json({ customer: req.customer.toSafeJSON() })
}

// DELETE /api/account/addresses/:addrId
exports.deleteAddress = async (req, res) => {
  const addr = req.customer.addresses.id(req.params.addrId)
  if (!addr) return res.status(404).json({ message: 'Address not found.' })
  const wasDefault = addr.isDefault
  addr.deleteOne()
  if (wasDefault && req.customer.addresses.length) req.customer.addresses[0].isDefault = true
  await req.customer.save()
  res.json({ customer: req.customer.toSafeJSON() })
}

// ---------- Orders & payments ----------

// GET /api/account/orders
exports.listOrders = async (req, res) => {
  const orders = await Order.find({ customerAccount: req.customer._id })
    .sort({ createdAt: -1 })
    .select('orderNumber trackingId status statusHistory items pricing courier createdAt')
    .lean()
  res.json({
    orders: orders.map((o) => ({ ...o, canPayOnline: canPayOnline(o), onlinePayAmount: onlinePayAmount(o) })),
  })
}

// GET /api/account/orders/:id
exports.getOrder = async (req, res) => {
  const order = await Order.findOne({ _id: req.params.id, customerAccount: req.customer._id })
  if (!order) return res.status(404).json({ message: 'Order not found.' })
  const payments = await Payment.find({ order: order._id }).sort({ createdAt: -1 })
  res.json({
    order: { ...order.toObject(), canPayOnline: canPayOnline(order), onlinePayAmount: onlinePayAmount(order) },
    payments,
  })
}

// GET /api/account/payments
exports.listPayments = async (req, res) => {
  const orders = await Order.find({ customerAccount: req.customer._id }).select('_id orderNumber')
  const orderMap = new Map(orders.map(o => [String(o._id), o.orderNumber]))
  const payments = await Payment.find({ order: { $in: orders.map(o => o._id) } }).sort({
    createdAt: -1,
  })
  res.json({
    payments: payments.map(p => ({ ...p.toObject(), orderNumber: orderMap.get(String(p.order)) })),
  })
}

// ---------- Cart ----------

async function getOrCreateCart(customerId) {
  let cart = await Cart.findOne({ customer: customerId })
  if (!cart) cart = await Cart.create({ customer: customerId, items: [] })
  return cart
}

async function respondCart(res, cart) {
  const items = await cart.hydrate()
  res.json({ items })
}

// GET /api/account/cart
exports.getCart = async (req, res) => {
  const cart = await getOrCreateCart(req.customer._id)
  await respondCart(res, cart)
}

// PUT /api/account/cart   { items: [{ productId, quantity }] }  (full replace)
exports.replaceCart = async (req, res) => {
  const incoming = Array.isArray(req.body.items) ? req.body.items : []
  const cart = await getOrCreateCart(req.customer._id)
  cart.items = incoming
    .filter(i => i.productId && Number(i.quantity) > 0)
    .map(i => ({ product: i.productId, quantity: Math.max(1, Math.floor(Number(i.quantity))) }))
  await cart.save()
  await respondCart(res, cart)
}

// POST /api/account/cart/items   { productId, quantity }
exports.addCartItem = async (req, res) => {
  const { productId } = req.body
  const quantity = Math.max(1, Math.floor(Number(req.body.quantity) || 1))
  const product = await Product.findById(productId)
  if (!product || !product.isActive)
    return res.status(404).json({ message: 'Product not available.' })

  const cart = await getOrCreateCart(req.customer._id)
  const line = cart.items.find(i => String(i.product) === String(productId))
  if (line) line.quantity += quantity
  else cart.items.push({ product: productId, quantity })
  await cart.save()
  await respondCart(res, cart)
}

// PATCH /api/account/cart/items/:productId   { quantity }
exports.updateCartItem = async (req, res) => {
  const quantity = Math.floor(Number(req.body.quantity))
  const cart = await getOrCreateCart(req.customer._id)
  const line = cart.items.find(i => String(i.product) === String(req.params.productId))
  if (!line) return res.status(404).json({ message: 'Item not in cart.' })
  if (quantity <= 0) cart.items = cart.items.filter(i => i !== line)
  else line.quantity = quantity
  await cart.save()
  await respondCart(res, cart)
}

// DELETE /api/account/cart/items/:productId
exports.removeCartItem = async (req, res) => {
  const cart = await getOrCreateCart(req.customer._id)
  cart.items = cart.items.filter(i => String(i.product) !== String(req.params.productId))
  await cart.save()
  await respondCart(res, cart)
}

// POST /api/account/cart/merge   { items: [{ productId, quantity }] }
// Called once right after login to fold the guest's localStorage cart into
// the server cart (sum quantities).
exports.mergeCart = async (req, res) => {
  const incoming = Array.isArray(req.body.items) ? req.body.items : []
  const cart = await getOrCreateCart(req.customer._id)
  incoming.forEach(i => {
    if (!i.productId || Number(i.quantity) <= 0) return
    const qty = Math.max(1, Math.floor(Number(i.quantity)))
    const line = cart.items.find(l => String(l.product) === String(i.productId))
    if (line) line.quantity += qty
    else cart.items.push({ product: i.productId, quantity: qty })
  })
  await cart.save()
  await respondCart(res, cart)
}

// ---------- Saved products (wishlist) ----------

// GET /api/account/wishlist
exports.listWishlist = async (req, res) => {
  const saved = await SavedProduct.find({ customer: req.customer._id })
    .sort({ createdAt: -1 })
    .populate({ path: 'product', populate: { path: 'category', select: 'name slug' } })
  const products = saved
    .filter(s => s.product)
    .map(s => ({ ...s.product.toObject(), savedAt: s.createdAt }))
  res.json({ products })
}

// POST /api/account/wishlist/:productId
exports.addToWishlist = async (req, res) => {
  const product = await Product.findById(req.params.productId)
  if (!product) return res.status(404).json({ message: 'Product not found.' })
  await SavedProduct.updateOne(
    { customer: req.customer._id, product: product._id },
    { $setOnInsert: { customer: req.customer._id, product: product._id } },
    { upsert: true }
  )
  res.status(201).json({ saved: true })
}

// DELETE /api/account/wishlist/:productId
exports.removeFromWishlist = async (req, res) => {
  await SavedProduct.deleteOne({ customer: req.customer._id, product: req.params.productId })
  res.json({ saved: false })
}

// GET /api/account/wishlist/ids  -> ["<id>", ...]  (cheap check for card hearts)
exports.wishlistIds = async (req, res) => {
  const saved = await SavedProduct.find({ customer: req.customer._id }).select('product').lean()
  res.json({ ids: saved.map(s => String(s.product)) })
}
