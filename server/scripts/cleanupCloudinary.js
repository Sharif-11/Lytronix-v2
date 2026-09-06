/**
 * Deletes every Cloudinary asset under the `lytronix/` folder (all
 * resource types) plus the now-empty folder tree, in the cloud named by
 * CLOUDINARY_CLOUD_NAME. Assets outside `lytronix/` are left alone.
 *
 *   node scripts/cleanupCloudinary.js --yes
 *   node scripts/cleanupCloudinary.js --dry     (list only, delete nothing)
 *
 * Writes a manifest of everything it saw to
 *   server/backups/cloudinary-manifest-<timestamp>.json
 * before deleting.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { v2: cloudinary } = require('cloudinary');

const PREFIX = 'lytronix/';
const RESOURCE_TYPES = ['image', 'video', 'raw'];

function configure() {
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    console.error('Cloudinary env vars are not set.');
    process.exit(1);
  }
  cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET,
    secure: true,
  });
  return CLOUDINARY_CLOUD_NAME;
}

async function listAll(resourceType) {
  const out = [];
  let next;
  do {
    // eslint-disable-next-line no-await-in-loop
    const res = await cloudinary.api.resources({
      type: 'upload',
      resource_type: resourceType,
      prefix: PREFIX,
      max_results: 500,
      next_cursor: next,
    });
    out.push(...res.resources);
    next = res.next_cursor;
  } while (next);
  return out;
}

async function run() {
  const dry = process.argv.includes('--dry');
  const go = process.argv.includes('--yes');
  if (!dry && !go) {
    console.error('Refusing to run. Pass --dry to preview or --yes to delete.');
    process.exit(1);
  }
  const cloud = configure();
  console.log(`\n  Cloud: ${cloud}   prefix: ${PREFIX}   mode: ${dry ? 'DRY RUN' : 'DELETE'}\n`);

  const manifest = [];
  for (const rt of RESOURCE_TYPES) {
    // eslint-disable-next-line no-await-in-loop
    const items = await listAll(rt).catch((e) => {
      console.warn(`  (${rt}) list failed: ${e.message}`);
      return [];
    });
    console.log(`  ${rt.padEnd(6)} ${items.length} asset(s)`);
    manifest.push(...items.map((r) => ({ ...r, resource_type: rt })));
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const manifestPath = path.join(__dirname, '..', 'backups', `cloudinary-manifest-${stamp}.json`);
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`\n  manifest -> ${path.relative(process.cwd(), manifestPath)}  (${manifest.length} assets)\n`);

  if (dry) {
    console.log('  DRY RUN — nothing deleted.\n');
    return;
  }

  for (const rt of RESOURCE_TYPES) {
    // delete_resources_by_prefix handles up to 1000 per call and sets
    // `partial: true` + a `next_cursor` when there's more. Loop on that —
    // never on api.resources(), whose listing lags deletes by minutes.
    let cursor;
    let total = 0;
    let rounds = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      rounds += 1;
      let res;
      try {
        // eslint-disable-next-line no-await-in-loop
        res = await cloudinary.api.delete_resources_by_prefix(PREFIX, {
          resource_type: rt,
          invalidate: true,
          next_cursor: cursor,
        });
      } catch (e) {
        if (e.error?.http_code === 420 || e.http_code === 420) {
          console.log('  rate limited — waiting 20s');
          // eslint-disable-next-line no-await-in-loop
          await new Promise((r) => setTimeout(r, 20000));
          // eslint-disable-next-line no-continue
          continue;
        }
        throw e;
      }
      total += Object.keys(res.deleted || {}).length;
      cursor = res.next_cursor;
      if (!res.partial || !cursor || rounds > 50) break;
    }
    if (total) console.log(`  deleted ${total} ${rt} asset(s)`);
  }

  // Remove the (now empty) folder tree.
  try {
    const subs = await cloudinary.api.sub_folders(PREFIX.replace(/\/$/, ''));
    for (const f of subs.folders || []) {
      // eslint-disable-next-line no-await-in-loop
      await cloudinary.api.delete_folder(f.path).catch((e) => console.warn(`  folder ${f.path}: ${e.message}`));
      console.log(`  folder removed  ${f.path}`);
    }
    await cloudinary.api.delete_folder(PREFIX.replace(/\/$/, ''));
    console.log(`  folder removed  ${PREFIX.replace(/\/$/, '')}`);
  } catch (e) {
    console.warn(`  folder cleanup: ${e.message}`);
  }

  console.log('\n  Cloudinary cleanup complete.\n');
}

run().catch((err) => {
  console.error('cleanupCloudinary failed:', err);
  process.exit(1);
});
