import Anthropic from "@anthropic-ai/sdk";
import type { Deps } from "./env";
import { ApiError, cacheKey } from "./http";

/**
 * "What to watch tonight" with Claude: it asks four questions of its own
 * choosing, one at a time, and then picks films and series from what it has
 * learned and from the player's library. More rounds of questions can follow
 * the picks. The key stays here; the app only sends its sign-in token.
 */
export const AI_MODEL = "claude-opus-5-5";
export const QUESTIONS_PER_ROUND = 4;

export type AiAnswer = { question: string; answer: string };
export type AiShown = {
  title: string;
  year: number | null;
  type: "movie" | "tv";
  verdict: "seen" | "liked" | "disliked" | null;
  /** The user's score out of 10 when they marked it seen and rated it. */
  rating: number | null;
};
export type AiStep = AiAnswer | { shown: AiShown[] };

export type AiRequest = {
  stage: "ask" | "pick";
  profile: string;
  steps: AiStep[];
  /** The user also wants titles they have already watched. */
  rewatch: boolean;
};

export type AiQuestion = {
  question: string;
  options: Array<{ label: string; hint: string }>;
  allow_custom: boolean;
};

export type AiPicks = {
  taste: string;
  intro: string;
  picks: Array<{
    title: string;
    original_title: string;
    year: number;
    type: "movie" | "tv";
    reason: string;
  }>;
};

const SYSTEM = `You are the film and series concierge inside Umbra, a personal app where the user tracks films and TV series. Your job: find what this person will genuinely enjoy watching tonight.

How a session works:
- You ask exactly ${QUESTIONS_PER_ROUND} questions per round, one per request, then recommend. After recommendations the user may start another round of ${QUESTIONS_PER_ROUND} questions to refine; use their reactions to the earlier picks.
- You choose every question and its answer options yourself. Each question must be the single most informative one given everything known so far: the library below, earlier answers, earlier picks and reactions. Never ask what the library or earlier answers already tell you. Do not follow a fixed script (mood, then format, then company...) unless that truly is the most useful path for this person.
- Good questions cover things like the evening's energy, how much attention they have, film or series and how long, who they watch with, tone (dark, light, bittersweet), pace, setting, era, language, what they are tired of, a recent favourite to match, how familiar or surprising it should be. Concrete beats abstract: options can name example titles from their own library ("Ближе к «Достать ножи» или к «Зодиаку»?").
- Give 3 to 6 short, clearly distinct options that cover the realistic range; a short hint under an option when it helps. Set allow_custom to true when a free-text answer could add something the options miss.
- Answers may be free text, may contradict earlier ones (the latest wins) or say "неважно".

Recommending:
- Use the whole library, every title and every rating in it: high ratings show taste, low ratings and dropped titles show what to avoid, the watchlist shows intentions (a watchlist title that fits is a strong pick; say so in the reason).
- Each request says whether rewatches are welcome. When they are not, never recommend anything the user has already watched, rated or dropped. When they are, titles they watched and rated highly may be among the picks next to new ones; never offer a title they rated low or dropped. Never repeat a title shown earlier in the session; titles marked "watching" only when continuing them clearly fits.
- Recommend real, released titles that can be identified unambiguously: give the exact original title, the year of release (first air year for a series) and whether it is a film or a series.
- Mix well-known and lesser-known titles when that fits the person. Respect hard constraints from the answers (length, company, language, things to avoid) strictly.
- Each reason is one or two sentences in Russian, speaking to the user as "ты", saying why this fits them tonight, ideally tied to their answers and to titles they rated.

Taste: with the recommendations, sum up in "taste" what you understood about this person's taste from their ratings and answers: two or three sentences in Russian, concrete (name genres, moods, directors or titles from their library), so they see you studied it. When their library is nearly empty, say what you went by instead.

Language: everything the user reads (questions, options, hints, taste, intro, reasons, the "title" field) is in Russian; use the usual Russian release title when one exists.`;

const QUESTION_SCHEMA = {
  type: "object",
  properties: {
    question: { type: "string" },
    options: {
      type: "array",
      items: {
        type: "object",
        properties: {
          label: { type: "string" },
          hint: { type: "string" },
        },
        required: ["label", "hint"],
        additionalProperties: false,
      },
    },
    allow_custom: { type: "boolean" },
  },
  required: ["question", "options", "allow_custom"],
  additionalProperties: false,
};

const PICKS_SCHEMA = {
  type: "object",
  properties: {
    taste: { type: "string" },
    intro: { type: "string" },
    picks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          original_title: { type: "string" },
          year: { type: "integer" },
          type: { type: "string", enum: ["movie", "tv"] },
          reason: { type: "string" },
        },
        required: ["title", "original_title", "year", "type", "reason"],
        additionalProperties: false,
      },
    },
  },
  required: ["taste", "intro", "picks"],
  additionalProperties: false,
};

