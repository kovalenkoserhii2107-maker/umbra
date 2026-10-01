import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { PlatformChip, PosterCard, useAsync } from "../components";
import { PLATFORMS } from "../lib/providers";
import {
  backdropUrl,
  posterUrl,
  tmdb,
  type MediaType,
  type PersonRef,
  type TitleDetails,
  type Video,
  type WatchGroup,
} from "../lib/tmdb";
import {
  VIDEO_TYPES,
  awardsLabel,
  countryName,
  externalLinks,
  languageName,
  money,
  providerGroups,
  regionalDates,
} from "../lib/titleFacts";
import type { OmdbScores } from "../lib/omdb";
import { dateLabel } from "../lib/format";

/** Every block on the title page uses this heading and spacing. */
export function Section({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="mt-10">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-xl font-medium tracking-tight">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** Small mono note on the right of a section heading. */
export function Aside({ children }: { children: ReactNode }) {
  return (
    <span className="shrink-0 font-mono text-[11px] uppercase tracking-[0.12em] text-dim">
      {children}
    </span>
  );
}

export function AsideLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="shrink-0 font-mono text-[11px] uppercase tracking-[0.12em] text-accent"
    >
      {children}
    </a>
  );
}

export const CARD = "rounded-2xl border border-hairline bg-card";

export function AwardsLine({ omdb }: { omdb: OmdbScores | null }) {
  const text = awardsLabel(omdb?.awards);
  if (!text) return null;
  return (
    <p
      className={`${CARD} mt-4 flex max-w-3xl items-start gap-3 px-4 py-3 text-sm`}
    >
      <span aria-hidden="true" className="text-base leading-5 text-[#f5c518]">
        ★
      </span>
      <span>
        <span className="text-mute">Награды · </span>
        {text}
      </span>
    </p>
  );
}

const knownIds = new Set(PLATFORMS.map((p) => p.id));

export function WatchOptions({
  region,
  regionCode,
}: {
  region?: WatchGroup;
  regionCode: string;
}) {
  const groups = providerGroups(region);
  return (
    <Section
      title={`Где смотреть · ${regionCode}`}
      aside={
        region?.link ? (
          <AsideLink href={region.link}>Все варианты ↗</AsideLink>
        ) : null
      }
    >
      {groups.length ? (
        <div className="space-y-3">
          {groups.map((g) => (
            <div key={g.label}>
              <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-dim">
                {g.label}
              </p>
              <div className="flex flex-wrap gap-2">
                {g.providers.map((p) =>
                  knownIds.has(p.provider_id) ? (
                    <PlatformChip key={p.provider_id} id={p.provider_id} />
                  ) : (
                    <span
                      key={p.provider_id}
                      className="inline-flex items-center gap-2 rounded-full border border-hairline px-3 py-1 text-xs text-mute"
                    >
                      {p.logo_path ? (
                        <img
                          src={posterUrl(p.logo_path, "w92")}
                          alt=""
                          className="h-4 w-4 rounded"
                        />
                      ) : null}
                      {p.provider_name}
                    </span>
                  ),
                )}
              </div>
            </div>
          ))}
          <p className="text-[11px] text-dim">Данные о площадках: JustWatch</p>
        </div>
      ) : (
        <p className="text-sm text-mute">
          В этом регионе легальных площадок не найдено. Смени регион в
          настройках.
        </p>
      )}
    </Section>
  );
}

