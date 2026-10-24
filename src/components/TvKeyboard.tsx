import { useEffect, useState } from "react";
import { canVoice, onTvEvent, tvBridge } from "../lib/tvMode";

type Layout = "ru" | "en" | "num";

/** Letters in alphabetical order, seven to a row, as on TV keyboards. */
const KEYS: Record<Layout, string> = {
  ru: "абвгдеёжзийклмнопрстуфхцчшщъыьэюя-.",
  en: "abcdefghijklmnopqrstuvwxyz-'",
  num: "1234567890-:.,!?&'()#",
};

const NAMES: Record<Layout, string> = { ru: "АБВ", en: "ABC", num: "123" };

const base = "flex h-10 items-center justify-center rounded-lg";
const key = `${base} bg-white/[0.07] text-lg`;

/**
 * On-screen keyboard for the remote, with voice input through the TV app.
 * Letters change `value` at once; the page searches as it changes.
 */
export function TvKeyboard({
  value,
  onChange,
  onSubmit,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
}) {
  const [layout, setLayout] = useState<Layout>("ru");
  const [voice, setVoice] = useState<"idle" | "listening" | "error">("idle");
  const [heard, setHeard] = useState("");
  const voiceReady = canVoice();

  useEffect(
    () =>
      onTvEvent((e) => {
        if (e.type !== "voice") return;
        if (e.state === "listening") {
          setVoice("listening");
          setHeard("");
        } else if (e.state === "partial") setHeard(e.text);
        else if (e.state === "result") {
          setVoice("idle");
          setHeard("");
          onChange(e.text);
          onSubmit(e.text);
        } else if (e.state === "error") setVoice("error");
        else if (e.state === "end")
          setVoice((v) => (v === "listening" ? "idle" : v));
      }),
    [onChange, onSubmit],
  );

  const type = (s: string) => onChange(value + s);
  const others = (Object.keys(KEYS) as Layout[]).filter((l) => l !== layout);

  return (
    <div className="space-y-3" role="group" aria-label="Клавиатура">
      {voiceReady ? (
        <button
          type="button"
          onClick={() => {
            if (voice === "listening") tvBridge()?.stopVoice();
            else tvBridge()?.startVoice("ru-RU");
          }}
          className={`flex h-12 w-full items-center justify-center gap-2 rounded-xl text-base ${voice === "listening" ? "bg-accent text-black" : "bg-white/[0.07]"}`}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <rect x="9" y="3" width="6" height="11" rx="3" />
            <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
          </svg>
          {voice === "listening" ? heard || "Говорите…" : "Сказать голосом"}
        </button>
      ) : null}
      {voice === "error" ? (
        <p role="status" className="text-sm text-mute">
          Не расслышал. Нажми на микрофон и скажи название ещё раз.
        </p>
      ) : null}
      <div className="grid grid-cols-7 gap-1.5">
        {Array.from(KEYS[layout]).map((ch, i) => (
          <button
            key={ch}
            type="button"
            data-tv-autofocus={i === 0 && !value ? "" : undefined}
            onClick={() => type(ch)}
            className={key}
          >
            {ch}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        <button
          type="button"
          onClick={() => type(" ")}
          aria-label="Пробел"
          className={`${key} col-span-3 text-sm text-mute`}
        >
          пробел
        </button>
        <button
          type="button"
          onClick={() => onChange(value.slice(0, -1))}
          aria-label="Стереть букву"
          className={`${key} col-span-2`}
        >
          ⌫
        </button>
        {others.map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => setLayout(l)}
            className={`${key} font-mono text-xs`}
          >
            {NAMES[l]}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onChange("")}
          className={`${key} col-span-3 text-sm text-mute`}
        >
          Очистить
        </button>
        <button
          type="button"
          onClick={() => onSubmit(value)}
          className={`${base} col-span-4 bg-accent text-base font-medium text-black`}
        >
          Найти
        </button>
      </div>
    </div>
  );
}
