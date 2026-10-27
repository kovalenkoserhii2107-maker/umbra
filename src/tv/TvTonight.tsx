import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useNavigate } from "react-router-dom";
import { RatingBadge, useAsync } from "../components";
import { useTvBack } from "../components/TvFocus";
import { loadFeedPage } from "../lib/feeds";
import { apiHealth, apiUrl } from "../lib/api";
import { yearOf } from "../lib/format";
import { useLibraryMeta } from "../lib/meta";
import { PLATFORMS } from "../lib/providers";
import {
  cachedRating,
  ensureImdbRating,
  subscribeRating,
} from "../lib/ratings";
import { readStorage, writeStorage } from "../lib/storage";
import {
  COMPANIES,
  ERAS,
  FORMATS,
  MOODS,
  watchlistEntry,
  type Answers,
  type Pick,
} from "../lib/tonight";
import { posterUrl, titleOf } from "../lib/tmdb";
import {
  appForProvider,
  canVoice,
  installedApps,
  launchTvApp,
  onTvEvent,
  tvBridge,
} from "../lib/tvMode";
import { useAiTonight } from "../lib/useAiTonight";
import { useQuickTonight, type Step } from "../lib/useQuickTonight";
import { useAppState } from "../state";
import { fromLibrary } from "./cards";
import { useLanes, type Lane } from "./lanes";
import { spaceTextures } from "./space";
import { Backdrop, Pill, PillLane, Rail, Stage, Tabs, useMenu } from "./ui";

/*
 * «Что посмотреть вечером» on the TV: the same pickers as on the phone
 * (lib/useAiTonight, lib/useQuickTonight), shown as a small show — the
 * question appears word by word, the chosen answer flies into the trail,
 * Claude "thinks" with the posters of your shelf circling the eclipse, and
 * the picks are dealt like cards.
 */

const MODE = "umbra.tonightMode";
const REWATCH = "umbra.tonightRewatch";

type Option = { label: string; hint?: string; voice?: boolean };

type QuestionView = {
  key: string;
  title: string;
  options: Option[];
  index: number;
  round: number;
  trail: string[];
  choose: (option: Option, text?: string) => void;
  back: () => void;
};

type Action = { key: string; label: string; accent?: boolean; run: () => void };

const i = (n: number) => ({ "--i": n }) as CSSProperties;

/** Light drifting behind everything. */
function Aurora() {
  return (
    <div
      aria-hidden="true"
      className="tv-aurora absolute inset-0 overflow-hidden"
    >
      <span />
      <span />
      <span />
    </div>
  );
}

function Words({ text, className }: { text: string; className?: string }) {
  return (
    <span className={className}>
      {text.split(" ").map((w, n) => (
        <span key={n} className="tv-word" style={i(n)}>
          {w}
          {" "}
        </span>
      ))}
    </span>
  );
}

/** Pills of a lane, the focused one white. */
function ActionLane({
  lane,
  actions,
  at,
  title,
}: {
  lane: string;
  actions: Action[];
  at: (lane: string, i: number) => boolean;
  title?: string;
}) {
  return (
    <PillLane lane={lane} title={title}>
      {actions.map((a, n) => (
        <Pill key={a.key} focused={at(lane, n)} accent={a.accent}>
          {a.label}
        </Pill>
      ))}
    </PillLane>
  );
}

// ---------------------------------------------------------------- intro

function Intro({
  ai,
  rewatch,
  resume,
  onMode,
  onResume,
  onRewatch,
}: {
  ai: boolean | null;
  rewatch: boolean;
  resume: boolean;
  onMode: (mode: "ai" | "quick") => void;
  onResume: () => void;
  onRewatch: () => void;
}) {
  const menu = useMenu("/tonight");
  const cards = [
    ...(resume
      ? [
          {
            key: "resume",
            icon: "↺",
            title: "Повернутися до добірки",
            text: "Останні варіанти Claude чекають на тебе",
            run: onResume,
          },
        ]
      : []),
    ...(ai !== false
      ? [
          {
            key: "ai",
            icon: "✦",
            title: "З Claude",
            text:
              ai === null
                ? "Перевіряю, чи на зв'язку Claude…"
                : "Чотири питання під твою полицю — і фільми, які потраплять у ціль",
            run: () => ai && onMode("ai"),
          },
        ]
      : []),
    {
      key: "quick",
      icon: "⚡",
      title: "Швидкий підбір",
      text: "Настрій, формат, компанія — і добірка за твоїми оцінками",
      run: () => onMode("quick"),
    },
  ];
  const lanes: Lane[] = [
    menu.lane,
    { key: "modes", size: cards.length, onSelect: (n) => cards[n]?.run() },
    { key: "rewatch", size: 1, onSelect: onRewatch },
  ];
  const nav = useLanes(lanes, {
    lane: menu.arrived ? "tabs" : "modes",
    cols: { tabs: menu.index },
  });
  useTvBack(nav.lane !== "tabs", () => nav.focus("tabs", menu.index));
  const at = (lane: string, n: number) =>
    nav.lane === lane && nav.col(lane) === n;
  return (
    <>
      <Tabs
        active="/tonight"
        focus={nav.lane === "tabs" ? nav.col("tabs") : null}
      />
      <div className="absolute left-12 top-[96px] w-[700px]">
        <p className="tv-rise font-mono text-[12px] uppercase tracking-[0.22em] text-accent">
          підбір на вечір
        </p>
        <h1 className="mt-2 text-[42px] leading-[1.05] tracking-tight">
          <Words text="Що подивитися ввечері?" />
        </h1>
        <p className="tv-rise mt-3 text-[16px] text-white/70" style={i(4)}>
          Чотири питання — і добірка, яка враховує все, що ти дивився та
          як оцінював.
        </p>
      </div>
      <div
        data-lane="modes"
        className="absolute left-12 top-[300px] flex gap-5"
      >
        {cards.map((c, n) => (
          <div
            key={c.key}
            data-focused={at("modes", n) || undefined}
            className="tv-rise relative w-[260px]"
            style={i(n + 5)}
          >
            {at("modes", n) ? (
              <span
                aria-hidden="true"
                className="tv-glow absolute -inset-4 rounded-[28px] bg-[radial-gradient(closest-side,rgba(255,158,100,0.45),transparent)]"
              />
            ) : null}
            <div
              className={`relative h-[132px] rounded-3xl p-5 transition-transform duration-200 ${
                at("modes", n)
                  ? "scale-105 bg-ink text-canvas"
                  : "bg-white/[0.08] text-ink"
              }`}
            >
              <p className="text-[22px] leading-none">
                <span className={at("modes", n) ? "text-black" : "text-accent"}>
                  {c.icon}
                </span>{" "}
                {c.title}
              </p>
              <p
                className={`mt-3 text-[14px] leading-snug ${at("modes", n) ? "text-black/70" : "text-white/60"}`}
              >
                {c.text}
              </p>
            </div>
          </div>
        ))}
      </div>
      <div className="absolute left-0 top-[468px]">
        <PillLane lane="rewatch">
          <Pill focused={at("rewatch", 0)}>
            {rewatch ? "✓ " : ""}Включати переглянуте
          </Pill>
          <span className="self-center text-[13px] text-white/50">
            {rewatch
              ? "Вже переглянуте теж може потрапити в добірку"
              : "Тільки те, що ти ще не бачив"}
          </span>
        </PillLane>
      </div>
    </>
  );
}

