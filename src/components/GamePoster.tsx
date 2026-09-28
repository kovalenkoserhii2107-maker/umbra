import { useState } from "react";

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
  // Use verified catalog images. Console IDs are not Steam AppIDs.
  let officialSteamImage = false;
  try {
    officialSteamImage = new URL(fallback).hostname.endsWith(
      ".steamstatic.com",
    );
  } catch {
    /* Empty fallback is allowed. */
  }
  const preferred = officialSteamImage
    ? [fallback, poster]
    : [poster, fallback];
  const list = [...new Set(preferred.filter((s): s is string => Boolean(s)))];
  const sized = list.map((src) => {
    try {
      const url = new URL(src);
      if (url.hostname === "www.metacritic.com" && !hero) {
        url.searchParams.set("width", "640");
        url.searchParams.set("height", "360");
      }
      return url.toString();
    } catch {
      return src;
    }
  });
  return (
    <PosterImage
      key={`${id}:${list.join("|")}`}
      list={sized}
      hero={hero}
      className={className}
    />
  );
}
function PosterImage({
  list,
  hero,
  className,
}: {
  list: string[];
  hero: boolean;
  className: string;
}) {
  const [index, setIndex] = useState(0);
  if (index >= list.length)
    return (
      <div aria-label="Постер недоступен" className={`bg-card ${className}`} />
    );
  return (
    <img
      src={list[index]}
      alt=""
      className={className}
      loading={hero ? "eager" : "lazy"}
      fetchPriority={hero ? "high" : "auto"}
      decoding="async"
      onError={() => setIndex((i) => i + 1)}
    />
  );
}
