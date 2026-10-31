// User names for highlight labels and page flags ("label.exam", "flag.unclear"). Keys and colours stay fixed.
// The UI hands in its reactive record, so templates reading `name` update when the user renames one.
export type NameStore = Record<string, string | undefined>;

let custom: NameStore = {};

export function useCustomNames(store: NameStore): void {
  custom = store;
}

/** The user's name for `id`, or `fallback` when none (or only blanks) is set. */
export const customName = (id: string, fallback: string): string => custom[id]?.trim() || fallback;
