/* eslint-disable no-await-in-loop, no-console */
// Fills the database with a large, realistic-looking demo dataset so the
// admin UI (lists, pagination, infinite scroll, filters, charts) can be
// exercised properly.
//
//   node seed/demoData.js            -> wipes the demo-target collections,
//                                       then inserts 500 of each
//   node seed/demoData.js 200        -> 200 of each instead of 500
//   node seed/demoData.js 500 --append -> keep existing rows, just add more
//
// NEVER touches roles or users (your admin login stays intact). Categories
// are created only if the catalogue tree is basically empty.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const connectDB = require('../config/db');

const Category = require('../models/Category');
const Product = require('../models/Product');
const Customer = require('../models/Customer');
const CustomerAccount = require('../models/CustomerAccount');
const Order = require('../models/Order');
const Payment = require('../models/Payment');
const AnalyticsEvent = require('../models/AnalyticsEvent');
const Notification = require('../models/Notification');
const SmsLog = require('../models/SmsLog');

const N = Math.max(1, parseInt(process.argv[2], 10) || 500);
const APPEND = process.argv.includes('--append');

// ---------- tiny helpers ----------
const rnd = (n) => Math.floor(Math.random() * n);
const pick = (arr) => arr[rnd(arr.length)];
const pickWeighted = (pairs) => {
  // pairs: [[value, weight], ...]
  const total = pairs.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [v, w] of pairs) {
    if ((r -= w) <= 0) return v;
  }
  return pairs[0][0];
};
const pickSome = (arr, min, max) => {
  const count = min + rnd(max - min + 1);
  const copy = [...arr];
  const out = [];
  for (let i = 0; i < count && copy.length; i++) out.push(copy.splice(rnd(copy.length), 1)[0]);
  return out;
};
const daysAgo = (d) => new Date(Date.now() - d * 24 * 60 * 60 * 1000);
const randomDateWithin = (days) => new Date(Date.now() - Math.random() * days * 24 * 60 * 60 * 1000);
const money = (min, max, step = 10) => Math.round((min + Math.random() * (max - min)) / step) * step;

// ---------- source vocab ----------
const FIRST_NAMES = [
  'Rahim', 'Karim', 'Sadia', 'Nusrat', 'Tanvir', 'Sabbir', 'Mitu', 'Jannat', 'Fahim', 'Rakib',
  'Sumaiya', 'Arif', 'Mahi', 'Tania', 'Shakil', 'Nafis', 'Rumana', 'Hasan', 'Farhana', 'Imran',
  'Sharmin', 'Riad', 'Tasnim', 'Mizan', 'Prova', 'Sohel', 'Lamia', 'Naeem', 'Antora', 'Rasel',
  'Mou', 'Shuvo', 'Bristy', 'Piyash', 'ETI', 'Zubair', 'Munni', 'Rifat', 'Oishi', 'Sajid',
];
const LAST_NAMES = [
  'Ahmed', 'Hossain', 'Islam', 'Chowdhury', 'Rahman', 'Khan', 'Akter', 'Begum', 'Sarkar', 'Mia',
  'Uddin', 'Haque', 'Molla', 'Sheikh', 'Bhuiyan', 'Talukder', 'Das', 'Roy', 'Kabir', 'Alam',
];
const CHANNELS = ['messenger', 'whatsapp', 'instagram', 'facebook', 'phone', 'sms', 'other'];
const PRIORITIES = ['low', 'medium', 'high'];
const TAGS = ['Future customer', 'Paikari (wholesale)', 'Khuchra (retail)', 'VIP', 'Regular', 'Repeat buyer', 'Cold lead'];
const SOURCES = ['Facebook', 'Instagram', 'Website', 'Phone', 'WhatsApp', 'Referral', 'Walk-in'];

