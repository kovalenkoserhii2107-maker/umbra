import { describe, expect, it } from "vitest";
import {
  ageAt,
  buildFilmography,
  departmentLabel,
  departmentTabs,
  knownFor,
} from "../../src/lib/filmography";
import { crewCards } from "../../src/lib/titleFacts";

const person = {
  id: 1,
  name: "James Gunn",
  gender: 2,
  known_for_department: "Directing",
  combined_credits: {
    cast: [
      {
        id: 10,
        title: "Cameo Film",
        media_type: "movie" as const,
        release_date: "2010-01-01",
        character: "Guy",
        order: 30,
        vote_count: 900,
      },
      {
        id: 20,
        name: "Late Show",
        media_type: "tv" as const,
        first_air_date: "2015-09-08",
        character: "Self",
        vote_count: 500,
      },
    ],
    crew: [
      {
        id: 30,
        title: "Guardians",
        media_type: "movie" as const,
        release_date: "2014-07-30",
        job: "Director",
        department: "Directing",
        vote_count: 27000,
      },
      {
        id: 30,
        title: "Guardians",
        media_type: "movie" as const,
        release_date: "2014-07-30",
        job: "Screenplay",
        department: "Writing",
        vote_count: 27000,
      },
      {
        id: 40,
        title: "Next Film",
        media_type: "movie" as const,
        release_date: "",
        job: "Director",
        department: "Directing",
        vote_count: 0,
      },
    ],
  },
};

describe("filmography", () => {
  it("merges roles per title, skips talk-show appearances, puts undated work first", () => {
    const works = buildFilmography(person);
    expect(works.map((w) => w.id)).toEqual([40, 30, 10]);
    expect(works[1].roles).toEqual(["режиссёр", "сценарий"]);
    expect(works[1].departments).toEqual(["Directing", "Writing"]);
    expect(works[2].character).toBe("Guy");
  });

  it("builds tabs, best-known titles and labels", () => {
    const works = buildFilmography(person);
    expect(departmentTabs(works, 2).map((t) => [t.label, t.count])).toEqual([
      ["Режиссёр", 2],
      ["Сценарист", 1],
      ["Актёр", 1],
    ]);
    expect(knownFor(works, "Directing").map((w) => w.id)).toEqual([30]);
    // A small part in a popular film is not what an actor is known for.
    expect(knownFor(works, "Acting")).toEqual([]);
    expect(departmentLabel("Acting", 1)).toBe("Актриса");
    expect(ageAt("1970-08-05", "2026-08-04")).toBe(55);
    expect(ageAt("1970-08-05", "2026-08-05")).toBe(56);
    expect(ageAt(null)).toBeNull();
  });

  it("shows each crew member once with all their roles", () => {
    const p = (id: number, name: string) => ({ id, name, profile_path: null });
    const cards = crewCards({
      id: 1,
      credits: {
        cast: [],
        crew: [
          { ...p(1, "James Gunn"), job: "Director" },
          { ...p(1, "James Gunn"), job: "Screenplay" },
          { ...p(2, "Kevin Feige"), job: "Producer" },
          { ...p(3, "Tyler Bates"), job: "Original Music Composer" },
        ],
      },
    });
    expect(cards.map((c) => [c.person.name, c.roles.join(", ")])).toEqual([
      ["James Gunn", "режиссёр, сценарий"],
      ["Kevin Feige", "продюсер"],
      ["Tyler Bates", "композитор"],
    ]);
  });
});
