import { createPortal } from "react-dom";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useTvBack } from "./TvFocus";

export type GalleryImage = {
  src: string;
  thumb?: string;
  alt?: string;
  caption?: string;
};

export type ImageViewerProps = {
  images: GalleryImage[];
  initialIndex?: number;
  onClose: () => void;
  title?: string;
};

export function ImageViewer({
  images,
  initialIndex = 0,
  onClose,
  title,
}: ImageViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(() =>
    Math.max(0, Math.min(initialIndex, images.length - 1)),
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const touchStartPos = useRef<{ x: number; y: number } | null>(null);
  const isSwiping = useRef(false);
  const isUserScrolling = useRef(false);
  const scrollTimeout = useRef<number | null>(null);

  // Close with remote's Back button in TV mode
  useTvBack(true, onClose);

  // Prevent background page scrolling while viewer is open
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  // Focus container on mount for immediate keyboard / TV remote navigation
  useEffect(() => {
    containerRef.current?.focus({ preventScroll: true });
  }, []);

  const goToSlide = useCallback(
    (index: number, smooth = true) => {
      const target = Math.max(0, Math.min(index, images.length - 1));
      setCurrentIndex(target);
      const container = scrollRef.current;
      if (!container) return;
      const child = container.children[target] as HTMLElement | undefined;
      if (child) {
        isUserScrolling.current = true;
        child.scrollIntoView({
          inline: "center",
          block: "nearest",
          behavior: smooth ? "smooth" : "auto",
        });
        if (scrollTimeout.current) window.clearTimeout(scrollTimeout.current);
        scrollTimeout.current = window.setTimeout(() => {
          isUserScrolling.current = false;
        }, 320);
      }
    },
    [images.length],
  );

  // Align immediately to initialIndex on mount without smooth animation
  useLayoutEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const child = container.children[currentIndex] as HTMLElement | undefined;
    if (child) {
      child.scrollIntoView({
        inline: "center",
        block: "nearest",
        behavior: "auto",
      });
    }
  }, []);

  // Update currentIndex as user swipes horizontally
  const handleScroll = useCallback(() => {
    if (isUserScrolling.current) return;
    const container = scrollRef.current;
    if (!container) return;
    const width = container.clientWidth;
    if (!width) return;
    const center = container.scrollLeft + width / 2;
    const children = Array.from(container.children) as HTMLElement[];
    let closestIndex = 0;
    let minDiff = Infinity;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const childCenter = child.offsetLeft + child.offsetWidth / 2;
      const diff = Math.abs(center - childCenter);
      if (diff < minDiff) {
        minDiff = diff;
        closestIndex = i;
      }
    }
    if (closestIndex !== currentIndex) {
      setCurrentIndex(closestIndex);
    }
  }, [currentIndex]);

  // Intercept TV remote and keyboard keys in capture phase
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        e.stopPropagation();
        goToSlide(currentIndex - 1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        e.stopPropagation();
        goToSlide(currentIndex + 1);
      } else if (
        e.key === "Escape" ||
        e.key === "Backspace" ||
        e.key === "BrowserBack"
      ) {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [currentIndex, goToSlide, onClose]);

  // Distinguish touch swipe from a tap on the backdrop
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      touchStartPos.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
      };
      isSwiping.current = false;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartPos.current || e.touches.length !== 1) return;
    const dx = Math.abs(e.touches[0].clientX - touchStartPos.current.x);
    const dy = Math.abs(e.touches[0].clientY - touchStartPos.current.y);
    if (dx > 10 || dy > 10) {
      isSwiping.current = true;
    }
  };

  const handleBackdropClick = () => {
    if (isSwiping.current) {
      isSwiping.current = false;
      return;
    }
    onClose();
  };

  if (typeof document === "undefined" || !images.length) return null;

  return createPortal(
    <div
      ref={containerRef}
      tabIndex={-1}
      data-tv-own-keys=""
      role="dialog"
      aria-modal="true"
      aria-label={title || "Галерея изображений"}
      onClick={handleBackdropClick}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      className="fixed inset-0 z-50 flex flex-col justify-between bg-black/95 backdrop-blur-md outline-none transition-opacity duration-200"
    >
      {/* Top bar with title, counter, and close cross button */}
      <div
        className="relative z-20 flex shrink-0 items-center justify-between px-4 py-3 sm:px-6 sm:py-4 pointer-events-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          {title ? (
            <span className="font-mono text-xs uppercase tracking-widest text-accent">
              {title}
            </span>
          ) : null}
          <span className="font-mono text-xs tracking-wider text-white/70">
            {currentIndex + 1} / {images.length}
          </span>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Закрити"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white/90 backdrop-blur-sm transition-all hover:bg-white/20 active:scale-95 sm:h-12 sm:w-12"
        >
          <svg
            className="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      {/* Main slider with swipeable full-width tiles */}
      <div className="relative flex-1 min-h-0 flex items-center justify-center w-full">
        {/* Left Arrow Button */}
        {images.length > 1 && currentIndex > 0 ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              goToSlide(currentIndex - 1);
            }}
            aria-label="Попередній кадр"
            className="absolute left-3 sm:left-6 top-1/2 -translate-y-1/2 z-30 flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-full bg-black/60 text-white/90 border border-white/15 backdrop-blur-md shadow-lg transition-transform hover:bg-black/90 hover:scale-105 active:scale-95 tv:border-accent"
          >
            <svg
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>
        ) : null}

        {/* Right Arrow Button */}
        {images.length > 1 && currentIndex < images.length - 1 ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              goToSlide(currentIndex + 1);
            }}
            aria-label="Наступний кадр"
            className="absolute right-3 sm:right-6 top-1/2 -translate-y-1/2 z-30 flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-full bg-black/60 text-white/90 border border-white/15 backdrop-blur-md shadow-lg transition-transform hover:bg-black/90 hover:scale-105 active:scale-95 tv:border-accent"
          >
            <svg
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 5l7 7-7 7"
              />
            </svg>
          </button>
        ) : null}

        {/* Horizontal Scroll Container */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="row-scroll flex h-full w-full items-center overflow-x-auto overflow-y-hidden snap-x snap-mandatory scroll-smooth touch-pan-x px-[4vw] sm:px-[6vw]"
          style={{ scrollbarWidth: "none" }}
        >
          {images.map((img, idx) => (
            <div
              key={img.src + idx}
              className="snap-center shrink-0 w-[92vw] sm:w-[86vw] max-w-6xl h-full flex flex-col items-center justify-center px-2 cursor-pointer"
              onClick={handleBackdropClick}
            >
              <div
                className="relative max-w-full max-h-full flex items-center justify-center cursor-default"
                onClick={(e) => e.stopPropagation()}
              >
                <img
                  src={img.src}
                  alt={img.alt || `${title || "Кадр"} ${idx + 1}`}
                  loading={
                    Math.abs(idx - currentIndex) <= 2 ? "eager" : "lazy"
                  }
                  decoding="async"
                  className="max-h-[72vh] sm:max-h-[80vh] w-auto max-w-full rounded-2xl border border-white/15 shadow-2xl object-contain"
                />
              </div>
              {img.caption ? (
                <p
                  className="mt-2 text-center text-xs text-white/70 max-w-xl line-clamp-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  {img.caption}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      {/* Bottom indicator */}
      <div
        className="relative z-20 flex shrink-0 items-center justify-center gap-1.5 py-3 sm:py-4 px-4 overflow-x-auto no-scrollbar pointer-events-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {images.length <= 20 ? (
          images.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Перейти к кадру ${i + 1}`}
              onClick={() => goToSlide(i)}
              className={`h-1.5 rounded-full transition-all duration-200 ${
                i === currentIndex
                  ? "w-6 bg-accent"
                  : "w-1.5 bg-white/30 hover:bg-white/60"
              }`}
            />
          ))
        ) : (
          <span className="font-mono text-[11px] text-white/60">
            {currentIndex + 1} / {images.length}
          </span>
        )}
      </div>
    </div>,
    document.body,
  );
}