const text = (v: unknown, max: number) =>
  typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";

/** Validates the app's request; anything odd is dropped rather than trusted. */
export function parseAiRequest(raw: unknown): AiRequest {
  const body = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;
  const stage = body.stage === "pick" ? "pick" : "ask";
  const profile =
    typeof body.profile === "string" ? body.profile.slice(0, 300_000) : "";
  const steps: AiStep[] = [];
  for (const s of Array.isArray(body.steps) ? body.steps.slice(0, 60) : []) {
    if (!s || typeof s !== "object") continue;
    const step = s as Record<string, unknown>;
    if (Array.isArray(step.shown)) {
      steps.push({
        shown: step.shown.slice(0, 40).flatMap((x): AiShown[] => {
          const p = (x && typeof x === "object" ? x : {}) as Record<
            string,
            unknown
          >;
          const title = text(p.title, 200);
          if (!title) return [];
          return [
            {
              title,
              year: Number.isInteger(p.year) ? (p.year as number) : null,
              type: p.type === "tv" ? "tv" : "movie",
              verdict: ["seen", "liked", "disliked"].includes(
                p.verdict as string,
              )
                ? (p.verdict as AiShown["verdict"])
                : null,
              rating:
                Number.isInteger(p.rating) &&
                (p.rating as number) >= 1 &&
                (p.rating as number) <= 10
                  ? (p.rating as number)
                  : null,
            },
          ];
        }),
      });
    } else {
      const question = text(step.question, 400);
      const answer = text(step.answer, 400);
      if (question && answer) steps.push({ question, answer });
    }
  }
  if (!profile.trim())
    throw new ApiError(400, "bad_profile", "The library summary is missing");
  return { stage, profile, steps, rewatch: body.rewatch === true };
}

/** Questions answered since the last picks. */
export function roundAnswers(steps: AiStep[]) {
  let n = 0;
  for (const s of steps) n = "shown" in s ? 0 : n + 1;
  return n;
}

const VERDICT: Record<NonNullable<AiShown["verdict"]>, string> = {
  seen: "already seen it",
  liked: "likes this suggestion",
  disliked: "not interested",
};

/** The session so far as plain text, plus what to do now. */
export function sessionPrompt(req: AiRequest, today: string) {
  const lines: string[] = [];
  let round = 1;
  let q = 0;
  for (const s of req.steps) {
    if ("shown" in s) {
      lines.push(
        `Recommendations shown after round ${round}:`,
        ...s.shown.map(
          (p) =>
            `- ${p.title}${p.year ? ` (${p.year})` : ""}, ${p.type === "tv" ? "series" : "film"}${p.verdict ? ` — user: ${VERDICT[p.verdict]}${p.rating ? `, rated ${p.rating}/10` : ""}` : ""}`,
        ),
      );
      round++;
      q = 0;
    } else {
      q++;
      lines.push(`Round ${round}, Q${q}: ${s.question}`, `A: ${s.answer}`);
    }
  }
  const asked = roundAnswers(req.steps);
  const task =
    req.stage === "pick"
      ? `Now recommend 12 titles for tonight, best fit first, none of them shown before. ${
          req.rewatch
            ? "Rewatches are welcome: up to a third of the picks may be titles the user watched and rated 8/10 or higher; for those, say in the reason that it is a rewatch and what they rated it."
            : "Rewatches are not wanted: only titles the user has not watched, so check every pick against the whole library."
        } The intro is one short sentence in Russian on what you looked for.`
      : `Ask question ${asked + 1} of ${QUESTIONS_PER_ROUND} in round ${round}.${round > 1 ? " Use the reactions to the earlier recommendations: find out what was off." : ""}`;
  return `${lines.length ? `Session so far:\n${lines.join("\n")}` : "The session has just started; no questions asked yet."}\n\nToday is ${today}.\n\n${task}`;
}

