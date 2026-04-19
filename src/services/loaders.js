import { weekdayKeyForToday } from "../lib/utils";
import { countAttendanceBySubject, loadSubjectAttendance } from "../db/repositories/attendance";
import { countMaterialsBySubject, loadSubjectMaterials } from "../db/repositories/materials";
import { countNotesBySubject, loadSubjectNotes } from "../db/repositories/notes";
import { loadPeriodDefinitions } from "../db/repositories/periods";
import {
  getSlotsBySubject,
  getSlotsByTerm,
  getSubject,
  getSubjectsByTerm,
} from "../db/repositories/subjects";
import { getDb } from "../db/schema";
import { sortSlots } from "../lib/utils";

function firstSortableSlot(subject) {
  return sortSlots(subject.slots || []).find((slot) => slot.activeSlotKey) || null;
}

function compareLibrarySubjects(left, right) {
  const leftSlot = firstSortableSlot(left);
  const rightSlot = firstSortableSlot(right);
  if (leftSlot && !rightSlot) return -1;
  if (!leftSlot && rightSlot) return 1;
  if (leftSlot && rightSlot) {
    const sorted = sortSlots([leftSlot, rightSlot]);
    if (sorted[0].id !== sorted[1].id) {
      return sorted[0].id === leftSlot.id ? -1 : 1;
    }
  }
  return left.name.localeCompare(right.name, "ja");
}

async function countTermRecords(index, termKey, activeSubjectIds) {
  const range = IDBKeyRange.only(termKey);
  let count = 0;
  let cursor = await index.openCursor(range);
  while (cursor) {
    if (activeSubjectIds.has(cursor.value.subjectId)) {
      count += 1;
    }
    cursor = await cursor.continue();
  }
  return count;
}

async function loadRecentActiveNotes(index, termKey, activeSubjectIds, subjectMap, limit = 6) {
  const range = IDBKeyRange.bound([termKey, ""], [termKey, "\uffff"]);
  const recentNotes = [];
  let cursor = await index.openCursor(range, "prev");
  while (cursor && recentNotes.length < limit) {
    const note = cursor.value;
    if (activeSubjectIds.has(note.subjectId)) {
      recentNotes.push({
        ...note,
        subject: subjectMap.get(note.subjectId) || null,
      });
    }
    cursor = await cursor.continue();
  }
  return recentNotes;
}

function mapSubjects(subjects) {
  return new Map(subjects.map((subject) => [subject.id, subject]));
}

export async function loadDashboardSummary(termKey) {
  const [subjects, periods, slots] = await Promise.all([
    getSubjectsByTerm(termKey),
    loadPeriodDefinitions(termKey),
    getSlotsByTerm(termKey),
  ]);

  const activeSubjects = subjects.filter((subject) => !subject.isArchived);
  const subjectMap = mapSubjects(subjects);
  const activeSubjectIds = new Set(activeSubjects.map((subject) => subject.id));
  const db = await getDb();
  const [notesCount, materialsCount, attendanceCount, recentNotes] = await Promise.all([
    countTermRecords(db.transaction("notes").store.index("byTermKey"), termKey, activeSubjectIds),
    countTermRecords(db.transaction("material_meta").store.index("byTermKey"), termKey, activeSubjectIds),
    countTermRecords(db.transaction("attendance").store.index("byTermKey"), termKey, activeSubjectIds),
    loadRecentActiveNotes(db.transaction("notes").store.index("byTermUpdated"), termKey, activeSubjectIds, subjectMap),
  ]);

  const todayKey = weekdayKeyForToday();
  const todayClasses = slots
    .filter((slot) => slot.termKey === termKey && slot.activeSlotKey && slot.weekday === todayKey)
    .sort((a, b) => a.periodNo - b.periodNo)
    .map((slot) => ({
      slot,
      subject: subjectMap.get(slot.subjectId) || null,
      period: periods.find((period) => period.periodNo === slot.periodNo) || null,
    }))
    .filter((item) => item.subject && !item.subject.isArchived);

  return {
    activeSubjectsCount: activeSubjects.length,
    notesCount,
    materialsCount,
    attendanceCount,
    todayClasses,
    recentNotes,
  };
}

export async function loadTimetable(termKey) {
  const [periods, subjects, slots] = await Promise.all([
    loadPeriodDefinitions(termKey),
    getSubjectsByTerm(termKey),
    getSlotsByTerm(termKey),
  ]);
  const subjectMap = mapSubjects(subjects);
  return {
    periods,
    slots: slots.filter((slot) => slot.activeSlotKey).map((slot) => ({
      slot,
      subject: subjectMap.get(slot.subjectId) || null,
    })),
  };
}

export async function loadLibrarySubjects(termKey) {
  const [subjects, slots, periods] = await Promise.all([
    getSubjectsByTerm(termKey),
    getSlotsByTerm(termKey),
    loadPeriodDefinitions(termKey),
  ]);

  const activeSlots = slots.filter((slot) => slot.activeSlotKey);
  const slotsBySubjectId = new Map();
  for (const slot of activeSlots) {
    if (!slotsBySubjectId.has(slot.subjectId)) {
      slotsBySubjectId.set(slot.subjectId, []);
    }
    slotsBySubjectId.get(slot.subjectId).push(slot);
  }

  const hydrated = subjects.map((subject) => ({
    ...subject,
    slots: sortSlots(slotsBySubjectId.get(subject.id) || []),
  }));

  return {
    periods,
    activeSubjects: hydrated.filter((subject) => !subject.isArchived).sort(compareLibrarySubjects),
    archivedSubjects: hydrated.filter((subject) => subject.isArchived).sort((a, b) => a.name.localeCompare(b.name, "ja")),
  };
}

export async function loadSubjectHeader(subjectId) {
  const subject = await getSubject(subjectId);
  if (!subject) return null;

  const [slots, periods, notesCount, materialsCount, attendanceCount] = await Promise.all([
    getSlotsBySubject(subjectId),
    loadPeriodDefinitions(subject.termKey),
    countNotesBySubject(subjectId),
    countMaterialsBySubject(subjectId),
    countAttendanceBySubject(subjectId),
  ]);

  return {
    subject,
    periods,
    slots: slots.filter((slot) => slot.activeSlotKey),
    notesCount,
    materialsCount,
    attendanceCount,
  };
}

export { loadSubjectNotes, loadSubjectMaterials, loadSubjectAttendance };
