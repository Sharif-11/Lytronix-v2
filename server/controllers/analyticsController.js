const mongoose = require('mongoose');
const AnalyticsEvent = require('../models/AnalyticsEvent');
const Order = require('../models/Order');
const Product = require('../models/Product');

const TRACKABLE = new Set(['site_visit', 'product_view', 'category_view', 'add_to_cart', 'checkout_started']);

// POST /api/analytics/track   { type, sessionId, productId?, categoryId?, path?, referrer? }
// Public. `order_placed` is emitted server-side by the order controller, never
// trusted from the client.
exports.track = async (req, res) => {
  const { type, sessionId, productId, categoryId, path, referrer } = req.body || {};
  if (!TRACKABLE.has(type)) return res.status(400).json({ message: 'Unknown event type.' });

  await AnalyticsEvent.create({
    type,
    sessionId: String(sessionId || '').slice(0, 64),
    product: mongoose.isValidObjectId(productId) ? productId : null,
    category: mongoose.isValidObjectId(categoryId) ? categoryId : null,
    customer: req.customer ? req.customer._id : null,
    path: String(path || '').slice(0, 200),
    referrer: String(referrer || '').slice(0, 200),
    at: new Date(),
  });

  res.status(202).json({ ok: true });
};

function rangeToStart(range) {
  const now = new Date();
  if (range === 'today') {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  const days = range === '30d' ? 30 : range === '90d' ? 90 : 7;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

// Distinct sessionIds with at least one event since `since`.
async function distinctVisitors(since) {
  const ids = await AnalyticsEvent.distinct('sessionId', {
    at: { $gte: since },
    sessionId: { $nin: ['', null] },
  });
  return ids.length;
}

// GET /api/analytics/overview?range=today|7d|30d
exports.overview = async (req, res) => {
  const range = req.query.range || '7d';
  const since = rangeToStart(range);

  const [
    visitors7d,
    visitorsToday,
    visitors30d,
    pageViews,
    productViews,
    addToCarts,
    orderAgg,
    series,
  ] = await Promise.all([
    distinctVisitors(rangeToStart('7d')),
    distinctVisitors(rangeToStart('today')),
    distinctVisitors(rangeToStart('30d')),
    AnalyticsEvent.countDocuments({ at: { $gte: since }, type: { $in: ['site_visit', 'product_view', 'category_view'] } }),
    AnalyticsEvent.countDocuments({ at: { $gte: since }, type: 'product_view' }),
    AnalyticsEvent.countDocuments({ at: { $gte: since }, type: 'add_to_cart' }),
    Order.aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: null, count: { $sum: 1 }, revenue: { $sum: '$pricing.grandTotal' } } },
    ]),
    dailySeries(since),
  ]);

  const orders = orderAgg[0]?.count || 0;
  const revenue = orderAgg[0]?.revenue || 0;
  const visitorsInRange = await distinctVisitors(since);
  const conversionRate = visitorsInRange ? Number(((orders / visitorsInRange) * 100).toFixed(1)) : 0;

  res.json({
    range,
    visitors: { today: visitorsToday, last7d: visitors7d, last30d: visitors30d, inRange: visitorsInRange },
    pageViews,
    productViews,
    addToCarts,
    orders,
    revenue,
    conversionRate,
    series,
  });
};

// Per-day visits vs orders vs revenue, for a trend chart.
async function dailySeries(since) {
  const days = [];
  const cursor = new Date(since);
  cursor.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  while (cursor <= today) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  const [visitRows, orderRows] = await Promise.all([
    AnalyticsEvent.aggregate([
      { $match: { at: { $gte: since }, sessionId: { $nin: ['', null] } } },
      {
        $group: {
          _id: { day: { $dateToString: { format: '%Y-%m-%d', date: '$at' } }, session: '$sessionId' },
        },
      },
      { $group: { _id: '$_id.day', visitors: { $sum: 1 } } },
    ]),
    Order.aggregate([
      { $match: { createdAt: { $gte: since } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          orders: { $sum: 1 },
          revenue: { $sum: '$pricing.grandTotal' },
        },
      },
    ]),
  ]);

  const vMap = new Map(visitRows.map((r) => [r._id, r.visitors]));
  const oMap = new Map(orderRows.map((r) => [r._id, r]));

  return days.map((d) => {
    const key = d.toISOString().slice(0, 10);
    return {
      date: key,
      visitors: vMap.get(key) || 0,
      orders: oMap.get(key)?.orders || 0,
      revenue: oMap.get(key)?.revenue || 0,
    };
  });
}

// GET /api/analytics/top-products?metric=views|orders|revenue&range=&limit=
exports.topProducts = async (req, res) => {
  const metric = req.query.metric || 'views';
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
  const since = rangeToStart(req.query.range || '30d');

  if (metric === 'views') {
    const rows = await AnalyticsEvent.aggregate([
      { $match: { type: 'product_view', at: { $gte: since }, product: { $ne: null } } },
      { $group: { _id: '$product', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: limit },
    ]);
    return res.json({ metric, items: await decorateProducts(rows, 'views') });
  }

  // orders / revenue: unwind order items in the window.
  const valueExpr =
    metric === 'revenue' ? { $sum: '$items.totalPrice' } : { $sum: '$items.quantity' };
  const rows = await Order.aggregate([
    { $match: { createdAt: { $gte: since } } },
    { $unwind: '$items' },
    { $match: { 'items.product': { $ne: null } } },
    { $group: { _id: '$items.product', count: valueExpr } },
    { $sort: { count: -1 } },
    { $limit: limit },
  ]);
  res.json({ metric, items: await decorateProducts(rows, metric) });
};

async function decorateProducts(rows, metric) {
  const ids = rows.map((r) => r._id).filter(Boolean);
  const products = await Product.find({ _id: { $in: ids } })
    .select('name slug images price viewCount orderCount')
    .lean();
  const map = new Map(products.map((p) => [String(p._id), p]));
  return rows.map((r) => ({
    product: map.get(String(r._id)) || { _id: r._id, name: '(deleted product)' },
    metric,
    value: r.count,
  }));
}

// GET /api/analytics/top-categories?range=&limit=
exports.topCategories = async (req, res) => {
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
  const since = rangeToStart(req.query.range || '30d');

  const rows = await Order.aggregate([
    { $match: { createdAt: { $gte: since } } },
    { $unwind: '$items' },
    { $match: { 'items.product': { $ne: null } } },
    {
      $lookup: {
        from: 'products',
        localField: 'items.product',
        foreignField: '_id',
        as: 'p',
      },
    },
    { $unwind: '$p' },
    { $unwind: '$p.categoryPath' },
    {
      $group: {
        _id: '$p.categoryPath',
        units: { $sum: '$items.quantity' },
        revenue: { $sum: '$items.totalPrice' },
      },
    },
    { $sort: { units: -1 } },
    { $limit: limit },
  ]);

  const Category = require('../models/Category');
  const cats = await Category.find({ _id: { $in: rows.map((r) => r._id) } })
    .select('name slug')
    .lean();
  const map = new Map(cats.map((c) => [String(c._id), c]));
  res.json({
    items: rows.map((r) => ({
      category: map.get(String(r._id)) || { _id: r._id, name: '(deleted)' },
      units: r.units,
      revenue: r.revenue,
    })),
  });
};
