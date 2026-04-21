import { DAY_DEFS, DEFAULT_PERIOD_TEMPLATES } from "./constants";

export function uid() {
  return crypto.randomUUID();
}

export function nowIso() {
  return new Date().toISOString();
}

export function todayIso() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateOnlyParts(year, month, day) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function dateFromDateOnly(value) {
  return new Date(`${value}T12:00:00`);
}

export function isValidDateOnly(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export function normalizeDateOnlyInputValue(value) {
  if (!value) return "";
  if (isValidDateOnly(value)) return value;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return formatDateOnlyParts(parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate());
}

export function normalizeTimeInputValue(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  const matched = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!matched) return "";
  const hours = Number(matched[1]);
  const minutes = Number(matched[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return "";
  }
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function suggestedTermLabel(termKey) {
  const trimmed = (termKey || "").trim();
  if (!trimmed) return "";
  const matched = trimmed.match(/^(\d{4})-(spring|fall)$/i);
  if (!matched) return trimmed;
  const [, year, season] = matched;
  return `${year}年度 ${season.toLowerCase() === "spring" ? "春学期" : "秋学期"}`;
}

export function parseStructuredTermKey(termKey) {
  const trimmed = (termKey || "").trim();
  const matched = trimmed.match(/^(\d{4})-(spring|fall)$/i);
  if (!matched) return null;
  return {
    year: matched[1],
    season: matched[2].toLowerCase(),
  };
}

export function isValidStructuredTermKey(termKey) {
  return Boolean(parseStructuredTermKey(termKey));
}

export function buildStructuredTermKey(year, season) {
  const normalizedYear = String(year || "").trim();
  const normalizedSeason = String(season || "").trim().toLowerCase();
  if (!/^\d{4}$/.test(normalizedYear)) return "";
  if (!["spring", "fall"].includes(normalizedSeason)) return "";
  return `${normalizedYear}-${normalizedSeason}`;
}

export function isValidSubjectColor(value) {
  return /^#[0-9a-fA-F]{6}$/.test((value || "").trim());
}

export function normalizeSubjectColorInput(value, fallback = "#4f46e5") {
  const trimmed = (value || "").trim();
  if (!isValidSubjectColor(trimmed)) return fallback;
  return trimmed.toLowerCase();
}

function parseDateValue(value) {
  if (!value) return null;
  if (isValidDateOnly(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatDate(iso) {
  if (!iso) return "-";
  const date = parseDateValue(iso);
  if (!date) return iso;
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatShortDate(iso) {
  if (!iso) return "-";
  const date = parseDateValue(iso);
  if (!date) return iso;
  return new Intl.DateTimeFormat("ja-JP", {
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function weekdayKeyForToday() {
  return weekdayKeyFromDate(todayIso());
}

export function weekdayKeyFromDate(isoDate) {
  if (!isoDate) return null;
  const date = dateFromDateOnly(isoDate);
  if (Number.isNaN(date.getTime())) return null;
  const map = [null, "mon", "tue", "wed", "thu", "fri", "sat"];
  return map[date.getDay()] ?? null;
}

export function nextLectureDateForSlots(slots = [], baseDate = todayIso()) {
  const normalizedBaseDate = normalizeDateOnlyInputValue(baseDate) || todayIso();
  const activeWeekdays = [...new Set(slots.filter((slot) => slot?.activeSlotKey).map((slot) => slot.weekday))];
  if (activeWeekdays.length === 0) {
    return normalizedBaseDate;
  }

  const baseWeekday = weekdayKeyFromDate(normalizedBaseDate);
  if (baseWeekday && activeWeekdays.includes(baseWeekday)) {
    return normalizedBaseDate;
  }

  const weekdayToIndex = {
    mon: 1,
    tue: 2,
    wed: 3,
    thu: 4,
    fri: 5,
    sat: 6,
  };
  const base = dateFromDateOnly(normalizedBaseDate);
  const baseDay = base.getDay();
  let bestOffset = Number.POSITIVE_INFINITY;

  for (const weekday of activeWeekdays) {
    const targetDay = weekdayToIndex[weekday];
    if (!targetDay) continue;
    const offset = ((targetDay - baseDay + 7) % 7) || 7;
    if (offset < bestOffset) {
      bestOffset = offset;
    }
  }

  if (!Number.isFinite(bestOffset)) {
    return normalizedBaseDate;
  }

  const nextDate = new Date(base);
  nextDate.setDate(base.getDate() + bestOffset);
  return formatDateOnlyParts(nextDate.getFullYear(), nextDate.getMonth() + 1, nextDate.getDate());
}

export function sortPeriods(periods = []) {
  return [...periods].sort((a, b) => a.periodNo - b.periodNo);
}

export function sortByUpdated(items = []) {
  return [...items].sort(
    (a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0),
  );
}

function collapseInlineWhitespace(value) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim();
}

function truncateText(value, maxLength) {
  const chars = Array.from(value);
  if (chars.length <= maxLength) return value;
  return `${chars.slice(0, maxLength).join("").trimEnd()}…`;
}

export function normalizeNoteTitle(title) {
  return collapseInlineWhitespace(title) || "無題ノート";
}

export function buildNotePreview(bodyText, { fallback = "本文なし", maxLength = 140 } = {}) {
  const normalized = collapseInlineWhitespace(bodyText);
  if (!normalized) return fallback;
  return truncateText(normalized, maxLength);
}

export function sortSlots(slots = []) {
  return [...slots].sort((a, b) => {
    const dayA = DAY_DEFS.findIndex((day) => day.key === a.weekday);
    const dayB = DAY_DEFS.findIndex((day) => day.key === b.weekday);
    if (dayA !== dayB) return dayA - dayB;
    return a.periodNo - b.periodNo;
  });
}

export function safeFileName(name = "file") {
  return name.replace(/[\\/:*?"<>|]+/g, "_");
}

export function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  const revoke = () => URL.revokeObjectURL(url);
  window.addEventListener("pagehide", revoke, { once: true });
  setTimeout(() => {
    window.removeEventListener("pagehide", revoke);
    revoke();
  }, 60000);
}

export function subjectColor(subject) {
  return normalizeSubjectColorInput(subject?.color);
}

export function slotKey(weekday, periodNo) {
  return `${weekday}-${periodNo}`;
}

export function activeSlotKeyFor(termKey, weekday, periodNo) {
  return `${termKey}:${weekday}:${periodNo}`;
}

export function buildPeriodId(termKey, periodNo) {
  return `period:${termKey}:${periodNo}`;
}

export function defaultPeriodsForTerm(termKey, timestamp = nowIso()) {
  return DEFAULT_PERIOD_TEMPLATES.map((period) => ({
    id: buildPeriodId(termKey, period.periodNo),
    termKey,
    ...period,
    createdAt: timestamp,
    updatedAt: timestamp,
  }));
}

export function isStandaloneMode() {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator?.standalone === true;
}

export function deepEqualJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function emptySubjectDraft(termKey) {
  return {
    id: null,
    termKey,
    name: "",
    teacherName: "",
    room: "",
    color: "#4f46e5",
    memo: "",
    isArchived: false,
    selectedSlotKeys: [],
  };
}

export function emptyNoteDraft(subjectId) {
  return {
    id: null,
    subjectId,
    title: "",
    bodyText: "",
    lectureDate: todayIso(),
  };
}

export function emptyAttendanceDraft(subjectId, lectureDate = todayIso()) {
  return {
    id: null,
    subjectId,
    lectureDate: normalizeDateOnlyInputValue(lectureDate) || todayIso(),
    timetableSlotId: "",
    status: "present",
    memo: "",
  };
}

export function emptyTodoDraft(subjectId, overrides = {}) {
  return {
    id: null,
    subjectId,
    title: "",
    memo: "",
    dueDate: "",
    status: "open",
    completedAt: null,
    baseUpdatedAt: null,
    ...overrides,
  };
}

export function emptyMaterialMetaDraft(meta = {}) {
  return {
    id: meta.id || null,
    note: meta.note || "",
    baseUpdatedAt: meta.updatedAt || null,
  };
}

export function buildSubjectSearchHaystack(subject) {
  return `${subject.name} ${subject.teacherName || ""} ${subject.room || ""} ${subject.memo || ""}`.toLowerCase();
}

export function dayLabelForKey(weekday) {
  return DAY_DEFS.find((day) => day.key === weekday)?.label || weekday;
}

export function getPeriodLabel(periods, periodNo) {
  const period = periods.find((item) => item.periodNo === periodNo);
  return period?.label || `${periodNo}限`;
}

export function formatSlotLabel(slot, periods) {
  const period = periods.find((item) => item.periodNo === slot.periodNo);
  return `${dayLabelForKey(slot.weekday)} ${period?.label || `${slot.periodNo}限`}${
    period?.startTime && period?.endTime ? ` (${period.startTime}-${period.endTime})` : ""
  }`;
}

export function sortTodos(items = []) {
  return [...items].sort((left, right) => {
    const leftDone = left.status === "done";
    const rightDone = right.status === "done";
    if (leftDone !== rightDone) return leftDone ? 1 : -1;

    if (!leftDone) {
      const leftDue = normalizeDateOnlyInputValue(left.dueDate);
      const rightDue = normalizeDateOnlyInputValue(right.dueDate);
      if (leftDue && !rightDue) return -1;
      if (!leftDue && rightDue) return 1;
      if (leftDue !== rightDue) return leftDue < rightDue ? -1 : 1;
    } else {
      const completedDiff =
        new Date(right.completedAt || right.updatedAt || right.createdAt || 0) -
        new Date(left.completedAt || left.updatedAt || left.createdAt || 0);
      if (completedDiff !== 0) return completedDiff;
    }

    return new Date(right.updatedAt || right.createdAt || 0) - new Date(left.updatedAt || left.createdAt || 0);
  });
}

export function fileExtension(name = "") {
  if (!name.includes(".")) return "";
  return name.split(".").pop().toLowerCase();
}
