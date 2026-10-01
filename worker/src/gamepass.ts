import type { Deps } from "./env";
import { ApiError } from "./http";

/** Xbox Game Pass catalog lists ("sigls") the app shows. */
export const GAME_PASS_LISTS: Record<string, string> = {
  console: "f6f1f99f-9b49-4ccd-b3bf-4d9767a77f5e",
  pc: "fdd9e2a7-0fee-49f6-ad69-4354098401ff",
  recent: "f13cf6b4-57e6-4459-89df-6aec18cf0538",
  coming: "095bda36-f5cd-43f2-9ee1-0a72f371fb96",
  leaving: "393f05bf-e596-4ef6-9487-6d4fa0eab987",
};

const STORE_ID = /^[0-9A-Z]{12}$/;

/** Microsoft Store ids of the games in one list, in catalog order. */
export async function gamePassList(deps: Deps, list: string) {
  const sigl = GAME_PASS_LISTS[list];
  if (!sigl) throw new ApiError(404, "unknown_list", "No such Game Pass list");
  const response = await deps.fetch(
    `https://catalog.gamepass.com/sigls/v2?id=${sigl}&language=en-us&market=US`,
    { headers: { Accept: "application/json" } },
  );
  if (!response.ok)
    throw new ApiError(
      502,
      "gamepass_failed",
      `Game Pass answered ${response.status}`,
    );
  const rows = (await response.json()) as Array<{ id?: string }>;
  const ids = [
    ...new Set(rows.map((r) => r.id || "").filter((id) => STORE_ID.test(id))),
  ];
  return { list, ids };
}