export function Videos({ videos }: { videos: Video[] }) {
  const [current, setCurrent] = useState(0);
  if (!videos.length) return null;
  const shown = videos[Math.min(current, videos.length - 1)];
  return (
    <Section
      title={VIDEO_TYPES[shown.type] || "Видео"}
      aside={videos.length > 1 ? <Aside>{videos.length} видео</Aside> : null}
    >
      <div className="overflow-hidden rounded-2xl border border-hairline">
        <iframe
          key={shown.key}
          title={shown.name}
          className="aspect-video w-full"
          src={`https://www.youtube.com/embed/${shown.key}`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
      {videos.length > 1 ? (
        <div className="row-scroll mt-3 flex gap-3 overflow-x-auto pb-2">
          {videos.slice(0, 15).map((v, i) => (
            <button
              key={v.key}
              type="button"
              onClick={() => setCurrent(i)}
              className={`w-44 shrink-0 text-left ${i === current ? "" : "opacity-70 hover:opacity-100"}`}
            >
              <img
                src={`https://i.ytimg.com/vi/${v.key}/mqdefault.jpg`}
                alt=""
                loading="lazy"
                className={`aspect-video w-full rounded-xl border object-cover ${i === current ? "border-accent" : "border-hairline"}`}
              />
              <p className="mt-1 line-clamp-2 text-xs">{v.name}</p>
              <p className="font-mono text-[10px] uppercase tracking-wider text-dim">
                {VIDEO_TYPES[v.type] || v.type}
                {v.iso_639_1 ? ` · ${v.iso_639_1}` : ""}
              </p>
            </button>
          ))}
        </div>
      ) : null}
    </Section>
  );
}

export function Gallery({ item }: { item: TitleDetails }) {
  const stills = (item.images?.backdrops ?? [])
    // Language-free frames are stills; titled ones are mostly promo art.
    .sort((a, b) => Number(!!a.iso_639_1) - Number(!!b.iso_639_1))
    .slice(0, 16);
  if (stills.length < 2) return null;
  return (
    <Section title="Кадры">
      <div className="row-scroll flex gap-3 overflow-x-auto pb-2">
        {stills.map((img) => (
          <a
            key={img.file_path}
            href={backdropUrl(img.file_path, "original")}
            target="_blank"
            rel="noreferrer"
            className="w-64 shrink-0 sm:w-80"
          >
            <img
              src={backdropUrl(img.file_path, "w780")}
              alt=""
              loading="lazy"
              className="aspect-video w-full rounded-xl border border-hairline object-cover"
            />
          </a>
        ))}
      </div>
    </Section>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-b border-hairline py-2.5 last:border-b-0 sm:grid sm:grid-cols-[11rem_1fr] sm:gap-4">
      <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-dim sm:pt-0.5">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm sm:mt-0">{children}</dd>
    </div>
  );
}

export function Details({
  item,
  media,
  omdb,
  region,
}: {
  item: TitleDetails;
  media: MediaType;
  omdb: OmdbScores | null;
  region: string;
}) {
  const countries = [
    ...new Set(
      (item.production_countries?.length
        ? item.production_countries.map(
            (c) => countryName(c.iso_3166_1) || c.name,
          )
        : (item.origin_country ?? []).map((c) => countryName(c) || c)
      ).filter(Boolean),
    ),
  ];
  const languages = (item.spoken_languages ?? [])
    .map((l) => languageName(l.iso_639_1) || l.name)
    .filter(Boolean);
  const rows: Array<[string, ReactNode]> = [];
  // Dates first: they answer "when can I watch it".
  if (media === "movie")
    for (const d of regionalDates(item, region))
      rows.push([`${d.label} · ${region}`, d.date]);
  if (media === "tv" && item.first_air_date)
    rows.push(["Первый эпизод", dateLabel(item.first_air_date)]);
  const lastAir = (item as { last_air_date?: string }).last_air_date;
  if (media === "tv" && lastAir && item.status !== "Returning Series")
    rows.push(["Последний эпизод", dateLabel(lastAir)]);
  if (media === "tv" && item.networks?.length)
    rows.push(["Канал", item.networks.map((n) => n.name).join(", ")]);
  if (countries.length)
    rows.push([
      countries.length > 1 ? "Страны" : "Страна",
      countries.join(", "),
    ]);
  const lang = languageName(item.original_language);
  if (lang) rows.push(["Язык оригинала", lang]);
  if (languages.length > 1) rows.push(["Языки", languages.join(", ")]);
  if (item.production_companies?.length)
    rows.push([
      "Студии",
      item.production_companies
        .slice(0, 6)
        .map((c) => c.name)
        .join(", "),
    ]);
  const budget = money(item.budget);
  if (budget) rows.push(["Бюджет", budget]);
  const world = money(item.revenue);
  if (world) rows.push(["Сборы в мире", world]);
  const us = money(omdb?.boxOffice);
  if (us) rows.push(["Сборы в США", us]);
  if (omdb?.rated && omdb.rated !== "Not Rated" && omdb.rated !== "Unrated")
    rows.push(["Рейтинг MPA", omdb.rated]);
  if (!rows.length) return null;
  return (
    <Section title="Подробности">
      <dl className={`${CARD} px-4`}>
        {rows.map(([label, value]) => (
          <Fact key={label} label={label}>
            {value}
          </Fact>
        ))}
      </dl>
    </Section>
  );
}


/** Photo card for cast and crew; opens the person's page. */
export function PersonCard({
  person,
  role,
}: {
  person: PersonRef;
  role: string;
}) {
  return (
    <Link to={`/person/${person.id}`} className="group w-28 shrink-0">
      {person.profile_path ? (
        <img
          src={posterUrl(person.profile_path, "w185")}
          alt=""
          loading="lazy"
          className="aspect-[2/3] w-full rounded-xl border border-hairline object-cover group-hover:border-accent"
        />
      ) : (
        <div className="flex aspect-[2/3] items-center justify-center rounded-xl border border-hairline bg-card text-2xl text-dim group-hover:border-accent">
          {person.name.slice(0, 1)}
        </div>
      )}
      <p className="mt-1.5 line-clamp-2 text-sm leading-snug">{person.name}</p>
      <p className="line-clamp-2 font-mono text-[10px] text-dim">{role}</p>
    </Link>
  );
}

export function Crew({
  cards,
}: {
  cards: Array<{ person: PersonRef; roles: string[] }>;
}) {
  if (!cards.length) return null;
  return (
    <Section title="Съёмочная группа">
      <div className="row-scroll flex gap-3 overflow-x-auto pb-2">
        {cards.map(({ person, roles }) => (
          <PersonCard key={person.id} person={person} role={roles.join(", ")} />
        ))}
      </div>
    </Section>
  );
}

export function Franchise({
  item,
  currentId,
}: {
  item: TitleDetails;
  currentId: number;
}) {
  const ref = item.belongs_to_collection;
  const collection = useAsync(
    () => (ref ? tmdb.collection(ref.id) : Promise.resolve(null)),
    [ref?.id],
  );
  const parts = [...(collection.data?.parts ?? [])]
    .filter((p) => p.id !== currentId)
    .sort((a, b) =>
      (a.release_date || "9999").localeCompare(b.release_date || "9999"),
    );
  if (!ref || !parts.length) return null;
  return (
    <Section
      title={collection.data?.name || ref.name}
      aside={<Aside>{parts.length + 1} в серии</Aside>}
    >
      <div className="row-scroll flex gap-3 overflow-x-auto pb-2">
        {parts.map((p) => (
          <PosterCard
            key={p.id}
            item={{ ...p, media_type: "movie" }}
            type="movie"
          />
        ))}
      </div>
    </Section>
  );
}

function ReviewCard({
  review,
}: {
  review: {
    id: string;
    author: string;
    content: string;
    url?: string;
    created_at?: string;
    author_details?: { rating?: number | null };
  };
}) {
  const [open, setOpen] = useState(false);
  const long = review.content.length > 420;
  const rating = review.author_details?.rating;
  return (
    <article className={`${CARD} p-4`}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="truncate text-sm">{review.author}</p>
        <p className="shrink-0 font-mono text-[11px] text-dim">
          {rating ? <span className="text-accent">{rating}/10 · </span> : null}
          {review.created_at ? dateLabel(review.created_at.slice(0, 10)) : ""}
        </p>
      </div>
      <p
        lang="en"
        className={`mt-2 whitespace-pre-line text-sm leading-6 text-ink/85 ${open ? "" : "line-clamp-6"}`}
      >
        {review.content}
      </p>
      <div className="mt-2 flex gap-3 text-xs">
        {long ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="text-accent"
          >
            {open ? "Свернуть" : "Читать полностью"}
          </button>
        ) : null}
        {review.url ? (
          <a
            href={review.url}
            target="_blank"
            rel="noreferrer"
            className="text-mute"
          >
            На TMDB ↗
          </a>
        ) : null}
      </div>
    </article>
  );
}

