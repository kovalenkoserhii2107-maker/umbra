import { Link, useParams } from "react-router-dom";
import { ErrorBox, Grid, Row, useAsync } from "../components";
import { PLATFORMS, platformBySlug } from "../lib/providers";
import { tmdb } from "../lib/tmdb";
import { useAppState } from "../state";

export function PlatformsPage() {
  const { settings } = useAppState();
  const list = PLATFORMS.filter((p) => settings.subscribed.includes(p.id));
  const shown = list.length ? list : PLATFORMS;

  return (
    <div className="rise">
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent">
        платформы
      </p>
      <h1 className="mt-1 text-3xl tracking-tight">Где смотреть</h1>
      <p className="mt-2 max-w-xl text-sm text-mute">
        Сначала новые оригиналы сервиса, потом остальной каталог. Регион:{" "}
        {settings.region}.
      </p>
      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {shown.map((p) => (
          <Link
            key={p.id}
            to={`/platforms/${p.slug}`}
            className="group rounded-2xl border border-hairline bg-card p-5 transition hover:border-accent/40"
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] tracking-[0.16em] text-dim">
                {p.short}
              </span>
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: p.tint }}
              />
            </div>
            <h2 className="mt-6 text-2xl tracking-tight">{p.name}</h2>
            <p className="mt-1 text-sm text-mute">Новое и каталог сервиса</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function PlatformPage() {
  const { slug = "" } = useParams();
  const platform = platformBySlug(slug);
  const { settings } = useAppState();

  const newest = useAsync(
    () =>
      platform
        ? tmdb.platformNewest(
            platform.id,
            settings.region,
            platform.movieCompanies,
            platform.tvNetworks,
          )
        : Promise.resolve([]),
    [platform?.id, settings.region],
  );
  const movies = useAsync(
    () =>
      platform
        ? tmdb.discover("movie", platform.id, settings.region)
        : Promise.resolve({
            results: [],
            page: 1,
            total_pages: 0,
            total_results: 0,
          }),
    [platform?.id, settings.region],
  );
  const shows = useAsync(
    () =>
      platform
        ? tmdb.discover("tv", platform.id, settings.region)
        : Promise.resolve({
            results: [],
            page: 1,
            total_pages: 0,
            total_results: 0,
          }),
    [platform?.id, settings.region],
  );

  if (!platform)
    return <p className="text-sm text-mute">Платформа не найдена.</p>;
  const err = newest.error || movies.error || shows.error;
  if (err && !newest.data && !movies.data) return <ErrorBox code={err} />;

  return (
    <div className="rise">
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent">
        {platform.short}
      </p>
      <h1 className="mt-1 mb-8 text-3xl tracking-tight">{platform.name}</h1>
      <Row title="Новое от сервиса" items={newest.data ?? []} />
      <section className="mb-10">
        <h2 className="mb-3 text-lg font-medium tracking-tight">
          Фильмы в каталоге
        </h2>
        {movies.loading ? (
          <p className="text-sm text-mute">Загрузка…</p>
        ) : (
          <Grid items={movies.data?.results ?? []} type="movie" />
        )}
      </section>
      <section className="mb-10">
        <h2 className="mb-3 text-lg font-medium tracking-tight">
          Сериалы в каталоге
        </h2>
        {shows.loading ? (
          <p className="text-sm text-mute">Загрузка…</p>
        ) : (
          <Grid items={shows.data?.results ?? []} type="tv" />
        )}
      </section>
    </div>
  );
}
