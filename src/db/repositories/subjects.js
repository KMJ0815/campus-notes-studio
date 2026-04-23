import { createAppError } from "../../lib/errors";
import { DAY_DEFS } from "../../lib/constants";
import { activeSlotKeyFor, isValidSubjectColor, nowIso, slotKey, sortSlots, uid } from "../../lib/utils";
import { getDb } from "../schema";

function buildConflictDescriptor(slot, subject, options = {}) {
  return {
    subjectId: subject?.id || slot.subjectId,
    subjectName: subject?.name || "別の授業",
    weekday: slot.weekday,
    periodNo: slot.periodNo,
    willBecomeSlotless: Boolean(options.willBecomeSlotless),
  };
}

async function getSubjectSlots(store, subjectId) {
  const slots = await store.index("bySubjectId").getAll(subjectId);
  return sortSlots(slots);
}

function activeRestoreSlotIds(slots) {
  return slots.filter((slot) => slot.activeSlotKey).map((slot) => slot.id);
}

export async function getSubject(subjectId) {
  const db = await getDb();
  return db.get("subjects", subjectId);
}

export async function getSubjectsByTerm(termKey) {
  const db = await getDb();
  return db.getAllFromIndex("subjects", "byTermKey", termKey);
}

export async function getSlotsByTerm(termKey) {
  const db = await getDb();
  return db.getAllFromIndex("slots", "byTermKey", termKey);
}

export async function getSlotsBySubject(subjectId) {
  const db = await getDb();
  const slots = await db.getAllFromIndex("slots", "bySubjectId", subjectId);
  return sortSlots(slots);
}

