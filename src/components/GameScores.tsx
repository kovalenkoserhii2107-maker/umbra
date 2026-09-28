type Scores = { id: number; metacritic?: number | null; steam?: number | null };
function valid(score: number | null | undefined) {
  return (
    typeof score === "number" &&
    Number.isFinite(score) &&
    score >= 0 &&
    score <= 100
  );
}
function metacriticColor(score: number) {
  return score >= 75
    ? "text-[#00ce7a]"
    : score >= 50
      ? "text-[#ffbd3f]"
      : "text-[#ff6874]";
}
export function GameScores({ metacritic, steam }: Scores) {
  return (
    <div className="absolute bottom-1.5 right-1.5 flex flex-col items-end gap-1">
      {valid(metacritic) ? (
        <p
          className={`rounded-md bg-black/75 px-1.5 py-0.5 font-mono text-[10px] font-bold leading-none ${metacriticColor(metacritic!)}`}
        >
          MC {metacritic}
        </p>
      ) : null}
      {valid(steam) ? (
        <p className="rounded-md bg-black/75 px-1.5 py-0.5 font-mono text-[10px] font-bold leading-none text-[#66c0f4]">
          Steam {steam}%
        </p>
      ) : null}
    </div>
  );
}
export function GameScoreLine({ metacritic, steam }: Scores) {
  return (
    <div className="mt-3 flex flex-wrap gap-2 text-sm">
      <span
        className={`rounded-full border border-hairline px-3 py-1 ${valid(metacritic) ? metacriticColor(metacritic!) : "text-mute"}`}
      >
        Metacritic: {valid(metacritic) ? `${metacritic}/100` : "нет оценки"}
      </span>
      <span className="rounded-full border border-hairline px-3 py-1 text-[#66c0f4]">
        Steam: {valid(steam) ? `${steam}% положительных` : "нет оценки"}
      </span>
    </div>
  );
}
