const mongoose = require('mongoose');
const { customAlphabet } = require('nanoid');

// Unambiguous alphabet (no 0/O/1/I) for human-readable tracking codes.
const nanoid = customAlphabet('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', 8);

// Suggested statuses shown as quick-select options in the UI.
// Status itself is stored as free text so admins can type a custom/manual entry.
//
// Lifecycle (see server/controllers/orderController.js + steadfastStatusMap.js):
//   unverified -> pending          (payment verified, e.g. bKash manual)
//   pending    -> processing       (admin books the parcel with a courier)
//   processing -> shipped          (Steadfast reports "pending" = in transit)
//   shipped    -> delivered        (Steadfast reports "delivered")
//   any        -> cancelled/hold/partial_delivered/in_review  (mirrors Steadfast 1:1)
// completed/refunded/returned stay available for manual, non-courier use.
const SUGGESTED_STATUSES = [
  'unverified',
  'pending',
  'processing',
  'shipped',
  'delivered',
  'partial_delivered',
  'completed',
  'cancelled',
  'hold',
  'in_review',
  'refunded',
  'returned',
];

const orderItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      default: null, // null allowed: admin may add a one-off item not in the catalogue
    },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: '' },
    unitPrice: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1, default: 1 },
    discount: { type: Number, default: 0, min: 0 }, // per-item discount, absolute amount
    deliveryCharge: { type: Number, default: 0, min: 0 }, // per-item delivery charge (from catalogue, editable)
    totalPrice: { type: Number, required: true, min: 0 }, // (unitPrice * quantity) - discount
  },
  { _id: false }
);

const paymentSchema = new mongoose.Schema(
  {
    walletName: { type: String, trim: true, default: '' }, // e.g. bKash, Nagad, Rocket, Bank
    walletPhoneNo: { type: String, trim: true, default: '' },
    transactionId: { type: String, trim: true, default: '' },
    amount: { type: Number, default: 0, min: 0 },
    time: { type: Date, default: Date.now },
    note: { type: String, trim: true, default: '' },
  },
  { _id: true, timestamps: true }
);

const statusHistorySchema = new mongoose.Schema(
  {
    status: { type: String, required: true, trim: true },
    note: { type: String, trim: true, default: '' },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    orderNumber: {
      type: String,
      unique: true,
      index: true,
    },
    trackingId: {
      type: String,
      unique: true,
      index: true,
    },

    // Set when the order was placed by a signed-in storefront customer.
    // Null for guest checkouts. Links an order to its owner's account so
    // "my orders" / "my payments" can be scoped without leaking by phone.
    customerAccount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CustomerAccount',
      default: null,
      index: true,
    },

    // ----- Customer -----
    customer: {
      name: { type: String, required: [true, 'Customer name is required'], trim: true },
      phone: { type: String, required: [true, 'Customer phone is required'], trim: true },
      zilla: { type: String, trim: true, default: '' }, // district
      thana: { type: String, trim: true, default: '' }, // sub-district / police station
      address: { type: String, trim: true, default: '' },
      comments: { type: String, trim: true, default: '' },
    },

    // ----- Items -----
    items: {
      type: [orderItemSchema],
      validate: {
        validator: (v) => Array.isArray(v) && v.length > 0,
        message: 'An order must contain at least one item',
      },
    },

    // ----- Pricing summary (order level) -----
    pricing: {
      subtotal: { type: Number, default: 0, min: 0 }, // sum of item totalPrice
      discount: { type: Number, default: 0, min: 0 }, // additional order-level discount
      deliveryCharge: { type: Number, default: 0, min: 0 }, // order-level delivery charge (sum or manual override)
      advancePaid: { type: Number, default: 0, min: 0 }, // paid up-front
      cashOnAmount: { type: Number, default: 0, min: 0 }, // amount to collect on delivery (COD)
      grandTotal: { type: Number, default: 0, min: 0 }, // subtotal - discount + deliveryCharge
      due: { type: Number, default: 0 }, // grandTotal - advancePaid - (sum of payments)
    },

    // ----- Payments (can log multiple, e.g. advance + COD confirmation) -----
    payments: { type: [paymentSchema], default: [] },

    // ----- Status / tracking -----
    status: { type: String, required: true, default: 'pending', trim: true },
    statusHistory: { type: [statusHistorySchema], default: [] },

    // Courier's own tracking link (e.g. a Pathao/Sundarban/RedX consignment URL),
    // entered by the admin once the parcel is booked with the courier.
    // Required before an order can be moved to the "shipped" status (or, if
    // booked automatically via Steadfast, courier.trackingCode satisfies it).
    courierTrackingLink: { type: String, trim: true, default: '' },

    // Populated automatically once a parcel is booked through a courier API
    // integration (currently: Steadfast). Kept separate from the manual
    // courierTrackingLink above so both flows can coexist.
    courier: {
      provider: { type: String, trim: true, default: '' }, // 'steadfast'
      consignmentId: { type: Number, default: null },
      trackingCode: { type: String, trim: true, default: '' },
      status: { type: String, trim: true, default: '' }, // last known raw status from the courier
      codAmount: { type: Number, default: null },
      deliveryCharge: { type: Number, default: null },
      lastMessage: { type: String, trim: true, default: '' },
      lastSyncedAt: { type: Date, default: null },
    },

    // Fine-grained tracking messages from the courier's webhook (e.g. "Package
    // arrived at the sorting center"), kept separate from statusHistory so
    // routine courier chatter doesn't clutter the order's own status log.
    courierEvents: {
      type: [
        {
          message: { type: String, trim: true, default: '' },
          at: { type: Date, default: Date.now },
          _id: false,
        },
      ],
      default: [],
    },

    // Parcel weight in KG, shown on the courier label (Steadfast prints this
    // on their own label; we mirror it on ours). Default 0.5.
    weightKg: { type: Number, default: 0.5, min: 0 },

    // ----- Misc -----
    source: { type: String, trim: true, default: '' }, // e.g. Facebook, Website, Phone
    createdBy: { type: String, trim: true, default: '' }, // admin/staff name, plain text (no auth system yet)
  },
  { timestamps: true }
);

