import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Users, Eye, MousePointerClick, ShoppingCart, TrendingUp, Percent, Package, FolderTree,
} from 'lucide-react';
import * as api from '../api/client';
import { formatMoney } from '../utils/format';
import { useLanguage } from '../context/LanguageContext';

export default function Analytics() {
  const { t } = useLanguage();
  const RANGES = [
    { key: 'today', label: t('analytics.today') },
    { key: '7d', label: t('analytics.days7') },
    { key: '30d', label: t('analytics.days30') },
  ];
  const [range, setRange] = useState('7d');
  const [overview, setOverview] = useState(null);
  const [topViewed, setTopViewed] = useState([]);
  const [topOrdered, setTopOrdered] = useState([]);
  const [topCats, setTopCats] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.getAnalyticsOverview(range),
      api.getTopProducts({ metric: 'views', range, limit: 8 }),
      api.getTopProducts({ metric: 'orders', range, limit: 8 }),
      api.getTopCategories({ range, limit: 6 }),
    ])
      .then(([ov, tv, to, tc]) => {
        setOverview(ov);
        setTopViewed(tv.items || []);
        setTopOrdered(to.items || []);
        setTopCats(tc.items || []);
      })
      .finally(() => setLoading(false));
  }, [range]);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display font-bold text-2xl sm:text-3xl text-ui-ink flex items-center gap-2">
            <TrendingUp size={24} className="text-ui-brand" /> {t('analytics.title')}
          </h1>
          <p className="text-sm text-ui-muted mt-1">{t('analytics.subtitle')}</p>
        </div>
        <div className="flex rounded-xl border border-ui-line bg-white overflow-hidden">
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              className={`px-3.5 py-2 text-sm font-medium ${
                range === r.key ? 'bg-ui-brand text-white' : 'text-ui-muted hover:bg-ui-surfaceAlt'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {loading && !overview ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="card h-24 animate-pulse bg-ui-surfaceAlt" />
          ))}
        </div>
      ) : overview ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <Kpi icon={Users} label={t('analytics.visitors')} value={overview.visitors.inRange} sub={t('analytics.todaySub', { n: overview.visitors.today })} />
            <Kpi icon={Eye} label={t('analytics.pageViews')} value={overview.pageViews} sub={t('analytics.productViewsSub', { n: overview.productViews })} />
            <Kpi icon={MousePointerClick} label={t('analytics.addToCart')} value={overview.addToCarts} />
            <Kpi icon={ShoppingCart} label={t('analytics.orders')} value={overview.orders} />
            <Kpi icon={TrendingUp} label={t('analytics.revenue')} value={formatMoney(overview.revenue)} />
            <Kpi icon={Percent} label={t('analytics.conversion')} value={`${overview.conversionRate}%`} sub={t('analytics.conversionSub')} />
            <Kpi icon={Users} label={t('analytics.visitors7d')} value={overview.visitors.last7d} />
            <Kpi icon={Users} label={t('analytics.visitors30d')} value={overview.visitors.last30d} />
          </div>

          <div className="card p-4 sm:p-5">
            <h2 className="font-display font-bold text-ui-ink mb-3">{t('analytics.trendTitle')}</h2>
            <TrendChart series={overview.series} t={t} />
          </div>

          <div className="grid lg:grid-cols-2 gap-5">
            <TopList
              title={t('analytics.topViewed')}
              icon={Eye}
              rows={topViewed}
              noDataLabel={t('analytics.noData')}
              render={(it) => ({
                to: `/products/${it.product._id}/edit`,
                name: it.product.name,
                value: t('analytics.viewsUnit', { n: it.value }),
              })}
            />
            <TopList
              title={t('analytics.topOrdered')}
              icon={Package}
              rows={topOrdered}
              noDataLabel={t('analytics.noData')}
              render={(it) => ({
                to: `/products/${it.product._id}/edit`,
                name: it.product.name,
                value: t('analytics.soldUnit', { n: it.value }),
              })}
            />
          </div>

          <TopList
            title={t('analytics.topCategories')}
            icon={FolderTree}
            rows={topCats}
            noDataLabel={t('analytics.noData')}
            render={(it) => ({
              to: '/categories',
              name: it.category.name,
              value: t('analytics.unitsRevenue', { units: it.units, revenue: formatMoney(it.revenue) }),
            })}
          />
        </>
      ) : (
        <p className="text-ui-muted">{t('analytics.noAnalyticsYet')}</p>
      )}
    </div>
  );
}

function Kpi({ icon: Icon, label, value, sub }) {
  return (
    <div className="card p-4">
      <div className="w-9 h-9 rounded-lg bg-ui-brand/10 text-ui-brand flex items-center justify-center">
        <Icon size={17} />
      </div>
      <p className="text-xs font-medium text-ui-muted mt-2.5">{label}</p>
      <p className="font-display font-bold text-xl text-ui-ink truncate">{value}</p>
      {sub && <p className="text-xs text-ui-faint mt-0.5">{sub}</p>}
    </div>
  );
}

function TopList({ title, icon: Icon, rows, render, noDataLabel }) {
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-2 px-4 sm:px-5 py-3.5 border-b border-ui-line">
        <Icon size={16} className="text-ui-brand" />
        <h2 className="font-display font-bold text-ui-ink text-sm">{title}</h2>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-ui-muted py-8 text-center">{noDataLabel}</p>
      ) : (
        <div className="divide-y divide-ui-line">
          {rows.map((it, i) => {
            const r = render(it);
            return (
              <Link
                key={i}
                to={r.to}
                className="flex items-center justify-between gap-3 px-4 sm:px-5 py-2.5 hover:bg-ui-surfaceAlt"
              >
                <span className="text-sm text-ui-ink truncate">
                  <span className="text-ui-faint font-mono mr-2">{i + 1}</span>
                  {r.name}
                </span>
                <span className="text-xs font-mono text-ui-muted shrink-0">{r.value}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Lightweight dual-line chart, no chart library.
function TrendChart({ series, t }) {
  if (!series || series.length === 0) {
    return <p className="text-sm text-ui-muted py-8 text-center">{t('analytics.noActivity')}</p>;
  }
  const W = 720;
  const H = 160;
  const pad = 24;
  const maxV = Math.max(1, ...series.map((d) => d.visitors));
  const maxO = Math.max(1, ...series.map((d) => d.orders));
  const x = (i) => pad + (i * (W - pad * 2)) / Math.max(1, series.length - 1);
  const yV = (v) => H - pad - (v / maxV) * (H - pad * 2);
  const yO = (v) => H - pad - (v / maxO) * (H - pad * 2);
  const path = (fn, key) => series.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${fn(d[key])}`).join(' ');

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[600px]" role="img" aria-label="Visitors and orders trend">
        <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} stroke="#E4E8F1" />
        <path d={path(yV, 'visitors')} fill="none" stroke="#4A7D1E" strokeWidth="2" />
        <path d={path(yO, 'orders')} fill="none" stroke="#D97706" strokeWidth="2" />
        {series.map((d, i) => (
          <g key={d.date}>
            <circle cx={x(i)} cy={yV(d.visitors)} r="2.5" fill="#4A7D1E" />
            <circle cx={x(i)} cy={yO(d.orders)} r="2.5" fill="#D97706" />
          </g>
        ))}
      </svg>
      <div className="flex gap-4 text-xs text-ui-muted mt-1">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-ui-brand inline-block" /> {t('analytics.visitors')}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-0.5 inline-block" style={{ background: '#D97706' }} /> {t('analytics.orders')}
        </span>
        <span className="ml-auto">
          {series[0]?.date} → {series[series.length - 1]?.date}
        </span>
      </div>
    </div>
  );
}
