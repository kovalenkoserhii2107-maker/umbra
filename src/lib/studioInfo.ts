export type StudioInfo = {
  title: string;
  description: string;
  extract: string;
  image: string;
  url: string;
};

type Summary = {
  type?: string;
  title?: string;
  description?: string;
  extract?: string;
  thumbnail?: { source?: string };
  content_urls?: { desktop?: { page?: string } };
};

function titled(name: string, page: string) {
  const left = name.toLowerCase().split(/[^a-z0-9а-яё]+/i).filter((w) => w.length > 3);
  const right = page.toLowerCase();
  return left.some((word) => right.includes(word));
}

async function summary(title: string): Promise<StudioInfo | null> {
  for (const host of ["ru.wikipedia.org", "en.wikipedia.org"]) {
    const response = await fetch(
      `https://${host}/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`,
    );
    if (!response.ok) continue;
    const data = (await response.json()) as Summary;
    if (data.type === "disambiguation" || !data.extract || !data.title) continue;
    if (!titled(title, data.title)) continue;
    return {
      title: data.title,
      description: data.description || "",
      extract: data.extract,
      image: data.thumbnail?.source || "",
      url: data.content_urls?.desktop?.page || "",
    };
  }
  return null;
}

export async function studioInfo(name: string): Promise<StudioInfo | null> {
  const direct = await summary(name);
  if (direct) return direct;
  const cleaned = name.replace(/\b(inc|ltd|llc|co|corp|gmbh|studios)\b\.?/gi, "").trim();
  if (cleaned && cleaned !== name) {
    const retry = await summary(cleaned);
    if (retry) return retry;
  }
  const response = await fetch(
    `https://ru.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(name)}&limit=1&namespace=0&format=json&origin=*`,
  );
  if (!response.ok) return null;
  const data = (await response.json()) as [string, string[]];
  const hit = data[1]?.[0];
  if (!hit || !titled(name, hit)) return null;
  return summary(hit);
}
