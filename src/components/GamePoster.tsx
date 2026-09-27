import { useState } from "react";

function sources(id: number, fallback: string, hero: boolean) {
  const base = `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}`;
  const list = hero
    ? [
        `${base}/library_hero.jpg`,
        `${base}/capsule_616x353.jpg`,
        `${base}/header.jpg`,
      ]
    : [`${base}/library_600x900_2x.jpg`, `${base}/library_600x900.jpg`];
  if (fallback) list.push(fallback);
  return list;
}

export function GamePoster({
  id,
  fallback,
  hero = false,
  className = "",
}: {
  id: number;
  fallback: string;
  hero?: boolean;
  className?: string;
}) {
  const list = sources(id, fallback, hero);
  const [index, setIndex] = useState(0);
  return (
    <img
      src={list[Math.min(index, list.length - 1)]}
      alt=""
      className={className}
      loading="lazy"
      onError={() =>
        setIndex((current) => (current < list.length - 1 ? current + 1 : current))
      }
    />
  );
}
