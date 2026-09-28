import type { Game } from "../lib/games";
function date(value?: string) {
  const time = Date.parse(value || "");
  return Number.isFinite(time)
    ? new Date(time).toLocaleString("ru-RU")
    : "дата неизвестна";
}
export function GameFacts({ game }: { game: Game }) {
  const facts = [
    ["Платформы", game.platforms?.join(" · ") || game.platform],
    ["Жанры", game.genre],
    ["Разработчик", game.developer],
    ["Издатель", game.publisher],
    ["Дата выхода", game.releaseLabel || game.release_date],
    ["Режимы игры", game.modes?.join(" · ")],
    [
      "Количество игроков в сессии",
      game.modes?.length === 1 && game.modes[0] === "Один игрок"
        ? "1"
        : "Источник не указывает точное число",
    ],
  ];
  return (
    <section className="mt-8">
      <h2 className="text-xl">Характеристики</h2>
      {game.pcDetails ? (
        <p className="mt-2 text-xs text-mute">
          Дополнительные сведения Steam, скриншоты и цены относятся к версии для
          PC.
        </p>
      ) : null}
      <dl className="mt-4 grid gap-4 sm:grid-cols-2">
        {facts.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-dim">{label}</dt>
            <dd className="mt-1 text-sm">{value || "Нет данных"}</dd>
          </div>
        ))}
      </dl>
      {game.playerCount != null ? (
        <p className="mt-4 text-sm text-mute">
          Игроков одновременно в Steam:{" "}
          {game.playerCount.toLocaleString("ru-RU")}
          <span className="block text-xs text-dim">
            На {date(game.checkedAt)}
          </span>
        </p>
      ) : null}
      {game.steam != null ? (
        <p className="mt-4 text-xs text-mute">
          Steam: доля положительных среди всех отзывов, включая активации
          ключей. Она может отличаться от оценки покупок в магазине.
        </p>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-4 text-sm text-accent">
        {game.steamAppId ? (
          <a
            href={`https://store.steampowered.com/app/${game.steamAppId}/#app_reviews_hash`}
            target="_blank"
            rel="noreferrer"
          >
            Отзывы Steam
            {game.steamReviewCount
              ? ` (${game.steamReviewCount.toLocaleString("ru-RU")})`
              : ""}
          </a>
        ) : null}
        {game.metacriticUrl ? (
          <a href={game.metacriticUrl} target="_blank" rel="noreferrer">
            Оценки Metacritic
          </a>
        ) : null}
      </div>
    </section>
  );
}
export function GameOffers({ game }: { game: Game }) {
  const offers = game.offers || [];
  return (
    <section className="mt-8">
      <h2 className="text-xl">Цены в магазинах</h2>
      <p className="mt-2 text-xs text-mute">
        Цены зависят от региона и могут измениться. Финальную цену и доступность
        проверь в магазине.
      </p>
      {offers.length ? (
        <div className="mt-4 space-y-2">
          {offers.map((offer, i) => (
            <a
              key={`${offer.url}:${i}`}
              href={offer.url}
              target="_blank"
              rel="noreferrer"
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-hairline bg-card p-4 hover:border-accent/40"
            >
              <div>
                <p>
                  {offer.store}{" "}
                  <span className="text-xs text-dim">PC · {offer.region}</span>
                </p>
                <p className="text-xs text-dim">
                  Проверено: {date(offer.checkedAt)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-accent">
                  {offer.price === 0
                    ? "Бесплатно"
                    : new Intl.NumberFormat("ru-RU", {
                        style: "currency",
                        currency: offer.currency,
                      }).format(offer.price)}
                </p>
                {offer.regularPrice && offer.regularPrice > offer.price ? (
                  <s className="text-xs text-dim">
                    {new Intl.NumberFormat("ru-RU", {
                      style: "currency",
                      currency: offer.currency,
                    }).format(offer.regularPrice)}
                  </s>
                ) : null}
              </div>
            </a>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm text-mute">
          Проверенных предложений пока нет. Это не означает, что игра
          бесплатная.
        </p>
      )}
      {offers.some((o) => o.source === "CheapShark") ? (
        <a
          href="https://www.cheapshark.com"
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-block text-xs text-dim"
        >
          Цены PC-магазинов: CheapShark
        </a>
      ) : null}
    </section>
  );
}
