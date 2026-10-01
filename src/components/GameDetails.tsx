import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Aside, AsideLink, CARD, Fact, Section } from "./TitleDetails";
import type { OpenCritic, Prices, SteamApp } from "../lib/api";
import {
  gameLinks,
  money,
  multiplayerLabel,
  releaseRows,
  steamReviewLabel,
  timeToBeatLabel,
} from "../lib/gameFacts";
import {
  imageUrl,
  ru,
  type RawGame,
  type RussianSupport,
  type TimeToBeat,
} from "../lib/igdb";
import { dateLabel } from "../lib/format";

function Chips({ items }: { items: ReactNode[] }) {
  return <span className="flex flex-wrap gap-x-3 gap-y-1">{items}</span>;
}

function russianLabel(r: RussianSupport) {
  const parts = [
    r.interface ? "интерфейс" : null,
    r.subtitles ? "субтитры" : null,
    r.audio ? "озвучка" : null,
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : "нет";
}

export function GameFacts({
  game,
  ages,
  russian,
  ttb,
  steam,
}: {
  game: RawGame;
  ages: string[];
  russian: RussianSupport | null;
  ttb: TimeToBeat | null;
  steam: SteamApp | null;
}) {
  const rows: Array<[string, ReactNode]> = [];
  const releases = releaseRows(game);
  if (releases.length)
    rows.push([
      releases.length > 1 ? "Даты выхода" : "Дата выхода",
      <span className="block space-y-0.5">
        {releases.map((r) => (
          <span key={r.day} className="block">
            {r.date}
            <span className="text-mute"> · {r.platforms.join(", ")}</span>
          </span>
        ))}
      </span>,
    ]);
  const companies = (role: "developer" | "publisher") =>
    (game.involved_companies ?? []).filter((c) => c[role] && c.company?.name);
  for (const [role, label] of [
    ["developer", "Разработчик"],
    ["publisher", "Издатель"],
  ] as const) {
    const list = companies(role);
    if (list.length)
      rows.push([
        label,
        <Chips
          items={list.map((c) => (
            <Link
              key={c.company!.id}
              to={`/games/studio/${c.company!.id}`}
              className="text-ink underline decoration-hairline underline-offset-4 hover:decoration-accent"
            >
              {c.company!.name}
            </Link>
          ))}
        />,
      ]);
  }
  const ttbRows = timeToBeatLabel(ttb);
  if (ttbRows.length)
    rows.push([
      "Время прохождения",
      <span>
        {ttbRows.map(([label, value], i) => (
          <span key={label}>
            {i ? <span className="text-dim"> · </span> : null}
            <span className="text-mute">{label} </span>
            {value}
          </span>
        ))}
      </span>,
    ]);
  if (russian) rows.push(["Русский язык", russianLabel(russian)]);
  const modes = (game.game_modes ?? []).map((m) => ru(m.name));
  if (modes.length) rows.push(["Режимы", modes.join(", ")]);
  const multi = multiplayerLabel(game);
  if (multi) rows.push(["Мультиплеер", multi]);
  const views = (game.player_perspectives ?? []).map((m) => ru(m.name));
  if (views.length) rows.push(["Вид", views.join(", ")]);
  if (ages.length) rows.push(["Возрастной рейтинг", ages.join(" · ")]);
  const series = [...(game.collections ?? []), ...(game.franchises ?? [])]
    .map((c) => c.name)
    .filter((n, i, all): n is string => !!n && all.indexOf(n) === i);
  if (series.length) rows.push(["Серия", series.join(", ")]);
  if (steam?.achievements)
    rows.push(["Достижения Steam", String(steam.achievements)]);
  if (steam?.players)
    rows.push(["Сейчас играют в Steam", steam.players.toLocaleString("ru-RU")]);
  if (steam?.reviews)
    rows.push([
      "Отзывы в Steam",
      `${steamReviewLabel(steam.reviews.score)} · ${steam.reviews.total.toLocaleString("ru-RU")}`,
    ]);
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

export function Screens({ game }: { game: RawGame }) {
  const shots = [...(game.screenshots ?? []), ...(game.artworks ?? [])]
    .filter((s) => s.image_id)
    .slice(0, 16);
  if (shots.length < 2) return null;
  return (
    <Section title="Скриншоты" aside={<Aside>{shots.length}</Aside>}>
      <div className="row-scroll flex gap-3 overflow-x-auto pb-2">
        {shots.map((s, i) => (
          <a
            key={s.image_id}
            href={imageUrl(s.image_id, "1080p")}
            target="_blank"
            rel="noreferrer"
            className="w-64 shrink-0 sm:w-80"
          >
            <img
              src={imageUrl(s.image_id, "screenshot_big")}
              alt={`${game.name} — кадр ${i + 1}`}
              loading="lazy"
              decoding="async"
              className="aspect-video w-full rounded-xl border border-hairline object-cover"
            />
          </a>
        ))}
      </div>
    </Section>
  );
}

function CriticCard({
  review,
}: {
  review: Extract<OpenCritic, { found: true }>["topReviews"][number];
}) {
  const [open, setOpen] = useState(false);
  const long = review.snippet.length > 280;
  return (
    <article className={`${CARD} p-4`}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="truncate text-sm">
          {review.outlet}
          {review.author ? (
            <span className="text-mute"> · {review.author}</span>
          ) : null}
        </p>
        <p className="shrink-0 font-mono text-[11px] text-dim">
          {/* An outlet's own verdict ("Essential") reads better than its 0–100 mapping. */}
          {review.verdict ? (
            <span className="text-accent">{review.verdict} · </span>
          ) : review.score !== null ? (
            <span className="font-bold text-accent">{review.score} · </span>
          ) : null}
          {review.date ? dateLabel(review.date) : ""}
        </p>
      </div>
      <p
        lang="en"
        className={`mt-2 text-sm leading-6 text-ink/85 ${open ? "" : "line-clamp-4"}`}
      >
        {review.snippet}
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
            Рецензия ↗
          </a>
        ) : null}
      </div>
    </article>
  );
}