function clean<T>(stage: AiRequest["stage"], data: unknown): T {
  if (stage === "ask") {
    const q = data as AiQuestion;
    const options = (q.options ?? [])
      .map((o) => ({ label: text(o.label, 120), hint: text(o.hint, 160) }))
      .filter((o) => o.label)
      .slice(0, 8);
    if (!text(q.question, 300) || options.length < 2)
      throw new ApiError(502, "ai_bad_answer", "Unexpected answer from AI");
    return {
      question: text(q.question, 300),
      options,
      allow_custom: q.allow_custom !== false,
    } as T;
  }
  const p = data as AiPicks;
  return {
    taste: text(p.taste, 700),
    intro: text(p.intro, 400),
    picks: (p.picks ?? [])
      .filter((x) => text(x.title, 200) || text(x.original_title, 200))
      .slice(0, 12)
      .map((x) => ({
        title: text(x.title, 200) || text(x.original_title, 200),
        original_title: text(x.original_title, 200),
        year: Number.isInteger(x.year) ? x.year : 0,
        type: x.type === "tv" ? "tv" : "movie",
        reason: text(x.reason, 600),
      })),
  } as T;
}

/** One step of the session: the next question or the picks. */
export async function aiTonight(
  deps: Deps,
  req: AiRequest,
): Promise<AiQuestion | AiPicks> {
  const apiKey = deps.env.ANTHROPIC_API_KEY;
  if (!apiKey)
    throw new ApiError(503, "ai_not_configured", "No ANTHROPIC_API_KEY");
  const client = new Anthropic({
    apiKey,
    fetch: deps.fetch,
    maxRetries: 1,
    timeout: 120_000,
  });
  const stage = req.stage;
  let message: Anthropic.Beta.Messages.BetaMessage;
  try {
    message = await client.beta.messages.create({
      model: AI_MODEL,
      max_tokens: stage === "pick" ? 16_000 : 8_000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      thinking: { type: "adaptive", display: "omitted" },
      output_config: {
        effort: stage === "pick" ? "high" : "medium",
        format: {
          type: "json_schema",
          schema: stage === "pick" ? PICKS_SCHEMA : QUESTION_SCHEMA,
        },
      },
      system: [
        { type: "text", text: SYSTEM },
        // The library summary is the same for every step of a session.
        {
          type: "text",
          text: `The user's library:\n${req.profile}`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: sessionPrompt(
            req,
            new Date(deps.now()).toISOString().slice(0, 10),
          ),
        },
      ],
    });
  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      const status = error.status ?? 0;
      if (status === 401 || status === 403)
        throw new ApiError(
          503,
          "ai_key_rejected",
          "Anthropic rejected the key",
        );
      if (status === 429 || status === 529)
        throw new ApiError(503, "ai_busy", "AI is busy, try again");
      if (status === 400 && /credit|billing/i.test(error.message))
        throw new ApiError(503, "ai_no_credit", "No Anthropic credit left");
      throw new ApiError(502, "ai_failed", "AI request failed");
    }
    throw error;
  }
  if (message.stop_reason === "refusal")
    throw new ApiError(422, "ai_refused", "AI declined this request");
  if (message.stop_reason === "max_tokens")
    throw new ApiError(502, "ai_too_long", "AI answer was cut off");
  const out = message.content
    .filter(
      (b): b is Anthropic.Beta.Messages.BetaTextBlock => b.type === "text",
    )
    .at(-1)?.text;
  let data: unknown;
  try {
    data = JSON.parse(out || "");
  } catch {
    throw new ApiError(502, "ai_bad_answer", "Unexpected answer from AI");
  }
  return clean(stage, data);
}

/* ------------------------------------------------------------- limits */

async function bump(deps: Deps, key: string, limit: number) {
  if (!deps.cache || limit <= 0) return true;
  const request = cacheKey(key);
  const hit = await deps.cache.match(request);
  const count = hit ? Number(await hit.text()) || 0 : 0;
  if (count >= limit) return false;
  deps.waitUntil(
    deps.cache.put(
      request,
      new Response(String(count + 1), {
        headers: { "Cache-Control": "public, max-age=90000" },
      }),
    ),
  );
  return true;
}

/**
 * A rough daily budget per person and in total, so a shared link cannot run
 * up the bill. Counts live in the edge cache, which is enough for that.
 */
export async function checkAiLimits(deps: Deps, uid: string) {
  const day = new Date(deps.now()).toISOString().slice(0, 10);
  const perUser = Number(deps.env.AI_DAILY_LIMIT) || 60;
  const total = Number(deps.env.AI_GLOBAL_LIMIT) || 400;
  if (!(await bump(deps, `ai/count/${day}/user/${uid}`, perUser)))
    throw new ApiError(429, "ai_limit", "Daily AI limit reached");
  if (!(await bump(deps, `ai/count/${day}/all`, total)))
    throw new ApiError(429, "ai_limit", "Daily AI limit reached");
}

/** Who may use the AI: everyone signed in, or only the listed emails. */
export function aiAllowed(list: string | undefined, email: string | null) {
  const allowed = (list || "")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  return !allowed.length || (email !== null && allowed.includes(email));
}
