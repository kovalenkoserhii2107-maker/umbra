import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAppState } from "../state";
import { useLibraryMeta } from "../lib/meta";
import { PLATFORMS } from "../lib/providers";
import { posterUrl, titleOf } from "../lib/tmdb";
import { episodeLabel } from "../lib/tracking";
import { readStorage, writeStorage } from "../lib/storage";
import { yearOf } from "../lib/format";
import { correctPosterUrl } from "../lib/tmdb";
import {
  COMPANIES,
  ERAS,
  FORMATS,
  MOODS,
  continueShows,
  genreTaste,
  keyOf,
  loadCandidates,
  rankTonight,
  withServices,
  type Answers,
  type Pick,
} from "../lib/tonight";
import type { LibraryItem } from "../state";

const PAGE = 6;
const LAST = "umbra.tonight";

type Step = 0 | 1 | 2 | 3;

function Option({
  label,
  hint,
  active,
  onClick,
}: {
  label: string;
  hint?: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-2xl border p-4 text-left transition ${active ? "border-accent bg-accent/10" : "border-hairline bg-card hover:border-accent/50"}`}
    >
      <span className="block text-base">{label}</span>
      {hint ? (
        <span className="mt-0.5 block text-xs text-mute">{hint}</span>
      ) : null}
    </button>
  );
}

function Question({
  step,
  title,
  children,
  onBack,
}: {
  step: number;
  title: string;
  children: React.ReactNode;
  onBack?: () => void;
}) {
  return (
    <section className="rise mt-6">
      <div className="flex items-center justify-between">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-dim">
          вопрос {step + 1} из 4
        </p>
        <div className="flex gap-1.5" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className={`h-1.5 w-6 rounded-full ${i <= step ? "bg-accent" : "bg-hairline"}`}
            />
          ))}
        </div>
      </div>
      <h2 className="mt-2 text-2xl tracking-tight">{title}</h2>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">{children}</div>
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="mt-4 text-sm text-mute"
        >
          ← Назад
        </button>
      ) : null}
    </section>
  );
}

function PickCard({
  pick,
  saved,
  onSave,
}: {
  pick: Pick;
  saved: boolean;
  onSave: () => void;
}) {
  const href = `/title/${pick.type}/${pick.item.id}`;
  const poster = posterUrl(pick.item.poster_path, "w185");
  const year = yearOf(pick.item.release_date || pick.item.first_air_date);
  const score =
    pick.item.vote_count && pick.item.vote_count >= 50
      ? pick.item.vote_average
      : null;
  return (
    <article className="flex gap-3 rounded-2xl border border-hairline bg-card p-3">
      <Link to={href} className="w-20 shrink-0">
        {poster ? (
          <img
            src={poster}
            alt=""
            loading="lazy"
            className="aspect-[2/3] w-full rounded-xl border border-hairline object-cover"
          />
        ) : (
          <div className="aspect-[2/3] rounded-xl border border-hairline bg-canvas" />
        )}
      </Link>
      <div className="min-w-0 flex-1">
        <Link
          to={href}
          className="block text-base leading-snug hover:text-accent"
        >
          {titleOf(pick.item)}
        </Link>
        <p className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.12em] text-dim">
          {[
            pick.type === "tv" ? "сериал" : "фильм",
            year,
            score ? `TMDB ${score.toFixed(1)}` : "",
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {pick.reasons.length ? (
          <ul className="mt-1.5 space-y-0.5 text-xs text-accent">
            {pick.reasons.map((r) => (
              <li key={r}>• {r}</li>
            ))}
          </ul>
        ) : null}
        {pick.where?.length ? (
          <p className="mt-1.5 text-xs text-ok">
            Смотреть: {pick.where.join(", ")}
          </p>
        ) : null}
        {pick.item.overview ? (
          <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-mute">
            {pick.item.overview}
          </p>
        ) : null}
        <button
          type="button"
          disabled={saved}
          onClick={onSave}
          className="mt-2 rounded-full border border-hairline px-3 py-1 text-xs disabled:text-dim"
        >
          {saved ? "В «Хочу посмотреть»" : "+ Хочу посмотреть"}
        </button>
      </div>
    </article>
  );
}

function ContinueCard({ item }: { item: LibraryItem }) {
  return (
    <Link
      to={`/title/tv/${item.id}`}
      className="flex items-center gap-3 rounded-2xl border border-accent/40 bg-accent/5 p-3"
    >
      {item.poster ? (
        <img
          src={correctPosterUrl(item.poster)}
          alt=""
          className="h-16 w-11 shrink-0 rounded-lg object-cover"
        />
      ) : null}
      <span className="min-w-0">
        <span className="block font-mono text-[10px] uppercase tracking-[0.14em] text-accent">
          продолжить
        </span>
        <span className="block truncate">{item.title}</span>
        <span className="block text-xs text-mute">
          {item.season
            ? `досмотрено до ${episodeLabel({ season: item.season, episode: item.episode ?? 0 })}`
            : "уже начат"}
        </span>
      </span>
    </Link>
  );
}

export function TonightPage() {
  const { items, settings, get, upsert } = useAppState();
  const { meta } = useLibraryMeta(items);
  const services = PLATFORMS.filter((p) => settings.subscribed.includes(p.id));
  const [step, setStep] = useState<Step | "done">(0);
  const [answers, setAnswers] = useState<Partial<Answers>>(() => {
    try {
      const last = JSON.parse(readStorage(LAST) || "{}") as Partial<Answers>;
      return { mine: last.mine ?? services.length > 0 };
    } catch {
      return { mine: services.length > 0 };
    }
  });
  const [ranked, setRanked] = useState<Pick[] | null>(null);
  const [shown, setShown] = useState<Pick[]>([]);
  const [page, setPage] = useState(0);
  const [cont, setCont] = useState<LibraryItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const seen = useMemo(
    () =>
      new Set(
        items
          .filter((x) => x.status !== "watchlist")
          .map((x) => keyOf(x.type, x.id)),
      ),
    [items],
  );

  function answer<K extends keyof Answers>(
    key: K,
    value: Answers[K],
    next: Step | "done",
  ) {
    setAnswers((a) => ({ ...a, [key]: value }));
    setStep(next);
  }

  const complete =
    step === "done" &&
    answers.mood &&
    answers.format &&
    answers.company &&
    answers.era;
  const key = complete ? JSON.stringify(answers) : "";

  // Collect and rank once the four answers are in.
  useEffect(() => {
    if (!complete) return;
    const a = answers as Answers;
    writeStorage(LAST, JSON.stringify(a));
    let alive = true;
    setBusy(true);
    setError("");
    setRanked(null);
    setShown([]);
    setPage(0);
    (async () => {
      const { candidates, names } = await loadCandidates(
        a,
        items,
        meta,
        settings.region,
        settings.subscribed,
      );
      const list = rankTonight(candidates, a, {
        seen,
        taste: genreTaste(items, meta),
        names,
      });
      if (!alive) return;
      setCont(continueShows(items, meta, a, names));
      const strict = a.mine && services.length > 0;
      const first = await withServices(
        list,
        settings.region,
        services,
        strict,
        strict ? 30 : PAGE,
      );
      if (!alive) return;
      setRanked(strict ? first : list);
      setShown(first.slice(0, PAGE));
    })()
      .catch(
        () =>
          alive &&
          setError(
            "Не удалось подобрать. Проверь интернет и попробуй ещё раз.",
          ),
      )
      .finally(() => alive && setBusy(false));
    return () => {
      alive = false;
    };
  }, [key]);

  async function more() {
    if (!ranked) return;
    const next = page + 1;
    const slice = ranked.slice(next * PAGE, next * PAGE + PAGE);
    if (!slice.length) return;
    setBusy(true);
    const annotated = await withServices(
      slice,
      settings.region,
      services,
      false,
      PAGE,
    );
    setShown((s) => [...s, ...annotated]);
    setPage(next);
    setBusy(false);
  }

  function save(p: Pick) {
    upsert({
      id: p.item.id,
      type: p.type,
      title: titleOf(p.item),
      poster: posterUrl(p.item.poster_path, "w185"),
      year: yearOf(p.item.release_date || p.item.first_air_date),
      status: "watchlist",
      rating: null,
      note: "",
    });
  }

  const restart = () => {
    setStep(0);
    setRanked(null);
    setShown([]);
  };

  return (
    <div className="rise max-w-3xl">
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent">
        подбор
      </p>
      <h1 className="mt-1 text-3xl tracking-tight">Что посмотреть вечером</h1>
      <p className="mt-2 text-sm text-mute">
        Четыре вопроса — и подборка с учётом того, что ты уже смотрел, как
        оценивал и что отложил.
      </p>

      {step === 0 ? (
        <Question step={0} title="Какое настроение?">
          {MOODS.map((m) => (
            <Option
              key={m.id}
              label={m.label}
              hint={m.hint}
              active={answers.mood === m.id}
              onClick={() => answer("mood", m.id, 1)}
            />
          ))}
        </Question>
      ) : step === 1 ? (
        <Question step={1} title="Фильм или сериал?" onBack={() => setStep(0)}>
          {FORMATS.map((f) => (
            <Option
              key={f.id}
              label={f.label}
              hint={f.hint}
              active={answers.format === f.id}
              onClick={() => answer("format", f.id, 2)}
            />
          ))}
        </Question>
      ) : step === 2 ? (
        <Question step={2} title="С кем смотришь?" onBack={() => setStep(1)}>
          {COMPANIES.map((c) => (
            <Option
              key={c.id}
              label={c.label}
              active={answers.company === c.id}
              onClick={() => answer("company", c.id, 3)}
            />
          ))}
        </Question>
      ) : step === 3 ? (
        <Question
          step={3}
          title="Свежее или проверенное?"
          onBack={() => setStep(2)}
        >
          {ERAS.map((e) => (
            <Option
              key={e.id}
              label={e.label}
              active={answers.era === e.id}
              onClick={() => answer("era", e.id, "done")}
            />
          ))}
        </Question>
      ) : (
        <section className="mt-6">
          <div className="flex flex-wrap items-center gap-2">
            {[
              MOODS.find((m) => m.id === answers.mood)?.label,
              FORMATS.find((f) => f.id === answers.format)?.label,
              COMPANIES.find((c) => c.id === answers.company)?.label,
              ERAS.find((e) => e.id === answers.era)?.label,
            ]
              .filter(Boolean)
              .map((label) => (
                <span
                  key={label}
                  className="rounded-full border border-hairline px-3 py-1 text-xs text-mute"
                >
                  {label}
                </span>
              ))}
            <button
              type="button"
              onClick={restart}
              className="text-xs text-accent"
            >
              Изменить ответы
            </button>
          </div>
          {services.length ? (
            <label className="mt-3 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={!!answers.mine}
                onChange={(e) =>
                  setAnswers((a) => ({ ...a, mine: e.target.checked }))
                }
                className="h-4 w-4 accent-[#ff9e64]"
              />
              Только на моих сервисах ({services.map((s) => s.name).join(", ")})
            </label>
          ) : null}

          {cont.length ? (
            <div className="mt-5 space-y-2">
              {cont.slice(0, 2).map((x) => (
                <ContinueCard key={x.id} item={x} />
              ))}
            </div>
          ) : null}

          {error ? (
            <p role="alert" className="mt-5 text-sm text-accent">
              {error}
            </p>
          ) : null}
          {busy && !shown.length ? (
            <p role="status" className="mt-5 text-sm text-mute">
              Подбираю под твоё настроение…
            </p>
          ) : null}
          {!busy && ranked && !shown.length ? (
            <p className="mt-5 text-sm text-mute">
              Ничего не подошло.{" "}
              {answers.mine
                ? "Попробуй без «Только на моих сервисах» или "
                : "Попробуй "}
              другое настроение.
            </p>
          ) : null}
          <div className="mt-5 space-y-3">
            {shown.map((p) => (
              <PickCard
                key={p.key}
                pick={p}
                saved={!!get(p.type, p.item.id)}
                onSave={() => save(p)}
              />
            ))}
          </div>
          {ranked && shown.length && shown.length < ranked.length ? (
            <div className="mt-5 flex justify-center">
              <button
                type="button"
                disabled={busy}
                onClick={() => void more()}
                className="rounded-full border border-hairline px-4 py-2 text-sm disabled:opacity-50"
              >
                {busy ? "Подбираю…" : "Ещё варианты"}
              </button>
            </div>
          ) : null}
        </section>
      )}
    </div>
  );
}
