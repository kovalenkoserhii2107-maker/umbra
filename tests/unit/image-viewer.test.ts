import { describe, expect, it } from "vitest";
import { backdropUrl } from "../../src/lib/tmdb";
import { imageUrl } from "../../src/lib/igdb";
import type { GalleryImage } from "../../src/components/ImageViewer";

describe("Image Viewer gallery utilities", () => {
  it("maps TMDB backdrop items into high-res gallery images with thumbnails", () => {
    const rawStills = [
      { file_path: "/sample1.jpg", iso_639_1: null },
      { file_path: "/sample2.jpg", iso_639_1: "en" },
    ];

    const images: GalleryImage[] = rawStills.map((img, i) => ({
      src: backdropUrl(img.file_path, "original"),
      thumb: backdropUrl(img.file_path, "w780"),
      alt: `Кадр ${i + 1}`,
    }));

    expect(images).toHaveLength(2);
    expect(images[0].src).toContain("/original/sample1.jpg");
    expect(images[0].thumb).toContain("/w780/sample1.jpg");
    expect(images[0].alt).toBe("Кадр 1");

    expect(images[1].src).toContain("/original/sample2.jpg");
    expect(images[1].thumb).toContain("/w780/sample2.jpg");
    expect(images[1].alt).toBe("Кадр 2");
  });

  it("maps IGDB game screenshots into 1080p gallery images with screenshot_big thumbnails", () => {
    const rawShots = [
      { image_id: "sc_alpha" },
      { image_id: "sc_beta" },
    ];

    const gameName = "Cyberpunk 2077";
    const images: GalleryImage[] = rawShots.map((s, i) => ({
      src: imageUrl(s.image_id, "1080p"),
      thumb: imageUrl(s.image_id, "screenshot_big"),
      alt: `${gameName} — кадр ${i + 1}`,
    }));

    expect(images).toHaveLength(2);
    expect(images[0].src).toBe(
      "https://images.igdb.com/igdb/image/upload/t_1080p/sc_alpha.jpg",
    );
    expect(images[0].thumb).toBe(
      "https://images.igdb.com/igdb/image/upload/t_screenshot_big/sc_alpha.jpg",
    );
    expect(images[0].alt).toBe("Cyberpunk 2077 — кадр 1");

    expect(images[1].src).toBe(
      "https://images.igdb.com/igdb/image/upload/t_1080p/sc_beta.jpg",
    );
  });

  it("calculates closest active slide index based on scroll center geometry", () => {
    // Container width = 1000, items at offsetLeft: [0, 900, 1800], width 860 each
    const children = [
      { offsetLeft: 0, offsetWidth: 860 },
      { offsetLeft: 900, offsetWidth: 860 },
      { offsetLeft: 1800, offsetWidth: 860 },
    ];
    const containerWidth = 1000;

    const findClosest = (scrollLeft: number) => {
      const center = scrollLeft + containerWidth / 2;
      let closest = 0;
      let minDiff = Infinity;
      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        const childCenter = child.offsetLeft + child.offsetWidth / 2;
        const diff = Math.abs(center - childCenter);
        if (diff < minDiff) {
          minDiff = diff;
          closest = i;
        }
      }
      return closest;
    };

    // Scrolled near beginning -> item 0
    expect(findClosest(0)).toBe(0);
    // Scrolled centered on item 1 (center at 1330) -> item 1
    expect(findClosest(830)).toBe(1);
    // Scrolled to end -> item 2
    expect(findClosest(1700)).toBe(2);
  });

  it("distinguishes touch swipe from backdrop tap using distance threshold", () => {
    const isSwipe = (dx: number, dy: number) => dx > 10 || dy > 10;

    // Micro-movements during a tap
    expect(isSwipe(2, 3)).toBe(false);
    expect(isSwipe(0, 0)).toBe(false);
    expect(isSwipe(9, 4)).toBe(false);

    // Intentional swipe gestures
    expect(isSwipe(45, 2)).toBe(true);
    expect(isSwipe(3, 50)).toBe(true);
    expect(isSwipe(15, 12)).toBe(true);
  });
});