// ------------------------------------------------------------- question

function Progress({ index, round }: { index: number; round: number }) {
  return (
    <div className="flex items-center gap-4">
      <div className="flex gap-1.5">
        {[0, 1, 2, 3].map((n) => (
          <span
            key={n}
            className="relative h-1.5 w-12 overflow-hidden rounded-full bg-white/15"
          >
            <span
              className="absolute inset-0 origin-left rounded-full bg-accent transition-transform duration-500 ease-out"
              style={{
                transform: `scaleX(${n < index ? 1 : n === index ? 0.35 : 0})`,
              }}
            />
          </span>
        ))}
      </div>
      <p className="font-mono text-[12px] uppercase tracking-[0.16em] text-white/60">
        {round > 1 ? `раунд ${round} · ` : ""}питання {index + 1} з 4
      </p>
    </div>
  );
}

function Question({ view }: { view: QuestionView }) {
  const [chosen, setChosen] = useState<number | null>(null);
  const [listening, setListening] = useState<string | null>(null);
  const voiceActive = useRef(false);
  const voiceAt = view.options.findIndex((o) => o.voice);

  useEffect(() => {
    const stop = onTvEvent((e) => {
      if (e.type !== "voice") return;
      if (e.state === "listening") {
        voiceActive.current = true;
        setListening("");
      } else if (e.state === "partial") setListening(e.text);
      else if (e.state === "result") {
        voiceActive.current = false;
        setListening(null);
        if (e.text.trim()) pick(voiceAt, e.text.trim());
      } else if (e.state === "end" || e.state === "error") {
        voiceActive.current = false;
        setListening(null);
      }
    });
    return () => {
      stop();
      if (voiceActive.current) {
        voiceActive.current = false;
        tvBridge()?.stopVoice();
      }
    };
  }, [view.key]);

  function pick(n: number, text?: string) {
    if (chosen !== null) return;
    const option = view.options[n];
    if (!option) return;
    if (option.voice && text === undefined) {
      voiceActive.current = true;
      setListening("");
      tvBridge()?.startVoice("ru-RU");
      return;
    }
    setChosen(n);
    // The flight of the chosen card, then the answer goes in.
    window.setTimeout(() => view.choose(option, text), 430);
  }

  const lanes: Lane[] = [
    {
      key: "options",
      size: chosen === null ? view.options.length : 0,
      onSelect: pick,
    },
  ];
  const nav = useLanes(lanes, { lane: "options" });
  useTvBack(true, view.back);
  const wide = view.options.length > 4;
  const step = wide ? 186 : 214;
  return (
    <>
      <div className="absolute left-12 top-10">
        <Progress index={view.index} round={view.round} />
        <div className="mt-4 flex h-8 flex-wrap gap-2">
          {view.trail.map((t, n) => (
            <span
              key={`${n}-${t}`}
              className={`${n === view.trail.length - 1 ? "tv-pop" : ""} max-w-[220px] truncate rounded-full bg-accent/20 px-3 py-1 text-[13px] text-accent`}
            >
              {t}
            </span>
          ))}
        </div>
      </div>
      <h1 className="absolute left-12 top-[128px] w-[820px] text-[36px] leading-[1.12] tracking-tight">
        <Words key={view.key} text={view.title} />
      </h1>
      <div className="absolute inset-x-0 top-[290px]">
        <Rail
          lane="options"
          count={view.options.length}
          step={step}
          col={nav.col("options")}
        >
          {view.options.map((o, n) => {
            const focused = chosen === null && nav.col("options") === n;
            const cls =
              chosen === null
                ? "tv-rise"
                : chosen === n
                  ? "tv-chosen"
                  : "tv-fall";
            return (
              <div
                key={`${view.key}-${n}`}
                data-focused={focused || undefined}
                className={`${cls} relative shrink-0`}
                style={{ ...i(n + 3), width: step - 14 }}
              >
                {focused ? (
                  <span
                    aria-hidden="true"
                    className="tv-glow absolute -inset-4 rounded-[28px] bg-[radial-gradient(closest-side,rgba(255,158,100,0.5),transparent)]"
                  />
                ) : null}
                <div
                  className={`relative flex h-[132px] flex-col justify-between rounded-3xl p-4 transition-transform duration-200 ${
                    focused || chosen === n
                      ? "scale-105 bg-ink text-canvas"
                      : "bg-white/[0.08]"
                  }`}
                >
                  <p className="line-clamp-3 text-[18px] leading-tight">
                    {o.voice ? "🎤 " : ""}
                    {o.voice && listening !== null && focused
                      ? listening || "Говорите…"
                      : o.label}
                  </p>
                  {o.hint ? (
                    <p
                      className={`line-clamp-2 text-[13px] leading-snug ${focused || chosen === n ? "text-black/60" : "text-white/55"}`}
                    >
                      {o.hint}
                    </p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </Rail>
      </div>
      <p className="absolute bottom-8 left-12 text-[13px] text-white/40">
        ← → обрати · OK відповісти · «Назад» — попереднє питання
      </p>
    </>
  );
}

// ------------------------------------------------------------- thinking

const PHRASES = {
  ask: [
    "Claude читає твої відповіді…",
    "Обирає найкорисніше наступне питання…",
  ],
  pick: [
    "Дивлюся твої оцінки та улюблене…",
    "Шукаю схоже на те, що тобі подобається…",
    "Відсіюю вже переглянуте…",
    "Перевіряю, де це подивитися…",
    "Збираю добірку на вечір…",
  ],
};

/**
 * The final pick: posters of the shelf and of the catalog run past like the
 * reels of a slot machine on a tilted wall, a frame pulsing in the middle.
 */
function Thinking({
  what,
  onBack,
}: {
  what: "ask" | "pick";
  onBack: () => void;
}) {
  useTvBack(true, onBack);
  const { items } = useAppState();
  const own = useMemo(
    () =>
      [...items]
        .filter((x) => x.poster)
        .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
        .slice(0, 24)
        .map((x) => fromLibrary(x).poster as string),
    [items],
  );
  const trending = useAsync(
    () => loadFeedPage("trending", 1).catch(() => null),
    [],
  );
  const top = useAsync(
    () => loadFeedPage("imdb250-movie", 1).catch(() => null),
    [],
  );
  const pool = useMemo(() => {
    const more = [
      ...(trending.data?.results ?? []),
      ...(top.data?.results ?? []),
    ]
      .map((x) => posterUrl(x.poster_path, "w185"))
      .filter(Boolean);
    return [...new Set([...own, ...more])];
  }, [own, trending.data, top.data]);
  const COLUMNS = 8;
  const PER = 6;
  const columns = Array.from({ length: COLUMNS }, (_, c) =>
    pool.length
      ? Array.from(
          { length: PER },
          (_, k) => pool[(c * 5 + k * 7) % pool.length],
        )
      : [],
  );
  const phrases = PHRASES[what];
  const [n, setN] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setN((k) => k + 1), 2600);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <div className="absolute inset-0 overflow-hidden">
      <div
        aria-hidden="true"
        className="absolute -inset-x-20 -top-40 bottom-[-160px] flex justify-center gap-3"
        style={{
          transform: "perspective(900px) rotateX(24deg) rotateZ(-10deg)",
        }}
      >
        {columns.map((col, c) => (
          <div key={c} className="w-[104px] shrink-0 overflow-hidden">
            {/* Two copies one after the other: the reel loops seamlessly. */}
            <div
              className={c % 2 ? "tv-reel-down" : "tv-reel-up"}
              style={{ "--d": `${18 + ((c * 7) % 5) * 3}s` } as CSSProperties}
            >
              {[...col, ...col].map((src, k) => (
                <img
                  key={k}
                  src={src}
                  alt=""
                  className="mb-3 h-[156px] w-[104px] rounded-xl object-cover"
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      {/* Darkness around the middle, where the choice is made. */}
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 48% 42% at 50% 46%, rgba(0,0,0,0.15), rgba(0,0,0,0.88) 75%, #000 100%)",
        }}
      />
      <div
        aria-hidden="true"
        className="tv-frame absolute left-1/2 top-[46%] h-[190px] w-[132px] -translate-x-1/2 -translate-y-1/2 rounded-2xl border-[3px] border-accent shadow-[0_0_40px_rgba(255,158,100,0.6)]"
      />
      <div className="absolute inset-x-0 bottom-14 flex flex-col items-center">
        <p key={n} className="tv-rise text-[22px] text-white/90">
          {phrases[n % phrases.length]}
        </p>
        <p className="mt-2 text-[13px] text-white/45">Зазвичай це до хвилини</p>
      </div>
    </div>
  );
}

/* The Earth: a huge circle whose top crosses the screen at y ≈ 330. */
const EARTH_R = 820;
const EARTH_X = 480;
const EARTH_Y = 1150;
const SUN_X = 600;
const LIMB_Y = EARTH_Y - Math.sqrt(EARTH_R * EARTH_R - (SUN_X - EARTH_X) ** 2);

function OrbitalSunrise() {
  const [tex, setTex] = useState<{ lights: string; clouds: string } | null>(
    null,
  );
  useEffect(() => {
    let alive = true;
    void spaceTextures().then((t) => alive && setTex(t));
    return () => {
      alive = false;
    };
  }, []);
  const strip = (url: string, opacity: number) => (
    <div
      className="tv-earth-turn absolute left-0 top-0 h-[360px] w-[3840px]"
      style={{
        opacity,
        backgroundImage: `url(${url})`,
        backgroundSize: "1920px 360px",
        backgroundRepeat: "repeat-x",
      }}
    />
  );
  return (
    <div aria-hidden="true" className="absolute inset-0">
      {/* The sun, behind the Earth: it rises over the limb and sets again. */}
      <div
        className="tv-sunrise absolute h-0 w-0"
        style={{ left: SUN_X, top: LIMB_Y }}
      >
        <div
          className="absolute -left-[220px] -top-[220px] h-[440px] w-[440px] rounded-full"
          style={{
            background:
              "radial-gradient(closest-side, rgba(255,250,235,0.95) 0 6%, rgba(255,214,160,0.55) 14%, rgba(255,150,80,0.22) 34%, rgba(255,120,60,0.06) 60%, transparent 100%)",
          }}
        />
        <div className="tv-flare absolute -left-[230px] -top-[230px] h-[460px] w-[460px]">
          <div
            className="tv-rays h-full w-full rounded-full"
            style={{
              background:
                "repeating-conic-gradient(from 8deg, rgba(255,240,220,0.5) 0deg 1.2deg, transparent 1.2deg 22.5deg)",
              WebkitMaskImage:
                "radial-gradient(closest-side, #000 4%, rgba(0,0,0,0.5) 22%, transparent 70%)",
              maskImage:
                "radial-gradient(closest-side, #000 4%, rgba(0,0,0,0.5) 22%, transparent 70%)",
            }}
          />
        </div>
        <div className="absolute -left-[13px] -top-[13px] h-[26px] w-[26px] rounded-full bg-white shadow-[0_0_24px_10px_rgba(255,245,225,0.9)]" />
      </div>

      {/* Twilight on the night side near the sun. */}
      <div
        className="tv-limb absolute"
        style={{
          left: SUN_X - 360,
          top: LIMB_Y - 150,
          width: 720,
          height: 300,
          background:
            "radial-gradient(closest-side, rgba(255,150,70,0.5), rgba(255,110,50,0.16) 45%, transparent 100%)",
        }}
      />

      {/* The night Earth: dark, city lights, clouds, the blue atmosphere. */}
      <div
        className="absolute overflow-hidden rounded-full"
        style={{
          left: EARTH_X - EARTH_R,
          top: EARTH_Y - EARTH_R,
          width: EARTH_R * 2,
          height: EARTH_R * 2,
          background:
            "radial-gradient(circle at 50% 2%, #0d1830 0%, #070b16 6%, #030509 22%)",
          boxShadow:
            "0 0 14px 3px rgba(120,190,255,0.75), 0 0 46px 14px rgba(70,130,255,0.32), 0 0 120px 40px rgba(40,80,200,0.12)",
        }}
      >
        <div
          className="absolute"
          style={{ left: EARTH_R - EARTH_X, top: 0, width: 960, height: 360 }}
        >
          {tex ? (
            <>
              {strip(tex.lights, 0.9)}
              {strip(tex.clouds, 0.5)}
            </>
          ) : null}
        </div>
        {/* Atmosphere scattering just inside the limb, warmer near the sun. */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            boxShadow:
              "inset 0 6px 10px rgba(130,190,255,0.45), inset 0 26px 60px rgba(40,90,200,0.25)",
          }}
        />
        <div
          className="tv-limb absolute"
          style={{
            left: EARTH_R + (SUN_X - EARTH_X) - 260,
            top: 0,
            width: 520,
            height: 120,
            background:
              "radial-gradient(ellipse 50% 30% at 50% 0%, rgba(255,170,90,0.7), rgba(255,120,60,0.22) 50%, transparent 80%)",
          }}
        />
      </div>

      {/* Lens flare: soft rings on the line from the sun across the screen. */}
      <div className="tv-flare absolute inset-0">
        {[
          { t: 0.35, r: 46, c: "rgba(255,190,130,0.16)" },
          { t: 0.6, r: 22, c: "rgba(140,210,255,0.22)" },
          { t: 0.85, r: 70, c: "rgba(255,160,90,0.09)" },
          { t: 1.1, r: 14, c: "rgba(180,255,220,0.25)" },
        ].map((f, k) => {
          const x = SUN_X + (330 - SUN_X) * f.t;
          const y = LIMB_Y - 34 + (470 - (LIMB_Y - 34)) * f.t;
          return (
            <span
              key={k}
              className="absolute rounded-full"
              style={{
                left: x - f.r,
                top: y - f.r,
                width: f.r * 2,
                height: f.r * 2,
                background: `radial-gradient(closest-side, ${f.c}, ${f.c} 70%, transparent)`,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

/** Stars of the waiting screen: fixed places, so they do not jump. */
const STARS = Array.from({ length: 46 }, (_, k) => {
  const r = (n: number) =>
    (((Math.sin(k * 127.1 + n * 311.7) * 43758.5453) % 1) + 1) % 1;
  return {
    left: `${r(1) * 100}%`,
    top: `${r(2) * 100}%`,
    size: 1 + Math.round(r(3) * 2),
    delay: `${-r(4) * 3.4}s`,
  };
});

/**
 * While Claude chooses the next question: sunrise over the night Earth
 * from orbit — the sun climbs over the limb with its flare, then sets again
 * and the atmosphere glows orange: an eclipse, the sign of Umbra.
 */
function Eclipse({
  index,
  round,
  trail,
  onBack,
}: {
  /** Questions answered in this round (the next one is index + 1). */
  index: number;
  round: number;
  trail: string[];
  onBack: () => void;
}) {
  useTvBack(true, onBack);
  return (
    <div className="absolute inset-0 bg-black">
      <div aria-hidden="true" className="absolute inset-0">
        {STARS.map((s, k) => (
          <span
            key={k}
            className="tv-star"
            style={{
              left: s.left,
              top: s.top,
              width: s.size,
              height: s.size,
              animationDelay: s.delay,
            }}
          />
        ))}
      </div>
      <div className="absolute left-12 top-10 flex items-center gap-4">
        <div className="flex gap-1.5">
          {[0, 1, 2, 3].map((n) => (
            <span
              key={n}
              className="relative h-1.5 w-12 overflow-hidden rounded-full bg-white/15"
            >
              {n < index ? (
                <span className="absolute inset-0 rounded-full bg-accent" />
              ) : n === index ? (
                <span className="tv-shimmer absolute inset-y-0 left-0 w-1/2 rounded-full bg-gradient-to-r from-transparent via-accent to-transparent" />
              ) : null}
            </span>
          ))}
        </div>
        <p className="font-mono text-[12px] uppercase tracking-[0.16em] text-white/60">
          {round > 1 ? `раунд ${round} · ` : ""}готую питання {index + 1} з 4
        </p>
      </div>

      <OrbitalSunrise />
      <div className="absolute inset-x-0 top-[400px] flex flex-col items-center">
        <p className="text-[22px] text-white/90 [text-shadow:0_2px_12px_rgba(0,0,0,0.9)]">
          Claude обирає наступне питання
          {[0, 1, 2].map((k) => (
            <span
              key={k}
              className="tv-dot inline-block text-accent"
              style={i(k)}
            >
              .
            </span>
          ))}
        </p>
        {trail.length ? (
          <div className="mt-4 flex max-w-[760px] flex-wrap justify-center gap-2">
            {trail.map((t, n) => (
              <span
                key={`${n}-${t}`}
                className={`${n === trail.length - 1 ? "tv-pop" : ""} max-w-[240px] truncate rounded-full bg-accent/20 px-3 py-1 text-[13px] text-accent`}
              >
                {t}
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-[14px] text-white/50">
            Дивлюся на твою полицю: оцінки, «Хочу подивитися», покинуте
          </p>
        )}
      </div>
    </div>
  );
}

// -------------------------------------------------------------- results

function useImdb(pick: Pick | null) {
  const [, tick] = useState(0);
  useEffect(
    () =>
      pick
        ? subscribeRating(pick.type, pick.item.id, () => tick((n) => n + 1))
        : undefined,
    [pick?.type, pick?.item.id],
  );
  useEffect(() => {
    if (pick)
      void ensureImdbRating(pick.type, pick.item.id).catch(() => undefined);
  }, [pick?.key]);
  return pick ? cachedRating(pick.type, pick.item.id).imdb : null;
}

function Results({
  picks,
  taste,
  extra,
  onSeen,
  onDismiss,
  onBack,
}: {
  picks: Pick[];
  /** What Claude understood about your taste. */
  taste?: string;
  /** "Ще варіанти", "Уточнити"… */
  extra: Action[];
  /** Seen, with the score picked right away (null — no score). */
  onSeen: (p: Pick, rating: number | null) => void;
  onDismiss: (p: Pick) => void;
  onBack: () => void;
}) {
  const navigate = useNavigate();
  const { get, upsert, remove } = useAppState();
  const [leaving, setLeaving] = useState<Record<string, "seen" | "dismiss">>(
    {},
  );
  const mounted = useRef(Date.now());
  const apps = installedApps();
  /** «Смотрел» pressed: the pick waits for its score. */
  const [rating, setRating] = useState<Pick | null>(null);

  /** The buttons under the posters, for the pick in focus. */
  const actionsFor = (pick: Pick | undefined): Action[] => {
    if (!pick) return [];
    const mine = get(pick.type, pick.item.id);
    const watch = pick.where
      ?.map((name) => ({ name, app: appForProvider(name) }))
      .find((w) => w.app && apps[w.app]);
    return [
      ...(watch?.app
        ? [
            {
              key: "watch",
              label: `▶ Дивитися в ${watch.name}`,
              accent: true,
              run: () =>
                launchTvApp(
                  watch.app!,
                  pick.item.original_title ||
                    pick.item.original_name ||
                    titleOf(pick.item),
                ),
            },
          ]
        : []),
      {
        key: "open",
        label: "Детальніше",
        run: () => navigate(`/title/${pick.type}/${pick.item.id}`),
      },
      ...(!mine
        ? [
            {
              key: "want",
              label: "＋ Хочу подивитися",
              run: () => upsert(watchlistEntry(pick)),
            },
          ]
        : mine.status === "watchlist" && !mine.note
          ? [
              {
                key: "want",
                label: "✓ У «Хочу подивитися»",
                run: () => remove(pick.type, pick.item.id),
              },
            ]
          : []),
      ...(mine?.status === "watched"
        ? []
        : [
            {
              key: "seen",
              label: "✓ Дивився",
              run: () => {
                setRating(pick);
                nav.focus("rate", 4);
              },
            },
          ]),
      { key: "no", label: "✕ Не те", run: () => leave(pick, "dismiss") },
    ];
  };
  const pickAt = (cols: Record<string, number>) =>
    picks[Math.max(0, Math.min(cols.picks ?? 0, picks.length - 1))];
  const nav = useLanes(
    (state) =>
      rating
        ? [
            // 1–10 and «Без оцінки»; the focus starts on 5.
            {
              key: "rate",
              size: 11,
              onSelect: (n) => {
                const p = rating;
                setRating(null);
                nav.focus("picks");
                leave(p, "seen", n < 10 ? n + 1 : null);
              },
            },
          ]
        : [
            {
              key: "picks",
              size: picks.length,
              onSelect: () => nav.focus("actions", 0),
            },
            {
              key: "actions",
              size: actionsFor(pickAt(state.cols)).length,
              onSelect: (n) => actionsFor(pickAt(state.cols))[n]?.run(),
            },
            {
              key: "more",
              size: extra.length,
              onSelect: (n) => extra[n]?.run(),
            },
          ],
    { lane: "picks" },
  );
  // Back while scoring: the pick stays, nothing is marked; otherwise back to the start.
  useTvBack(true, () => {
    if (rating !== null) {
      setRating(null);
      nav.focus("actions");
    } else {
      onBack();
    }
  });
  // While scoring, the picks lane is away: the row keeps its place.
  const lastPick = useRef(0);
  if (!rating) lastPick.current = nav.col("picks");
  const pickIndex = lastPick.current;
  const pick = picks[pickIndex] ?? null;
  const imdb = useImdb(pick);
  // Another pick: its buttons start from the first, so «Не то» is never
  // pressed again by accident on the card that came in its place.
  useEffect(() => nav.setCol("actions", 0), [pick?.key]);
  const actions = actionsFor(pick ?? undefined);

  function leave(
    p: Pick,
    how: "seen" | "dismiss",
    score: number | null = null,
  ) {
    if (leaving[p.key]) return;
    setLeaving((l) => ({ ...l, [p.key]: how }));
    window.setTimeout(() => {
      if (how === "seen") onSeen(p, score);
      else onDismiss(p);
      setLeaving((l) => {
        const next = { ...l };
        delete next[p.key];
        return next;
      });
    }, 430);
  }

  const at = (lane: string, n: number) =>
    nav.lane === lane && nav.col(lane) === n;
  const late = Date.now() - mounted.current > 1500;

  const year = pick
    ? yearOf(pick.item.release_date || pick.item.first_air_date)
    : "";
  const score = imdb
    ? `IMDb ${imdb}`
    : pick?.item.vote_count && pick.item.vote_count >= 50
      ? `TMDB ${pick.item.vote_average?.toFixed(1)}`
      : "";
  return (
    <>
      <Backdrop path={pick?.item.backdrop_path} dim={0.9} />
      <div className="absolute left-12 top-8 w-[600px]">
        {taste ? (
          <p className="tv-rise line-clamp-2 text-[13px] leading-snug text-accent/90">
            <span className="font-mono uppercase tracking-[0.14em]">
              Claude зрозумів:{" "}
            </span>
            {taste}
          </p>
        ) : (
          <p className="tv-rise font-mono text-[12px] uppercase tracking-[0.2em] text-accent">
            добірка на вечір
          </p>
        )}
        {pick ? (
          <div key={pick.key} className="tv-fade mt-4">
            <h1 className="line-clamp-2 text-[34px] leading-[1.08] tracking-tight">
              {titleOf(pick.item)}
            </h1>
            <p className="mt-2 text-[14px] text-white/70">
              {[pick.type === "tv" ? "серіал" : "фільм", year, score]
                .filter(Boolean)
                .join(" · ")}
              {pick.where?.length ? (
                <span className="text-ok">
                  {" "}
                  · є на {pick.where.join(", ")}
                </span>
              ) : null}
            </p>
            {pick.reasons.length ? (
              <p className="mt-3 line-clamp-3 border-l-2 border-accent pl-3 text-[15px] leading-snug text-white/90">
                {pick.reasons.join(" · ")}
              </p>
            ) : pick.item.overview ? (
              <p className="mt-3 line-clamp-3 text-[15px] leading-snug text-white/80">
                {pick.item.overview}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="absolute inset-x-0 top-[236px]">
        <Rail lane="picks" count={picks.length} step={124} col={pickIndex}>
          {picks.map((p, n) => {
            const focused = at("picks", n);
            const how = leaving[p.key];
            const status = get(p.type, p.item.id)?.status;
            return (
              <div
                key={p.key}
                data-focused={focused || undefined}
                className={`${how === "seen" ? "tv-seen" : how === "dismiss" ? "tv-dismiss" : "tv-deal"} relative w-[110px] shrink-0`}
                style={i(late ? 0 : n)}
              >
                <div
                  className={`relative h-[165px] overflow-hidden rounded-xl bg-card transition-transform duration-150 ${
                    focused || (nav.lane === "actions" && pick?.key === p.key)
                      ? "z-10 scale-110 shadow-[0_0_0_3px_var(--color-accent),0_14px_30px_rgba(0,0,0,0.7)]"
                      : ""
                  }`}
                >
                  {p.item.poster_path ? (
                    <img
                      src={posterUrl(p.item.poster_path)}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <p className="p-2 text-sm text-mute">{titleOf(p.item)}</p>
                  )}
                  <RatingBadge type={p.type} id={p.item.id} />
                  {how === "seen" ? (
                    <span className="absolute inset-0 flex items-center justify-center bg-ok/70 text-4xl text-black">
                      ✓
                    </span>
                  ) : status === "watchlist" ? (
                    <span className="absolute left-1.5 top-1.5 rounded-md bg-accent px-1.5 py-0.5 text-[11px] font-bold text-black">
                      хочу
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </Rail>
      </div>

      <div className="absolute inset-x-0 top-[426px]">
        {rating ? (
          <section
            data-lane="rate"
            className="tv-rise flex items-center gap-2.5 px-12"
          >
            <p className="mr-2 max-w-[190px] truncate text-[15px] text-white/80">
              Як тобі «{titleOf(rating.item)}»?
            </p>
            {Array.from({ length: 10 }, (_, n) => (
              <span
                key={n}
                data-focused={at("rate", n) || undefined}
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-mono text-[15px] transition-transform duration-150 ${
                  at("rate", n)
                    ? "scale-125 bg-accent text-black"
                    : "bg-white/10"
                }`}
              >
                {n + 1}
              </span>
            ))}
            <span
              data-focused={at("rate", 10) || undefined}
              className={`ml-1 flex h-10 shrink-0 items-center rounded-full px-4 text-[14px] transition-transform duration-150 ${
                at("rate", 10)
                  ? "scale-105 bg-ink text-canvas"
                  : "bg-white/10 text-white/70"
              }`}
            >
              Без оцінки
            </span>
          </section>
        ) : (
          <ActionLane lane="actions" actions={actions} at={at} />
        )}
      </div>
      <div
        className={`absolute inset-x-0 top-[484px] transition-opacity duration-200 ${nav.lane === "more" ? "opacity-100" : "opacity-60"}`}
      >
        <ActionLane lane="more" actions={extra} at={at} />
      </div>
    </>
  );
}

// ---------------------------------------------------------------- screen

function Message({
  text,
  actions,
  onBack,
}: {
  text: string;
  actions: Action[];
  onBack: () => void;
}) {
  const nav = useLanes(
    [{ key: "msg", size: actions.length, onSelect: (n) => actions[n]?.run() }],
    {
      lane: "msg",
    },
  );
  useTvBack(true, onBack);
  const at = (lane: string, n: number) =>
    nav.lane === lane && nav.col(lane) === n;
  return (
    <div className="absolute inset-x-0 top-[180px]">
      <p className="tv-rise px-12 text-[22px] leading-snug text-white/85">
        {text}
      </p>
      <div className="mt-6">
        <ActionLane lane="msg" actions={actions} at={at} />
      </div>
    </div>
  );
}

const QUICK: Array<{
  key: keyof Answers;
  title: string;
  options: Array<{ id: string; label: string; hint?: string }>;
}> = [
  { key: "mood", title: "Який настрій?", options: MOODS },
  { key: "format", title: "Фільм чи серіал?", options: FORMATS },
  { key: "company", title: "З ким дивишся?", options: COMPANIES },
  { key: "era", title: "Свіже чи перевірене?", options: ERAS },
];

export function TvTonight() {
  const { items, settings, get, upsert, update, remove } = useAppState();
  const { meta } = useLibraryMeta(items);
  const services = PLATFORMS.filter((p) => settings.subscribed.includes(p.id));
  const [ai, setAi] = useState<boolean | null>(apiUrl() ? null : false);
  useEffect(() => {
    if (!apiUrl()) return;
    let alive = true;
    apiHealth()
      .then((h) => alive && setAi(Boolean(h.services.ai)))
      .catch(() => alive && setAi(false));
    return () => {
      alive = false;
    };
  }, []);
  const [rewatch, setRewatch] = useState(() => readStorage(REWATCH) === "1");
  const claude = useAiTonight({
    items,
    meta,
    region: settings.region,
    services,
    library: { get, upsert, update, remove },
    rewatch,
  });
  const quick = useQuickTonight(rewatch);
  /** null — the start screen. */
  const [mode, setMode] = useState<"ai" | "quick" | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  const toStart = () => setMode(null);

  function begin(m: "ai" | "quick") {
    writeStorage(MODE, m);
    setMode(m);
    if (m === "ai") claude.start();
    else {
      quick.restart();
      setHidden([]);
    }
  }

  let content: React.ReactNode;
  if (mode === null) {
    content = (
      <Intro
        ai={ai}
        rewatch={rewatch}
        resume={Boolean(claude.session?.picks.length)}
        onMode={begin}
        onResume={() => setMode("ai")}
        onRewatch={() => {
          writeStorage(REWATCH, rewatch ? "0" : "1");
          setRewatch(!rewatch);
        }}
      />
    );
  } else if (mode === "ai") {
    const s = claude.session;
    // This round's answers, oldest first.
    const trail: string[] = [];
    for (const step of [...(s?.steps ?? [])].reverse()) {
      if (!("answer" in step)) break;
      trail.unshift(step.answer);
    }
    if (claude.busy === "ask")
      content = (
        <Eclipse
          index={claude.answered}
          round={claude.round}
          trail={trail}
          onBack={toStart}
        />
      );
    else if (claude.busy)
      content = <Thinking key="pick" what="pick" onBack={toStart} />;
    else if (claude.error)
      content = (
        <Message
          text={claude.error}
          onBack={toStart}
          actions={[
            ...(claude.canRetry
              ? [
                  {
                    key: "retry",
                    label: "Повторити",
                    accent: true,
                    run: claude.retry,
                  },
                ]
              : []),
            {
              key: "quick",
              label: "Швидкий підбір",
              run: () => begin("quick"),
            },
            { key: "home", label: "До початку", run: toStart },
          ]}
        />
      );
    else if (claude.current && s) {
      content = (
        <Question
          key={`ai-${s.steps.length}-${claude.current.question}`}
          view={{
            key: `ai-${s.steps.length}`,
            title: claude.current.question,
            options: [
              ...claude.current.options,
              ...(claude.current.allow_custom && canVoice()
                ? [{ label: "Сказати своїми словами", voice: true }]
                : []),
            ],
            index: claude.answered,
            round: claude.round,
            trail,
            choose: (o, text) => claude.answer(text ?? o.label),
            back: () => (s.asked.length > 1 ? claude.back() : toStart()),
          }}
        />
      );
    } else if (s?.picks.length)
      content = (
        <Results
          key={`ai-${s.steps.length}`}
          picks={s.picks.filter((p) => !s.verdicts[p.key])}
          taste={s.taste}
          onSeen={(p, rating) => claude.judge(p, "seen", rating)}
          onDismiss={(p) => claude.judge(p, "disliked")}
          onBack={toStart}
          extra={[
            {
              key: "more",
              label: "Ще варіанти",
              accent: true,
              run: () => claude.proceed("pick"),
            },
            {
              key: "ask",
              label: "Уточнити (4 питання)",
              run: () => claude.proceed("ask"),
            },
            { key: "again", label: "Почати заново", run: toStart },
          ]}
        />
      );
    else if (s)
      content = (
        <Message
          text="Claude не знайшов нічого нового. Уточнимо?"
          onBack={toStart}
          actions={[
            {
              key: "ask",
              label: "Уточнити (4 питання)",
              accent: true,
              run: () => claude.proceed("ask"),
            },
            { key: "home", label: "До початку", run: toStart },
          ]}
        />
      );
    else content = <Eclipse index={0} round={1} trail={[]} onBack={toStart} />;
  } else {
    const step = quick.step;
    if (step !== "done") {
      const q = QUICK[step];
      const trail = QUICK.slice(0, step)
        .map((x) => x.options.find((o) => o.id === quick.answers[x.key])?.label)
        .filter((x): x is string => Boolean(x));
      content = (
        <Question
          key={`quick-${step}`}
          view={{
            key: `quick-${step}`,
            title: q.title,
            options: q.options.map((o) => ({ label: o.label, hint: o.hint })),
            index: step,
            round: 1,
            trail,
            choose: (o) => {
              const option = q.options.find((x) => x.label === o.label)!;
              quick.answer(
                q.key,
                option.id as never,
                step === 3 ? "done" : ((step + 1) as Step),
              );
            },
            back: () =>
              step > 0 ? quick.setStep((step - 1) as Step) : toStart(),
          }}
        />
      );
    } else if (quick.error)
      content = (
        <Message
          text={quick.error}
          onBack={toStart}
          actions={[
            {
              key: "again",
              label: "Змінити відповіді",
              accent: true,
              run: () => begin("quick"),
            },
            { key: "home", label: "До початку", run: toStart },
          ]}
        />
      );
    else if (quick.busy && !quick.shown.length)
      content = <Thinking what="pick" onBack={toStart} />;
    else {
      const picks = quick.shown.filter((p) => !hidden.includes(p.key));
      content = picks.length ? (
        <Results
          key="quick"
          picks={picks}
          onSeen={(p, rating) => {
            const was = get(p.type, p.item.id);
            upsert({
              ...watchlistEntry(p, "watched"),
              rating: rating ?? was?.rating ?? null,
              note: was?.note ?? "",
            });
            setHidden((h) => [...h, p.key]);
          }}
          onDismiss={(p) => setHidden((h) => [...h, p.key])}
          onBack={toStart}
          extra={[
            ...(quick.ranked && quick.shown.length < quick.ranked.length
              ? [
                  {
                    key: "more",
                    label: "Ще варіанти",
                    accent: true,
                    run: () => void quick.more(),
                  },
                ]
              : []),
            {
              key: "again",
              label: "Змінити відповіді",
              run: () => begin("quick"),
            },
            { key: "home", label: "До початку", run: toStart },
          ]}
        />
      ) : (
        <Message
          text="Нічого не підійшло. Спробуємо інший настрій?"
          onBack={toStart}
          actions={[
            {
              key: "again",
              label: "Змінити відповіді",
              accent: true,
              run: () => begin("quick"),
            },
            { key: "home", label: "До початку", run: toStart },
          ]}
        />
      );
    }
  }

  return (
    <Stage screen="/tonight">
      <Aurora />
      {content}
    </Stage>
  );
}
