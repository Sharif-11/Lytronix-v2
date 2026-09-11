import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X, ImageOff, Play, ZoomIn } from 'lucide-react';

// Turn the product's parallel url arrays into one ordered media list.
function toMedia(images = [], videos = []) {
  return [
    ...(images || []).filter(Boolean).map((url) => ({ type: 'image', url })),
    ...(videos || []).filter(Boolean).map((url) => ({ type: 'video', url })),
  ];
}

const SWIPE_THRESHOLD = 45; // px of horizontal travel before it counts as a swipe

/**
 * Product image/video gallery: full image shown un-cropped (object-contain),
 * drag / swipe left-right to change, arrows + dots, and a full-screen
 * lightbox on click. Reused by the storefront product page and the public
 * product landing page.
 */
export default function ProductGallery({ images = [], videos = [], name = '', className = '' }) {
  const media = toMedia(images, videos);
  const [idx, setIdx] = useState(0);
  const [drag, setDrag] = useState(0); // live finger offset while dragging
  const [lightbox, setLightbox] = useState(false);
  const startRef = useRef(null); // { x, y, moved }
  const trackRef = useRef(null);

  const count = media.length;
  const clampTo = useCallback((n) => (count ? (n + count) % count : 0), [count]);
  const goTo = useCallback((n) => setIdx((c) => clampTo(typeof n === 'function' ? n(c) : n)), [clampTo]);
  const next = useCallback(() => goTo((c) => c + 1), [goTo]);
  const prev = useCallback(() => goTo((c) => c - 1), [goTo]);

  // Reset to the first item whenever the product changes.
  const mediaKey = media.map((m) => m.url).join('|');
  useEffect(() => {
    setIdx(0);
  }, [mediaKey]);

  const onTouchStart = (e) => {
    startRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, moved: false };
    setDrag(0);
  };
  const onTouchMove = (e) => {
    if (!startRef.current) return;
    const dx = e.touches[0].clientX - startRef.current.x;
    const dy = e.touches[0].clientY - startRef.current.y;
    if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
      startRef.current.moved = true;
      setDrag(dx);
    }
  };
  const onTouchEnd = () => {
    const s = startRef.current;
    startRef.current = null;
    if (s && s.moved) {
      if (drag <= -SWIPE_THRESHOLD) next();
      else if (drag >= SWIPE_THRESHOLD) prev();
    }
    setDrag(0);
  };

  const openLightbox = (e) => {
    // A swipe (moved) shouldn't also register as a tap that opens the lightbox.
    if (startRef.current?.moved) return;
    e?.stopPropagation?.();
    setLightbox(true);
  };

  if (!count) {
    return (
      <div
        className={`aspect-square rounded-2xl border border-ui-line bg-ui-surfaceAlt flex flex-col items-center justify-center text-ui-faint ${className}`}
      >
        <ImageOff size={40} />
        <span className="text-xs mt-2">ছবি নেই</span>
      </div>
    );
  }

  const cur = media[idx];
  const offsetPct = -idx * 100;

  return (
    <div className={`min-w-0 ${className}`}>
      <div
        ref={trackRef}
        className="relative group w-full min-w-0 max-w-full rounded-2xl border border-ui-line bg-white overflow-hidden select-none"
        style={{ touchAction: 'pan-y' }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div className="w-full min-w-0 aspect-square overflow-hidden">
          <div
            className="flex h-full w-full min-w-0"
            style={{
              transform: `translateX(calc(${offsetPct}% + ${drag}px))`,
              transition: drag ? 'none' : 'transform 300ms cubic-bezier(0.22,1,0.36,1)',
            }}
          >
            {media.map((m, i) => (
              <div
                key={m.url}
                className="h-full flex items-center justify-center overflow-hidden"
                style={{ flex: '0 0 100%', width: '100%', minWidth: 0, maxWidth: '100%' }}
              >
                {m.type === 'video' ? (
                  <video src={m.url} controls playsInline className="max-w-full max-h-full object-contain bg-black" />
                ) : (
                  <img
                    src={m.url}
                    alt={i === idx ? name : ''}
                    loading={i === 0 ? 'eager' : 'lazy'}
                    draggable={false}
                    onClick={openLightbox}
                    className="max-w-full max-h-full object-contain cursor-zoom-in"
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {count > 1 && (
          <>
            <ArrowButton side="left" onClick={prev} />
            <ArrowButton side="right" onClick={next} />
            <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 flex gap-1.5">
              {media.map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 rounded-full transition-all ${i === idx ? 'w-5 bg-ui-brand' : 'w-1.5 bg-black/20'}`}
                />
              ))}
            </div>
          </>
        )}

        {cur.type === 'image' && (
          <span className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full bg-white/90 text-ui-muted flex items-center justify-center shadow-sm opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            <ZoomIn size={14} />
          </span>
        )}
      </div>

      {count > 1 && (
        <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
          {media.map((m, i) => (
            <button
              key={m.url}
              type="button"
              onClick={() => setIdx(i)}
              aria-label={`ছবি ${i + 1}`}
              className={`shrink-0 w-16 h-16 rounded-xl overflow-hidden border-2 bg-white transition-colors ${
                i === idx ? 'border-ui-brand' : 'border-ui-line hover:border-ui-faint'
              }`}
            >
              {m.type === 'video' ? (
                <span className="w-full h-full flex items-center justify-center bg-ui-ink/5 text-ui-muted">
                  <Play size={16} />
                </span>
              ) : (
                <img src={m.url} alt="" loading="lazy" className="w-full h-full object-cover" />
              )}
            </button>
          ))}
        </div>
      )}

      {lightbox && (
        <Lightbox media={media} idx={idx} name={name} onIdx={goTo} onClose={() => setLightbox(false)} />
      )}
    </div>
  );
}

function ArrowButton({ side, onClick }) {
  const Icon = side === 'left' ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label={side === 'left' ? 'আগেরটি' : 'পরেরটি'}
      className={`absolute top-1/2 -translate-y-1/2 ${
        side === 'left' ? 'left-2' : 'right-2'
      } w-9 h-9 rounded-full bg-white/85 hover:bg-white text-ui-ink shadow-sm flex items-center justify-center transition-opacity sm:opacity-0 sm:group-hover:opacity-100`}
    >
      <Icon size={18} />
    </button>
  );
}

function Lightbox({ media, idx, name, onIdx, onClose }) {
  const [show, setShow] = useState(false);
  const startRef = useRef(null);

  useEffect(() => {
    setShow(true);
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') onIdx((i) => i + 1);
      else if (e.key === 'ArrowLeft') onIdx((i) => i - 1);
    };
    window.addEventListener('keydown', onKey);

    // overflow:hidden alone doesn't reliably stop the page moving under a
    // touch drag on iOS Safari (its rubber-band pan is a separate mechanism
    // from overflow scrolling). Pin the body in place at its current scroll
    // position instead, and restore it on close.
    const scrollY = window.scrollY;
    const body = document.body.style;
    const prev = { position: body.position, top: body.top, left: body.left, right: body.right, overflow: body.overflow };
    body.position = 'fixed';
    body.top = `-${scrollY}px`;
    body.left = '0';
    body.right = '0';
    body.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', onKey);
      body.position = prev.position;
      body.top = prev.top;
      body.left = prev.left;
      body.right = prev.right;
      body.overflow = prev.overflow;
      window.scrollTo(0, scrollY);
    };
  }, [onClose, onIdx]);

  const onTouchStart = (e) => {
    startRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, moved: false };
  };
  const onTouchEnd = (e) => {
    const s = startRef.current;
    startRef.current = null;
    if (!s) return;
    const dx = e.changedTouches[0].clientX - s.x;
    const dy = e.changedTouches[0].clientY - s.y;
    if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
      onIdx((i) => (dx < 0 ? i + 1 : i - 1));
    } else if (dy > 90 && Math.abs(dy) > Math.abs(dx)) {
      onClose(); // swipe down to dismiss
    }
  };

  const cur = media[idx];

  return createPortal(
    <div
      className={`fixed inset-0 z-[999] bg-black/92 backdrop-blur-sm flex flex-col transition-opacity duration-200 ${
        show ? 'opacity-100' : 'opacity-0'
      }`}
      onClick={onClose}
    >
      <div className="flex items-center justify-between px-4 h-14 text-white/90 shrink-0">
        <span className="text-sm font-mono">
          {idx + 1} / {media.length}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="বন্ধ করুন"
          className="w-9 h-9 rounded-full hover:bg-white/10 flex items-center justify-center"
        >
          <X size={20} />
        </button>
      </div>

      <div
        className="flex-1 flex items-center justify-center px-4 pb-4 min-h-0"
        // Both swipe-to-navigate (horizontal) and swipe-to-dismiss (vertical)
        // are fully handled by JS below via touch deltas — without this, the
        // browser's own native pan/rubber-band handling stays active during
        // the drag and visibly moves the page behind the (fixed) overlay.
        style={{ touchAction: 'none' }}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {cur.type === 'video' ? (
          <video src={cur.url} controls autoPlay playsInline className="max-h-full max-w-full rounded-lg" />
        ) : (
          <img src={cur.url} alt={name} className="max-h-full max-w-full object-contain rounded-lg" draggable={false} />
        )}
      </div>

      {media.length > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onIdx((i) => i - 1);
            }}
            aria-label="আগেরটি"
            className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
          >
            <ChevronLeft size={24} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onIdx((i) => i + 1);
            }}
            aria-label="পরেরটি"
            className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
          >
            <ChevronRight size={24} />
          </button>

          <div className="shrink-0 flex gap-2 justify-center px-4 pb-4 overflow-x-auto" onClick={(e) => e.stopPropagation()}>
            {media.map((m, i) => (
              <button
                key={m.url}
                type="button"
                onClick={() => onIdx(() => i)}
                className={`shrink-0 w-12 h-12 rounded-lg overflow-hidden border-2 ${
                  i === idx ? 'border-white' : 'border-white/25'
                }`}
              >
                {m.type === 'video' ? (
                  <span className="w-full h-full flex items-center justify-center bg-white/10 text-white/80">
                    <Play size={14} />
                  </span>
                ) : (
                  <img src={m.url} alt="" className="w-full h-full object-cover" />
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>,
    document.body
  );
}
