import { readStorage, writeStorage } from "./storage";

/**
 * Review text not yet confirmed, kept on this device: a sheet closed by
 * accident or a reloaded tab does not lose it. Per account, so nobody else
 * on a shared device sees it; gone once confirmed or cancelled.
 */
const key = (uid: string, what: string) => `umbra.draft.${uid}.${what}`;

export const readDraft = (uid: string, what: string) =>
  readStorage(key(uid, what));

export function writeDraft(uid: string, what: string, text: string) {
  writeStorage(key(uid, what), text || null);
}

export const clearDraft = (uid: string, what: string) =>
  writeStorage(key(uid, what), null);