orderSchema.index({ 'customer.name': 'text', 'customer.phone': 'text', orderNumber: 'text' });

// Compute item totals, order pricing summary, and due amount before saving.
orderSchema.pre('validate', function computeTotals(next) {
  if (Array.isArray(this.items)) {
    this.items.forEach((item) => {
      const lineTotal = item.unitPrice * item.quantity - (item.discount || 0);
      item.totalPrice = Math.max(0, Math.round(lineTotal * 100) / 100);
    });
  }

  const subtotal = (this.items || []).reduce((sum, i) => sum + i.totalPrice, 0);
  const itemsDeliveryCharge = (this.items || []).reduce((sum, i) => sum + (i.deliveryCharge || 0), 0);

  this.pricing = this.pricing || {};
  this.pricing.subtotal = Math.round(subtotal * 100) / 100;

  // If admin hasn't set an explicit order-level delivery charge, fall back to sum of item delivery charges.
  if (this.pricing.deliveryCharge === undefined || this.pricing.deliveryCharge === null) {
    this.pricing.deliveryCharge = itemsDeliveryCharge;
  }

  const grandTotal =
    this.pricing.subtotal - (this.pricing.discount || 0) + (this.pricing.deliveryCharge || 0);
  this.pricing.grandTotal = Math.max(0, Math.round(grandTotal * 100) / 100);

  const paymentsTotal = (this.payments || []).reduce((sum, p) => sum + (p.amount || 0), 0);
  const due =
    this.pricing.grandTotal - (this.pricing.advancePaid || 0) - paymentsTotal;
  this.pricing.due = Math.round(due * 100) / 100;

  next();
});

// Assign orderNumber and trackingId once, on first creation.
orderSchema.pre('save', async function assignIdentifiers(next) {
  if (!this.trackingId) {
    this.trackingId = nanoid();
  }
  if (!this.orderNumber) {
    const now = new Date();
    const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
      now.getDate()
    ).padStart(2, '0')}`;
    // Continue from the highest sequence ever assigned — read off the most
    // recently inserted order (by _id). Gap-proof: deleting an order never
    // rewinds the counter. A genuine race to the same number is caught by the
    // unique index + the retry loop in orderController.createOrder.
    const last = await this.constructor
      .findOne({ orderNumber: { $regex: /^ORD-\d{8}-\d+$/ } })
      .sort({ _id: -1 })
      .select('orderNumber')
      .lean();
    const lastSeq = last ? parseInt(String(last.orderNumber).split('-').pop(), 10) || 0 : 0;
    this.orderNumber = `ORD-${datePart}-${String(lastSeq + 1).padStart(4, '0')}`;
  }
  if (this.isNew && (!this.statusHistory || this.statusHistory.length === 0)) {
    this.statusHistory = [{ status: this.status || 'pending', note: 'Order created', at: new Date() }];
  }
  next();
});

orderSchema.statics.SUGGESTED_STATUSES = SUGGESTED_STATUSES;

module.exports = mongoose.model('Order', orderSchema);
module.exports.SUGGESTED_STATUSES = SUGGESTED_STATUSES;
