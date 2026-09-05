// Small, dependency-free slug helper. Lowercases, strips accents, replaces
// any run of non-alphanumerics with a single hyphen, trims leading/trailing
// hyphens. Non-latin scripts (e.g. Bangla) collapse to '' — callers append a
// short random suffix in that case so the slug is still unique/usable.
function slugify(input) {
  return String(input || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

module.exports = slugify;
