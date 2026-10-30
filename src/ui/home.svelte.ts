// "Bugün" home screen state: continue reading, today's plan, due cards, recent highlights and recordings.
import { HomeRepo, type RecentDocument, type RecentHighlight, type RecentRecording } from "../core/home/homeRepo";
import { addDays, doneMinutes, expand, expandWeek, isoDay, weekStart, type Occurrence } from "../core/plan/plan";
import { PlanRepo } from "../core/plan/planRepo";
import { dueCards } from "../core/study/cards";
import { StudyRepo } from "../core/study/studyRepo";
import type { Library } from "./library.svelte";

export class Home {
  readonly home: HomeRepo;
  readonly plan: PlanRepo;
  readonly study: StudyRepo;
  today = $state(isoDay(new Date()));
  hour = $state(new Date().getHours());
  recent = $state.raw<RecentDocument[]>([]);
  todayPlan = $state.raw<Occurrence[]>([]);
  dueCount = $state(0);
  highlights = $state.raw<RecentHighlight[]>([]);
  recordings = $state.raw<RecentRecording[]>([]);
  week = $state({ doneMin: 0, plannedMin: 0, highlights: 0 });
  loaded = $state(false);

  constructor(readonly lib: Library) {
    this.home = new HomeRepo(lib.platform.db);
    this.plan = new PlanRepo(lib.platform.db);
    this.study = new StudyRepo(lib.platform.db);
  }

  async refresh(): Promise<void> {
    const now = new Date();
    this.today = isoDay(now);
    this.hour = now.getHours();
    const monday = weekStart(this.today);
    const sunday = addDays(monday, 6);
    const [y, m, d] = monday.split("-").map(Number);
    const [items, done, recent, cards, highlights, recordings, hlWeek] = await Promise.all([
      this.plan.itemsBetween(monday, sunday),
      this.plan.doneBetween(monday, sunday),
      this.home.recentDocuments(3),
      this.study.listCards(null, this.today),
      this.home.recentHighlights(5),
      this.home.recentRecordings(3),
      this.home.highlightsSince(new Date(y, m - 1, d).toISOString()),
    ]);
    const week = expandWeek(items, monday, done);
    this.todayPlan = expand(items, [this.today], done);
    this.week = { doneMin: doneMinutes(week), plannedMin: week.reduce((s, o) => s + o.item.durationMin, 0), highlights: hlWeek };
    this.recent = recent;
    this.dueCount = dueCards(cards, this.today).length;
    this.highlights = highlights;
    this.recordings = recordings;
    this.loaded = true;
  }

  async toggle(o: Occurrence): Promise<void> {
    await this.plan.setDone(o.item, o.day, !o.done);
    await this.refresh();
  }
}
