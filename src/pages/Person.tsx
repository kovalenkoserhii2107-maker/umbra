import { Link, useParams } from "react-router-dom";
import { useMemo, useState, type ReactNode } from "react";
import { ErrorBox, PosterCard, useAsync } from "../components";
import { Aside, CARD, Section } from "../components/TitleDetails";
import { dateLabel, plural, yearOf } from "../lib/format";
import {
  ageAt,
  buildFilmography,
  departmentLabel,
  departmentTabs,
  knownFor,
  type Work,
} from "../lib/filmography";
import { posterUrl, tmdb, type PersonDetails } from "../lib/tmdb";
import { localIso } from "../lib/releases";
import { useAppState } from "../state";

function years(n: number) {
  return `${n} ${plural(n, "год", "года", "лет")}`;
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-2 text-sm">
      <span className="w-32 shrink-0 font-mono text-[10px] uppercase leading-5 tracking-[0.14em] text-dim">
        {label}
      </span>
      <span className="min-w-0">{children}</span>
    </div>
  );
}

function personLinks(person: PersonDetails) {
  const ids = person.external_ids || {};
  const links: Array<{ label: string; href: string }> = [];
  if (person.homepage && /^https?:\/\//.test(person.homepage))
    links.push({ label: "Сайт", href: person.homepage });
  if (ids.imdb_id)
    links.push({
      label: "IMDb",
      href: `https://www.imdb.com/name/${ids.imdb_id}/`,
    });
  links.push({
    label: "TMDB",
    href: `https://www.themoviedb.org/person/${person.id}`,
  });
  if (ids.instagram_id)
    links.push({
      label: "Instagram",
      href: `https://www.instagram.com/${ids.instagram_id}/`,
    });
  if (ids.twitter_id)
    links.push({ label: "X", href: `https://x.com/${ids.twitter_id}` });
  return links;
}

function Biography({ person }: { person: PersonDetails }) {
  const [open, setOpen] = useState(false);
  const english = useAsync(
    () =>
      person.biography
        ? Promise.resolve(null)
        : tmdb.personBiography(person.id).then((r) => r.biography || null),
    [person.id, person.biography],
  );
  const text = person.biography || english.data;
  if (!text) return null;
  const long = text.length > 420;
  return (
    <Section
      title="Биография"
      aside={person.biography ? null : <Aside>на английском</Aside>}
    >
      <p
        lang={person.biography ? undefined : "en"}
        className={`max-w-3xl whitespace-pre-line text-[15px] leading-7 text-ink/90 ${long && !open ? "line-clamp-6" : ""}`}
      >
        {text}
      </p>
      {long ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mt-1 text-sm text-accent"
        >
          {open ? "Свернуть" : "Читать полностью"}
        </button>
      ) : null}
    </Section>
  );
}

function WorkRow({ work, tab }: { work: Work; tab: string }) {
  const { get } = useAppState();
  const mine = get(work.type, work.id);
  const year = yearOf(work.date);
  const upcoming = !work.date || work.date > localIso(new Date());
  const role =
    tab === "Acting" || (tab === "all" && work.departments[0] === "Acting")
      ? work.character || "роль"
      : work.roles.join(", ") || work.character || "";
  return (
    <Link
      to={`/title/${work.type}/${work.id}`}
      className={`${CARD} flex gap-3 p-2 hover:border-accent/40`}
    >
      {work.posterPath ? (
        <img
          src={posterUrl(work.posterPath, "w185")}
          alt=""
          loading="lazy"
          className="h-20 w-14 shrink-0 rounded-lg object-cover"
        />
      ) : (
        <div className="h-20 w-14 shrink-0 rounded-lg bg-canvas-soft" />
      )}
      <div className="min-w-0 flex-1 py-1">
        <p className="truncate">{work.title}</p>
        <p className="font-mono text-[11px] uppercase tracking-wider text-dim">
          {year || "в работе"} · {work.type === "tv" ? "сериал" : "фильм"}
          {upcoming && year ? " · скоро" : ""}
        </p>
        {role ? (
          <p className="mt-0.5 truncate text-sm text-mute">{role}</p>
        ) : null}
      </div>
      {mine ? (
        <span className="self-center pr-1 font-mono text-[11px] text-accent">
          {mine.rating
            ? `★ ${mine.rating}`
            : mine.status === "watchlist"
              ? "в списке"
              : "✓"}
        </span>
      ) : null}
    </Link>
  );
}

