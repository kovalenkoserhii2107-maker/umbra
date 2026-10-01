import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "../lib/auth";
import {
  loadFriendRatings,
  useFriendList,
  type FriendRating,
  type Person,
  type SharedRating,
} from "../lib/friends";
import type { MediaType } from "../lib/tmdb";
import { episodeLabel, progressOf } from "../lib/tracking";

export function Avatar({
  person,
  size = 40,
}: {
  person: Person;
  size?: number;
}) {
  return person.picture ? (
    <img
      src={person.picture}
      alt=""
      referrerPolicy="no-referrer"
      className="shrink-0 rounded-full object-cover"
      style={{ width: size, height: size }}
    />
  ) : (
    <span
      className="flex shrink-0 items-center justify-center rounded-full bg-ink font-medium text-canvas"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {person.name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function sharedStatus(r: SharedRating) {
  const progress = progressOf(r);
  if (r.status === "watchlist") return "хочет посмотреть";
  if (r.status === "watching")
    return progress ? `смотрит · ${episodeLabel(progress)}` : "смотрит";
  if (r.status === "dropped") return "бросил";
  return r.rating ? `${r.rating}/10` : "посмотрел";
}

/** Short label for a poster badge: "8", "хочет", "смотрит". */
export function shortStatus(r: SharedRating) {
  if (r.rating) return String(r.rating);
  if (r.status === "watchlist") return "хочет";
  if (r.status === "watching") return "смотрит";
  if (r.status === "dropped") return "бросил";
  return "✓";
}

// Rated first (best first), then watching, then the watchlist.
const ORDER = { watched: 0, watching: 1, watchlist: 2, dropped: 3 } as const;
export function byInterest(a: FriendRating, b: FriendRating) {
  return (
    (b.rating.rating ?? 0) - (a.rating.rating ?? 0) ||
    ORDER[a.rating.status] - ORDER[b.rating.status]
  );
}

const Index = createContext<Map<string, FriendRating[]>>(new Map());
const REFRESH_AFTER = 2 * 60_000;

/**
 * Loads every friend's shared shelf once and refreshes it when the app comes
 * back to the foreground, so posters can show friends' marks without a read
 * per card.
 */
export function FriendsIndexProvider({ children }: { children: ReactNode }) {
  const { account } = useAuth();
  const { list } = useFriendList(account?.sub || null);
  const [index, setIndex] = useState(() => new Map<string, FriendRating[]>());
  const key = (list ?? []).map((p) => `${p.uid}:${p.name}`).join();
  useEffect(() => {
    const friends = list ?? [];
    if (!friends.length) {
      setIndex(new Map());
      return;
    }
    let alive = true;
    let loadedAt = 0;
    async function load() {
      loadedAt = Date.now();
      const shelves = await Promise.all(
        friends.map(async (friend) => {
          try {
            return { friend, rows: await loadFriendRatings(friend.uid) };
          } catch {
            // Not accepted yet or no access: nothing to show for this friend.
            return { friend, rows: [] as SharedRating[] };
          }
        }),
      );
      const next = new Map<string, FriendRating[]>();
      for (const { friend, rows } of shelves)
        for (const rating of rows) {
          const k = `${rating.type}-${rating.id}`;
          next.set(k, [...(next.get(k) || []), { friend, rating }]);
        }
      next.forEach((v) => v.sort(byInterest));
      if (alive) setIndex(next);
    }
    void load();
    const onVisible = () => {
      if (
        document.visibilityState === "visible" &&
        Date.now() - loadedAt > REFRESH_AFTER
      )
        void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [key]);
  return <Index.Provider value={index}>{children}</Index.Provider>;
}

export function useFriendsOn(type: MediaType, id: number) {
  return useContext(Index).get(`${type}-${id}`) ?? [];
}

/** Friends' marks on a poster corner: avatars plus the first friend's mark. */
export function FriendBadge({
  type,
  id,
  className = "absolute left-1.5 top-1.5",
}: {
  type: MediaType;
  id: number;
  className?: string;
}) {
  const rows = useFriendsOn(type, id);
  if (!rows.length) return null;
  const title = rows
    .map(({ friend, rating }) => `${friend.name}: ${sharedStatus(rating)}`)
    .join(", ");
  return (
    <div
      title={title}
      aria-label={`Друзья: ${title}`}
      className={`${className} flex items-center gap-1 rounded-full bg-black/75 py-0.5 pl-0.5 pr-2 backdrop-blur-sm`}
    >
      <span className="flex -space-x-1.5">
        {rows.slice(0, 2).map(({ friend }) => (
          <span key={friend.uid} className="rounded-full ring-2 ring-black/75">
            <Avatar person={friend} size={18} />
          </span>
        ))}
      </span>
      <span className="font-mono text-[11px] font-bold leading-none text-white">
        {shortStatus(rows[0].rating)}
        {rows.length > 2 ? ` +${rows.length - 2}` : ""}
      </span>
    </div>
  );
}
