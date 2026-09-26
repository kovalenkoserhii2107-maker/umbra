import { Link, useParams } from "react-router-dom";
import { useMemo, useState } from "react";
import { ErrorBox, useAsync } from "../components";
import { kindOf, posterUrl, tmdb, type CreditWork } from "../lib/tmdb";
import { yearOf } from "../lib/format";

export function PersonPage() {
  const { id = "" } = useParams();
  const query = useAsync(() => tmdb.person(Number(id)), [id]);
  const [tab, setTab] = useState<"all" | "director" | "actor">("all");

  const works = useMemo(() => {
    const person = query.data;
    if (!person?.combined_credits) return [];
    const map = new Map<string, CreditWork>();
    for (const item of person.combined_credits.cast || []) {
      const type = item.media_type === "tv" ? "tv" : "movie";
      if (item.media_type === "person") continue;
      map.set(`${type}-${item.id}`, {
        ...item,
        media_type: type,
        role: item.character || "роль",
        department: "Acting",
      });
    }
    for (const item of person.combined_credits.crew || []) {
      const type = item.media_type === "tv" ? "tv" : "movie";
      const key = `${type}-${item.id}`;
      const prev = map.get(key);
      const isDirector = item.job === "Director";
      if (!prev) {
        map.set(key, {
          ...item,
          media_type: type,
          role: item.job || item.department || "съёмочная группа",
          department: item.department,
          job: item.job,
        });
      } else if (isDirector) {
        map.set(key, {
          ...prev,
          role: "режиссёр",
          job: "Director",
          department: "Directing",
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => {
      const ya = Number(yearOf(a.release_date || a.first_air_date) || 0);
      const yb = Number(yearOf(b.release_date || b.first_air_date) || 0);
      if (yb !== ya) return yb - ya;
      return (a.title || a.name || "").localeCompare(
        b.title || b.name || "",
        "ru",
      );
    });
  }, [query.data]);

  const filtered = works.filter((w) => {
    if (tab === "director")
      return w.job === "Director" || w.department === "Directing";
    if (tab === "actor") return w.department === "Acting";
    return true;
  });

  if (query.error) return <ErrorBox code={query.error} />;
  if (query.loading || !query.data)
    return <p className="text-sm text-mute">Собираю фильмографию…</p>;

  const person = query.data;

  return (
    <div className="rise pb-8">
      <div className="flex gap-4">
        {person.profile_path ? (
          <img
            src={posterUrl(person.profile_path, "w185")}
            alt=""
            className="h-40 w-28 rounded-2xl object-cover"
          />
        ) : (
          <div className="h-40 w-28 rounded-2xl border border-hairline bg-card" />
        )}
        <div className="min-w-0">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent">
            фильмография
          </p>
          <h1 className="mt-1 text-3xl tracking-tight">{person.name}</h1>
          <p className="mt-2 text-sm text-mute">
            {[
              person.known_for_department,
              person.birthday,
              person.place_of_birth,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      </div>
      {person.biography ? (
        <p className="mt-5 max-w-3xl text-sm leading-7 text-mute">
          {person.biography}
        </p>
      ) : null}

      <div className="mt-8 mb-5 flex flex-wrap gap-2">
        {(
          [
            ["all", "Все"],
            ["director", "Режиссёр"],
            ["actor", "Актёр"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`rounded-full border px-3 py-1 font-mono text-[11px] uppercase tracking-[0.12em] ${
              tab === id
                ? "border-ink bg-ink text-canvas"
                : "border-hairline text-mute"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {filtered.map((work) => {
          const year = yearOf(work.release_date || work.first_air_date);
          const type = kindOf(work);
          return (
            <Link
              key={`${type}-${work.id}-${work.role}`}
              to={`/title/${type}/${work.id}`}
              className="flex gap-3 rounded-xl border border-hairline bg-card p-2 hover:border-accent/40"
            >
              {work.poster_path ? (
                <img
                  src={posterUrl(work.poster_path, "w185")}
                  alt=""
                  className="h-20 w-14 rounded-lg object-cover"
                />
              ) : (
                <div className="h-20 w-14 rounded-lg bg-canvas-soft" />
              )}
              <div className="min-w-0 py-1">
                <p className="truncate">{work.title || work.name}</p>
                <p className="font-mono text-[11px] uppercase tracking-wider text-dim">
                  {year || "—"} · {type === "tv" ? "сериал" : "фильм"} ·{" "}
                  {work.role}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
      {!filtered.length ? (
        <p className="mt-8 text-sm text-mute">В этой роли записей нет.</p>
      ) : null}
    </div>
  );
}
