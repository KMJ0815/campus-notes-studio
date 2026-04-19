import { ATTENDANCE_STATUS_OPTIONS } from "../../lib/constants";
import { createAppError } from "../../lib/errors";
import { dayLabelForKey, formatSlotLabel, isValidDateOnly, normalizeDateOnlyInputValue, nowIso, sortSlots, uid, weekdayKeyFromDate } from "../../lib/utils";
import { getDb } from "../schema";
import { loadPeriodDefinitions } from "./periods";

function fallbackSlotLabel(slot) {
  return `${dayLabelForKey(slot.weekday)} ${slot.periodNo}限`;
}

function historyAwareSlotLabel(slot, periods) {
  const baseLabel = formatSlotLabel(slot, periods);
  if (slot.activeSlotKey) return baseLabel;
  return `${baseLabel || fallbackSlotLabel(slot)} (履歴)`;
}

function buildSlotSnapshot(slot, periods) {
  const period = periods.find((item) => item.periodNo === slot.periodNo);
  return {
    weekday: slot.weekday,
    periodNo: slot.periodNo,
    label: period?.label || `${slot.periodNo}限`,
    startTime: period?.startTime || "",
    endTime: period?.endTime || "",
    isHistorical: !slot.activeSlotKey,
  };
}

function slotLabelFromSnapshot(snapshot) {
  if (!snapshot) return "";
  const timeLabel = snapshot.startTime && snapshot.endTime ? ` (${snapshot.startTime}-${snapshot.endTime})` : "";
  const baseLabel = `${dayLabelForKey(snapshot.weekday)} ${snapshot.label || `${snapshot.periodNo}限`}${timeLabel}`;
  return snapshot.isHistorical ? `${baseLabel} (履歴)` : baseLabel;
}

async function getSlotsForAttendance(slotStore, subjectId, lectureDate, options = {}) {
  const includeSlotIds = new Set(options.includeSlotIds || []);
  const weekday = weekdayKeyFromDate(normalizeDateOnlyInputValue(lectureDate));
  if (!weekday && includeSlotIds.size === 0) return [];
  const slots = await slotStore.index("bySubjectId").getAll(subjectId);
  const matched = slots.filter((slot) => {
    if (includeSlotIds.has(slot.id)) {
      return !weekday || slot.weekday === weekday;
    }
    return Boolean(weekday) && slot.weekday === weekday && slot.activeSlotKey;
  });
  return sortSlots(
    matched.filter((slot, index, list) => list.findIndex((candidate) => candidate.id === slot.id) === index),
  );
}

export async function loadSubjectAttendance(subjectId) {
  const db = await getDb();
  const [subject, records, slots] = await Promise.all([
    db.get("subjects", subjectId),
    db.getAllFromIndex("attendance", "bySubjectId", subjectId),
    db.getAllFromIndex("slots", "bySubjectId", subjectId),
  ]);
  const periods = subject ? await loadPeriodDefinitions(subject.termKey) : [];
  const slotMap = new Map(slots.map((slot) => [slot.id, slot]));

  return records
    .map((record) => {
      const linkedSlot = record.timetableSlotId ? slotMap.get(record.timetableSlotId) : null;
      const slotSnapshot = record.slotSnapshot || null;
      return {
        ...record,
        lectureDate: normalizeDateOnlyInputValue(record.lectureDate),
        timetableSlotId: record.timetableSlotId ?? "",
        linkedSlot,
        slotSnapshot,
        slotLabel: slotSnapshot
          ? slotLabelFromSnapshot(slotSnapshot)
          : linkedSlot
            ? historyAwareSlotLabel(linkedSlot, periods)
            : "",
      };
    })
    .sort((a, b) => {
      if (a.lectureDate !== b.lectureDate) {
        return a.lectureDate < b.lectureDate ? 1 : -1;
      }

      const aPeriod = a.slotSnapshot?.periodNo ?? a.linkedSlot?.periodNo ?? Number.MAX_SAFE_INTEGER;
      const bPeriod = b.slotSnapshot?.periodNo ?? b.linkedSlot?.periodNo ?? Number.MAX_SAFE_INTEGER;
      if (aPeriod !== bPeriod) {
        return aPeriod - bPeriod;
      }

      return new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0);
    })
    .map(({ linkedSlot, ...record }) => record);
}