const PRODUCT_BRANDS = ['Anker', 'Baseus', 'UGREEN', 'Remax', 'Havit', 'Xiaomi', 'Joyroom', 'Aukey', 'Ldnio', 'Orico'];
const PRODUCT_TYPES = [
  ['Power Bank', 890, 4500],
  ['Wall Charger', 350, 2800],
  ['Car Charger', 300, 1600],
  ['USB-C Cable', 120, 900],
  ['Lightning Cable', 150, 1100],
  ['GaN Charger', 1200, 5200],
  ['Wireless Charger', 700, 3600],
  ['AA Battery Pack', 180, 700],
  ['Lithium Cell 18650', 220, 900],
  ['Rechargeable Battery Kit', 650, 2400],
  ['Cable Organiser', 90, 450],
  ['Travel Adapter', 400, 1800],
  ['Multiport Hub', 900, 3800],
  ['Surge Protector', 550, 2200],
];
const CAPS = ['5000mAh', '10000mAh', '20000mAh', '30W', '65W', '20W PD', '3A', '1m', '2m', '100W', '4-port', '2-pack'];

const SMS_MESSAGES = [
  'Your Lytronix order has been confirmed. Thank you!',
  'Your parcel has been shipped via Steadfast Courier.',
  'Your Lytronix order has been delivered. Thank you for shopping with us!',
  'Your Lytronix OTP is 4821. Valid for 5 minutes.',
  'Reminder: your order is out for delivery today.',
  'Eid offer! Up to 25% off on power banks this week only.',
];

// ---------- geo ----------
function loadGeo() {
  const raw = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'policeStationsSeed.json'), 'utf8'));
  const pairs = [];
  for (const d of raw.data || []) {
    for (const ps of d.policestations || []) pairs.push({ zilla: d.name, thana: ps.name });
  }
  return pairs;
}

function bdPhone() {
  const ops = ['013', '014', '015', '016', '017', '018', '019'];
  return pick(ops) + String(rnd(100000000)).padStart(8, '0');
}
function personName() {
  return `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
}
function streetAddress() {
  return `House ${1 + rnd(120)}, Road ${1 + rnd(30)}, ${pick(['Block A', 'Block B', 'Block C', 'Sector 7', 'Sector 11', 'Ward 4', 'Ward 9'])}`;
}

// ---------- category tree ----------
async function ensureCategories() {
  let cats = await Category.find().lean();
  if (cats.length < 6) {
    console.log('Catalogue is thin — planting a starter category tree…');
    const TREE = [
      { name: 'Power Banks', children: ['Fast Charge', 'Solar', 'High Capacity'] },
      { name: 'Chargers & Cables', children: ['Wall Chargers', 'Car Chargers', 'USB-C Cables', 'GaN Chargers'] },
      { name: 'Batteries', children: ['AA / AAA', 'Lithium Cells', 'Rechargeable Packs'] },
      { name: 'Accessories', children: ['Adapters', 'Cases', 'Cable Organisers', 'Hubs & Docks'] },
    ];
    for (let i = 0; i < TREE.length; i++) {
      const parent = await Category.create({ name: TREE[i].name, sortOrder: i });
      for (let j = 0; j < TREE[i].children.length; j++) {
        await Category.create({ name: TREE[i].children[j], parent: parent._id, sortOrder: j });
      }
    }
    cats = await Category.find().lean();
  }
  // ancestor path map
  const byId = new Map(cats.map((c) => [String(c._id), c]));
  const pathOf = (id) => {
    const out = [];
    let cur = byId.get(String(id));
    const seen = new Set();
    while (cur && !seen.has(String(cur._id))) {
      seen.add(String(cur._id));
      out.unshift(cur._id);
      cur = cur.parent ? byId.get(String(cur.parent)) : null;
    }
    return out;
  };
  const leaves = cats.filter((c) => !cats.some((x) => String(x.parent) === String(c._id)));
  return { cats, leaves: leaves.length ? leaves : cats, pathOf };
}

// ---------- builders ----------
function buildProducts(count, leaves, pathOf) {
  const docs = [];
  for (let i = 0; i < count; i++) {
    const [type, lo, hi] = pick(PRODUCT_TYPES);
    const brand = pick(PRODUCT_BRANDS);
    const cap = pick(CAPS);
    const name = `${brand} ${type} ${cap} #${String(i + 1).padStart(4, '0')}`;
    const cat = pick(leaves);
    const price = money(lo, hi, 10);
    const trackInventory = Math.random() < 0.85;
    const stock = trackInventory ? pickWeighted([[0, 1], [rnd(6), 2], [10 + rnd(90), 5], [200 + rnd(400), 2]]) : 0;
    const policyRoll = Math.random();
    const paymentPolicy =
      policyRoll < 0.7
        ? { codAllowed: true, advanceType: 'none', advanceAmount: 0, advancePercent: 0 }
        : policyRoll < 0.85
        ? { codAllowed: true, advanceType: 'fixed', advanceAmount: money(100, 500, 50), advancePercent: 0 }
        : policyRoll < 0.95
        ? { codAllowed: true, advanceType: 'percent', advanceAmount: 0, advancePercent: pick([10, 20, 25, 50]) }
        : { codAllowed: false, advanceType: 'none', advanceAmount: 0, advancePercent: 0 };

    docs.push({
      name,
      price,
      description: `${brand} ${type} (${cap}). Genuine product with warranty. Fast, safe charging for phones, tablets and accessories.`,
      deliveryCharge: pick([0, 0, 60, 80, 100, 120]),
      sku: `${brand.slice(0, 3).toUpperCase()}-${1000 + i}`,
      category: cat._id,
      categoryPath: pathOf(cat._id),
      images: [
        `https://picsum.photos/seed/lytx${i}a/600/600`,
        `https://picsum.photos/seed/lytx${i}b/600/600`,
      ].slice(0, 1 + rnd(2)),
      videos: [],
      stock,
      trackInventory,
      lowStockThreshold: 5,
      viewCount: rnd(2500),
      orderCount: rnd(400),
      paymentPolicy,
      isActive: Math.random() < 0.9,
      createdAt: randomDateWithin(200),
      updatedAt: new Date(),
    });
  }
  return docs;
}

