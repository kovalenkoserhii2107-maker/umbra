import { useEffect, useState } from "react";

/** Absolute link to a screen of this app, e.g. "/title/movie/1". */
export function appUrl(path: string) {
  return `${window.location.origin}${import.meta.env.BASE_URL}#${path}`;
}

type Target = {
  id: string;
  label: string;
  tint: string;
  mark: string;
  href: (text: string, url: string, subject: string) => string;
};

const TARGETS: Target[] = [
  {
    id: "telegram",
    label: "Telegram",
    tint: "#2aabee",
    mark: "TG",
    href: (text, url) =>
      `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
  },
  {
    id: "whatsapp",
    label: "WhatsApp",
    tint: "#25d366",
    mark: "WA",
    href: (text, url) =>
      `https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`,
  },
  {
    id: "viber",
    label: "Viber",
    tint: "#7360f2",
    mark: "VB",
    href: (text, url) =>
      `viber://forward?text=${encodeURIComponent(`${text}\n${url}`)}`,
  },
  {
    id: "sms",
    label: "Сообщения",
    tint: "#34c759",
    mark: "SMS",
    href: (text, url) => `sms:?&body=${encodeURIComponent(`${text}\n${url}`)}`,
  },
  {
    id: "mail",
    label: "Почта",
    tint: "#9e9e9e",
    mark: "@",
    href: (text, url, subject) =>
      `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(`${text}\n${url}`)}`,
  },
];

export function ShareIcon({ className = "h-[18px] w-[18px]" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3.5v11M8 7.5l4-4 4 4" />
      <path d="M7 11H6a1.5 1.5 0 0 0-1.5 1.5v6A1.5 1.5 0 0 0 6 20h12a1.5 1.5 0 0 0 1.5-1.5v-6A1.5 1.5 0 0 0 18 11h-1" />
    </svg>
  );
}

export function ShareSheet({
  title,
  text,
  url,
  onClose,
}: {
  title: string;
  text: string;
  url: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState("");
  const native = typeof navigator !== "undefined" && "share" in navigator;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied("Ссылка скопирована");
    } catch {
      setCopied("Не удалось скопировать. Ссылка: " + url);
    }
  }

  async function more() {
    try {
      await navigator.share({ title, text, url });
      onClose();
    } catch {
      /* the person closed the system sheet */
    }
  }

  const tile =
    "flex flex-col items-center gap-1.5 rounded-2xl p-2 text-[11px] text-mute hover:bg-white/5";
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Закрыть"
        onClick={onClose}
        className="absolute inset-0 bg-black/60"
      />
      <div
        role="dialog"
        aria-label="Поделиться"
        className="relative w-full max-w-md rounded-t-3xl border border-hairline bg-card p-5 sm:rounded-3xl"
        style={{ paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom))" }}
      >
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-accent">
          Поделиться
        </p>
        <p className="mt-1 line-clamp-2 text-lg leading-snug">{title}</p>
        <div className="mt-4 grid grid-cols-4 gap-1">
          {TARGETS.map((target) => (
            <a
              key={target.id}
              href={target.href(text, url, title)}
              target={
                target.id === "telegram" || target.id === "whatsapp"
                  ? "_blank"
                  : undefined
              }
              rel="noreferrer"
              onClick={() => window.setTimeout(onClose, 300)}
              className={tile}
            >
              <span
                className="flex h-12 w-12 items-center justify-center rounded-full font-mono text-xs font-bold text-white"
                style={{ background: target.tint }}
              >
                {target.mark}
              </span>
              {target.label}
            </a>
          ))}
          <button type="button" onClick={copy} className={tile}>
            <span className="flex h-12 w-12 items-center justify-center rounded-full border border-hairline text-ink">
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                aria-hidden="true"
              >
                <rect x="8" y="8" width="12" height="12" rx="2" />
                <path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8" />
              </svg>
            </span>
            Ссылка
          </button>
          {native ? (
            <button type="button" onClick={more} className={tile}>
              <span className="flex h-12 w-12 items-center justify-center rounded-full border border-hairline text-ink">
                <ShareIcon className="h-5 w-5" />
              </span>
              Ещё…
            </button>
          ) : null}
        </div>
        {copied ? (
          <p role="status" className="mt-3 break-all text-sm text-accent">
            {copied}
          </p>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-full border border-hairline py-2.5 text-sm text-mute"
        >
          Отмена
        </button>
      </div>
    </div>
  );
}

export function ShareButton({
  title,
  text,
  path,
  label = "Поделиться",
  className,
  showLabel = false,
}: {
  title: string;
  text: string;
  path: string;
  label?: string;
  className?: string;
  /** Show the label next to the icon instead of an icon-only button. */
  showLabel?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label={showLabel ? undefined : label}
        title={label}
        onClick={() => setOpen(true)}
        className={
          className ||
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-hairline bg-canvas/60 text-ink hover:border-accent"
        }
      >
        <ShareIcon />
        {showLabel ? <span>{label}</span> : null}
      </button>
      {open ? (
        <ShareSheet
          title={title}
          text={text}
          url={appUrl(path)}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
