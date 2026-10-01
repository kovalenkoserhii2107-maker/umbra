import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import {
  openInstallHelp,
  promptInstall,
  useCanInstall,
  useInstalled,
} from "../lib/install";

export function AccountMenu() {
  const [open, setOpen] = useState(false);
  const { account, status } = useAuth();
  const root = useRef<HTMLDivElement>(null);
  const canInstall = useCanInstall();
  const installed = useInstalled();

  useEffect(() => {
    if (!open) return;
    function onDoc(event: MouseEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={root} className="relative shrink-0">
      <button
        type="button"
        aria-label="Меню"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-10 w-10 items-center justify-center rounded-full border border-hairline bg-card text-ink"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 18 18"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M3 5h12M3 9h12M3 13h12"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      </button>
      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-2xl border border-hairline bg-card shadow-[0_18px_50px_rgba(0,0,0,0.55)]">
          {status === "initializing" ? (
            <p className="px-4 py-3 text-sm">Восстанавливаю вход…</p>
          ) : account ? (
            <Link
              to="/settings"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 border-b border-hairline px-4 py-3 hover:bg-white/5"
            >
              {account.picture ? (
                <img
                  src={account.picture}
                  alt=""
                  className="h-8 w-8 rounded-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-xs text-canvas">
                  {account.name.slice(0, 1)}
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm">{account.name}</p>
                <p className="truncate text-xs text-mute">{account.email}</p>
              </div>
            </Link>
          ) : (
            <Link
              to="/login"
              onClick={() => setOpen(false)}
              className="block px-4 py-3 text-sm text-accent hover:bg-white/5"
            >
              Войти
            </Link>
          )}
          {account ? (
            <>
              <Link
                to="/stats"
                onClick={() => setOpen(false)}
                className="block px-4 py-3 text-sm hover:bg-white/5"
              >
                Статистика и итоги
              </Link>
              <Link
                to="/friends"
                onClick={() => setOpen(false)}
                className="block px-4 py-3 text-sm hover:bg-white/5"
              >
                Друзья
              </Link>
            </>
          ) : null}
          {installed ? null : (
            <button
              type="button"
              onClick={async () => {
                setOpen(false);
                if (!canInstall || !(await promptInstall())) openInstallHelp();
              }}
              className="block w-full px-4 py-3 text-left text-sm hover:bg-white/5"
            >
              Установить приложение
            </button>
          )}
          <Link
            to="/settings"
            onClick={() => setOpen(false)}
            className="block px-4 py-3 text-sm hover:bg-white/5"
          >
            Профиль и настройки
          </Link>
        </div>
      ) : null}
    </div>
  );
}