function buildCustomers(count, geo) {
  const docs = [];
  for (let i = 0; i < count; i++) {
    const g = pick(geo);
    docs.push({
      name: Math.random() < 0.92 ? personName() : '',
      phone: bdPhone(),
      zilla: g.zilla,
      thana: g.thana,
      address: streetAddress(),
      comments: Math.random() < 0.35 ? `<p>${pick(['Prefers evening delivery.', 'Wholesale enquiry.', 'Asked about warranty.', 'Repeat buyer — good payer.', 'Wants bulk pricing.'])}</p>` : '',
      channels: pickSome(CHANNELS, 0, 3),
      priority: pickWeighted([['low', 3], ['medium', 5], ['high', 2]]),
      tags: pickSome(TAGS, 0, 2),
      createdAt: randomDateWithin(220),
      updatedAt: new Date(),
    });
  }
  return docs;
}

function buildCustomerAccounts(count, geo, usedPhones) {
  const docs = [];
  for (let i = 0; i < count; i++) {
    let phone = bdPhone();
    while (usedPhones.has(phone)) phone = bdPhone();
    usedPhones.add(phone);
    const addrCount = pickWeighted([[0, 2], [1, 5], [2, 2], [3, 1]]);
    const addresses = [];
    for (let a = 0; a < addrCount; a++) {
      const g = pick(geo);
      addresses.push({
        label: pick(['Home', 'Office', 'Home', 'Parents', 'Shop']),
        name: Math.random() < 0.3 ? personName() : '',
        phone: Math.random() < 0.2 ? bdPhone() : '',
        zilla: g.zilla,
        policeStation: g.thana,
        address: streetAddress(),
        isDefault: a === 0,
      });
    }
    docs.push({
      phone,
      phoneVerified: Math.random() < 0.8,
      name: Math.random() < 0.85 ? personName() : '',
      addresses,
      isActive: Math.random() < 0.97,
      isBlocked: Math.random() < 0.03,
      lastLoginAt: Math.random() < 0.7 ? randomDateWithin(60) : null,
      createdAt: randomDateWithin(200),
      updatedAt: new Date(),
    });
  }
  return docs;
}

