"use strict";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function formatDateUTC(date) {
  return date.toISOString().slice(0, 10);
}

function parseDateUTC(dateString) {
  if (!DATE_RE.test(dateString)) {
    throw new Error(`Invalid snapshot date '${dateString}'. Expected YYYY-MM-DD.`);
  }
  const date = new Date(`${dateString}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid snapshot date '${dateString}'.`);
  }
  return date;
}

function addDays(date, days) {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function normalizeSeries(series) {
  if (!series || typeof series !== "object" || Array.isArray(series)) return {};

  const normalized = {};
  for (const [date, value] of Object.entries(series)) {
    if (!DATE_RE.test(date)) continue;
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) continue;
    normalized[date] = Math.floor(value);
  }
  return normalized;
}

function sortSeries(series) {
  return Object.fromEntries(
    Object.entries(series).sort(([a], [b]) => a.localeCompare(b)),
  );
}

function mergeSnapshots(existingSeries, todayDate, todayTotal, windowDays) {
  if (typeof todayTotal !== "number" || !Number.isFinite(todayTotal) || todayTotal < 0) {
    throw new Error(`Invalid total '${todayTotal}'. Expected a non-negative number.`);
  }

  const today = parseDateUTC(todayDate);
  const keepFrom = formatDateUTC(addDays(today, -(windowDays - 1)));
  const sanitized = normalizeSeries(existingSeries);
  sanitized[todayDate] = Math.floor(todayTotal);

  const kept = {};
  for (const [date, value] of Object.entries(sanitized)) {
    if (date >= keepFrom && date <= todayDate) {
      kept[date] = value;
    }
  }

  return sortSeries(kept);
}

function pickBaseline(entries, cutoffDate) {
  const exact = entries.find(([date]) => date === cutoffDate);
  if (exact) return { value: exact[1], partial: false };

  const after = entries.find(([date]) => date > cutoffDate);
  if (after) return { value: after[1], partial: true };

  const before = [...entries].reverse().find(([date]) => date < cutoffDate);
  if (before) return { value: before[1], partial: true };

  return null;
}

function startOfIsoWeek(dateString) {
  const date = parseDateUTC(dateString);
  const isoDay = date.getUTCDay() === 0 ? 7 : date.getUTCDay();
  return formatDateUTC(addDays(date, -(isoDay - 1)));
}

function startOfMonth(dateString) {
  const date = parseDateUTC(dateString);
  return formatDateUTC(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)));
}

function startOfYear(dateString) {
  const date = parseDateUTC(dateString);
  return formatDateUTC(new Date(Date.UTC(date.getUTCFullYear(), 0, 1)));
}

function isoWeekNumber(dateString) {
  const date = parseDateUTC(dateString);
  const thursday = addDays(date, 3 - ((date.getUTCDay() + 6) % 7));
  const firstThursday = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4));
  const offset = (firstThursday.getUTCDay() + 6) % 7;
  const week1Thursday = addDays(firstThursday, 3 - offset);
  const diffDays = Math.round((thursday.getTime() - week1Thursday.getTime()) / 86_400_000);
  return 1 + Math.floor(diffDays / 7);
}

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function computeRange(total, series, todayDate, days) {
  const today = parseDateUTC(todayDate);
  const cutoffDate = formatDateUTC(addDays(today, -days));
  return computeCalendarRange(total, series, cutoffDate);
}

function computeCalendarRange(total, series, periodStartDate) {
  const entries = Object.entries(series).sort(([a], [b]) => a.localeCompare(b));

  if (entries.length === 0) return { value: 0, partial: true };

  const baseline = pickBaseline(entries, periodStartDate);
  if (!baseline) return { value: 0, partial: true };

  return {
    value: Math.max(0, Math.floor(total) - Math.floor(baseline.value)),
    partial: baseline.partial,
  };
}

function buildPeriods(todayDate) {
  const today = parseDateUTC(todayDate);
  const year = today.getUTCFullYear();

  const weekStart = startOfIsoWeek(todayDate);
  const weekEnd = formatDateUTC(addDays(parseDateUTC(weekStart), 6));
  const monthStart = startOfMonth(todayDate);
  const monthEnd = formatDateUTC(new Date(Date.UTC(year, today.getUTCMonth() + 1, 0)));
  const yearStart = startOfYear(todayDate);
  const yearEnd = formatDateUTC(new Date(Date.UTC(year, 11, 31)));

  return {
    day: { start: todayDate, end: todayDate, label: todayDate },
    week: {
      start: weekStart,
      end: weekEnd,
      label: `${year}-W${String(isoWeekNumber(todayDate)).padStart(2, "0")}`,
    },
    month: {
      start: monthStart,
      end: monthEnd,
      label: `${MONTH_NAMES[today.getUTCMonth()]} ${year}`,
    },
    year: { start: yearStart, end: yearEnd, label: String(year) },
  };
}

function computeStats(total, series, todayDate) {
  const day = computeCalendarRange(total, series, formatDateUTC(addDays(parseDateUTC(todayDate), -1)));
  const week = computeCalendarRange(total, series, startOfIsoWeek(todayDate));
  const month = computeCalendarRange(total, series, startOfMonth(todayDate));
  const year = computeCalendarRange(total, series, startOfYear(todayDate));

  return {
    stats: {
      total: Math.floor(total),
      day: day.value,
      week: week.value,
      month: month.value,
      year: year.value,
    },
    partial: {
      day: day.partial,
      week: week.partial,
      month: month.partial,
      year: year.partial,
    },
  };
}

function getSnapshotMeta(series, windowDays) {
  const dates = Object.keys(series).sort();
  return {
    windowDays,
    count: dates.length,
    firstDate: dates.length > 0 ? dates[0] : null,
    lastDate: dates.length > 0 ? dates[dates.length - 1] : null,
    series,
  };
}

function buildPayload({
  owner,
  repo,
  visibility,
  generatedAt,
  total,
  todayDate,
  windowDays,
  series,
  hourlyEnabled,
}) {
  const normalizedSeries = sortSeries(normalizeSeries(series));
  const { stats, partial } = computeStats(total, normalizedSeries, todayDate);

  return {
    schemaVersion: "2",
    owner,
    repo,
    visibility,
    generatedAt,
    stats,
    partial,
    periods: buildPeriods(todayDate),
    snapshots: getSnapshotMeta(normalizedSeries, windowDays),
    profile: {
      defaultMode: hourlyEnabled ? "hourly" : "daily",
      hourlyEnabled,
    },
  };
}

function calendarRetentionDays(todayDate) {
  const today = parseDateUTC(todayDate);
  const start = parseDateUTC(startOfYear(todayDate));
  return Math.round((today.getTime() - start.getTime()) / 86_400_000) + 1;
}

module.exports = {
  formatDateUTC,
  mergeSnapshots,
  computeStats,
  buildPayload,
  normalizeSeries,
  computeCalendarRange,
  startOfIsoWeek,
  startOfMonth,
  startOfYear,
  isoWeekNumber,
  calendarRetentionDays,
};