export function Reviews({
  media,
  id,
  imdbId,
  rottenTomatoesUrl,
}: {
  media: MediaType;
  id: number;
  imdbId: string;
  rottenTomatoesUrl: string;
}) {
  const reviews = useAsync(() => tmdb.reviews(media, id), [media, id]);
  const list = reviews.data?.results ?? [];
  if (!list.length && !imdbId) return null;
  const chip =
    "inline-flex items-center gap-1.5 rounded-full border border-hairline px-3 py-1.5 text-xs text-ink hover:border-accent";
  return (
    <Section
      title="Рецензии"
      aside={
        list.length ? (
          <Aside>{reviews.data!.total_results} на TMDB</Aside>
        ) : null
      }
    >
      {imdbId ? (
        <div className="mb-3 flex flex-wrap gap-2">
          <a
            href={`https://www.imdb.com/title/${imdbId}/criticreviews/`}
            target="_blank"
            rel="noreferrer"
            className={chip}
          >
            Критики на IMDb <span className="text-accent">↗</span>
          </a>
          <a
            href={rottenTomatoesUrl}
            target="_blank"
            rel="noreferrer"
            className={chip}
          >
            Rotten Tomatoes <span className="text-accent">↗</span>
          </a>
        </div>
      ) : null}
      {list.length ? (
        <>
          <p className="mb-2 text-xs text-dim">Зрители TMDB · на английском</p>
          <div className="space-y-3">
            {list.slice(0, 3).map((r) => (
              <ReviewCard key={r.id} review={r} />
            ))}
          </div>
        </>
      ) : null}
    </Section>
  );
}

export function LinksRow({
  item,
  media,
}: {
  item: TitleDetails;
  media: MediaType;
}) {
  const links = externalLinks(item, media);
  return (
    <Section title="Ссылки">
      <div className="flex flex-wrap gap-2">
        {links.map((l) => (
          <a
            key={l.label}
            href={l.href}
            target="_blank"
            rel="noreferrer"
            className="rounded-full border border-hairline px-3 py-1.5 text-xs text-mute hover:border-accent hover:text-ink"
          >
            {l.label} ↗
          </a>
        ))}
      </div>
    </Section>
  );
}
