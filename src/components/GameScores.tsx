import { useEffect, useState } from "react";
import { loadSteamScores, type SteamScore } from "../lib/steamScores";

function metacriticColor(score: number) {
  if (score >= 75) return "text-[#00ce7a]";
  if (score >= 50) return "text-[#ffbd3f]";
  return "text-[#ff6874]";
}

export function useSteamScore(id: number) {
  const [score, setScore] = useState<SteamScore | null>(null);
  useEffect(() => {
    let alive = true;
    loadSteamScores().then((all) => {
      if (alive) setScore(all[String(id)] ?? null);
    });
    return () => {
      alive = false;
    };
  }, [id]);
  return score;
}

export function GameScores({ id }: { id: number }) {
  const score = useSteamScore(id);
  if (!score || (score.metacritic == null && score.steam == null)) return null;
  return (
    <div className="absolute bottom-1.5 right-1.5 flex flex-col items-end gap-1">
      {score.metacritic != null ? (
        <p
          className={`rounded-md bg-black/75 px-1.5 py-0.5 font-mono text-[10px] font-bold leading-none ${metacriticColor(score.metacritic)}`}
        >
          MC {score.metacritic}
        </p>
      ) : null}
      {score.steam != null ? (
        <p className="rounded-md bg-black/75 px-1.5 py-0.5 font-mono text-[10px] font-bold leading-none text-[#66c0f4]">
          Steam {score.steam}%
        </p>
      ) : null}
    </div>
  );
}

export function GameScoreLine({ id }: { id: number }) {
  const score = useSteamScore(id);
  if (!score || (score.metacritic == null && score.steam == null)) return null;
  return (
    <p className="mt-3 flex flex-wrap gap-2">
      {score.metacritic != null ? (
        <span
          className={`rounded-full border border-hairline bg-card px-3 py-1 font-mono text-[11px] uppercase tracking-[0.12em] ${metacriticColor(score.metacritic)}`}
        >
          Metacritic {score.metacritic}
        </span>
      ) : null}
      {score.steam != null ? (
        <span className="rounded-full border border-hairline bg-card px-3 py-1 font-mono text-[11px] uppercase tracking-[0.12em] text-[#66c0f4]">
          Steam {score.steam}%
        </span>
      ) : null}
    </p>
  );
}
