import type { CreditWork, MediaType, PersonDetails } from "./tmdb";

const JOBS: Record<string, string> = {
  Director: "режиссёр",
  "Co-Director": "сорежиссёр",
  Screenplay: "сценарий",
  Writer: "сценарий",
  Teleplay: "сценарий",
  Story: "сюжет",
  Novel: "автор романа",
  Characters: "автор персонажей",
  Creator: "создатель",
  Producer: "продюсер",
  "Executive Producer": "исполнительный продюсер",
  "Co-Producer": "сопродюсер",
  "Original Music Composer": "композитор",
  Music: "композитор",
  Composer: "композитор",
  "Director of Photography": "оператор",
  Editor: "монтаж",
  "Production Design": "художник-постановщик",
  Casting: "кастинг",
};

export const jobLabel = (job?: string) =>
  (job && JOBS[job]) || job?.toLowerCase() || "съёмочная группа";

const DEPARTMENTS: Record<string, [string, string]> = {
  // [label for a man or anyone, label for a woman]
  Acting: ["Актёр", "Актриса"],
  Directing: ["Режиссёр", "Режиссёр"],
  Writing: ["Сценарист", "Сценаристка"],
  Production: ["Продюсер", "Продюсер"],
  Sound: ["Композитор", "Композитор"],
  Camera: ["Оператор", "Оператор"],
  Editing: ["Монтажёр", "Монтажёр"],
  Art: ["Художник", "Художница"],
  Creator: ["Создатель", "Создательница"],
};

export function departmentLabel(department?: string, gender?: number) {
  const pair = department ? DEPARTMENTS[department] : undefined;
  if (!pair) return department || "";
  return gender === 1 ? pair[1] : pair[0];
}

// Talk shows and award ceremonies would bury an actor's real roles.
const SELF = /^(self|himself|herself|themselves|narrator \(voice\)?)\b/i;

export type Work = {
  id: number;
  type: MediaType;
  title: string;
  posterPath: string | null;
  /** YYYY-MM-DD or "" for undated (usually announced) work. */
  date: string;
  departments: string[];
  roles: string[];
  character?: string;
  votes: number;
  popularity: number;
  /** Billing position for cast; lower is a bigger part. */
  order?: number;
};

/** Cast and crew credits merged per title, newest first, undated on top. */
export function buildFilmography(person: PersonDetails): Work[] {
  const works = new Map<string, Work>();
  const add = (credit: CreditWork, department: string, role: string) => {
    if (credit.media_type === "person") return;
    const type: MediaType = credit.media_type === "tv" ? "tv" : "movie";
    const key = `${type}-${credit.id}`;
    const work =
      works.get(key) ??
      ({
        id: credit.id,
        type,
        title: credit.title || credit.name || "Без названия",
        posterPath: credit.poster_path ?? null,
        date: (credit.release_date || credit.first_air_date || "").slice(0, 10),
        departments: [],
        roles: [],
        votes: credit.vote_count || 0,
        popularity: credit.popularity || 0,
      } satisfies Work);
    if (!work.departments.includes(department))
      work.departments.push(department);
    if (role && !work.roles.includes(role)) work.roles.push(role);
    works.set(key, work);
    return work;
  };
  for (const credit of person.combined_credits?.cast ?? []) {
    if (credit.media_type === "tv" && SELF.test(credit.character || ""))
      continue;
    const work = add(credit, "Acting", "");
    if (work && credit.character && !work.character)
      work.character = credit.character;
    if (work && credit.order !== undefined)
      work.order = Math.min(work.order ?? credit.order, credit.order);
  }
  for (const credit of person.combined_credits?.crew ?? [])
    add(
      credit,
      credit.job === "Creator" ? "Creator" : credit.department || "Crew",
      jobLabel(credit.job),
    );
  return [...works.values()].sort(
    (a, b) =>
      (b.date || "9999").localeCompare(a.date || "9999") ||
      a.title.localeCompare(b.title, "ru"),
  );
}

/** Tabs for the departments present, most credits first. */
export function departmentTabs(works: Work[], gender?: number) {
  const counts = new Map<string, number>();
  for (const w of works)
    for (const d of w.departments) counts.set(d, (counts.get(d) || 0) + 1);
  return [...counts.entries()]
    .filter(([d]) => DEPARTMENTS[d])
    .sort((a, b) => b[1] - a[1])
    .map(([id, count]) => ({ id, label: departmentLabel(id, gender), count }));
}

/** The person's best-known titles: widely voted, in a real part or behind the camera. */
export function knownFor(works: Work[], department?: string) {
  return works
    .filter(
      (w) =>
        w.votes > 50 &&
        (department === "Acting"
          ? w.departments.includes("Acting") && (w.order ?? 99) < 10
          : !department || w.departments.includes(department)),
    )
    .sort((a, b) => b.votes - a.votes)
    .slice(0, 12);
}

/** Full years between two dates (YYYY-MM-DD); null if the start is unknown. */
export function ageAt(birthday?: string | null, until?: string | null) {
  if (!birthday) return null;
  const [y, m, d] = birthday.split("-").map(Number);
  const end = until ? new Date(`${until}T00:00:00`) : new Date();
  let age = end.getFullYear() - y;
  if (end.getMonth() + 1 < m || (end.getMonth() + 1 === m && end.getDate() < d))
    age--;
  return Number.isFinite(age) ? age : null;
}
