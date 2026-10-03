import { beforeAll, describe, expect, it } from "vitest";
import { handle } from "../../worker/src/index";
import {
  parseAiRequest,
  roundAnswers,
  sessionPrompt,
} from "../../worker/src/ai";
import type { CacheLike, Deps, Env } from "../../worker/src/env";

const SITE = "https://kovalenkoserhii2107-maker.github.io";
const PROJECT = "umbra-18ba8";
const NOW = Date.UTC(2026, 9, 3, 18);
const env: Env = {
  ALLOWED_ORIGINS: SITE,
  ANTHROPIC_API_KEY: "sk-ant-test",
  FIREBASE_PROJECT_ID: PROJECT,
};

type Call = { url: string; init?: RequestInit };

const b64url = (bytes: Uint8Array | string) =>
  btoa(
    typeof bytes === "string"
      ? bytes
      : String.fromCharCode(...new Uint8Array(bytes)),
  )
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

let keys: CryptoKeyPair;
let publicJwk: JsonWebKey;

beforeAll(async () => {
  keys = (await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  publicJwk = await crypto.subtle.exportKey("jwk", keys.publicKey);
});

async function token(claims: Record<string, unknown> = {}, kid = "key-1") {
  const head = b64url(JSON.stringify({ alg: "RS256", kid, typ: "JWT" }));
  const body = b64url(
    JSON.stringify({
      aud: PROJECT,
      iss: `https://securetoken.google.com/${PROJECT}`,
      sub: "user-1",
      iat: NOW / 1000 - 60,
      exp: NOW / 1000 + 3000,
      email: "me@example.com",
      email_verified: true,
      ...claims,
    }),
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    keys.privateKey,
    new TextEncoder().encode(`${head}.${body}`),
  );
  return `${head}.${body}.${b64url(new Uint8Array(signature))}`;
}

function memoryCache(): CacheLike {
  const store = new Map<string, string>();
  return {
    async match(key) {
      const body = store.get(key.url);
      return body === undefined ? undefined : new Response(body);
    },
    async put(key, response) {
      store.set(key.url, await response.text());
    },
  };
}

const question = {
  question: "Сколько сил на вечер?",
  options: [
    { label: "Хочу расслабиться", hint: "лёгкое" },
    { label: "Готов вникать", hint: "" },
    { label: "Что-то среднее", hint: "" },
  ],
  allow_custom: true,
};

function claudeReply(data: unknown, stop_reason = "end_turn") {
  return Response.json({
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: "claude-opus-5-5",
    content: [
      { type: "thinking", thinking: "", signature: "sig" },
      { type: "text", text: JSON.stringify(data) },
    ],
    stop_reason,
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 10 },
  });
}

function setup(
  claude: (call: Call) => Response = () => claudeReply(question),
  extra: Partial<Env> = {},
) {
  const calls: Call[] = [];
  const pending: Promise<unknown>[] = [];
  const deps: Deps = {
    env: { ...env, ...extra },
    cache: memoryCache(),
    now: () => NOW,
    waitUntil: (task) => pending.push(task),
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        input instanceof Request ? input.url : String(input as string | URL);
      const call = { url, init };
      calls.push(call);
      if (url.includes("securetoken@system.gserviceaccount.com"))
        return Response.json({
          keys: [{ ...publicJwk, kid: "key-1", alg: "RS256", use: "sig" }],
        });
      if (url.startsWith("https://api.anthropic.com/")) return claude(call);
      return new Response("unexpected", { status: 500 });
    }) as typeof fetch,
  };
  const send = async (body: unknown, auth?: string) => {
    const headers = new Headers({
      Origin: SITE,
      "Content-Type": "application/json",
    });
    if (auth) headers.set("Authorization", `Bearer ${auth}`);
    const response = await handle(
      new Request("https://umbra-api.example.workers.dev/ai/tonight", {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      }),
      deps,
    );
    await Promise.all(pending);
    return response;
  };
  return { calls, send };
}

const body = {
  stage: "ask",
  profile: "Оценки: Зодиак (2007, фильм) — 9/10",
  steps: [],
};