export function CriticReviews({ oc }: { oc: OpenCritic | null | undefined }) {
  if (!oc?.found || !oc.topReviews.length) return null;
  return (
    <Section
      title="Рецензии критиков"
      aside={<AsideLink href={oc.url}>OpenCritic · {oc.reviews} ↗</AsideLink>}
    >
      <p className="mb-2 text-xs text-dim">Самые читаемые · на английском</p>
      <div className="space-y-3">
        {oc.topReviews.slice(0, 4).map((r) => (
          <CriticCard key={`${r.outlet}-${r.url}`} review={r} />
        ))}
      </div>
    </Section>
  );
}

const chip =
  "inline-flex items-center gap-1.5 rounded-full border border-hairline px-3 py-1.5 text-xs hover:border-accent";

function PcPrices({ prices }: { prices: Prices | null | undefined }) {
  if (prices === undefined)
    return (
      <p role="status" className="mb-3 text-sm text-mute">
        Проверяю цены в магазинах ПК…
      </p>
    );
  if (!prices?.found || !prices.deals.length) return null;
  const low = prices.historyLow;
  return (
    <div className={`${CARD} mb-3 divide-y divide-hairline`}>
      {prices.deals.map((d) => {
        const best = d.storeLow !== null && d.price <= d.storeLow;
        return (
          <a
            key={`${d.shop}-${d.url}`}
            href={d.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-3 px-4 py-3 hover:bg-canvas/40"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm">{d.shop}</span>
              <span className="block truncate font-mono text-[10px] uppercase tracking-[0.12em] text-dim">
                {[
                  d.drm.length ? d.drm.join(", ") : "",
                  best ? "минимум в магазине" : "",
                  d.voucher ? `код ${d.voucher}` : "",
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </span>
            {d.cut > 0 ? (
              <span className="rounded bg-ok px-1.5 py-0.5 font-mono text-[11px] font-bold text-[#08130b]">
                −{d.cut}%
              </span>
            ) : null}
            <span className="shrink-0 text-right">
              <span
                className={`block font-mono text-sm font-bold ${d.cut > 0 ? "text-ok" : ""}`}
              >
                {d.price === 0 ? "бесплатно" : money(d.price, d.currency)}
              </span>
              {d.cut > 0 ? (
                <span className="block font-mono text-[11px] text-dim line-through">
                  {money(d.regular, d.currency)}
                </span>
              ) : null}
            </span>
          </a>
        );
      })}
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs text-mute">
        <span>
          {low
            ? `Минимум за всё время: ${money(low.amount, low.currency)}`
            : ""}
        </span>
        <a
          href={prices.url}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 text-accent"
        >
          IsThereAnyDeal ↗
        </a>
      </div>
    </div>
  );
}

export function GameLinks({
  game,
  steamId,
  prices,
  part,
}: {
  game: RawGame;
  steamId: number | null;
  /** PC prices; undefined while loading, null for games without a PC version. */
  prices?: Prices | null;
  /** Stores with prices sit high on the card; other links at the end. */
  part: "stores" | "links";
}) {
  const { stores, other } = gameLinks(game, steamId);
  if (part === "links")
    return (
      <Section title="Ссылки">
        <div className="flex flex-wrap gap-2">
          {other.map((l) => (
            <a
              key={l.label}
              href={l.href}
              target="_blank"
              rel="noreferrer"
              className={`${chip} text-mute hover:text-ink`}
            >
              {l.label} ↗
            </a>
          ))}
        </div>
      </Section>
    );
  return (
    <>
      {stores.length ? (
        <Section title="Где купить">
          <PcPrices prices={prices} />
          <div className="flex flex-wrap gap-2">
            {stores.map((l) => (
              <a
                key={l.label}
                href={l.href}
                target="_blank"
                rel="noreferrer"
                className={`${chip} text-ink`}
              >
                {l.label}
                <span className="text-accent">
                  {l.search ? "поиск ↗" : "↗"}
                </span>
              </a>
            ))}
          </div>
          {prices === null ? null : (
            <p className="mt-2 text-[11px] text-dim">
              Цены — магазины ПК; консольные магазины открываются ссылкой.
            </p>
          )}
        </Section>
      ) : null}
    </>
  );
}

export function PcRequirements({ steam }: { steam: SteamApp | null }) {
  const req = steam?.requirements;
  if (!req?.minimum && !req?.recommended) return null;
  return (
    <Section title="Системные требования">
      <div className="grid gap-3 sm:grid-cols-2">
        {(
          [
            ["Минимальные", req.minimum],
            ["Рекомендуемые", req.recommended],
          ] as const
        )
          .filter(([, text]) => text)
          .map(([label, text]) => (
            <details
              key={label}
              className={`${CARD} p-4`}
              open={label === "Минимальные"}
            >
              <summary className="cursor-pointer text-sm">{label}</summary>
              <p className="mt-3 whitespace-pre-line text-sm leading-6 text-mute">
                {text.replace(/^(Минимальные|Рекомендуемые):\s*/i, "")}
              </p>
            </details>
          ))}
      </div>
    </Section>
  );
}