// Order status lifecycle for building a believable statusHistory.
const LIFECYCLE = ['pending', 'processing', 'shipped', 'delivered'];
const STATUS_WEIGHTS = [
  ['unverified', 6],
  ['pending', 14],
  ['processing', 10],
  ['shipped', 14],
  ['delivered', 34],
  ['cancelled', 8],
  ['hold', 3],
  ['in_review', 3],
  ['partial_delivered', 2],
  ['returned', 2],
  ['refunded', 2],
];

function buildOrders(count, products, geo, startSeq) {
  const docs = [];
  const trackingSeen = new Set();
  const trk = () => {
    let t;
    do {
      t = '';
      for (let i = 0; i < 8; i++) t += '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'[rnd(32)];
    } while (trackingSeen.has(t));
    trackingSeen.add(t);
    return t;
  };

  for (let i = 0; i < count; i++) {
    const createdAt = randomDateWithin(120);
    const status = pickWeighted(STATUS_WEIGHTS);
    const g = pick(geo);
    const lineProducts = pickSome(products, 1, 4);
    const items = lineProducts.map((p) => {
      const quantity = pickWeighted([[1, 6], [2, 3], [3, 1], [5, 1]]);
      const discount = Math.random() < 0.2 ? money(20, 200, 10) : 0;
      const unitPrice = p.price;
      return {
        product: p._id,
        name: p.name,
        description: '',
        unitPrice,
        quantity,
        discount,
        deliveryCharge: p.deliveryCharge || 0,
        totalPrice: Math.max(0, unitPrice * quantity - discount),
      };
    });

    const subtotal = items.reduce((s, it) => s + it.totalPrice, 0);
    const itemsDelivery = items.reduce((s, it) => s + (it.deliveryCharge || 0), 0);
    const orderDiscount = Math.random() < 0.15 ? money(30, 300, 10) : 0;
    const deliveryCharge = Math.random() < 0.5 ? itemsDelivery : pick([60, 80, 100, 120, 130]);
    const grandTotal = Math.max(0, subtotal - orderDiscount + deliveryCharge);

    const advancePaid =
      status === 'unverified'
        ? 0
        : Math.random() < 0.3
        ? Math.min(grandTotal, money(200, Math.max(300, Math.round(grandTotal / 2)), 50))
        : 0;

    const embeddedPayments = [];
    if (advancePaid > 0) {
      embeddedPayments.push({
        walletName: pick(['bKash', 'Nagad', 'Rocket']),
        walletPhoneNo: bdPhone(),
        transactionId: `TX${String(rnd(1e9)).padStart(9, '0')}`,
        amount: advancePaid,
        time: new Date(createdAt.getTime() + 3600 * 1000),
        note: 'Advance payment',
      });
    }
    if (status === 'delivered' && Math.random() < 0.6) {
      embeddedPayments.push({
        walletName: 'Cash on Delivery',
        walletPhoneNo: '',
        transactionId: '',
        amount: Math.max(0, grandTotal - advancePaid),
        time: new Date(createdAt.getTime() + 4 * 24 * 3600 * 1000),
        note: 'COD collected',
      });
    }
    const paidSoFar = advancePaid + embeddedPayments.filter((p) => p.note === 'COD collected').reduce((s, p) => s + p.amount, 0);
    const due = Math.round((grandTotal - paidSoFar) * 100) / 100;

    // status history following the lifecycle up to the current status
    const history = [{ status: 'pending', note: 'Order created', at: createdAt }];
    const idx = LIFECYCLE.indexOf(status);
    if (idx > 0) {
      for (let s = 1; s <= idx; s++) {
        history.push({
          status: LIFECYCLE[s],
          note: '',
          at: new Date(createdAt.getTime() + s * 36 * 3600 * 1000),
        });
      }
    } else if (!LIFECYCLE.includes(status)) {
      history.push({
        status,
        note: pick(['Customer request', 'Courier update', 'Admin action', '']),
        at: new Date(createdAt.getTime() + 24 * 3600 * 1000),
      });
    }

    const booked = ['processing', 'shipped', 'delivered', 'partial_delivered', 'returned'].includes(status);
    const trackingCode = booked ? trk() : '';
    const courier = booked
      ? {
          provider: 'steadfast',
          consignmentId: 3000000 + startSeq + i,
          trackingCode,
          status: status === 'shipped' ? 'in_transit' : status,
          codAmount: Math.max(0, grandTotal - advancePaid),
          deliveryCharge,
          lastMessage: pick([
            'Picked up from merchant',
            'Arrived at sorting hub',
            'Out for delivery',
            'Delivered to customer',
            'Delivery attempt failed',
          ]),
          lastSyncedAt: new Date(createdAt.getTime() + 3 * 24 * 3600 * 1000),
        }
      : {
          provider: '', consignmentId: null, trackingCode: '', status: '',
          codAmount: null, deliveryCharge: null, lastMessage: '', lastSyncedAt: null,
        };

    const courierEvents = booked
      ? Array.from({ length: 1 + rnd(4) }).map((_, k) => ({
          message: pick([
            'Package picked up',
            'Reached Dhaka sorting center',
            'In transit to destination hub',
            'Out for delivery',
            'Delivery rescheduled',
            'Delivered — payment collected',
          ]),
          at: new Date(createdAt.getTime() + (k + 1) * 20 * 3600 * 1000),
        }))
      : [];

    const datePart = `${createdAt.getFullYear()}${String(createdAt.getMonth() + 1).padStart(2, '0')}${String(
      createdAt.getDate()
    ).padStart(2, '0')}`;

    docs.push({
      orderNumber: `ORD-${datePart}-${String(startSeq + i + 1).padStart(4, '0')}`,
      trackingId: trk(),
      customerAccount: null,
      customer: {
        name: personName(),
        phone: bdPhone(),
        zilla: g.zilla,
        thana: g.thana,
        address: streetAddress(),
        comments: Math.random() < 0.2 ? pick(['Call before delivery', 'Gift wrap please', 'Deliver after 5pm']) : '',
      },
      items,
      pricing: {
        subtotal: Math.round(subtotal * 100) / 100,
        discount: orderDiscount,
        deliveryCharge,
        advancePaid,
        cashOnAmount: Math.max(0, grandTotal - advancePaid),
        grandTotal: Math.round(grandTotal * 100) / 100,
        due,
      },
      payments: embeddedPayments,
      status,
      statusHistory: history,
      courierTrackingLink: trackingCode ? `https://steadfast.com.bd/t/${trackingCode}` : '',
      courier,
      courierEvents,
      weightKg: pick([0.5, 0.5, 1, 1.5, 2]),
      source: pick(SOURCES),
      createdBy: pick(['', 'Admin', 'Sadia', 'Tanvir']),
      createdAt,
      updatedAt: new Date(),
    });
  }
  return docs;
}

