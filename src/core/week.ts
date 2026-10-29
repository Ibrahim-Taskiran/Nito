// Week parsing and ordering for lecture files ("Hafta 3: ...", "hafta04.pdf").

/** "1.Hafta ...", "Hafta2A_...", "2026_Hafta1_...", "hafta04.pdf" -> week number. */
export function weekNumber(name: string): number | null {
  const m =
    name.match(/hafta\s*[_-]?\s*0*(\d{1,2})(?!\d)/i) ??
    name.match(/(?<!\d)0*(\d{1,2})\s*\.?\s*hafta/i);
  return m ? Number(m[1]) : null;
}

/** Raw file name -> readable title that keeps the week as a prefix. */
export function cleanTitle(fileName: string): string {
  const week = weekNumber(fileName);
  const rest = fileName
    .replace(/\.pdf$/i, "")
    .replace(/\[[^\]]*\]|\(\d+\)/g, " ")
    .replace(/_+/g, " ")
    .replace(/(?<!\d)20\d{2}(?!\d)/g, " ")
    .replace(/\d{1,2}\s*\.?\s*hafta|hafta\s*-?\s*\d{1,2}[a-z]?(?![a-z\d])/gi, " ")
    .replace(/(?<![\p{L}\d])(v\d+|ogrenci|öğrenci|degisti|değişti)(?![\p{L}\d])/giu, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/\s+/g, " ")
    .replace(/^[\s,.;:-]+|[\s,.;:-]+$/g, "");
  if (week === null) return rest || fileName;
  return rest ? `Hafta ${week}: ${rest}` : `Hafta ${week}`;
}

const collator = new Intl.Collator("tr", { numeric: true, sensitivity: "base" });

export function compareByWeek(
  a: { week: number | null; title: string },
  b: { week: number | null; title: string },
): number {
  const wa = a.week ?? Number.MAX_SAFE_INTEGER;
  const wb = b.week ?? Number.MAX_SAFE_INTEGER;
  return wa !== wb ? wa - wb : collator.compare(a.title, b.title);
}

export interface WeekGroup<T> {
  week: number | null;
  label: string;
  items: T[];
}

/** Groups by week (ascending), documents without a week last. */
export function groupByWeek<T extends { week: number | null; title: string }>(items: T[]): WeekGroup<T>[] {
  const groups = new Map<number | null, T[]>();
  for (const it of [...items].sort(compareByWeek)) {
    const list = groups.get(it.week) ?? [];
    list.push(it);
    groups.set(it.week, list);
  }
  return [...groups].map(([week, list]) => ({
    week,
    label: week === null ? "Haftasız" : `Hafta ${week}`,
    items: list,
  }));
}
