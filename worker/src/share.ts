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

/** IMDb score, e.g. "7.6": Agregarr first, OMDb as a fallback. */
export async function imdbRating(deps: Deps, imdbId: string) {
  const score = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 && n <= 10 ? n.toFixed(1) : null;
  };
  try {
    const r = await deps.fetch(
      `https://api.agregarr.org/api/ratings?id=${encodeURIComponent(imdbId)}`,
      { headers: { Accept: "application/json" } },
    );
    if (r.ok) {
      const data = (await r.json()) as
        | Array<{ imdbId?: string; rating?: number | string | null }>
        | { imdbId?: string; rating?: number | string | null };
      const row = (Array.isArray(data) ? data : [data]).find(
        (x) => x?.imdbId === imdbId,
      );
      const value = score(row?.rating);
      if (value) return value;
    }
  } catch {
    /* try OMDb */
  }
  if (!deps.env.OMDB_KEY) return null;
  try {
    const r = await deps.fetch(
      `https://www.omdbapi.com/?i=${encodeURIComponent(imdbId)}&apikey=${encodeURIComponent(deps.env.OMDB_KEY)}`,
    );
    if (!r.ok) return null;
    return score(((await r.json()) as { imdbRating?: string }).imdbRating);
  } catch {
    return null;
  }
}

async function tmdbPreview(
  deps: Deps,
  kind: "movie" | "tv",
  id: number,
): Promise<Preview | null> {
  const key = deps.env.TMDB_KEY;
  if (!key) return null;
  const response = await deps.fetch(
    `https://api.themoviedb.org/3/${kind}/${id}?api_key=${encodeURIComponent(key)}&language=ru-RU&append_to_response=external_ids`,
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
    external_ids?: { imdb_id?: string | null };
  };
  const title = d.title || d.name;
  if (!title) return null;
  const year = yearOf(d.release_date || d.first_air_date);
  const imdbId = d.external_ids?.imdb_id;
  const imdb = imdbId ? await imdbRating(deps, imdbId) : null;
  const tmdb =
    d.vote_count && d.vote_average ? d.vote_average.toFixed(1) : null;
  const facts = [
    kind === "tv" ? "Сериал" : "Фильм",
    year,
    d.genres?.[0]?.name,
    tmdb ? `TMDB ${tmdb}` : "",
  ].filter(Boolean);
  const named = year ? `${title} (${year})` : title;
  return {
    // The title is the boldest line of a preview: the IMDb score sits there.
    title: imdb ? `${named} · ★ IMDb ${imdb}` : named,
    description: [facts.join(" · "), shorten(d.overview || d.tagline || "")]
      .filter(Boolean)
      .join("\n"),
    image: d.poster_path
      ? `https://image.tmdb.org/t/p/w780${d.poster_path}`
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
      ? `https://images.igdb.com/igdb/image/upload/t_1080p/${g.cover.image_id}.jpg`
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
  /** The text of the fallback link while the page redirects. */
  linkText?: string,
) {
  const title = escape(preview?.title || "Umbra");
  const description = escape(
    preview?.description || "Фильмы, сериалы и игры в Umbra",
  );
  const link = escape(target);
  const image = preview?.image
    ? `<meta property="og:image" content="${escape(preview.image)}">
<meta property="og:image:alt" content="${title}">
<meta name="twitter:image" content="${escape(preview.image)}">`
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
<meta name="twitter:card" content="${preview?.image ? "summary_large_image" : "summary"}">
<link rel="canonical" href="${link}">
<meta http-equiv="refresh" content="0;url=${link}">
<style>body{background:#000;color:#fcfcfc;font:16px system-ui,sans-serif;padding:24px}a{color:#ff9e64}</style>
</head><body>
<p><a href="${link}">${linkText ? escape(linkText) : `Открыть «${title}» в Umbra`}</a></p>
<script>location.replace(${JSON.stringify(target).replace(/</g, "\\u003c")})</script>
</body></html>`;
}

/** Someone's id from the invite link: Firebase uids are 20–40 letters and digits. */
export const INVITE_UID = /^[A-Za-z0-9]{20,40}$/;

/**
 * A friend invite. The inviter's profile is private, so their name comes in
 * the link itself (`?n=`); it is only shown in the preview, and the app
 * then shows the real profile.
 */
export function inviteResponse(
  deps: Deps,
  uid: string,
  name: string,
  self: string,
) {
  const site =
    deps.env.SITE_URL || "https://kovalenkoserhii2107-maker.github.io/umbra/";
  const base = site.endsWith("/") ? site : `${site}/`;
  const who = name.replace(/\s+/g, " ").trim().slice(0, 40);
  const preview: Preview = {
    title: who ? `${who} зовёт тебя в Umbra` : "Приглашение в Umbra",
    description:
      "Добавляйтесь в друзья и смотрите оценки друг друга: фильмы, сериалы и игры. Подбор на вечер с ИИ, коллекция и где смотреть — бесплатно.",
    image: `${base}og-invite.png`,
  };
  return new Response(
    sharePage(
      preview,
      `${base}#/friends/invite/${uid}`,
      self,
      "Открыть приглашение в Umbra",
    ),
    {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      },
    },
  );
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
      `share/v3/${kind}/${id}`,
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