function buildPayments(count, orders) {
  const docs = [];
  for (let i = 0; i < count; i++) {
    const order = pick(orders);
    const method = pickWeighted([
      ['cod', 40],
      ['bkash_manual', 30],
      ['bkash_automated', 15],
      ['sslcommerz', 8],
      ['other', 7],
    ]);
    const status = pickWeighted([
      ['pending', 20],
      ['pending_verification', 18],
      ['verified', 45],
      ['failed', 12],
      ['refunded', 5],
    ]);
    const amount = Math.max(50, Math.round((order.pricing?.grandTotal || money(500, 5000)) * pick([0.25, 0.5, 1, 1])));
    const isManual = method === 'bkash_manual';
    const createdAt = new Date((order.createdAt?.getTime?.() || Date.now()) + rnd(48) * 3600 * 1000);
    docs.push({
      order: order._id,
      method,
      amount,
      currency: 'BDT',
      status,
      senderNumber: isManual ? bdPhone() : '',
      transactionId: isManual || method === 'bkash_automated' ? `TX${String(rnd(1e9)).padStart(9, '0')}` : '',
      proofImageUrl: isManual && Math.random() < 0.7 ? `https://picsum.photos/seed/pay${i}/480/720` : '',
      gatewayReference: method === 'bkash_automated' || method === 'sslcommerz' ? `REF${String(rnd(1e10)).padStart(10, '0')}` : '',
      gatewayResponse: null,
      verifiedAt: status === 'verified' ? new Date(createdAt.getTime() + 6 * 3600 * 1000) : null,
      rejectionReason: status === 'failed' ? pick(['Transaction ID not found', 'Amount mismatch', 'Duplicate submission', 'Screenshot unclear']) : '',
      note: Math.random() < 0.15 ? pick(['Partial advance', 'Full payment', 'Reconciled manually']) : '',
      createdAt,
      updatedAt: new Date(),
    });
  }
  return docs;
}

