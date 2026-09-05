// Maps a free-text district/thana guess (from the AI order extraction, or any
// other loose input) onto the canonical Packzy district/thana list that the
// order form's <select>s are bound to (server/controllers/metaController.js).
// A guess that isn't an exact string match against that list is otherwise
// invisible to the dropdowns — this is what lets "Cumilla" resolve to the
// canonical "Comilla" (or vice versa) instead of silently leaving the field
// blank.
const { getCachedDistricts } = require('../controllers/metaController');

// Common renamed/alternate-spelling districts. Keys and values are both
// normalised (see normalise()) before lookup, so case/diacritics don't matter.
const DISTRICT_ALIASES = {
  cumilla: 'comilla',
  chattogram: 'chittagong',
  jashore: 'jessore',
  barishal: 'barisal',
  bogura: 'bogra',
  netrakona: 'netrokona',
  'coxs bazar': "cox's bazar",
  'cox bazar': "cox's bazar",
  brahamanbaria: 'brahmanbaria',
  chapainawabganj: 'chapai nawabganj',
  nawabganj: 'chapai nawabganj',
};

// Minimum similarity (0..1) to accept a fuzzy match rather than give up.
const MATCH_THRESHOLD = 0.72;

function normalise(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9\s']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Plain Levenshtein edit distance — small inputs (district/thana names, a
// handful of characters), no need for a library.
function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

function similarity(a, b) {
  if (!a || !b) return 0;
  const dist = levenshtein(a, b);
  return 1 - dist / Math.max(a.length, b.length);
}

// Finds the best match for `rawName` among `candidates` ([{ name, ... }]).
// Exact match (after normalising + alias resolution) wins outright; otherwise
// falls back to the closest by edit-distance similarity, gated by threshold.
function bestMatch(rawName, candidates) {
  const target = normalise(rawName);
  if (!target || candidates.length === 0) return null;

  const aliased = DISTRICT_ALIASES[target] || target;

  for (const c of candidates) {
    const norm = normalise(c.name);
    if (norm === target || norm === aliased) return c;
  }
  // Also check the alias table in the other direction (canonical -> alias),
  // in case the dataset itself uses the "other" spelling.
  const reverseAlias = Object.entries(DISTRICT_ALIASES).find(([, v]) => v === target)?.[0];
  if (reverseAlias) {
    const hit = candidates.find((c) => normalise(c.name) === reverseAlias);
    if (hit) return hit;
  }

  let best = null;
  let bestScore = 0;
  for (const c of candidates) {
    const score = similarity(target, normalise(c.name));
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return bestScore >= MATCH_THRESHOLD ? best : null;
}

// resolveZillaThana({ zilla, thana }) -> { zilla, thana, zillaMatched, thanaMatched }
// Matched fields are replaced with the canonical name; unmatched fields are
// returned exactly as given (never dropped) with the corresponding *Matched
// flag set to false, so the caller can flag it for manual review instead of
// silently picking something wrong.
function resolveZillaThana({ zilla, thana } = {}) {
  const districts = getCachedDistricts();

  const districtHit = zilla ? bestMatch(zilla, districts) : null;
  const resolvedZilla = districtHit ? districtHit.name : zilla || '';

  let resolvedThana = thana || '';
  let thanaMatched = false;
  if (thana) {
    // Scope the thana search to the matched district when we have one — a
    // much smaller candidate list means far fewer false positives (many
    // districts share thana names like "Sadar" or "Kotwali").
    const pool = districtHit
      ? districtHit.policestations || []
      : districts.flatMap((d) => d.policestations || []);
    const thanaHit = bestMatch(thana, pool);
    if (thanaHit) {
      resolvedThana = thanaHit.name;
      thanaMatched = true;
    }
  }

  return {
    zilla: resolvedZilla,
    thana: resolvedThana,
    zillaMatched: Boolean(districtHit),
    thanaMatched,
  };
}

module.exports = { resolveZillaThana };
