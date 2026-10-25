import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useAsync } from "../components";
import { useTvBack } from "../components/TvFocus";
import { findTitles, profileUrl, type Found } from "../lib/catalog";
import {
  applySearch,
  defaultFilters,
  recentSearches,
  rememberSearch,
  splitYear,
} from "../lib/search";
import { tmdb } from "../lib/tmdb";
import { canVoice, onTvEvent, tvBridge } from "../lib/tvMode";
import { cardsOf, type Card } from "./cards";
import { screenKey, useLanes, type Lane } from "./lanes";
import {
  Backdrop,
  LaneStack,
  Person,
  Poster,
  Stage,
  Tabs,
  useMenu,
} from "./ui";

/**
 * Search on the TV: letters on the left, results on the right, as on the
 * TV's own apps. The focus glides over the keys; each letter pops into the
 * line; results rise in as they come. A real keyboard and the remote's
 * voice button type too.
 */

type Layout = "ru" | "en" | "num";

/** Letters in alphabetical order, seven to a row, as on TV keyboards. */
const KEYS: Record<Layout, string> = {
  ru: "абвгдеёжзийклмнопрстуфхцчшщъыьэюя-.",
  en: "abcdefghijklmnopqrstuvwxyz-'",
  num: "1234567890-:.,!?&'()#",
};
const LAYOUTS: Array<[Layout, string]> = [
  ["ru", "АБВ"],
  ["en", "ABC"],
  ["num", "123"],
];
const COLS = 7;
/** A key and the gap after it. */
const STEP_X = 44;
const STEP_Y = 42;
const TILES = 4;
const FACES = 5;
const DELAY = 300;

/** Searches already made: Back to the screen shows them at once. */
const cache = new Map<string, Found>();

const chunk = <T,>(list: T[], size: number) =>
  Array.from({ length: Math.ceil(list.length / size) }, (_, i) =>
    list.slice(i * size, i * size + size),
  );

/** The value once it has stayed the same for a moment. */
function useSettled<T>(value: T, ms: number) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), ms);
    return () => window.clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