function buildAnalytics(count, products) {
  const types = [
    ['site_visit', 40],
    ['product_view', 30],
    ['category_view', 12],
    ['add_to_cart', 10],
    ['checkout_started', 5],
    ['order_placed', 3],
  ];
  const docs = [];
  for (let i = 0; i < count; i++) {
    const type = pickWeighted(types);
    const p = type === 'product_view' || type === 'add_to_cart' ? pick(products) : null;
    const at = randomDateWithin(150);
    docs.push({
      type,
      product: p ? p._id : null,
      category: null,
      order: null,
      sessionId: `sess_${rnd(120)}`,
      customer: null,
      path: type === 'product_view' && p ? `/shop/p/${p.slug || p._id}` : type === 'site_visit' ? '/shop' : '/shop/cart',
      referrer: pick(['', '', 'https://facebook.com', 'https://google.com', 'https://instagram.com']),
      value: type === 'order_placed' ? money(500, 6000, 10) : 0,
      at,
    });
  }
  return docs;
}

function buildNotifications(count, orders) {
  const types = [
    ['order_new', 40],
    ['courier_status', 22],
    ['courier_tracking', 20],
    ['payment_review', 15],
    ['system', 3],
  ];
  const docs = [];
  for (let i = 0; i < count; i++) {
    const type = pickWeighted(types);
    const o = type === 'system' ? null : pick(orders);
    const createdAt = randomDateWithin(60);
    const map = {
      order_new: { title: `New order ${o?.orderNumber || ''}`, body: 'A customer placed an order on the storefront.', severity: 'success' },
      courier_status: { title: `Courier status update`, body: pick(['Delivered', 'In transit', 'On hold', 'Delivery failed']), severity: 'info' },
      courier_tracking: { title: `Parcel movement`, body: pick(['Arrived at hub', 'Out for delivery', 'Picked up']), severity: 'info' },
      payment_review: { title: `Payment needs review`, body: 'A manual bKash payment was submitted.', severity: 'warning' },
      system: { title: 'System notice', body: 'Webhook received for an unknown parcel.', severity: 'warning' },
    };
    docs.push({
      type,
      ...map[type],
      order: o ? o._id : null,
      link: o ? `/orders/${o._id}` : '',
      meta: null,
      readBy: [],
      createdAt,
      updatedAt: new Date(),
    });
  }
  return docs;
}

function buildSmsLogs(count, orders) {
  const purposes = [
    ['admin_new_order', 20],
    ['customer_consignment_booked', 22],
    ['customer_delivered', 20],
    ['customer_otp', 18],
    ['admin_manual', 10],
    ['marketing', 8],
    ['admin_password_reset', 2],
  ];
  const docs = [];
  for (let i = 0; i < count; i++) {
    const purpose = pickWeighted(purposes);
    const status = Math.random() < 0.88 ? 'sent' : 'failed';
    const linkOrder = ['admin_new_order', 'customer_consignment_booked', 'customer_delivered', 'admin_manual'].includes(purpose)
      ? pick(orders)
      : null;
    docs.push({
      to: bdPhone(),
      message: pick(SMS_MESSAGES),
      purpose,
      order: linkOrder ? linkOrder._id : null,
      status,
      responseCode: status === 'sent' ? 202 : pick([1001, 1002, 1007]),
      providerResponse: null,
      error: status === 'failed' ? pick(['Insufficient balance', 'Invalid number', 'Gateway timeout']) : '',
      createdAt: randomDateWithin(90),
      updatedAt: new Date(),
    });
  }
  return docs;
}

