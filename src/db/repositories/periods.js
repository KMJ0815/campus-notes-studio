import { createAppError } from "../../lib/errors";
import { buildPeriodId, normalizeTimeInputValue, nowIso, sortPeriods } from "../../lib/utils";
import { getDb } from "../schema";

export async function loadPeriodDefinitions(termKey) {
  const db = await getDb();
  const periods = await db.getAllFromIndex("period_definitions", "byTermKey", termKey);
  return sortPeriods(
    periods.map((period) => ({
      ...period,
      startTime: normalizeTimeInputValue(period.startTime),
      endTime: normalizeTimeInputValue(period.endTime),
    })),
  );
}

export function normalizePeriodDrafts(termKey, periodsDraft, options = {}) {
  const { preserveExistingId = false } = options;
  return sortPeriods(
    periodsDraft.map((period) => {
      const periodNo = Number(period.periodNo);
      return {
        ...period,
        id: preserveExistingId && period.id ? period.id : buildPeriodId(termKey, periodNo),
        termKey,
        periodNo,
        isEnabled: Boolean(period.isEnabled),
        startTime: normalizeTimeInputValue(period.startTime),
        endTime: normalizeTimeInputValue(period.endTime),
        label: period.label?.trim() || `${periodNo}限`,
      };
    }),
  );
}

export function validateAndNormalizePeriodDrafts(termKey, periodsDraft, options = {}) {
  const sanitized = normalizePeriodDrafts(termKey, periodsDraft, options);

  if (sanitized.length === 0) {
    throw createAppError("INVALID_PERIOD", "コマ時間は 1 件以上必要です。");
  }
  if (!sanitized.some((period) => period.isEnabled)) {
    throw createAppError("INVALID_PERIOD", "有効なコマは 1 件以上必要です。");
  }

  if (sanitized.some((period) => !Number.isInteger(period.periodNo) || period.periodNo <= 0)) {
    throw createAppError("INVALID_PERIOD", "コマ番号は 1 以上の整数で入力してください。");
  }

  const periodNos = sanitized.map((period) => period.periodNo);
  if (new Set(periodNos).size !== periodNos.length) {
    throw createAppError("INVALID_PERIOD", "コマ番号が重複しています。");
  }

  const invalidTimePeriods = sanitized.filter(
    (period) => !period.startTime || !period.endTime || period.startTime >= period.endTime,
  );
  if (invalidTimePeriods.length > 0) {
    throw createAppError(
      "INVALID_PERIOD",
      `開始・終了時刻が不正なコマがあります。${invalidTimePeriods.map((period) => period.label || `${period.periodNo}限`).join("、")}`,
    );
  }

  return sanitized;
}

export async function termHasPeriodDefinitions(termKey, tx = null) {
  if (tx) {
    const periods = await tx.objectStore("period_definitions").index("byTermKey").getAll(termKey);
    return periods.length > 0;
  }
  const db = await getDb();
  const periods = await db.getAllFromIndex("period_definitions", "byTermKey", termKey);
  return periods.length > 0;
}

export async function savePeriodDefinitionsInTransaction(tx, termKey, periodsDraft) {
  const sanitized = validateAndNormalizePeriodDrafts(termKey, periodsDraft);

  const periodStore = tx.objectStore("period_definitions");
  const slotStore = tx.objectStore("slots");
  const subjectStore = tx.objectStore("subjects");

  const existing = await periodStore.index("byTermKey").getAll(termKey);
  const blockedPeriodNos = new Set();
  const blockingSubjects = new Map();

  const [termSlots, subjects] = await Promise.all([
    slotStore.index("byTermKey").getAll(termKey),
    subjectStore.getAll(),
  ]);
  const restoreSlotIds = new Set(
    subjects.flatMap((subject) => (Array.isArray(subject.restoreSlotIds) ? subject.restoreSlotIds : [])),
  );
  const protectedSlots = termSlots.filter((slot) => slot.activeSlotKey || restoreSlotIds.has(slot.id));
  const nextEnabledPeriodNos = new Set(sanitized.filter((period) => period.isEnabled).map((period) => period.periodNo));

  for (const slot of protectedSlots) {
    if (!nextEnabledPeriodNos.has(slot.periodNo)) {
      blockedPeriodNos.add(slot.periodNo);
      const subject = subjects.find((item) => item.id === slot.subjectId);
      if (!blockingSubjects.has(slot.periodNo)) {
        blockingSubjects.set(slot.periodNo, []);
      }
      if (subject) {
        const list = blockingSubjects.get(slot.periodNo);
        if (!list.includes(subject.name)) {
          list.push(subject.name);
        }
      }
    }
  }

  if (blockedPeriodNos.size > 0) {
    const details = [...blockedPeriodNos]
      .sort((a, b) => a - b)
      .map((periodNo) => `${periodNo}限: ${(blockingSubjects.get(periodNo) || []).join(" / ")}`)
      .join("、");
    throw createAppError("PERIOD_IN_USE", `使用中のコマは削除・無効化できません。${details}`);
  }

  const timestamp = nowIso();
  const existingById = new Map(existing.map((period) => [period.id, period]));

  for (const period of existing) {
    await periodStore.delete(period.id);
  }

  for (const period of sanitized) {
    const existingPeriod = existingById.get(period.id);
    await periodStore.put({
      ...existingPeriod,
      ...period,
      createdAt: existingPeriod?.createdAt || timestamp,
      updatedAt: timestamp,
    });
  }
}
