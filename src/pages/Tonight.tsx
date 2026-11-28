import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AiTonight } from "../components/AiTonight";
import { PickCard } from "../components/TonightCards";
import {
  Thinking,
  libraryPosters,
  useLingering,
} from "../components/TonightMotion";
import { apiHealth, apiUrl } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useAppState } from "../state";
import { useLibraryMeta } from "../lib/meta";
import { PLATFORMS } from "../lib/providers";
import { episodeLabel } from "../lib/tracking";
import { readStorage, writeStorage } from "../lib/storage";
import { correctPosterUrl } from "../lib/tmdb";
import { COMPANIES, ERAS, FORMATS, MOODS, type Answers } from "../lib/tonight";
import type { TasteSummary } from "../lib/engine";
import { useQuickTonight } from "../lib/useQuickTonight";
import type { LibraryItem } from "../state";

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
          продовжити
        </span>
        <span className="block truncate">{item.title}</span>
        <span className="block text-xs text-mute">
          {item.season
            ? `доглянуто до ${episodeLabel({ season: item.season, episode: item.episode ?? 0 })}`
            : "уже розпочато"}
        </span>
      </span>
    </Link>
  );
}

function Chips<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ id: T; label: string }>;
  value: T | undefined;
  onChange: (id: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex items-center gap-2">
      <span className="w-20 shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-dim">
        {label}
      </span>
      <div className="row-scroll flex gap-1.5 overflow-x-auto pb-1">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            aria-pressed={value === o.id}
            onClick={() => onChange(o.id)}
            className={`shrink-0 rounded-full border px-3 py-1 text-xs transition ${value === o.id ? "border-accent bg-accent text-black" : "border-hairline text-mute hover:border-accent/50"}`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function TastePanel({ taste }: { taste: TasteSummary }) {
  const rows: Array<[string, string]> = [];
  if (taste.genres.length) rows.push(["любиш", taste.genres.join(", ")]);
  if (taste.directors.length) rows.push(["автори", taste.directors.join(", ")]);
  if (taste.language) rows.push(["а ще", taste.language]);
  if (taste.avoid.length) rows.push(["не твоє", taste.avoid.join(", ")]);
  return (
    <section
      aria-label="Твій смак"
      className="mt-5 rounded-2xl border border-hairline bg-card p-4"
    >
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-accent">
        твій смак · {taste.engaged} переглянутих, {taste.rated} оцінок
      </p>
      <p className="mt-1 text-sm">
        {[taste.critic, taste.format].filter(Boolean).join(" · ")}
      </p>
      {rows.length ? (
        <dl className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
          {rows.map(([k, v]) => (
            <div key={k} className="flex gap-2">
              <dt className="text-dim">{k}</dt>
              <dd className="text-mute">{v}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </section>
  );
}

/** Umbra's own picker: picks by taste at once; answers only refine them. */
function QuickPicker({ rewatch }: { rewatch: boolean }) {
  const {
    answers,
    setAnswers,
    ranked,
    shown,
    more,
    cont,
    taste,
    busy,
    error,
    save,
    shuffle,
    services,
    get,
  } = useQuickTonight(rewatch, { instant: true });
  const { items } = useAppState();
  const posters = useMemo(() => libraryPosters(items), [items]);
  // The show plays for a couple of seconds before the picks are dealt.
  const showing = useLingering((busy && !shown.length) || !ranked, 2000);
  const set = <K extends keyof Answers>(key: K, value: Answers[K]) =>
    setAnswers((a) => ({ ...a, [key]: value }));

  return (
    <section className="mt-6">
      <div className="space-y-2">
        <Chips
          label="Настрій"
          options={MOODS}
          value={answers.mood}
          onChange={(v) => set("mood", v)}
        />
        <Chips
          label="Формат"
          options={FORMATS}
          value={answers.format}
          onChange={(v) => set("format", v)}
        />
        <Chips
          label="Компанія"
          options={COMPANIES}
          value={answers.company}
          onChange={(v) => set("company", v)}
        />
        <Chips
          label="Епоха"
          options={ERAS}
          value={answers.era}
          onChange={(v) => set("era", v)}
        />
      </div>
      {services.length ? (
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={!!answers.mine}
            onChange={(e) => set("mine", e.target.checked)}
            className="h-4 w-4 accent-[#ff9e64]"
          />
          Тільки на моїх сервісах ({services.map((s) => s.name).join(", ")})
        </label>
      ) : null}

      {taste ? <TastePanel taste={taste} /> : null}

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
      {showing && !error ? <Thinking kind="pick" posters={posters} /> : null}
      {!showing && ranked && !shown.length ? (
        <p className="mt-5 text-sm text-mute">
          Нічого не підійшло.{" "}
          {answers.mine
            ? "Спробуй без «Тільки на моїх сервісах» або "
            : "Спробуй "}
          інший настрій.
        </p>
      ) : null}
      <div className="mt-5 space-y-3">
        {showing
          ? null
          : shown.map((p, i) => (
              <div
                key={p.key}
                className="pk-deal"
                // Each page is dealt in from the top, card by card.
                style={{ animationDelay: `${(i % 6) * 90}ms` }}
              >
                <PickCard
                  pick={p}
                  saved={get(p.type, p.item.id)?.status === "watchlist"}
                  onSave={() => save(p)}
                  mine={get(p.type, p.item.id)}
                />
              </div>
            ))}
      </div>
      {!showing && ranked && shown.length ? (
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {shown.length < ranked.length ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void more()}
              className="rounded-full border border-hairline px-4 py-2 text-sm disabled:opacity-50"
            >
              {busy ? "Підбираю…" : "Ще варіанти"}
            </button>
          ) : null}
          <button
            type="button"
            disabled={busy}
            onClick={shuffle}
            className="rounded-full border border-hairline px-4 py-2 text-sm disabled:opacity-50"
          >
            ↻ Перемішати
          </button>
        </div>
      ) : null}
    </section>
  );
}

const MODE = "umbra.tonightMode";
const REWATCH = "umbra.tonightRewatch";

export function TonightPage() {
  const { items, settings, get, upsert, update, remove } = useAppState();
  const { meta } = useLibraryMeta(items);
  const auth = useAuth();
  const services = PLATFORMS.filter((p) => settings.subscribed.includes(p.id));
  // Claude is there when the worker has its key; known after one quick check.
  const [ai, setAi] = useState<boolean | null>(apiUrl() ? null : false);
  // Umbra's own picker by default; Claude when chosen.
  const [mode, setMode] = useState<"ai" | "quick">(() =>
    readStorage(MODE) === "ai" ? "ai" : "quick",
  );
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
  const toggleRewatch = (on: boolean) => {
    setRewatch(on);
    writeStorage(REWATCH, on ? "1" : "0");
  };
  const choose = (m: "ai" | "quick") => {
    setMode(m);
    writeStorage(MODE, m);
  };
  const signedIn = Boolean(auth.account);
  const useAi = ai === true && signedIn && mode === "ai";

  return (
    <div className="rise max-w-3xl">
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent">
        підбір
      </p>
      <h1 className="mt-1 text-3xl tracking-tight">Що подивитися ввечері</h1>
      <p className="mt-2 text-sm text-mute">
        {useAi
          ? "Питання ставить Claude — під тебе та твою бібліотеку."
          : "Авторський алгоритм Umbra: вчиться на всьому, що ти дивився, оцінював і відклав, і одразу підбирає — найкраще згори. Уточни настрій чи формат, якщо хочеш."}
      </p>
      {ai ? (
        <div
          role="tablist"
          aria-label="Як підбирати"
          className="mt-4 inline-flex rounded-full border border-hairline p-1 text-sm"
        >
          {(
            [
              ["quick", "За смаком"],
              ["ai", "З Claude"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={(id === "ai") === useAi}
              onClick={() => choose(id)}
              className={`rounded-full px-4 py-1.5 ${(id === "ai") === useAi ? "bg-accent text-black" : "text-mute"}`}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}
      <label className="mt-4 flex w-fit cursor-pointer items-center gap-3 text-sm">
        <span className="relative inline-flex">
          <input
            type="checkbox"
            role="switch"
            checked={rewatch}
            onChange={(e) => toggleRewatch(e.target.checked)}
            className="peer sr-only"
          />
          <span className="h-6 w-10 rounded-full bg-hairline transition peer-checked:bg-accent" />
          <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-ink transition peer-checked:translate-x-4" />
        </span>
        <span>
          Включати переглянуте
          <span className="block text-xs text-mute">
            {rewatch
              ? "Вже переглянуті фільми теж потраплять у добірку"
              : "У добірці тільки те, що ти ще не бачив"}
          </span>
        </span>
      </label>
      {ai && mode === "ai" && !signedIn ? (
        <p className="mt-3 text-sm text-mute">
          <Link to="/login?next=%2Ftonight" className="text-accent">
            Увійди
          </Link>
          , щоб підбирав Claude: він дивиться на твою бібліотеку.
        </p>
      ) : null}
      {useAi ? (
        <AiTonight
          items={items}
          meta={meta}
          region={settings.region}
          services={services}
          library={{ get, upsert, update, remove }}
          rewatch={rewatch}
        />
      ) : ai === null && mode === "ai" && signedIn ? (
        <p role="status" className="mt-6 text-sm text-mute">
          Завантаження…
        </p>
      ) : (
        <QuickPicker rewatch={rewatch} />
      )}
    </div>
  );
}