export async function saveSubject(subjectDraft, options = {}) {
  const { overwriteConflicts = false } = options;
  const subjectName = subjectDraft.name.trim();
  if (!subjectName) {
    throw createAppError("INVALID_SUBJECT", "授業名は必須です。");
  }
  if (!isValidSubjectColor(subjectDraft.color)) {
    throw createAppError("INVALID_SUBJECT_COLOR", "授業色は #RRGGBB 形式で入力してください。");
  }
  if (subjectDraft.isArchived) {
    throw createAppError("ARCHIVE_VIA_ACTION_REQUIRED", "アーカイブは専用の操作から実行してください。");
  }

  const db = await getDb();
  const tx = db.transaction(["subjects", "slots", "period_definitions", "settings"], "readwrite");
  const subjectStore = tx.objectStore("subjects");
  const slotStore = tx.objectStore("slots");

  const existingSubject = subjectDraft.id ? await subjectStore.get(subjectDraft.id) : null;
  if (subjectDraft.id && !existingSubject) {
    throw createAppError("STALE_DRAFT", "この授業は既に削除されています。授業一覧を更新してからやり直してください。");
  }
  if (subjectDraft.id && subjectDraft.baseUpdatedAt && existingSubject.updatedAt !== subjectDraft.baseUpdatedAt) {
    throw createAppError("STALE_UPDATE", "この授業は別の画面で更新されています。開き直してから保存してください。");
  }
  const subjectId = subjectDraft.id || uid();
  const existingSlots = await getSubjectSlots(slotStore, subjectId);
  const desiredSlotKeys = new Set(subjectDraft.selectedSlotKeys || []);
  const validWeekdays = new Set(DAY_DEFS.map((day) => day.key));
  const periodStore = tx.objectStore("period_definitions");
  const enabledPeriods = await periodStore.index("byTermKey").getAll(subjectDraft.termKey);
  const enabledPeriodNos = new Set(enabledPeriods.filter((period) => period.isEnabled).map((period) => period.periodNo));

  const conflictDescriptors = [];
  const activeConflicts = [];

  for (const desiredKey of desiredSlotKeys) {
    const [weekday, periodNoRaw] = desiredKey.split("-");
    const periodNo = Number(periodNoRaw);
    if (!validWeekdays.has(weekday) || !Number.isInteger(periodNo) || !enabledPeriodNos.has(periodNo)) {
      throw createAppError("INVALID_SLOT_SELECTION", "存在しない、または無効なコマは選択できません。");
    }
    const activeKey = activeSlotKeyFor(subjectDraft.termKey, weekday, periodNo);
    const conflictingSlot = await slotStore.index("byActiveSlotKey").get(activeKey);
    if (conflictingSlot && conflictingSlot.subjectId !== subjectId) {
      const conflictingSubject = await subjectStore.get(conflictingSlot.subjectId);
      conflictDescriptors.push(buildConflictDescriptor(conflictingSlot, conflictingSubject));
      activeConflicts.push(conflictingSlot);
    }
  }

  if (conflictDescriptors.length > 0 && !overwriteConflicts) {
    const conflictingSubjects = [...new Set(activeConflicts.map((slot) => slot.subjectId))];
    const subjectWillBecomeSlotless = new Map();

    for (const conflictingSubjectId of conflictingSubjects) {
      const subjectSlots = await getSubjectSlots(slotStore, conflictingSubjectId);
      const activeSlotCount = subjectSlots.filter((slot) => slot.activeSlotKey).length;
      const overwrittenCount = activeConflicts.filter((slot) => slot.subjectId === conflictingSubjectId).length;
      subjectWillBecomeSlotless.set(conflictingSubjectId, activeSlotCount - overwrittenCount <= 0);
    }

    throw createAppError("SLOT_CONFLICT", "別の授業が使用しているコマがあります。", {
      conflicts: conflictDescriptors.map((conflict) => ({
        ...conflict,
        willBecomeSlotless: subjectWillBecomeSlotless.get(conflict.subjectId) || false,
      })),
    });
  }

  const timestamp = nowIso();
  const baseSubject = {
    id: subjectId,
    termKey: subjectDraft.termKey,
    name: subjectName,
    teacherName: subjectDraft.teacherName.trim(),
    room: subjectDraft.room.trim(),
    color: subjectDraft.color,
    memo: subjectDraft.memo,
    createdAt: existingSubject?.createdAt || timestamp,
    updatedAt: timestamp,
  };

  await subjectStore.put({
    ...existingSubject,
    ...baseSubject,
    isArchived: false,
    restoreSlotIds: [],
  });

  for (const conflict of activeConflicts) {
    await slotStore.put({
      ...conflict,
      isArchived: true,
      activeSlotKey: undefined,
      updatedAt: timestamp,
    });
  }

  for (const slotRecord of existingSlots) {
    const key = slotKey(slotRecord.weekday, slotRecord.periodNo);
    if (desiredSlotKeys.has(key)) {
      await slotStore.put({
        ...slotRecord,
        isArchived: false,
        activeSlotKey: activeSlotKeyFor(subjectDraft.termKey, slotRecord.weekday, slotRecord.periodNo),
        updatedAt: timestamp,
      });
      desiredSlotKeys.delete(key);
    } else {
      await slotStore.put({
        ...slotRecord,
        isArchived: true,
        activeSlotKey: undefined,
        updatedAt: timestamp,
      });
    }
  }

  for (const desiredKey of desiredSlotKeys) {
    const [weekday, periodNoRaw] = desiredKey.split("-");
    const periodNo = Number(periodNoRaw);
    await slotStore.put({
      id: uid(),
      termKey: subjectDraft.termKey,
      subjectId,
      weekday,
      periodNo,
      roomOverride: "",
      isArchived: false,
      activeSlotKey: activeSlotKeyFor(subjectDraft.termKey, weekday, periodNo),
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }

  await tx.done;
  return getSubject(subjectId);
}

export async function archiveSubject(subjectId) {
  const db = await getDb();
  const tx = db.transaction(["subjects", "slots"], "readwrite");
  const subjectStore = tx.objectStore("subjects");
  const slotStore = tx.objectStore("slots");
  const subject = await subjectStore.get(subjectId);
  if (!subject) {
    throw createAppError("NOT_FOUND", "授業が見つかりませんでした。");
  }
  if (subject.isArchived) {
    throw createAppError("ALREADY_ARCHIVED_SUBJECT", "この授業は既にアーカイブされています。", {
      subject,
    });
  }

  const timestamp = nowIso();
  const slots = await getSubjectSlots(slotStore, subjectId);
  await subjectStore.put({
    ...subject,
    isArchived: true,
    restoreSlotIds: activeRestoreSlotIds(slots),
    updatedAt: timestamp,
  });
  for (const slot of slots) {
    if (!slot.activeSlotKey) continue;
    await slotStore.put({
      ...slot,
      isArchived: true,
      activeSlotKey: undefined,
      updatedAt: timestamp,
    });
  }
  await tx.done;
  return getSubject(subjectId);
}

export async function restoreSubject(subjectId) {
  const db = await getDb();
  const tx = db.transaction(["subjects", "slots", "period_definitions"], "readwrite");
  const subjectStore = tx.objectStore("subjects");
  const slotStore = tx.objectStore("slots");
  const periodStore = tx.objectStore("period_definitions");
  const subject = await subjectStore.get(subjectId);
  if (!subject) {
    throw createAppError("NOT_FOUND", "授業が見つかりませんでした。");
  }
  if (!subject.isArchived) {
    throw createAppError("ALREADY_ACTIVE_SUBJECT", "この授業は既に復元されています。", {
      subject,
    });
  }

  const slots = await getSubjectSlots(slotStore, subjectId);
  const restoreSlotIds = new Set(subject.restoreSlotIds || []);
  const restoreSlots = slots.filter((slot) => restoreSlotIds.has(slot.id));
  const conflicts = [];

  for (const slot of restoreSlots) {
    const period = await periodStore.index("byTermPeriod").get([slot.termKey, slot.periodNo]);
    if (!period || !period.isEnabled) {
      throw createAppError("RESTORE_PERIOD_DISABLED", "復元先のコマ定義が削除または無効化されています。");
    }
    const activeKey = activeSlotKeyFor(slot.termKey, slot.weekday, slot.periodNo);
    const existing = await slotStore.index("byActiveSlotKey").get(activeKey);
    if (existing && existing.subjectId !== subjectId) {
      const conflictingSubject = await subjectStore.get(existing.subjectId);
      conflicts.push(buildConflictDescriptor(existing, conflictingSubject));
    }
  }

  if (conflicts.length > 0) {
    throw createAppError("RESTORE_CONFLICT", "復元先の時間割に競合があります。", {
      conflicts,
    });
  }

  const timestamp = nowIso();
  await subjectStore.put({ ...subject, isArchived: false, restoreSlotIds: [], updatedAt: timestamp });
  for (const slot of restoreSlots) {
    await slotStore.put({
      ...slot,
      isArchived: false,
      activeSlotKey: activeSlotKeyFor(slot.termKey, slot.weekday, slot.periodNo),
      updatedAt: timestamp,
    });
  }
  await tx.done;
  return {
    restoredSlotCount: restoreSlots.length,
    restoredSlots: restoreSlots.map((slot) => ({
      ...slot,
      isArchived: false,
      activeSlotKey: activeSlotKeyFor(slot.termKey, slot.weekday, slot.periodNo),
      updatedAt: timestamp,
    })),
    subject: await getSubject(subjectId),
  };
}
