import { useEffect, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTvBack } from "../components/TvFocus";
import {
  cachedRating,
  ensureImdbRating,
  subscribeRatings,
} from "../lib/ratings";
import { tmdb } from "../lib/tmdb";
import { fromTmdb, metaLine, type Card, type CardRow } from "./cards";
import { screenKey, useLanes, type Lane } from "./lanes";
import {
  Backdrop,
  LaneStack,
  POSTER_STEP,
  Poster,
  Rail,
  Stage,
  TABS,
  Tabs,
} from "./ui";

/** Library cards have no picture or plot: those come from TMDB once. */
const extra = new Map<string, Promise<Card | null>>();
function details(card: Card): Promise<Card | null> {
  const key = `${card.type}-${card.id}`;
  let p = extra.get(key);
  if (!p) {
    p = tmdb
      .basic(card.type, card.id)
      .then((d) => fromTmdb({ ...d, media_type: card.type }))
      .catch(() => null);
    extra.set(key, p);
  }
  return p;
}

/** The focused card, settled for a moment, with what TMDB adds to it. */
function useHero(card: Card | null) {
  const [hero, setHero] = useState<Card | null>(card);
  const [, setTick] = useState(0);
  useEffect(() => subscribeRatings(() => setTick((n) => n + 1)), []);
  useEffect(() => {
    if (!card) return;
    let alive = true;
    // Holding a key runs across many cards: only the one it stops on loads.
    const timer = window.setTimeout(() => {
      setHero(card);
      void ensureImdbRating(card.type, card.id).catch(() => undefined);
      if (card.backdrop === undefined || !card.overview)
        void details(card).then(
          (more) =>
            alive &&
            more &&
            setHero({
              ...more,
              ...card,
              backdrop: card.backdrop ?? more.backdrop,
              overview: card.overview || more.overview,
              genres: card.genres?.length ? card.genres : more.genres,
              vote: card.vote ?? more.vote,
            }),
        );
    }, 140);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [card?.type, card?.id]);
  return hero;
}

/**
 * The TV home layout: the focused title fills the screen above, rows of
 * posters below; the top menu when `tab` is set. Used by the feed, the
 * collection and a person's films.
 */
export function RowsScreen({
  tab,
  rows,
  heading,
  empty,
}: {
  /** Path of the active tab; null — no menu (Back leaves the screen). */
  tab: string | null;
  rows: CardRow[];
  heading?: ReactNode;
  /** Shown when there are no rows at all. */
  empty?: ReactNode;
}) {
  // Rows still loading stay in the list (empty), so focus can wait for the
  // first one instead of settling on the menu.
  const shown = rows.filter((r) => r.cards.length);
  const navigate = useNavigate();
  const location = useLocation();
  const tabIndex = Math.max(
    0,
    TABS.findIndex((t) => t.to === tab),
  );
  const lanes: Lane[] = [
    ...(tab === null
      ? []
      : [
          {
            key: "tabs",
            size: TABS.length,
            onSelect: (i: number) => {
              if (TABS[i].to !== tab) navigate(TABS[i].to, { replace: true });
            },
          },
        ]),
    ...rows.map((row) => ({
      key: row.key,
      size: row.cards.length,
      onSelect: (i: number) => {
        const card = row.cards[i];
        if (card) navigate(`/title/${card.type}/${card.id}`);
      },
    })),
  ];
  const nav = useLanes(lanes, {
    lane: rows[0]?.key,
    cols: { tabs: tabIndex },
    remember: screenKey(location.pathname),
  });
  const onTabs = nav.lane === "tabs";
  const rowIndex = shown.findIndex((r) => r.key === nav.lane);
  const focusedRow = shown[rowIndex] ?? shown[0];
  const card = focusedRow?.cards[nav.col(focusedRow.key)] ?? null;
  const hero = useHero(card);

  // Back from the rows returns to the menu first; from the menu it leaves.
  useTvBack(tab !== null && !onTabs, () => nav.focus("tabs", tabIndex));

  const imdb = hero ? cachedRating(hero.type, hero.id).imdb : null;
  return (
    <Stage screen={tab ?? undefined}>
      <Backdrop path={hero?.backdrop} />
      {tab !== null ? (
        <Tabs active={tab} focus={onTabs ? nav.col("tabs") : null} />
      ) : null}
      <div className="absolute left-12 top-[84px] w-[540px]">
        {heading}
        {hero ? (
          <div key={`${hero.type}-${hero.id}`} className="tv-fade">
            <h1 className="line-clamp-2 text-[34px] leading-[1.1] tracking-tight">
              {hero.title}
            </h1>
            <p className="mt-2 text-[14px] text-white/70">
              {metaLine(hero, imdb)}
            </p>
            {hero.overview ? (
              <p className="mt-3 line-clamp-3 text-[15px] leading-snug text-white/80">
                {hero.overview}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
      {shown.length ? (
        <LaneStack focus={focusedRow?.key ?? null} anchor={292} top={292}>
          {shown.map((row, i) => (
            <Rail
              key={row.key}
              lane={row.key}
              title={row.title}
              count={row.cards.length}
              step={POSTER_STEP}
              col={nav.col(row.key)}
              dim={i < rowIndex}
            >
              {row.cards.map((c, j) => (
                <Poster
                  key={`${c.type}-${c.id}`}
                  card={c}
                  focused={nav.lane === row.key && nav.col(row.key) === j}
                />
              ))}
            </Rail>
          ))}
        </LaneStack>
      ) : (
        <div className="absolute left-12 top-[300px] text-mute">{empty}</div>
      )}
    </Stage>
  );
}
