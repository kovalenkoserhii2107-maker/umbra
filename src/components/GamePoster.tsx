import { useState } from "react";

function sources(id: number, fallback: string, poster?: string, hero?: boolean) {
  const base = `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}`;
  return [
    poster,
    hero ? `${base}/library_hero.jpg` : undefined,
    `${base}/capsule_616x353.jpg`,
    `${base}/header.jpg`,
    fallback,
  ].filter((item): item is string => Boolean(item));
}

export function GamePoster({
  id,
  fallback,
  poster,
  hero = false,
  className = "",
}: {
  id: number;
  fallback: string;
  poster?: string;
  hero?: boolean;
  className?: string;
}) {
  const list = sources(id, fallback, poster, hero);
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