// ---------- insert helpers ----------
async function insertInBatches(Model, docs, size = 500, label = Model.modelName) {
  let done = 0;
  for (let i = 0; i < docs.length; i += size) {
    const batch = docs.slice(i, i + size);
    await Model.insertMany(batch, { ordered: false }).catch((e) => {
      // ordered:false — some dup-key rejects are fine, keep going
      if (e && e.writeErrors) done -= e.writeErrors.length;
    });
    done += batch.length;
    process.stdout.write(`\r  ${label}: ${Math.min(done, docs.length)}/${docs.length}   `);
  }
  process.stdout.write('\n');
}

async function run() {
  await connectDB();
  console.log(`\nDemo seeder — target ${N} rows per collection${APPEND ? ' (append mode)' : ''}\n`);

  if (!APPEND) {
    console.log('Wiping demo-target collections (roles & users are left untouched)…');
    await Promise.all([
      Product.deleteMany({}),
      Customer.deleteMany({}),
      CustomerAccount.deleteMany({}),
      Order.deleteMany({}),
      Payment.deleteMany({}),
      AnalyticsEvent.deleteMany({}),
      Notification.deleteMany({}),
      SmsLog.deleteMany({}),
    ]);
  }

  const geo = loadGeo();
  const { leaves, pathOf } = await ensureCategories();

  // 1) Products (needs full save hooks for slug + uniqueness)
  console.log('Products…');
  const productDefs = buildProducts(N, leaves, pathOf);
  const products = [];
  for (let i = 0; i < productDefs.length; i += 50) {
    const made = await Product.create(productDefs.slice(i, i + 50));
    products.push(...made);
    process.stdout.write(`\r  Product: ${products.length}/${productDefs.length}   `);
  }
  process.stdout.write('\n');

  // 2) Customers (rolodex)
  console.log('Customers…');
  await insertInBatches(Customer, buildCustomers(N, geo), 500, 'Customer');

  // 3) Customer accounts (storefront logins)
  console.log('Customer accounts…');
  const usedPhones = new Set();
  await insertInBatches(CustomerAccount, buildCustomerAccounts(N, geo, usedPhones), 500, 'CustomerAccount');

  // 4) Orders
  console.log('Orders…');
  const existingOrders = APPEND ? await Order.countDocuments() : 0;
  const orderDefs = buildOrders(N, products, geo, existingOrders);
  await insertInBatches(Order, orderDefs, 500, 'Order');
  const orders = await Order.find().select('_id orderNumber pricing.grandTotal createdAt').lean();

  // 5) Payments (standalone collection)
  console.log('Payments…');
  await insertInBatches(Payment, buildPayments(N, orders), 500, 'Payment');

  // 6) Analytics events
  console.log('Analytics events…');
  await insertInBatches(AnalyticsEvent, buildAnalytics(N, products), 1000, 'AnalyticsEvent');

  // 7) Notifications
  console.log('Notifications…');
  await insertInBatches(Notification, buildNotifications(N, orders), 1000, 'Notification');

  // 8) SMS logs
  console.log('SMS logs…');
  await insertInBatches(SmsLog, buildSmsLogs(N, orders), 1000, 'SmsLog');

  // summary
  const counts = {
    categories: await Category.countDocuments(),
    products: await Product.countDocuments(),
    customers: await Customer.countDocuments(),
    customerAccounts: await CustomerAccount.countDocuments(),
    orders: await Order.countDocuments(),
    payments: await Payment.countDocuments(),
    analyticsEvents: await AnalyticsEvent.countDocuments(),
    notifications: await Notification.countDocuments(),
    smsLogs: await SmsLog.countDocuments(),
  };
  console.log('\nDone. Collection totals now:');
  for (const [k, v] of Object.entries(counts)) console.log(`  ${k.padEnd(18)} ${v}`);

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('\nDemo seed failed:', err);
  process.exit(1);
});
