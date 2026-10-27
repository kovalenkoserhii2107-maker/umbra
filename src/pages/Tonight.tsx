import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AiTonight } from "../components/AiTonight";
import { Option, PickCard, Question } from "../components/TonightCards";
import { apiHealth, apiUrl } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useAppState } from "../state";
import { useLibraryMeta } from "../lib/meta";
import { PLATFORMS } from "../lib/providers";
import { episodeLabel } from "../lib/tracking";
import { readStorage, writeStorage } from "../lib/storage";
import { correctPosterUrl } from "../lib/tmdb";
import { COMPANIES, ERAS, FORMATS, MOODS } from "../lib/tonight";
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

/** The rule-based picker: fixed questions, scored by the library. */
function QuickPicker({ rewatch }: { rewatch: boolean }) {
  const {
    step,
    setStep,
    answers,
    setAnswers,
    answer,
    ranked,
    shown,
    more,
    cont,
    busy,
    error,
    save,
    restart,
    services,
    get,
  } = useQuickTonight(rewatch);

  return (
    <div>
      {step === 0 ? (
        <Question step={0} title="Який настрій?">
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
        <Question step={1} title="Фільм чи серіал?" onBack={() => setStep(0)}>
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
        <Question step={2} title="З ким дивишся?" onBack={() => setStep(1)}>
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
          title="Свіже чи перевірене?"
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
              Змінити відповіді
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
              Тільки на моїх сервісах ({services.map((s) => s.name).join(", ")})
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
              Підбираю під твій настрій…
            </p>
          ) : null}
          {!busy && ranked && !shown.length ? (
            <p className="mt-5 text-sm text-mute">
              Нічого не підійшло.{" "}
              {answers.mine
                ? "Спробуй без «Тільки на моїх сервісах» або "
                : "Спробуй "}
              інший настрій.
            </p>
          ) : null}
          <div className="mt-5 space-y-3">
            {shown.map((p) => (
              <PickCard
                key={p.key}
                pick={p}
                saved={get(p.type, p.item.id)?.status === "watchlist"}
                onSave={() => save(p)}
                mine={get(p.type, p.item.id)}
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
                {busy ? "Підбираю…" : "Ще варіанти"}
              </button>
            </div>
          ) : null}
        </section>
      )}
    </div>
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
  const [mode, setMode] = useState<"ai" | "quick">(() =>
    readStorage(MODE) === "quick" ? "quick" : "ai",
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
          : "Чотири питання — і добірка з урахуванням того, що ти вже дивився, як оцінював і що відклав."}
      </p>
      {ai ? (
        <div
          role="tablist"
          aria-label="Як підбирати"
          className="mt-4 inline-flex rounded-full border border-hairline p-1 text-sm"
        >
          {(
            [
              ["ai", "З Claude"],
              ["quick", "Швидкий"],
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
