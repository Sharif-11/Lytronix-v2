const axios = require('axios');
const seedData = require('../data/policeStationsSeed.json');

const POLICE_STATIONS_URL = 'https://portal.packzy.com/api/v1/police_stations';

// Refresh from the upstream Packzy API at most this often. Order creation
// hits our own endpoint every time, but we only ever call Packzy on a cache
// miss or once the cache goes stale — never per-request.
const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

function shapeDistricts(raw) {
  // Upstream shape: { status, data: [ { id, name, policestations: [...] } ] }
  const list = Array.isArray(raw?.data) ? raw.data : [];
  return list
    .map((d) => ({
      id: d.id,
      name: d.name,
      policestations: (d.policestations || [])
        .filter((ps) => ps && ps.status !== 0)
        .map((ps) => ({ id: ps.id, name: ps.name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Bundled fallback so the district/thana pickers work correctly from the
// very first request — before any network call to Packzy has succeeded —
// and keep working if Packzy is briefly unreachable. `fetchedAt: 0` means
// it's treated as immediately stale, so a real refresh is still attempted
// in the background right away; this is just what gets served meanwhile
// (and what a fetch failure falls back to instead of a 502).
let cache = {
  data: shapeDistricts(seedData),
  fetchedAt: 0,
  fromSeed: true,
  inFlight: null, // dedupe concurrent refreshes
};

async function refreshCache() {
  if (cache.inFlight) return cache.inFlight;

  cache.inFlight = axios
    .get(POLICE_STATIONS_URL, { timeout: 15000 })
    .then((res) => {
      cache.data = shapeDistricts(res.data);
      cache.fetchedAt = Date.now();
      cache.fromSeed = false;
      return cache.data;
    })
    .finally(() => {
      cache.inFlight = null;
    });

  return cache.inFlight;
}

// GET /api/meta/police-stations?refresh=true
exports.getPoliceStations = async (req, res) => {
  const isStale = cache.fromSeed || Date.now() - cache.fetchedAt > CACHE_TTL_MS;
  const forceRefresh = req.query.refresh === 'true';

  if (isStale || forceRefresh) {
    try {
      await refreshCache();
    } catch (err) {
      // Upstream hiccup: serve the seed/stale cache (never fails the
      // request outright — there's always at least the bundled dataset).
    }
  }

  res.json({
    districts: cache.data || [],
    cachedAt: cache.fetchedAt,
    source: cache.fromSeed ? 'bundled-seed' : 'live',
  });
};

// Warm the cache in the background on a fixed interval so it's rarely (if
// ever) fetched inline on a user's request. Failures are swallowed — the
// next request will just serve the existing cache (seed or otherwise).
setInterval(() => {
  refreshCache().catch(() => {});
}, CACHE_TTL_MS).unref();

// Kick off one background refresh shortly after boot too, so the seed
// dataset gets replaced with live data quickly under normal conditions
// without making the first user request wait on it.
setTimeout(() => {
  refreshCache().catch(() => {});
}, 5000).unref();

// Synchronous accessor for other server-side code (the AI address resolver)
// that wants the same district/thana list without a second HTTP round trip.
// Always returns *something* — the bundled seed at worst.
exports.getCachedDistricts = () => cache.data || [];
