import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getOrders, getOrderStats, getAnalyticsOverview, getTopProducts, getSteadfastBalance } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import StatusBadge from '../components/StatusBadge';
import { formatMoney, formatDateShort } from '../utils/format';
import {
  Plus, Package, BookUser, Printer, ClipboardList, Wallet, Clock, TrendingUp, ArrowUpRight, ArrowRight,
  Users, Eye, RefreshCw,
} from 'lucide-react';
import usePageTitle from '../lib/usePageTitle';

const STAT_TONES = {
  lime: { icon: 'bg-ui-brand/10 text-ui-brand', ring: 'from-ui-brand/10' },
  indigo: { icon: 'bg-accent-indigo/10 text-accent-indigo', ring: 'from-accent-indigo/10' },
  violet: { icon: 'bg-accent-violet/10 text-accent-violet', ring: 'from-accent-violet/10' },
  teal: { icon: 'bg-accent-teal/10 text-accent-teal', ring: 'from-accent-teal/10' },
  rose: { icon: 'bg-rose-50 text-ui-rust', ring: 'from-rose-50' },
};

function StatCard({ icon: Icon, label, value, sub, tone = 'indigo' }) {
  const t = STAT_TONES[tone];
  return (
    <div className="card p-4 sm:p-5 relative overflow-hidden">
      <div className={`absolute -top-8 -right-8 w-24 h-24 rounded-full bg-gradient-to-br ${t.ring} to-transparent`} />
      <div className="relative flex items-start justify-between">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${t.icon}`}>
          <Icon size={19} />
        </div>
      </div>
      <p className="relative text-xs font-medium text-ui-muted mt-3">{label}</p>
      <p className="relative font-display font-bold text-2xl text-ui-ink mt-0.5 truncate">{value}</p>
      {sub && <p className="relative text-xs text-ui-faint mt-1">{sub}</p>}
    </div>
  );
}

const QUICK_ACTIONS = [
  { to: '/orders/new', labelKey: 'dashboard.newOrder', icon: Plus, permission: 'orders:manage' },
  { to: '/products/new', labelKey: 'dashboard.addProduct', icon: Package, permission: 'products:manage' },
  { to: '/customers/new', labelKey: 'dashboard.addCustomer', icon: BookUser, permission: 'customers:manage' },
  { to: '/orders/print', labelKey: 'dashboard.printLogbook', icon: Printer, permission: null },
];

export default function Dashboard() {
  const { user, hasPermission } = useAuth();
  const { t } = useLanguage();
  usePageTitle(t('dashboard.title'));
  const [stats, setStats] = useState(null);
  const [recentOrders, setRecentOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [traffic, setTraffic] = useState(null);
  const [balance, setBalance] = useState(null);
  const [balanceLoading, setBalanceLoading] = useState(true);
  const [balanceUnavailable, setBalanceUnavailable] = useState(false);

  const loadBalance = () => {
    setBalanceLoading(true);
    getSteadfastBalance()
      .then((d) => {
        setBalance(d.balance);
        setBalanceUnavailable(false);
      })
      .catch(() => setBalanceUnavailable(true))
      .finally(() => setBalanceLoading(false));
  };

  useEffect(() => {
    loadBalance();
  }, []);

  useEffect(() => {
    Promise.all([getOrderStats(), getOrders({ page: 1, limit: 6 })])
      .then(([statsData, ordersData]) => {
        setStats(statsData);
        setRecentOrders(ordersData.orders);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!hasPermission('analytics:view')) return;
    Promise.all([getAnalyticsOverview('7d'), getTopProducts({ metric: 'views', range: '7d', limit: 3 })])
      .then(([ov, tp]) => setTraffic({ ...ov, topViewed: tp.items || [] }))
      .catch(() => {});
  }, [hasPermission]);

  const pendingLike = (stats?.byStatus?.pending || 0) + (stats?.byStatus?.processing || 0);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6 sm:space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-display font-bold text-2xl sm:text-[28px] text-ui-ink tracking-tight">
            {t('dashboard.welcome')}{user?.name ? `, ${user.name.split(' ')[0]}` : ''} 👋
          </h1>
          <p className="text-sm text-ui-muted mt-1">{t('dashboard.subtitle')}</p>
        </div>
        {hasPermission('orders:manage') && (
          <Link to="/orders/new" className="btn-primary self-start sm:self-auto">
            <Plus size={16} /> {t('dashboard.newOrder')}
          </Link>
        )}
      </div>

      {loading && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="card p-5 h-28 animate-pulse bg-ui-surfaceAlt" />
          ))}
        </div>
      )}

      {!loading && stats && (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <StatCard icon={ClipboardList} label={t('dashboard.totalOrders')} value={stats.total} sub={t('dashboard.inProgress', { n: pendingLike })} tone="lime" />
            <StatCard icon={TrendingUp} label={t('dashboard.todaysOrders')} value={stats.today.count} sub={formatMoney(stats.today.revenue)} tone="teal" />
            <StatCard icon={Wallet} label={t('dashboard.totalRevenue')} value={formatMoney(stats.totalRevenue)} tone="violet" />
            <StatCard icon={Clock} label={t('dashboard.outstandingDue')} value={formatMoney(stats.totalDue)} sub={t('dashboard.acrossAllOrders')} tone="rose" />
          </div>

          <div className="grid lg:grid-cols-3 gap-5 sm:gap-6">
            {/* Recent orders */}
            <div className="lg:col-span-2 card overflow-hidden">
              <div className="flex items-center justify-between px-4 sm:px-5 py-4 border-b border-ui-line">
                <h2 className="font-display font-bold text-ui-ink">{t('dashboard.recentOrders')}</h2>
                <Link to="/orders" className="text-xs font-medium text-ui-brand hover:underline flex items-center gap-0.5">
                  {t('dashboard.viewAll')} <ArrowRight size={13} />
                </Link>
              </div>

              {recentOrders.length === 0 && (
                <p className="text-sm text-ui-muted py-10 text-center">{t('dashboard.noOrdersYet')}</p>
              )}

              <div className="divide-y divide-ui-line">
                {recentOrders.map((o) => (
                  <Link
                    key={o._id}
                    to={`/orders/${o._id}`}
                    className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3.5 hover:bg-ui-surfaceAlt transition-colors"
                  >
                    <div className="min-w-0 flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-ui-surfaceAlt border border-ui-line flex items-center justify-center text-xs font-semibold text-ui-muted shrink-0">
                        {o.customer?.name?.[0]?.toUpperCase() || '?'}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-ui-ink truncate">{o.customer?.name}</span>
                        </div>
                        <p className="text-xs font-mono text-ui-faint">{o.orderNumber} · {formatDateShort(o.createdAt)}</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0 flex flex-col items-end gap-1">
                      <p className="font-mono text-sm font-medium text-ui-ink">{formatMoney(o.pricing?.grandTotal)}</p>
                      <StatusBadge status={o.status} />
                    </div>
                  </Link>
                ))}
              </div>
            </div>

            {/* Sidebar column: status breakdown + quick actions */}
            <div className="space-y-5 sm:space-y-6">
              <div className="card p-4 sm:p-5">
                <div className="flex items-center justify-between mb-1">
                  <h2 className="font-display font-bold text-ui-ink flex items-center gap-2">
                    <Wallet size={16} className="text-ui-brand" /> {t('dashboard.courierBalance')}
                  </h2>
                  <button
                    onClick={loadBalance}
                    disabled={balanceLoading}
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-ui-muted hover:bg-ui-surfaceAlt"
                    aria-label={t('common.refresh')}
                  >
                    <RefreshCw size={13} className={balanceLoading ? 'animate-spin' : ''} />
                  </button>
                </div>
                {balanceUnavailable ? (
                  <p className="text-xs text-ui-faint mt-2">{t('dashboard.balanceUnavailable')}</p>
                ) : (
                  <p className="font-display font-bold text-2xl text-ui-ink mt-1">
                    {balance === null ? '—' : formatMoney(balance)}
                  </p>
                )}
                <p className="text-[11px] text-ui-faint mt-0.5">{t('dashboard.steadfastWallet')}</p>
              </div>

              {traffic && (
                <div className="card p-4 sm:p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="font-display font-bold text-ui-ink">{t('dashboard.storeTraffic')}</h2>
                    <Link to="/analytics" className="text-xs font-medium text-ui-brand hover:underline flex items-center gap-0.5">
                      {t('dashboard.details')} <ArrowRight size={13} />
                    </Link>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <div className="w-9 h-9 mx-auto rounded-xl bg-ui-brand/10 text-ui-brand flex items-center justify-center">
                        <Users size={17} />
                      </div>
                      <p className="font-display font-bold text-lg text-ui-ink mt-1">{traffic.visitors.last7d}</p>
                      <p className="text-[11px] text-ui-faint">{t('dashboard.visitors')}</p>
                    </div>
                    <div>
                      <div className="w-9 h-9 mx-auto rounded-xl bg-accent-indigo/10 text-accent-indigo flex items-center justify-center">
                        <Eye size={17} />
                      </div>
                      <p className="font-display font-bold text-lg text-ui-ink mt-1">{traffic.productViews}</p>
                      <p className="text-[11px] text-ui-faint">{t('dashboard.productViews')}</p>
                    </div>
                    <div>
                      <div className="w-9 h-9 mx-auto rounded-xl bg-accent-teal/10 text-accent-teal flex items-center justify-center">
                        <TrendingUp size={17} />
                      </div>
                      <p className="font-display font-bold text-lg text-ui-ink mt-1">{traffic.conversionRate}%</p>
                      <p className="text-[11px] text-ui-faint">{t('dashboard.conversion')}</p>
                    </div>
                  </div>
                  {traffic.topViewed.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-dashed border-ui-line">
                      <p className="text-xs text-ui-muted mb-1.5">{t('dashboard.mostViewed')}</p>
                      <ol className="space-y-1">
                        {traffic.topViewed.map((it, i) => (
                          <li key={i} className="flex justify-between text-sm">
                            <span className="truncate text-ui-ink">{it.product.name}</span>
                            <span className="font-mono text-ui-faint shrink-0 ml-2">{it.value}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </div>
              )}

              <div className="card p-4 sm:p-5">
                <h2 className="font-display font-bold text-ui-ink mb-3">{t('dashboard.ordersByStatus')}</h2>
                <div className="space-y-2">
                  {Object.entries(stats.byStatus).map(([status, count]) => (
                    <Link
                      key={status}
                      to={`/orders?status=${status}`}
                      className="flex items-center justify-between px-3 py-2 rounded-xl hover:bg-ui-surfaceAlt transition-colors group"
                    >
                      <StatusBadge status={status} />
                      <span className="flex items-center gap-1 font-mono text-sm text-ui-muted">
                        {count}
                        <ArrowUpRight size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                      </span>
                    </Link>
                  ))}
                </div>
              </div>

              <div className="card p-4 sm:p-5">
                <h2 className="font-display font-bold text-ui-ink mb-3">{t('dashboard.quickActions')}</h2>
                <div className="grid grid-cols-2 gap-2.5">
                  {QUICK_ACTIONS.filter((a) => !a.permission || hasPermission(a.permission)).map((a) => (
                    <Link
                      key={a.to}
                      to={a.to}
                      target={a.to === '/orders/print' ? '_blank' : undefined}
                      rel={a.to === '/orders/print' ? 'noreferrer' : undefined}
                      className="flex flex-col items-center justify-center gap-2 bg-ui-surfaceAlt hover:bg-ui-brand/10 border border-transparent hover:border-ui-brand/20 rounded-xl py-4 transition-colors"
                    >
                      <a.icon size={18} className="text-ui-brand" />
                      <span className="text-xs font-medium text-center px-2 text-ui-ink">{t(a.labelKey)}</span>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
