import { useEffect, useRef, useState } from "react";
import { readStorage, writeStorage } from "../lib/storage";
export function NoteEditor({
  value,
  save,
  storageKey,
  confirmed,
}: {
  value: string;
  save: (value: string) => void;
  storageKey: string;
  confirmed: boolean;
}) {
  const [draft, setDraft] = useState(() => readStorage(storageKey) ?? value);
  const [storageError, setStorageError] = useState(false);
  const latest = useRef(draft);
  const dirty = useRef(draft !== value);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const saveRef = useRef(save);
  saveRef.current = save;
  function flush() {
    clearTimeout(timer.current);
    if (dirty.current) {
      dirty.current = false;
      saveRef.current(latest.current);
    }
  }
  useEffect(() => {
    const savedDraft = readStorage(storageKey);
    if (confirmed && value === latest.current) writeStorage(storageKey, null);
    if (!dirty.current && (savedDraft === null || value === latest.current)) {
      latest.current = value;
      setDraft(value);
    }
  }, [value, confirmed, storageKey]);
  useEffect(() => {
    if (dirty.current) timer.current = setTimeout(flush, 500);
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, []);
  return (
    <>
      <textarea
        aria-label="Заметка"
        value={draft}
        maxLength={5000}
        onBlur={flush}
        onChange={(event) => {
          latest.current = event.target.value;
          dirty.current = true;
          setDraft(latest.current);
          setStorageError(!writeStorage(storageKey, latest.current));
          clearTimeout(timer.current);
          timer.current = setTimeout(flush, 500);
        }}
        className="mt-1 w-full rounded-xl border border-hairline bg-canvas px-3 py-2 text-ink outline-none"
        placeholder="Коротко, для себя"
      />
      {draft !== value ? (
        <button
          type="button"
          onClick={() => {
            dirty.current = true;
            flush();
          }}
          className="text-xs text-accent"
        >
          Сохранить заметку
        </button>
      ) : null}
      {storageError ? (
        <span role="alert" className="text-xs text-accent">
          Черновик не сохраняется на устройстве. Дождись сохранения в облаке
          перед закрытием.
        </span>
      ) : null}
    </>
  );
}
