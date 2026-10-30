import { describe, expect, it } from "vitest";
import {
  elapsed, formatClock, isDone, newCountdown, newStopwatch, parseMinutes, pauseCountdown, pauseWatch, remaining, startCountdown, startWatch,
} from "../src/core/timer";

describe("timer", () => {
  it("formats the clock", () => {
    expect(formatClock(0)).toBe("00:00");
    expect(formatClock(65_400)).toBe("01:05");
    expect(formatClock(3_725_000)).toBe("1:02:05");
    expect(formatClock(-5)).toBe("00:00");
  });

  it("stopwatch keeps time across pauses", () => {
    let w = startWatch(newStopwatch(), 1000);
    expect(elapsed(w, 6000)).toBe(5000);
    w = pauseWatch(w, 6000);
    expect(elapsed(w, 60_000)).toBe(5000);
    w = startWatch(w, 70_000);
    expect(elapsed(w, 72_000)).toBe(7000);
    expect(startWatch(w, 99_000)).toBe(w);
  });

  it("countdown runs, pauses and ends", () => {
    let c = startCountdown(newCountdown(1), 0);
    expect(remaining(c, 20_000)).toBe(40_000);
    c = pauseCountdown(c, 20_000);
    expect(remaining(c, 500_000)).toBe(40_000);
    expect(isDone(c, 500_000)).toBe(false);
    c = startCountdown(c, 500_000);
    expect(isDone(c, 539_999)).toBe(false);
    expect(isDone(c, 540_000)).toBe(true);
    expect(remaining(c, 600_000)).toBe(0);
  });

  it("parses minutes", () => {
    expect(parseMinutes("25")).toBe(25);
    expect(parseMinutes(" 1,5 ")).toBe(1.5);
    expect(parseMinutes("0")).toBeNull();
    expect(parseMinutes("abc")).toBeNull();
    expect(parseMinutes("601")).toBeNull();
  });
});
