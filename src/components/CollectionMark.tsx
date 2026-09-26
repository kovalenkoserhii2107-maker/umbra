import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import type { MediaType } from "../lib/tmdb";
import { useAppState } from "../state";

function StarIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 2.4 14.7 8l6.2.9-4.5 4.4 1.1 6.2L12 16.6 6.5 19.5l1.1-6.2L3.1 8.9 9.3 8 12 2.4Z"
      />
    </svg>
  );
}

function Stars({
  value,
  onPick,
}: {
  value: number;
  onPick?: (value: number) => void;
}) {
  return (
    <div className="flex flex-wrap gap-0.5" role="radiogroup" aria-label="Оценка">
      {Array.from({ length: 10 }, (_, index) => index + 1).map((score) => {
        const on = score <= value;
        const className = `rounded-md p-0.5 ${on ? "text-accent" : "text-dim"}`;
        if (!onPick) {
          return (
            <span key={score} className={className}>
              <StarIcon />
            </span>
          );
        }
        return (
          <button
            key={score}
            type="button"
            role="radio"
            aria-checked={value === score}
            aria-label={`${score} из 10`}
            onClick={() => onPick(score)}
            className={className}
          >
            <StarIcon />
          </button>
        );
      })}
    </div>
  );
}

export function CollectionMark({
  media,
  id,
  title,
  poster,
  year,
}: {
  media: MediaType;
  id: number;
  title: string;
  poster: string;
  year: string;
}) {
  const navigate = useNavigate();
  const { account, status: authStatus } = useAuth();
  const { get, upsert, update, remove } = useAppState();
  const mine = get(media, id);
  const watched = mine?.status === "watched";
  const wanted = mine?.status === "watchlist";
  const [panel, setPanel] = useState(false);
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState("");

  function login() {
    navigate(`/login?next=${encodeURIComponent(`/title/${media}/${id}`)}`);
  }

  function openPanel() {
    if (!account) {
      login();
      return;
    }
    setStars(mine?.rating ?? 0);
    setComment(mine?.note ?? "");
    setPanel(true);
  }

  function confirm() {
    if (!account) {
      login();
      return;
    }
    if (stars < 1) return;
    const note = comment.trim().slice(0, 5000);
    if (mine) {
      update(media, id, { status: "watched", rating: stars, note });
    } else {
      upsert({
        id,
        type: media,
        title,
        poster,
        year,
        status: "watched",
        rating: stars,
        note,
      });
    }
    setPanel(false);
  }

  function want() {
    if (!account) {
      login();
      return;
    }
    setPanel(false);
    if (wanted) return;
    if (mine) {
      update(media, id, { status: "watchlist" });
      return;
    }
    upsert({
      id,
      type: media,
      title,
      poster,
      year,
      status: "watchlist",
      rating: null,
      note: "",
    });
  }

  const idle =
    "rounded-full border border-hairline px-4 py-2 text-sm text-mute";
  const on = "rounded-full border border-ink bg-ink px-4 py-2 text-sm text-canvas";

  return (
    <section className="mt-8 rounded-2xl border border-hairline bg-card p-4">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-dim">
        коллекция
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          disabled={authStatus === "initializing"}
          onClick={openPanel}
          className={watched && !panel ? on : idle}
        >
          В просмотренные
        </button>
        <button
          type="button"
          disabled={authStatus === "initializing"}
          onClick={want}
          className={wanted ? on : idle}
        >
          Хочу посмотреть
        </button>
      </div>

      {panel ? (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-mute">
            Оценка{stars ? ` · ${stars} из 10` : " от 1 до 10"}
          </p>
          <Stars value={stars} onPick={setStars} />
          <label className="block text-sm text-mute">
            Комментарий
            <textarea
              aria-label="Комментарий"
              value={comment}
              maxLength={5000}
              onChange={(event) => setComment(event.target.value)}
              placeholder="Что запомнилось — по желанию"
              className="mt-1 w-full rounded-xl border border-hairline bg-canvas px-3 py-2 text-ink outline-none"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={stars < 1}
              onClick={confirm}
              className="rounded-full bg-accent px-4 py-2 text-sm text-canvas disabled:opacity-40"
            >
              Подтвердить
            </button>
            <button
              type="button"
              onClick={() => setPanel(false)}
              className="rounded-full px-4 py-2 text-sm text-dim"
            >
              Отмена
            </button>
          </div>
        </div>
      ) : null}

      {mine && !panel ? (
        <div className="mt-4 space-y-2">
          {watched && mine.rating ? (
            <>
              <Stars value={mine.rating} />
              <p className="font-mono text-[11px] uppercase tracking-wider text-dim">
                в фильмографии · {mine.rating}/10
              </p>
            </>
          ) : null}
          {watched && !mine.rating ? (
            <p className="text-sm text-mute">
              В фильмографии без оценки. Можно поставить звёзды.
            </p>
          ) : null}
          {wanted ? (
            <p className="text-sm text-mute">
              В списке «Хочу посмотреть». Дату выхода можно будет отслеживать
              отдельно.
            </p>
          ) : null}
          {mine.status !== "watched" && mine.status !== "watchlist" ? (
            <p className="text-sm text-mute">Старая отметка. Можно перенести.</p>
          ) : null}
          {mine.note && watched ? (
            <p className="text-sm text-ink/90">{mine.note}</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {watched ? (
              <button
                type="button"
                onClick={openPanel}
                className="rounded-full border border-hairline px-3 py-1.5 text-sm text-mute"
              >
                Изменить оценку
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => remove(media, id)}
              className="rounded-full px-3 py-1.5 text-sm text-dim"
            >
              Убрать из коллекции
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