export async function countAttendanceBySubject(subjectId) {
  const db = await getDb();
  return db.countFromIndex("attendance", "bySubjectId", subjectId);
}

export async function getAttendanceSlotOptions(subjectId, lectureDate, options = {}) {
  const db = await getDb();
  const subject = await db.get("subjects", subjectId);
  if (!subject) return [];
  const slotStore = db.transaction("slots").store;
  const slots = await getSlotsForAttendance(slotStore, subjectId, normalizeDateOnlyInputValue(lectureDate), options);
  const periods = await loadPeriodDefinitions(subject.termKey);
  return slots.map((slot) => ({
    id: slot.id,
    label: historyAwareSlotLabel(slot, periods),
    weekdayLabel: dayLabelForKey(slot.weekday),
    periodNo: slot.periodNo,
    isHistorical: !slot.activeSlotKey,
  }));
}

export async function saveAttendance(attendanceDraft) {
  const lectureDate = normalizeDateOnlyInputValue(attendanceDraft.lectureDate);
  if (!isValidDateOnly(lectureDate)) {
    throw createAppError("INVALID_ATTENDANCE_DATE", "講義日は必須です。正しい日付を入力してください。");
  }
  if (!ATTENDANCE_STATUS_OPTIONS.some((option) => option.value === attendanceDraft.status)) {
    throw createAppError("INVALID_ATTENDANCE_STATUS", "出席ステータスが不正です。");
  }

  const db = await getDb();
  const tx = db.transaction(["attendance", "slots", "subjects", "period_definitions"], "readwrite");
  const attendanceStore = tx.objectStore("attendance");
  const slotStore = tx.objectStore("slots");
  const subjectStore = tx.objectStore("subjects");
  const existingById = attendanceDraft.id ? await attendanceStore.get(attendanceDraft.id) : null;
  if (attendanceDraft.id && !existingById) {
    throw createAppError("STALE_DRAFT", "この出席記録は既に削除されています。");
  }
  if (attendanceDraft.id && attendanceDraft.baseUpdatedAt && existingById.updatedAt !== attendanceDraft.baseUpdatedAt) {
    throw createAppError("STALE_UPDATE", "この出席記録は別の画面で更新されています。開き直してから保存してください。");
  }
  const subject = await subjectStore.get(attendanceDraft.subjectId);
  if (!subject) {
    throw createAppError("NOT_FOUND", "授業が見つかりませんでした。");
  }
  const periodStore = tx.objectStore("period_definitions");
  const periods = await periodStore.index("byTermKey").getAll(subject.termKey);
  const existingLinkedSlot = existingById?.timetableSlotId ? await slotStore.get(existingById.timetableSlotId) : null;
  const existingLectureDate = normalizeDateOnlyInputValue(existingById?.lectureDate);
  const lectureDateChanged = Boolean(existingById && existingLectureDate && existingLectureDate !== lectureDate);
  const includeSlotIds = existingLinkedSlot && (!lectureDateChanged || existingLinkedSlot.activeSlotKey)
    ? [existingLinkedSlot.id]
    : [];

  const candidateSlots = await getSlotsForAttendance(slotStore, attendanceDraft.subjectId, lectureDate, {
    includeSlotIds,
  });
  let timetableSlotId = attendanceDraft.timetableSlotId || "";
  const isEditing = Boolean(existingById);
  const wasUnlinked = isEditing && !existingById.timetableSlotId;

  if (lectureDateChanged && existingLinkedSlot && !existingLinkedSlot.activeSlotKey && timetableSlotId === existingLinkedSlot.id) {
    timetableSlotId = "";
  }

  if (!timetableSlotId && candidateSlots.length === 1 && (!isEditing || !wasUnlinked)) {
    timetableSlotId = candidateSlots[0].id;
  } else if (!timetableSlotId && candidateSlots.length > 1 && !wasUnlinked) {
    throw createAppError("ATTENDANCE_SLOT_REQUIRED", "同じ日に複数コマがあります。該当コマを選択してください。", {
      slotOptions: candidateSlots.map((slot) => ({ id: slot.id, weekday: slot.weekday, periodNo: slot.periodNo })),
    });
  }

  if (timetableSlotId) {
    const matched = candidateSlots.find((slot) => slot.id === timetableSlotId);
    if (!matched) {
      throw createAppError("ATTENDANCE_SLOT_INVALID", "選択したコマはこの講義日と一致しません。");
    }
  }

  const existingByKey = await attendanceStore.index("bySubjectLectureSlot").get([
    attendanceDraft.subjectId,
    lectureDate,
    timetableSlotId,
  ]);
  const sameDateRecords = await attendanceStore.index("bySubjectDate").getAll([
    attendanceDraft.subjectId,
    lectureDate,
  ]);
  const otherSameDateUnlinkedRecord = sameDateRecords.find((record) => !record.timetableSlotId && record.id !== existingById?.id);
  const otherSameDateLinkedRecords = sameDateRecords.filter((record) => record.timetableSlotId && record.id !== existingById?.id);

  if (candidateSlots.length > 1) {
    if (timetableSlotId && otherSameDateUnlinkedRecord) {
      throw createAppError(
        "ATTENDANCE_DUPLICATE",
        "同じ日付にコマ未指定の記録があります。既存の記録を編集して該当コマへ変更してください。",
      );
    }
    if (!timetableSlotId && otherSameDateLinkedRecords.length > 0) {
      throw createAppError(
        "ATTENDANCE_DUPLICATE",
        "同じ日付にコマ紐付け済みの記録があります。既存の記録を編集するか、先に削除してください。",
      );
    }
  }

  if (candidateSlots.length <= 1 && sameDateRecords.length > 1) {
    const conflictingSameDateRecords = sameDateRecords.filter((record) => record.id !== existingById?.id);
    if (conflictingSameDateRecords.length > 0) {
      throw createAppError("ATTENDANCE_DUPLICATE", "その日・そのコマの記録は既にあります。既存記録を編集するか、先に削除してください。");
    }
  }

  const existingByDate = candidateSlots.length <= 1 ? sameDateRecords[0] || null : null;

  if (existingById && existingByKey && existingById.id !== existingByKey.id) {
    throw createAppError("ATTENDANCE_DUPLICATE", "その日・そのコマの記録は既にあります。既存記録を編集するか、先に削除してください。");
  }

  if (existingById && existingByDate && existingById.id !== existingByDate.id) {
    throw createAppError("ATTENDANCE_DUPLICATE", "その日・そのコマの記録は既にあります。既存記録を編集するか、先に削除してください。");
  }

  const existing = candidateSlots.length <= 1 ? existingById || existingByDate || existingByKey : existingByKey || existingById;
  const resolvedSlot = timetableSlotId
    ? candidateSlots.find((slot) => slot.id === timetableSlotId) || existingLinkedSlot || await slotStore.get(timetableSlotId)
    : null;
  const slotSnapshotUnchanged = Boolean(
    existing?.slotSnapshot
      && existing.lectureDate === lectureDate
      && (existing.timetableSlotId || "") === timetableSlotId
      && existing.termKey === subject.termKey,
  );
  const slotSnapshot = slotSnapshotUnchanged
    ? existing.slotSnapshot
    : resolvedSlot
      ? buildSlotSnapshot(resolvedSlot, periods)
      : null;

  await attendanceStore.put({
    id: existing?.id || attendanceDraft.id || uid(),
    subjectId: attendanceDraft.subjectId,
    termKey: subject.termKey,
    lectureDate,
    timetableSlotId,
    slotSnapshot,
    status: attendanceDraft.status,
    memo: attendanceDraft.memo,
    createdAt: existing?.createdAt || nowIso(),
    updatedAt: nowIso(),
  });
  await tx.done;
}

export async function deleteAttendance(attendanceId) {
  const db = await getDb();
  const existing = await db.get("attendance", attendanceId);
  if (!existing) {
    throw createAppError("STALE_DRAFT", "この出席記録は既に削除されています。");
  }
  await db.delete("attendance", attendanceId);
}