describe("AI picker", () => {
  it("asks Claude Opus 5.5 for the next question with the library cached", async () => {
    const { send, calls } = setup();
    const response = await send(body, await token());
    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(SITE);
    expect(await response.json()).toEqual(question);

    const call = calls.find((c) => c.url.startsWith("https://api.anthropic"))!;
    expect(call.url).toContain("/v1/messages");
    const headers = new Headers(call.init?.headers);
    expect(headers.get("x-api-key")).toBe("sk-ant-test");
    expect(headers.get("anthropic-beta")).toContain(
      "server-side-fallback-2026-07-01",
    );
    const sent = JSON.parse(String(call.init?.body));
    expect(sent.model).toBe("claude-opus-5-5");
    expect(sent.fallbacks).toBe("default");
    expect(sent.output_config.effort).toBe("medium");
    expect(sent.output_config.format.type).toBe("json_schema");
    expect(sent.system[1].text).toContain("Зодиак");
    expect(sent.system[1].cache_control).toEqual({ type: "ephemeral" });
    expect(sent.messages[0].content).toContain("question 1 of 4");
    expect(sent).not.toHaveProperty("tool_choice");
  });

  it("picks titles at high effort and cleans the answer", async () => {
    const { send, calls } = setup(() =>
      claudeReply({
        taste: "Любишь детективы с юмором.",
        intro: "Искал напряжённое, но не мрачное.",
        picks: [
          {
            title: "Убийство в Восточном экспрессе",
            original_title: "Murder on the Orient Express",
            year: 2017,
            type: "movie",
            reason: "Детектив, как ты любишь.",
          },
          {
            title: "",
            original_title: "",
            year: 2020,
            type: "tv",
            reason: "",
          },
        ],
      }),
    );
    const response = await send(
      {
        ...body,
        stage: "pick",
        steps: [{ question: "Сколько сил?", answer: "Мало" }],
      },
      await token(),
    );
    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      taste: string;
      picks: unknown[];
    };
    expect(data.picks).toHaveLength(1);
    expect(data.taste).toBe("Любишь детективы с юмором.");
    const sent = JSON.parse(
      String(calls.find((c) => c.url.includes("anthropic"))!.init?.body),
    );
    expect(sent.output_config.effort).toBe("high");
    expect(sent.messages[0].content).toContain("recommend 12 titles");
    expect(sent.messages[0].content).toContain("Rewatches are not wanted");
  });

  it("needs a valid sign-in", async () => {
    const { send, calls } = setup();
    expect((await send(body)).status).toBe(401);
    expect((await send(body, await token({ aud: "other" }))).status).toBe(401);
    expect(
      (await send(body, await token({ exp: NOW / 1000 - 3600 }))).status,
    ).toBe(401);
    const forged = (await token()).replace(/\.[^.]+$/, ".AAAA");
    expect((await send(body, forged)).status).toBe(401);
    expect(calls.some((c) => c.url.includes("anthropic"))).toBe(false);
  });

  it("can be limited to some emails", async () => {
    const { send } = setup(undefined, { AI_USERS: "friend@example.com" });
    expect((await send(body, await token())).status).toBe(403);
    expect(
      (await send(body, await token({ email: "friend@example.com" }))).status,
    ).toBe(200);
  });

  it("stops after the daily limit", async () => {
    const { send } = setup(undefined, { AI_DAILY_LIMIT: "2" });
    const t = await token();
    expect((await send(body, t)).status).toBe(200);
    expect((await send(body, t)).status).toBe(200);
    const third = await send(body, t);
    expect(third.status).toBe(429);
    expect(((await third.json()) as { error: string }).error).toBe("ai_limit");
  });

  it("reports refusals and missing keys", async () => {
    const refused = setup(() => claudeReply({}, "refusal"));
    expect((await refused.send(body, await token())).status).toBe(422);
    const off = setup(undefined, { ANTHROPIC_API_KEY: "" });
    const response = await off.send(body, await token());
    expect(response.status).toBe(503);
    expect(((await response.json()) as { error: string }).error).toBe(
      "ai_not_configured",
    );
  });

  it("lets rewatches in when asked", () => {
    const req = parseAiRequest({
      stage: "pick",
      profile: "x",
      steps: [],
      rewatch: true,
    });
    expect(req.rewatch).toBe(true);
    expect(sessionPrompt(req, "2026-10-03")).toContain("Rewatches are welcome");
    expect(parseAiRequest({ stage: "pick", profile: "x" }).rewatch).toBe(false);
  });

  it("builds the session from rounds of answers and shown picks", () => {
    const req = parseAiRequest({
      stage: "ask",
      profile: "x",
      steps: [
        { question: "Q1", answer: "A1" },
        { question: "Q2", answer: "A2" },
        {
          shown: [
            {
              title: "Дюна",
              year: 2021,
              type: "movie",
              verdict: "seen",
              rating: 8,
            },
            { title: "", year: 1 },
          ],
        },
        { question: "Q3", answer: "A3" },
        { nonsense: true },
      ],
    });
    expect(req.steps).toHaveLength(4);
    expect(roundAnswers(req.steps)).toBe(1);
    const prompt = sessionPrompt(req, "2026-10-03");
    expect(prompt).toContain(
      "Дюна (2021), film — user: already seen it, rated 8/10",
    );
    expect(prompt).toContain("Round 2, Q1: Q3");
    expect(prompt).toContain("Ask question 2 of 4 in round 2");
    expect(() => parseAiRequest({ stage: "ask", steps: [] })).toThrow();
  });
});
