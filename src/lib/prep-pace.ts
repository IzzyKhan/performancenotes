/**
 * Prep-pace math: how many scenes/day must be prepped to finish before
 * principal photography, given prep days/week and tick-off progress.
 */

export type PrepPaceStatus =
  | "dates_missing"
  | "not_started"
  | "in_progress"
  | "all_done"
  | "behind"
  | "production_started";

export type PrepPaceResult = {
  status: PrepPaceStatus;
  totalScenes: number;
  preppedScenes: number;
  unpreppedScenes: number;
  /** Working prep days remaining in the effective window. */
  workingDaysLeft: number;
  /** Scenes per working day needed; null when not computable. */
  scenesPerDay: number | null;
  /** Short human-readable summary for the dialog. */
  summary: string;
};

/** Parse YYYY-MM-DD as a local calendar date (noon avoids DST edge cases). */
export function parseIsoDate(value: string | null | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(y, m - 1, d, 12, 0, 0, 0);
  if (
    date.getFullYear() !== y ||
    date.getMonth() !== m - 1 ||
    date.getDate() !== d
  ) {
    return null;
  }
  return date;
}

export function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0);
}

/** Inclusive calendar-day count from `from` to `to` (both noon-local). */
export function calendarDaysInclusive(from: Date, to: Date): number {
  const a = startOfLocalDay(from).getTime();
  const b = startOfLocalDay(to).getTime();
  if (b < a) return 0;
  return Math.floor((b - a) / 86_400_000) + 1;
}

/**
 * Approximate working days in a calendar span of `calendarDays` length,
 * given `daysPerWeek` prep days (we don't ask which weekdays).
 */
export function workingDaysInSpan(
  calendarDays: number,
  daysPerWeek: number
): number {
  if (calendarDays <= 0) return 0;
  const d = Math.min(7, Math.max(1, Math.floor(daysPerWeek)));
  const fullWeeks = Math.floor(calendarDays / 7);
  const remainder = calendarDays % 7;
  return fullWeeks * d + Math.min(remainder, d);
}

function formatScenesPerDay(n: number): string {
  return n.toFixed(1).replace(/\.0$/, "");
}

export function computePrepPace(opts: {
  prepStartDate: string | null;
  shootStartDate: string | null;
  techRecceDate?: string | null;
  /** When true, last prep day is the day before tech recce instead of shoot start. */
  prepEndBeforeTechRecce?: boolean;
  prepDaysPerWeek: number;
  totalScenes: number;
  preppedScenes: number;
  /** Override "today" for tests (local Date). */
  today?: Date;
}): PrepPaceResult {
  const totalScenes = Math.max(0, opts.totalScenes);
  const preppedScenes = Math.min(
    totalScenes,
    Math.max(0, opts.preppedScenes)
  );
  const unpreppedScenes = totalScenes - preppedScenes;
  const daysPerWeek =
    typeof opts.prepDaysPerWeek === "number" &&
    opts.prepDaysPerWeek >= 1 &&
    opts.prepDaysPerWeek <= 7
      ? Math.floor(opts.prepDaysPerWeek)
      : 5;

  const base = {
    totalScenes,
    preppedScenes,
    unpreppedScenes,
    workingDaysLeft: 0,
    scenesPerDay: null as number | null,
  };

  const prepStart = parseIsoDate(opts.prepStartDate);
  const shootStart = parseIsoDate(opts.shootStartDate);
  const techRecce = parseIsoDate(opts.techRecceDate);
  const prepEndBeforeTechRecce = Boolean(opts.prepEndBeforeTechRecce);

  if (!prepStart || !shootStart) {
    return {
      ...base,
      status: "dates_missing",
      summary: "Set prep start and shoot start dates to see your pace.",
    };
  }

  if (shootStart.getTime() <= prepStart.getTime()) {
    return {
      ...base,
      status: "dates_missing",
      summary: "Shoot start must be after prep start.",
    };
  }

  if (prepEndBeforeTechRecce && !techRecce) {
    return {
      ...base,
      status: "dates_missing",
      summary: "Set a tech recce date, or finish prep by the day before shoot start.",
    };
  }

  if (
    prepEndBeforeTechRecce &&
    techRecce &&
    techRecce.getTime() <= prepStart.getTime()
  ) {
    return {
      ...base,
      status: "dates_missing",
      summary: "Tech recce must be after prep start.",
    };
  }

  if (
    prepEndBeforeTechRecce &&
    techRecce &&
    techRecce.getTime() >= shootStart.getTime()
  ) {
    return {
      ...base,
      status: "dates_missing",
      summary: "Tech recce must be before shoot start.",
    };
  }

  const prepDeadlineAnchor = prepEndBeforeTechRecce && techRecce ? techRecce : shootStart;
  const lastPrepDay = new Date(prepDeadlineAnchor);
  lastPrepDay.setDate(lastPrepDay.getDate() - 1);
  const deadlineLabel = prepEndBeforeTechRecce ? "tech recce" : "shoot start";

  if (totalScenes === 0) {
    return {
      ...base,
      status: "dates_missing",
      summary: "Add scenes to track prep pace.",
    };
  }

  if (unpreppedScenes === 0) {
    return {
      ...base,
      status: "all_done",
      summary: `All ${totalScenes} scenes prepped.`,
    };
  }

  const today = startOfLocalDay(opts.today ?? new Date());

  if (today.getTime() >= shootStart.getTime()) {
    return {
      ...base,
      status: "production_started",
      summary: `${unpreppedScenes} scene${unpreppedScenes === 1 ? "" : "s"} still unprepped — principal photography has started.`,
    };
  }

  // Effective window: from max(today, prepStart) through the last prep day.
  const windowStart =
    today.getTime() > prepStart.getTime() ? today : prepStart;

  if (windowStart.getTime() > lastPrepDay.getTime()) {
    return {
      ...base,
      status: "behind",
      summary: `${unpreppedScenes} scene${unpreppedScenes === 1 ? "" : "s"} left — prep deadline was the day before ${deadlineLabel}.`,
    };
  }

  const calendarDays = calendarDaysInclusive(windowStart, lastPrepDay);
  const workingDaysLeft = workingDaysInSpan(calendarDays, daysPerWeek);

  if (workingDaysLeft <= 0) {
    return {
      ...base,
      workingDaysLeft: 0,
      status: "behind",
      summary: `${unpreppedScenes} scene${unpreppedScenes === 1 ? "" : "s"} left — no prep days remaining before ${deadlineLabel}.`,
    };
  }

  const scenesPerDay = unpreppedScenes / workingDaysLeft;
  const paceLabel = formatScenesPerDay(scenesPerDay);

  if (today.getTime() < prepStart.getTime()) {
    const deadlineNote = prepEndBeforeTechRecce
      ? " (day before tech recce)"
      : " (day before shoot start)";
    return {
      ...base,
      workingDaysLeft,
      scenesPerDay,
      status: "not_started",
      summary: `Prep starts ${opts.prepStartDate} — you'll need about ${paceLabel} scene${scenesPerDay === 1 ? "" : "s"}/day${deadlineNote} (${daysPerWeek} days/week).`,
    };
  }

  return {
    ...base,
    workingDaysLeft,
    scenesPerDay,
    status: "in_progress",
    summary: `${unpreppedScenes} left · ${workingDaysLeft} prep day${workingDaysLeft === 1 ? "" : "s"} · ${paceLabel} scene${scenesPerDay === 1 ? "" : "s"}/day · finish by day before ${deadlineLabel}`,
  };
}
