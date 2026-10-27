import { useEffect, useMemo, useRef, useState } from "react";
import {
  Link,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { Empty, useAsync } from "../components";
import { ShareButton } from "../components/ShareButton";
import { useAuth } from "../lib/auth";
import {
  INVITE_TOKEN,
  acceptInvite,
  acceptRequest,
  declineRequest,
  friendsError,
  loadFriendRatings,
  loadProfile,
  mirrorLibrary,
  myInviteToken,
  removeFriend,
  sendRequest,
  useFriendList,
  useRequests,
} from "../lib/friends";
import { correctPosterUrl } from "../lib/tmdb";
import { tasteMatch } from "../lib/taste";
import { useAppState } from "../state";
import { Avatar, sharedStatus } from "../components/FriendsIndex";

const button =
  "rounded-full border border-hairline px-3 py-1.5 text-xs text-mute hover:text-ink";

export function FriendsPage() {
  const { account } = useAuth();
  const { items } = useAppState();
  const uid = account?.sub || null;
  const friends = useFriendList(uid);
  const requests = useRequests(uid);
  const [message, setMessage] = useState("");
  const [tokenEpoch, setTokenEpoch] = useState(0);
  // The key in my link lets a friend join at once; without it (rules not
  // published yet) the link still works through a friend request.
  const token = useAsync(
    () => (uid ? myInviteToken() : Promise.resolve("")),
    [uid, tokenEpoch],
  );
  useEffect(() => {
    if (uid && items.length) void mirrorLibrary(uid, items);
  }, [uid, items]);
  if (!account) return null;
  const invitePath = `/friends/invite/${account.sub}?${new URLSearchParams({
    ...(token.data ? { t: token.data } : {}),
    n: account.name,
  })}`;

  async function run(action: () => Promise<void>) {
    setMessage("");
    try {
      await action();
    } catch (error) {
      setMessage(friendsError(error));
    }
  }

  const error = friends.error || requests.error;
  return (
    <div className="rise max-w-2xl">
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent">
        друзі
      </p>
      <h1 className="mt-1 text-3xl tracking-tight">Друзі</h1>
      <p className="mt-2 text-sm text-mute">
        Друзі бачать твої оцінки та статуси — що дивишся і що хочеш
        подивитися. Особисті нотатки залишаються тільки в тебе.
      </p>

      <div className="mt-5 rounded-2xl border border-hairline bg-card p-4">
        <p className="text-sm">Запроси друга за посиланням</p>
        <p className="mt-1 text-xs text-mute">
          Друг відкриє посилання, увійде або зареєструється в Umbra — і ви відразу
          станете друзями та побачите оцінки одне одного.
        </p>
        {token.loading ? (
          <button
            type="button"
            disabled
            className="mt-3 inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm text-canvas opacity-60"
          >
            Готую посилання…
          </button>
        ) : (
          <ShareButton
            title="Запрошення в Umbra"
            text={`${account.name} кличе тебе в Umbra — будемо бачити оцінки фільмів одне одного:`}
            path={invitePath}
            label="Запросити друга"
            showLabel
            className="mt-3 inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm text-canvas"
          />
        )}
      </div>

      {error || message ? (
        <p role="alert" className="mt-4 text-sm text-accent">
          {message || error}
        </p>
      ) : null}

      {requests.list?.length ? (
        <section className="mt-8">
          <h2 className="mb-3 text-lg tracking-tight">Заявки в друзі</h2>
          <div className="space-y-2">
            {requests.list.map((p) => (
              <div
                key={p.uid}
                className="flex items-center gap-3 rounded-2xl border border-accent/40 bg-card p-3"
              >
                <Avatar person={p} />
                <p className="min-w-0 flex-1 truncate">{p.name}</p>
                <button
                  type="button"
                  onClick={() => run(() => acceptRequest(p))}
                  className="rounded-full bg-accent px-3 py-1.5 text-xs text-black"
                >
                  Прийняти
                </button>
                <button
                  type="button"
                  onClick={() => run(() => declineRequest(p.uid))}
                  className={button}
                >
                  Відхилити
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-8">
        <h2 className="mb-3 text-lg tracking-tight">Мої друзі</h2>
        {friends.list === null ? (
          <p className="text-sm text-mute">Завантажую…</p>
        ) : friends.list.length === 0 ? (
          <Empty text="Поки нікого. Надішли другу посилання-запрошення." />
        ) : (
          <div className="space-y-2">
            {friends.list.map((p) => (
              <div
                key={p.uid}
                className="flex items-center gap-3 rounded-2xl border border-hairline bg-card p-3"
              >
                <Link
                  to={`/friends/${p.uid}`}
                  className="flex min-w-0 flex-1 items-center gap-3"
                >
                  <Avatar person={p} />
                  <span className="truncate">{p.name}</span>
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(`Видалити ${p.name} з друзів?`))
                      void run(async () => {
                        await removeFriend(p.uid);
                        setTokenEpoch((n) => n + 1);
                      });
                  }}
                  className={button}
                >
                  Видалити
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export function InvitePage() {
  const { uid = "" } = useParams();
  const [params] = useSearchParams();
  const token = params.get("t") || "";
  const { account } = useAuth();
  const { items } = useAppState();
  const navigate = useNavigate();
  const friends = useFriendList(account?.sub || null);
  const profile = useAsync(() => loadProfile(uid), [uid]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const tried = useRef(false);
  const keyed = INVITE_TOKEN.test(token) && uid !== account?.sub;

  // A link with the invite key: friends right away, no request to accept.
  useEffect(() => {
    if (!keyed || !account || !profile.data || tried.current) return;
    tried.current = true;
    setBusy(true);
    acceptInvite(profile.data, token, {
      name: account.name,
      picture: account.picture,
    })
      .then(() => {
        if (items.length) void mirrorLibrary(account.sub, items);
        navigate(`/friends/${uid}`, { replace: true, state: { joined: true } });
      })
      .catch(() => {
        setMessage(
          "Не вдалося додати одразу — надішли заявку, і друг її прийме.",
        );
        setBusy(false);
      });
  }, [keyed, account, profile.data]);

  if (!account) return null;
  const already = friends.list?.some((p) => p.uid === uid);

  async function add() {
    if (!profile.data || !account) return;
    setBusy(true);
    setMessage("");
    try {
      await sendRequest(profile.data, {
        name: account.name,
        picture: account.picture,
      });
      if (items.length) void mirrorLibrary(account.sub, items);
      navigate(`/friends/${uid}`, { replace: true });
    } catch (error) {
      setMessage(
        error instanceof Error && !("code" in error)
          ? error.message
          : friendsError(error),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rise mx-auto max-w-md pt-6 text-center">
      {uid === account.sub ? (
        <Empty text="Це твоє посилання-запрошення. Надішли його другу." />
      ) : profile.loading || (keyed && busy) ? (
        <p role="status" className="text-sm text-mute">
          {keyed ? "Додаю в друзі…" : "Відкриваю запрошення…"}
        </p>
      ) : !profile.data ? (
        <Empty
          text={
            profile.error
              ? friendsError({ code: "permission-denied" })
              : "Запрошення не знайдено. Попроси друга надіслати посилання ще раз."
          }
        />
      ) : (
        <div className="rounded-3xl border border-hairline bg-card p-6">
          <div className="flex justify-center">
            <Avatar person={profile.data} size={64} />
          </div>
          <p className="mt-4 text-xl">{profile.data.name}</p>
          <p className="mt-1 text-sm text-mute">запрошує тебе в друзі</p>
          {already ? (
            <Link
              to={`/friends/${uid}`}
              className="mt-6 inline-block rounded-full border border-hairline px-4 py-2 text-sm"
            >
              Ви вже друзі — відкрити
            </Link>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={add}
              className="mt-6 w-full rounded-full bg-ink px-4 py-3 text-sm text-canvas disabled:opacity-60"
            >
              Додати в друзі
            </button>
          )}
          <p className="mt-3 text-xs text-dim">
            {profile.data.name} побачить твої оцінки та статуси, ти — його. Нотатки
            залишаються особистими.
          </p>
          {message ? (
            <p role="alert" className="mt-3 text-sm text-accent">
              {message}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}

type Show = "all" | "rated" | "watchlist" | "watching";

export function FriendPage() {
  const { uid = "" } = useParams();
  const joined = Boolean(
    (useLocation().state as { joined?: boolean } | null)?.joined,
  );
  const { account } = useAuth();
  const { items } = useAppState();
  const friends = useFriendList(account?.sub || null);
  const friend = friends.list?.find((p) => p.uid === uid);
  const ratings = useAsync(() => loadFriendRatings(uid), [uid]);
  const [show, setShow] = useState<Show>("all");
  const match = useMemo(
    () => (ratings.data ? tasteMatch(items, ratings.data) : null),
    [items, ratings.data],
  );
  const list = (ratings.data ?? []).filter((r) =>
    show === "all"
      ? true
      : show === "rated"
        ? r.rating !== null
        : r.status === show,
  );
  const name = friend?.name || "Друг";
  const denied = Boolean(ratings.error);

  return (
    <div className="rise">
      <div className="flex items-center gap-3">
        {friend ? <Avatar person={friend} size={48} /> : null}
        <div className="min-w-0">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent">
            друг
          </p>
          <h1 className="truncate text-2xl tracking-tight">{name}</h1>
        </div>
      </div>

      {joined ? (
        <p
          role="status"
          className="mt-4 rounded-2xl border border-ok/40 bg-ok/10 px-4 py-3 text-sm"
        >
          Ви тепер друзі — {name} бачить твої оцінки, а ти його.
        </p>
      ) : null}

      {friends.list && !friend ? (
        <p className="mt-4 text-sm text-mute">
          Цієї людини немає серед твоїх друзів.{" "}
          <Link to="/friends" className="text-accent">
            До друзів
          </Link>
        </p>
      ) : null}

      {match ? (
        <div className="mt-5 rounded-2xl border border-hairline bg-card p-4">
          <p className="text-3xl tracking-tight">{match.percent}%</p>
          <p className="mt-1 text-xs text-mute">
            збіг смаків за {match.common} спільними оцінками
          </p>
        </div>
      ) : null}

      {ratings.loading ? (
        <p className="mt-6 text-sm text-mute">Завантажую оцінки…</p>
      ) : denied ? (
        <Empty
          text={`${name} ще не прийняв заявку — оцінки з'являться після підтвердження.`}
        />
      ) : !ratings.data?.length ? (
        <Empty text={`${name} поки нічого не відзначив.`} />
      ) : (
        <>
          <div className="row-scroll mt-6 flex gap-2 overflow-x-auto pb-1">
            {(
              [
                ["all", "Всі"],
                ["rated", "З оцінкою"],
                ["watching", "Дивиться"],
                ["watchlist", "Хоче подивитися"],
              ] as Array<[Show, string]>
            ).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setShow(id)}
                className={`shrink-0 rounded-full border px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.1em] ${show === id ? "border-ink bg-ink text-canvas" : "border-hairline text-mute"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="mt-4 space-y-2">
            {list.map((r) => {
              const mine = items.find(
                (x) => x.type === r.type && x.id === r.id,
              );
              return (
                <Link
                  key={`${r.type}-${r.id}`}
                  to={`/title/${r.type}/${r.id}`}
                  className="flex gap-3 rounded-xl border border-hairline bg-card p-2 hover:border-accent/40"
                >
                  {r.poster ? (
                    <img
                      src={correctPosterUrl(r.poster)}
                      alt=""
                      className="h-20 w-14 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="h-20 w-14 rounded-lg bg-canvas-soft" />
                  )}
                  <div className="min-w-0 flex-1 py-1">
                    <p className="truncate">{r.title}</p>
                    <p className="font-mono text-[11px] uppercase tracking-wider text-accent">
                      {sharedStatus(r)}
                    </p>
                    {mine?.rating ? (
                      <p className="font-mono text-[11px] uppercase tracking-wider text-dim">
                        у тебе {mine.rating}/10
                      </p>
                    ) : null}
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