export function TvSearch() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const q = params.get("q")?.trim() || "";
  const [text, setText] = useState(q);
  const [layout, setLayout] = useState<Layout>("ru");
  const [found, setFound] = useState<Found | null>(() => cache.get(q) ?? null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [recent, setRecent] = useState(recentSearches);
  const [voice, setVoice] = useState<"idle" | "listening" | "error">("idle");
  const [heard, setHeard] = useState("");
  const voiceReady = canVoice();
  const popular = useAsync(() => tmdb.trending("day"), []);
  const menu = useMenu("/search");

  function search(value: string) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set("q", value);
        else next.delete("q");
        return next;
      },
      { replace: true },
    );
  }

  /** Text that comes whole (voice, a recent search) is searched at once. */
  function put(value: string) {
    setText(value);
    search(value.trim());
  }

  // Letters typed become the query after a short pause; one is not enough.
  useEffect(() => {
    const next = text.trim();
    if (next === q || next.length === 1) return;
    const timer = window.setTimeout(() => search(next), DELAY);
    return () => window.clearTimeout(timer);
  }, [text]);

  useEffect(() => {
    if (!q) {
      setFound(null);
      setLoading(false);
      setFailed(false);
      return;
    }
    const hit = cache.get(q);
    if (hit) {
      setFound(hit);
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    setFailed(false);
    findTitles(q)
      .then((next) => {
        cache.set(q, next);
        if (alive) setFound(next);
      })
      .catch(() => alive && setFailed(true))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [q]);

  // Voice through the TV app: what is heard shows in the line as it comes.
  useEffect(
    () =>
      onTvEvent((e) => {
        if (e.type !== "voice") return;
        if (e.state === "listening") {
          setVoice("listening");
          setHeard("");
        } else if (e.state === "partial") setHeard(e.text);
        else if (e.state === "result") {
          setVoice("idle");
          setHeard("");
          put(e.text);
        } else if (e.state === "error") setVoice("error");
        else if (e.state === "end")
          setVoice((v) => (v === "listening" ? "idle" : v));
      }),
    [],
  );

  // A keyboard plugged into the TV (or the remote's digits) types as well.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === "Backspace") setText((t) => t.slice(0, -1));
      else if (event.key.length === 1) setText((t) => t + event.key);
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const titles = useMemo(
    () =>
      found
        ? cardsOf(
            applySearch(found.items, found.used, {
              ...defaultFilters,
              year: found.year,
            }),
          ).slice(0, 24)
        : [],
    [found],
  );
  const people = useMemo(
    () =>
      [...(found?.people ?? [])]
        .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
        .slice(0, FACES * 2),
    [found],
  );
  const tiles: Card[] = q
    ? titles
    : cardsOf(popular.data?.results ?? []).slice(0, TILES * 2);
  const tileRows = chunk(tiles, TILES);
  const faceRows = q ? chunk(people, FACES) : [];
  const chips = q ? [] : recent.slice(0, 4);

  const letters = Array.from(KEYS[layout]);
  const keyRows = chunk(letters, COLS);
  const tools = [
    ...(voiceReady ? ["voice"] : []),
    ...LAYOUTS.map(([id]) => id),
  ];
  const toolSpans = voiceReady ? [4, 1, 1, 1] : [3, 2, 2];

  function open(card: Card) {
    if (q) setRecent(rememberSearch(q));
    navigate(`/title/${card.type}/${card.id}`);
  }

  // Off the right end of the keys to the results, off their left end back.
  const jump = useRef({ toResults: () => {}, toKeys: () => {} });
  const keysPane = (lane: Lane): Lane => ({
    ...lane,
    grid: "kb",
    pane: "kb",
    exit: { right: () => jump.current.toResults() },
  });
  const resultsPane = (lane: Lane): Lane => ({
    ...lane,
    pane: "res",
    exit: { left: () => jump.current.toKeys() },
  });
  const lanes: Lane[] = [
    menu.lane,
    keysPane({
      key: "tools",
      size: tools.length,
      span: toolSpans,
      onSelect: (i) => {
        const tool = tools[i];
        if (tool === "voice") {
          if (voice === "listening") tvBridge()?.stopVoice();
          else tvBridge()?.startVoice(layout === "en" ? "en-US" : "ru-RU");
        } else setLayout(tool as Layout);
      },
    }),
    ...keyRows.map((row, r) =>
      keysPane({
        key: `k${r}`,
        size: row.length,
        onSelect: (i) => setText((t) => t + row[i]),
      }),
    ),
    keysPane({
      key: "edit",
      size: 3,
      span: [2, 3, 2],
      onSelect: (i) =>
        i === 0
          ? setText((t) => t.slice(0, -1))
          : i === 1
            ? setText((t) => (t && !t.endsWith(" ") ? t + " " : t))
            : put(""),
    }),
    resultsPane({
      key: "recent",
      size: chips.length,
      onSelect: (i) => put(chips[i]),
    }),
    ...tileRows.map((row, r) =>
      resultsPane({
        key: `r${r}`,
        size: row.length,
        grid: "tiles",
        onSelect: (i) => open(row[i]),
      }),
    ),
    ...faceRows.map((row, r) =>
      resultsPane({
        key: `p${r}`,
        size: row.length,
        grid: "faces",
        onSelect: (i) => {
          if (q) setRecent(rememberSearch(q));
          navigate(`/person/${row[i].id}`);
        },
      }),
    ),
  ];
  const nav = useLanes(lanes, {
    lane: menu.arrived ? "tabs" : "k0",
    cols: { tabs: menu.index },
    remember: screenKey(location.pathname),
    fresh: menu.arrived,
  });
  const pane = lanes.find((l) => l.key === nav.lane)?.pane;
  const lastKeys = useRef("k0");
  const lastResults = useRef<string | null>(null);
  if (pane === "kb") lastKeys.current = nav.lane!;
  if (pane === "res") lastResults.current = nav.lane;
  jump.current = {
    toResults: () => {
      const live = lanes.filter((l) => l.pane === "res" && l.size > 0);
      const back = live.find((l) => l.key === lastResults.current);
      const lane = back ?? live[0];
      if (lane) nav.focus(lane.key);
    },
    toKeys: () => nav.focus(lastKeys.current),
  };
  const onTabs = nav.lane === "tabs";
  useTvBack(!onTabs, () => nav.focus("tabs", menu.index));

  const at = (lane: string, i: number) =>
    nav.lane === lane && nav.col(lane) === i;
  const tileRow = Number(nav.lane?.slice(1));
  const focusedCard =
    pane === "res" && nav.lane?.startsWith("r")
      ? (tileRows[tileRow]?.[nav.col(nav.lane)] ?? null)
      : null;
  const backdrop = useSettled(focusedCard?.backdrop ?? null, 180);

  // The light on the keys: one shape that glides from key to key.
  const kbLanes = lanes.filter((l) => l.pane === "kb");
  const kbRow = kbLanes.findIndex((l) => l.key === lastKeys.current);
  const kbLane = kbLanes[Math.max(0, kbRow)];
  const kbCol = nav.col(kbLane.key);
  let slot = 0;
  for (let i = 0; i < kbCol; i++) slot += kbLane.span?.[i] ?? 1;
  const width = (kbLane.span?.[kbCol] ?? 1) * STEP_X - 4;

  const typing = text.trim() !== q;
  const shown = voice === "listening" ? heard : text;
  const used = found && q && found.used !== splitYear(q).text ? found.used : "";
  const nothing =
    q && found && !loading && !titles.length && !people.length && !typing;
  const resultsLane =
    pane === "res" ? nav.lane : (lastResults.current ?? "recent");

  return (
    <Stage screen="/search">
      <Backdrop path={backdrop} dim={0.92} />
      <Tabs active="/search" focus={onTabs ? nav.col("tabs") : null} />

      {/* The line being typed. */}
      <div className="absolute left-12 top-[78px] w-[304px]">
        <div
          aria-label="Поиск фильмов, сериалов и людей"
          role="textbox"
          aria-readonly="true"
          data-value={text}
          className={`flex h-[52px] items-center gap-2 overflow-hidden rounded-2xl px-4 transition-colors duration-300 ${
            voice === "listening" ? "bg-accent/20" : "bg-white/[0.08]"
          }`}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-5 w-5 shrink-0 text-dim"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <p className="flex min-w-0 flex-1 items-center justify-end overflow-hidden whitespace-pre text-[22px] tracking-tight">
            {shown ? (
              Array.from(shown).map((ch, i) => (
                <span key={i} className="tv-pop inline-block">
                  {ch}
                </span>
              ))
            ) : (
              <span className="mr-auto text-[15px] text-dim">
                {voice === "listening" ? "Говори…" : "Название или имя"}
              </span>
            )}
            <span
              aria-hidden="true"
              className="tv-caret ml-0.5 h-6 w-[2px] bg-accent"
            />
          </p>
          {loading || (typing && text.trim().length > 1) ? (
            <span
              aria-hidden="true"
              className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-hairline border-t-accent"
            />
          ) : null}
        </div>
        {voice === "error" ? (
          <p role="status" className="tv-rise mt-2 text-[13px] text-mute">
            Не расслышал. Нажми на микрофон и скажи ещё раз.
          </p>
        ) : null}
      </div>

      {/* The keys. */}
      <div
        role="group"
        aria-label="Клавиатура"
        className="absolute left-12 top-[146px] w-[304px]"
      >
        <span
          aria-hidden="true"
          className={`absolute left-0 top-0 h-[38px] rounded-xl bg-ink shadow-[0_6px_24px_rgba(255,158,100,0.35)] transition-[transform,width,opacity] duration-200 ease-[cubic-bezier(0.34,1.4,0.64,1)] ${
            pane === "kb" ? "opacity-100" : "opacity-0"
          }`}
          style={{
            width,
            transform: `translate3d(${slot * STEP_X}px, ${Math.max(0, kbRow) * STEP_Y}px, 0)`,
          }}
        />
        <div
          className="relative grid gap-1"
          style={{
            gridTemplateColumns: `repeat(${COLS}, 40px)`,
            gridAutoRows: "38px",
          }}
        >
          {tools.map((tool, i) => {
            const on = at("tools", i);
            const current = tool === layout;
            return (
              <Key
                key={tool}
                span={toolSpans[i]}
                on={on}
                className={
                  tool === "voice"
                    ? "gap-2 text-[14px]"
                    : `font-mono text-[12px] ${current && !on ? "text-accent" : ""}`
                }
              >
                {tool === "voice" ? (
                  <>
                    <span className="relative flex">
                      {voice === "listening" ? (
                        <span className="tv-listen absolute -inset-2 rounded-full bg-accent" />
                      ) : null}
                      <Mic />
                    </span>
                    {voice === "listening" ? "Слушаю" : "Голосом"}
                  </>
                ) : (
                  LAYOUTS.find(([id]) => id === tool)![1]
                )}
              </Key>
            );
          })}
          {keyRows.map((row, r) =>
            row.map((ch, i) => (
              <Key
                key={`${layout}-${ch}`}
                on={at(`k${r}`, i)}
                className="text-[19px]"
              >
                {ch}
              </Key>
            )),
          )}
          <Key span={2} on={at("edit", 0)} label="Стереть букву">
            ⌫
          </Key>
          <Key span={3} on={at("edit", 1)} className="text-[13px] text-mute">
            пробел
          </Key>
          <Key span={2} on={at("edit", 2)} className="text-[13px] text-mute">
            очистить
          </Key>
        </div>
      </div>

      {/* The results. */}
      <div className="absolute bottom-0 left-[372px] right-0 top-[70px] overflow-hidden">
        <LaneStack focus={resultsLane} anchor={40} top={0}>
          <div key={q ? (found?.used ?? "") : "popular"} className="px-4">
            {chips.length ? (
              <section data-lane="recent" className="pb-4 pt-2">
                <h2 className="mb-2 text-[13px] text-mute">Недавние поиски</h2>
                <div className="flex gap-2">
                  {chips.map((chip, i) => (
                    <span
                      key={chip}
                      data-focused={at("recent", i) || undefined}
                      className={`tv-rise max-w-[160px] truncate rounded-full px-4 py-2 text-[14px] transition-[transform,background-color,color] duration-150 ${
                        at("recent", i)
                          ? "scale-105 bg-ink text-canvas"
                          : "bg-white/10 text-ink"
                      }`}
                      style={{ animationDelay: `${i * 40}ms` }}
                    >
                      {chip}
                    </span>
                  ))}
                </div>
              </section>
            ) : null}
            <h2 className="pb-1 pt-2 text-[17px] font-medium tracking-tight">
              {!q
                ? "Популярно сегодня"
                : nothing
                  ? `Ничего не нашлось по «${q}»`
                  : "Фильмы и сериалы"}
            </h2>
            {used ? (
              <p className="text-[13px] text-mute">
                Показаны результаты для «{used}»
              </p>
            ) : null}
            {failed ? (
              <p className="mt-2 text-mute">
                Поиск сейчас не отвечает. Проверь интернет.
              </p>
            ) : nothing ? (
              <p className="mt-2 text-[15px] text-mute">
                Проверь буквы или скажи название голосом.
              </p>
            ) : null}
            {q && loading && !found ? <Placeholders /> : null}
            <div
              className={`transition-opacity duration-300 ${loading && found ? "opacity-50" : ""}`}
            >
              {tileRows.map((row, r) => (
                <div
                  key={r}
                  data-lane={`r${r}`}
                  className="flex gap-6 pb-3 pt-3"
                >
                  {row.map((card, i) => (
                    <div
                      key={`${card.type}-${card.id}`}
                      className="tv-rise"
                      style={{
                        animationDelay: `${Math.min(r * TILES + i, 10) * 45}ms`,
                      }}
                    >
                      <Poster
                        card={card}
                        focused={at(`r${r}`, i)}
                        caption="year"
                      />
                    </div>
                  ))}
                </div>
              ))}
              {faceRows.length ? (
                <h2 className="pb-1 pt-3 text-[17px] font-medium tracking-tight">
                  Люди
                </h2>
              ) : null}
              {faceRows.map((row, r) => (
                <div key={r} data-lane={`p${r}`} className="flex gap-3 py-3">
                  {row.map((person, i) => (
                    <div
                      key={person.id}
                      className="tv-rise"
                      style={{ animationDelay: `${Math.min(i, 6) * 45}ms` }}
                    >
                      <Person
                        name={person.name}
                        role={
                          person.known_for_department === "Acting"
                            ? "актёр"
                            : undefined
                        }
                        photo={profileUrl(person.profile_path) || null}
                        focused={at(`p${r}`, i)}
                      />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </LaneStack>
      </div>
    </Stage>
  );
}

function Key({
  on,
  span = 1,
  className = "",
  label,
  children,
}: {
  on: boolean;
  span?: number;
  className?: string;
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      data-focused={on || undefined}
      aria-label={label}
      className={`flex items-center justify-center rounded-xl ${
        on ? "!text-canvas" : "bg-white/[0.06]"
      } ${className}`}
      style={{
        gridColumn: `span ${span}`,
        // The letter darkens as the light reaches it.
        transition: `color 120ms ease ${on ? 60 : 0}ms, background-color 150ms`,
      }}
    >
      {children}
    </span>
  );
}

function Mic() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="relative h-[18px] w-[18px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}

/** Posters still on their way: a light runs over empty frames. */
function Placeholders() {
  return (
    <div className="flex gap-6 pt-3">
      {Array.from({ length: TILES }, (_, i) => (
        <div
          key={i}
          className="relative h-[156px] w-[104px] overflow-hidden rounded-xl bg-white/[0.06]"
        >
          <span
            className="tv-shimmer absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-white/10 to-transparent"
            style={{ animationDelay: `${i * 120}ms` }}
          />
        </div>
      ))}
    </div>
  );
}
