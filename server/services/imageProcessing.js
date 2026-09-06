const sharp = require('sharp');
const logger = require('./logger');

// Long-lived server: don't let libvips hold a file/operation cache.
sharp.cache(false);
// Cap libvips worker threads so a burst of uploads can't starve the event loop.
sharp.concurrency(2);

const DEFAULTS = {
  maxWidth: 1600,
  maxHeight: 1600,
  quality: 80, // WebP quality — visually lossless for photos at ~78–82
  format: 'webp',
};

/**
 * Resize (never upscale) + re-encode to a modern format, dropping EXIF/GPS
 * and other metadata. Also normalises orientation and flattens animation.
 * Reads JPEG/PNG/WebP/AVIF/GIF/TIFF and — with the bundled libvips — HEIC.
 * Returns { buffer, format, width, height, bytesIn, bytesOut }.
 */
async function optimizeImage(input, opts = {}) {
  const o = { ...DEFAULTS, ...opts };

  const pipeline = sharp(input, { failOn: 'none', animated: false })
    .rotate() // bake in EXIF orientation; sharp then omits metadata on output
    .resize({
      width: o.maxWidth,
      height: o.maxHeight,
      fit: 'inside',
      withoutEnlargement: true,
    });

  if (o.format === 'webp') {
    pipeline.webp({ quality: o.quality, effort: 4 });
  } else if (o.format === 'avif') {
    pipeline.avif({ quality: Math.max(1, o.quality - 22), effort: 4 });
  } else if (o.format === 'jpeg' || o.format === 'jpg') {
    pipeline.jpeg({ quality: o.quality, mozjpeg: true });
  } else {
    pipeline.toFormat(o.format, { quality: o.quality });
  }

  const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
  return {
    buffer: data,
    format: info.format,
    width: info.width,
    height: info.height,
    bytesIn: input.length,
    bytesOut: data.length,
  };
}

/**
 * Best-effort: return an optimized buffer, or the original bytes untouched
 * if sharp can't handle this particular file. Never throws — an upload must
 * not fail just because optimization did.
 */
async function optimizeOrPassthrough(input, opts = {}) {
  try {
    const r = await optimizeImage(input, opts);
    // Guard against pathological cases where "optimizing" made it bigger.
    if (r.bytesOut >= r.bytesIn && (opts.format || DEFAULTS.format) !== 'webp') {
      return input;
    }
    logger.info('image optimized', {
      format: r.format,
      dims: `${r.width}x${r.height}`,
      from: `${Math.round(r.bytesIn / 1024)}KB`,
      to: `${Math.round(r.bytesOut / 1024)}KB`,
      saved: `${Math.max(0, Math.round((1 - r.bytesOut / r.bytesIn) * 100))}%`,
    });
    return r.buffer;
  } catch (err) {
    logger.warn('image optimize failed — uploading original', { error: err.message });
    return input;
  }
}

module.exports = { optimizeImage, optimizeOrPassthrough, DEFAULTS };