export function PersonPage() {
  const { id = "" } = useParams();
  const query = useAsync(() => tmdb.person(Number(id)), [id]);
  const [tab, setTab] = useState<string | null>(null);

  const works = useMemo(
    () => (query.data ? buildFilmography(query.data) : []),
    [query.data],
  );

  if (query.error) return <ErrorBox code={query.error} />;
  if (query.loading || !query.data)
    return <p className="text-sm text-mute">Собираю фильмографию…</p>;

  const person = query.data;
  const tabs = departmentTabs(works, person.gender);
  // Open on the person's main profession, e.g. directing for a director.
  const main =
    tabs.find((t) => t.id === person.known_for_department)?.id ?? "all";
  const current = tab ?? main;
  const list =
    current === "all"
      ? works
      : works.filter((w) => w.departments.includes(current));
  const famous = knownFor(works, person.known_for_department);
  const age = ageAt(person.birthday, person.deathday);
  const occupation = departmentLabel(
    person.known_for_department,
    person.gender,
  );
  const links = personLinks(person);

  const chip = (active: boolean) =>
    `shrink-0 rounded-full border px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.1em] ${active ? "border-ink bg-ink text-canvas" : "border-hairline text-mute"}`;

  return (
    <div className="rise pb-8">
      <header className={`${CARD} rounded-3xl p-4 sm:p-6`}>
        <div className="flex items-end gap-4 sm:gap-6">
          {person.profile_path ? (
            <img
              src={posterUrl(person.profile_path, "w342")}
              alt=""
              className="w-24 shrink-0 rounded-2xl border border-hairline object-cover sm:w-36"
            />
          ) : (
            <div className="flex aspect-[2/3] w-24 shrink-0 items-center justify-center rounded-2xl border border-hairline bg-canvas-soft text-4xl text-dim sm:w-36">
              {person.name.slice(0, 1)}
            </div>
          )}
          <div className="min-w-0 flex-1 pb-1">
            {occupation ? (
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent">
                {occupation}
              </p>
            ) : null}
            <h1 className="mt-1 text-2xl leading-tight tracking-tight sm:text-4xl">
              {person.name}
            </h1>
            <p className="mt-1 text-sm text-mute">
              {works.length} {plural(works.length, "работа", "работы", "работ")}
            </p>
          </div>
        </div>
        {person.birthday || person.place_of_birth || person.deathday ? (
          <div className="mt-4 space-y-2 border-t border-hairline pt-4">
            {person.birthday ? (
              <Fact label={person.gender === 1 ? "Родилась" : "Родился"}>
                {dateLabel(person.birthday)}
                {age !== null && !person.deathday ? ` · ${years(age)}` : ""}
              </Fact>
            ) : null}
            {person.place_of_birth ? (
              <Fact label="Место рождения">{person.place_of_birth}</Fact>
            ) : null}
            {person.deathday ? (
              <Fact label={person.gender === 1 ? "Умерла" : "Умер"}>
                {dateLabel(person.deathday)}
                {age !== null ? ` · в ${years(age)}` : ""}
              </Fact>
            ) : null}
          </div>
        ) : null}
        {links.length ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {links.map((l) => (
              <a
                key={l.label}
                href={l.href}
                target="_blank"
                rel="noreferrer"
                className="rounded-full border border-hairline px-3 py-1 text-xs text-mute hover:border-accent hover:text-ink"
              >
                {l.label} ↗
              </a>
            ))}
          </div>
        ) : null}
      </header>

      <Biography person={person} />

      {famous.length >= 3 ? (
        <Section title="Известные работы">
          <div className="row-scroll flex gap-3 overflow-x-auto pb-2">
            {famous.map((w) => (
              <PosterCard
                key={`${w.type}-${w.id}`}
                item={{
                  id: w.id,
                  title: w.type === "movie" ? w.title : undefined,
                  name: w.type === "tv" ? w.title : undefined,
                  poster_path: w.posterPath,
                  release_date: w.type === "movie" ? w.date : undefined,
                  first_air_date: w.type === "tv" ? w.date : undefined,
                  media_type: w.type,
                }}
                type={w.type}
              />
            ))}
          </div>
        </Section>
      ) : null}

      <Section title="Фильмография" aside={<Aside>{list.length}</Aside>}>
        <div className="row-scroll mb-4 flex gap-2 overflow-x-auto pb-1">
          <button
            className={chip(current === "all")}
            onClick={() => setTab("all")}
          >
            Все · {works.length}
          </button>
          {tabs.map((t) => (
            <button
              key={t.id}
              className={chip(current === t.id)}
              onClick={() => setTab(t.id)}
            >
              {t.label} · {t.count}
            </button>
          ))}
        </div>
        {list.length ? (
          <div className="space-y-2">
            {list.map((work) => (
              <WorkRow
                key={`${work.type}-${work.id}`}
                work={work}
                tab={current}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-mute">В этой роли записей нет.</p>
        )}
      </Section>
    </div>
  );
}
