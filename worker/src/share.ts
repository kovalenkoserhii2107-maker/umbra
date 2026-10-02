import type { Deps } from "./env";
import { cached } from "./http";
import { igdbQuery } from "./igdb";
import { steamApp } from "./steamStore";

/**
 * Link previews for shared titles. The app uses hash routes, which messengers
 * never send to a server, so a share link points here instead: the page
 * carries Open Graph tags (poster, title, short description) for Telegram and
 * others, and sends people straight on to the app.
 */
export type ShareKind = "movie" | "tv" | "game";

type Preview = {
  title: string;
  description: string;
  image: string;
};

const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );

/** Cuts at a sentence or word end, at most `max` characters. */
export function shorten(text: string, max = 220) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const sentence = cut.lastIndexOf(". ");
  if (sentence > max * 0.6) return cut.slice(0, sentence + 1);
  return `${cut.slice(0, cut.lastIndexOf(" ")).replace(/[,;:–—-]$/, "")}…`;
}

const yearOf = (date?: string | null) => (date || "").slice(0, 4);

async function tmdbPreview(
  deps: Deps,
  kind: "movie" | "tv",
  id: number,
): Promise<Preview | null> {
  const key = deps.env.TMDB_KEY;
  if (!key) return null;
  const response = await deps.fetch(
    `https://api.themoviedb.org/3/${kind}/${id}?api_key=${encodeURIComponent(key)}&language=ru-RU`,
  );
  if (!response.ok) return null;
  const d = (await response.json()) as {
    title?: string;
    name?: string;
    overview?: string;
    tagline?: string;
    poster_path?: string | null;
    release_date?: string;
    first_air_date?: string;
    vote_average?: number;
    vote_count?: number;
    genres?: Array<{ name?: string }>;
  };
  const title = d.title || d.name;
  if (!title) return null;
  const year = yearOf(d.release_date || d.first_air_date);
  const facts = [
    kind === "tv" ? "Сериал" : "Фильм",
    year,
    d.genres?.[0]?.name,
    d.vote_count && d.vote_average ? `TMDB ${d.vote_average.toFixed(1)}` : "",
  ].filter(Boolean);
  return {
    title: year ? `${title} (${year})` : title,
    description: [facts.join(" · "), shorten(d.overview || d.tagline || "")]
      .filter(Boolean)
      .join("\n"),
    image: d.poster_path
      ? `https://image.tmdb.org/t/p/w500${d.poster_path}`
      : "",
  };
}

async function gamePreview(deps: Deps, id: number): Promise<Preview | null> {
  const rows = JSON.parse(
    await igdbQuery(
      deps,
      "games",
      `fields name,summary,cover.image_id,first_release_date,aggregated_rating,aggregated_rating_count,genres.name,websites.url,external_games.url; where id = ${id};`,
    ),
  ) as Array<{
    name?: string;
    summary?: string;
    cover?: { image_id?: string };
    first_release_date?: number;
    aggregated_rating?: number;
    aggregated_rating_count?: number;
    genres?: Array<{ name?: string }>;
    websites?: Array<{ url?: string }>;
    external_games?: Array<{ url?: string }>;
  }>;
  const g = rows[0];
  if (!g?.name) return null;
  // A Russian description from Steam when the game is there.
  let about = "";
  const steam = [...(g.external_games ?? []), ...(g.websites ?? [])]
    .map((x) => x.url?.match(/store\.steampowered\.com\/app\/(\d+)/)?.[1])
    .find(Boolean);
  if (steam)
    about = await steamApp(deps, Number(steam))
      .then((s) => s.short || s.about)
      .catch(() => "");
  const year = g.first_release_date
    ? String(new Date(g.first_release_date * 1000).getUTCFullYear())
    : "";
  const facts = [
    "Игра",
    year,
    g.genres?.[0]?.name,
    g.aggregated_rating && g.aggregated_rating_count
      ? `критики ${Math.round(g.aggregated_rating)}`
      : "",
  ].filter(Boolean);
  return {
    title: year ? `${g.name} (${year})` : g.name,
    description: [facts.join(" · "), shorten(about || g.summary || "")]
      .filter(Boolean)
      .join("\n"),
    image: g.cover?.image_id
      ? `https://images.igdb.com/igdb/image/upload/t_cover_big_2x/${g.cover.image_id}.jpg`
      : "",
  };
}

export function appLink(site: string, kind: ShareKind, id: number) {
  const base = site.endsWith("/") ? site : `${site}/`;
  return `${base}#/${kind === "game" ? `games/${id}` : `title/${kind}/${id}`}`;
}

export function sharePage(
  preview: Preview | null,
  target: string,
  self: string,
) {
  const title = escape(preview?.title || "Umbra");
  const description = escape(
    preview?.description || "Фильмы, сериалы и игры в Umbra",
  );
  const link = escape(target);
  const image = preview?.image
    ? `<meta property="og:image" content="${escape(preview.image)}">`
    : "";
  return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8">
<title>${title} — Umbra</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="${description}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Umbra">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${escape(self)}">
${image}
<meta name="twitter:card" content="summary">
<link rel="canonical" href="${link}">
<meta http-equiv="refresh" content="0;url=${link}">
<style>body{background:#000;color:#fcfcfc;font:16px system-ui,sans-serif;padding:24px}a{color:#ff9e64}</style>
</head><body>
<p><a href="${link}">Открыть «${title}» в Umbra</a></p>
<script>location.replace(${JSON.stringify(target).replace(/</g, "\\u003c")})</script>
</body></html>`;
}

/** The HTML for one share link; previews are kept a day. */
export async function shareResponse(
  deps: Deps,
  kind: ShareKind,
  id: number,
  self: string,
) {
  const site =
    deps.env.SITE_URL || "https://kovalenkoserhii2107-maker.github.io/umbra/";
  let preview: Preview | null = null;
  try {
    const { body } = await cached(
      deps,
      `share/${kind}/${id}`,
      86400,
      async () => {
        const p =
          kind === "game"
            ? await gamePreview(deps, id)
            : await tmdbPreview(deps, kind, id);
        // Nothing found is not cached, so a fixed key or new title shows up.
        if (!p) throw new Error("no preview");
        return JSON.stringify(p);
      },
    );
    preview = JSON.parse(body) as Preview;
  } catch {
    preview = null;
  }
  return new Response(sharePage(preview, appLink(site, kind, id), self), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
