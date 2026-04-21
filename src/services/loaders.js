import { weekdayKeyForToday } from "../lib/utils";
import { countAttendanceBySubject, loadSubjectAttendance } from "../db/repositories/attendance";
import { countMaterialsBySubject, loadSubjectMaterials } from "../db/repositories/materials";
import { countNotesBySubject, loadSubjectNotes } from "../db/repositories/notes";
import { loadPeriodDefinitions } from "../db/repositories/periods";
import {
  countDoneTodosBySubject,
  countOpenTodosBySubject,
  loadSubjectTodos,
} from "../db/repositories/todos";
import {
  getSlotsBySubject,
  getSlotsByTerm,
  getSubject,
  getSubjectsByTerm,
} from "../db/repositories/subjects";
import { getDb } from "../db/schema";
import { sortSlots, sortTodos } from "../lib/utils";

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

async function countTermRecords(index, range, activeSubjectIds) {
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

async function loadTodoRecordsByStatus(index, termKey, status, activeSubjectIds, subjectMap) {
  const todos = [];
  let cursor = await index.openCursor(IDBKeyRange.only([termKey, status]));
  while (cursor) {
    const todo = cursor.value;
    if (activeSubjectIds.has(todo.subjectId)) {
      todos.push({
        ...todo,
        subject: subjectMap.get(todo.subjectId) || null,
      });
    }
    cursor = await cursor.continue();
  }
  return sortTodos(todos);
}

async function loadOpenTodoCountsBySubject(index, termKey, activeSubjectIds) {
  const counts = new Map();
  let cursor = await index.openCursor(IDBKeyRange.only([termKey, "open"]));
  while (cursor) {
    const todo = cursor.value;
    if (activeSubjectIds.has(todo.subjectId)) {
      counts.set(todo.subjectId, (counts.get(todo.subjectId) || 0) + 1);
    }
    cursor = await cursor.continue();
  }
  return counts;
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
  const [notesCount, materialsCount, attendanceCount, recentNotes, openTodosCount] = await Promise.all([
    countTermRecords(db.transaction("notes").store.index("byTermKey"), IDBKeyRange.only(termKey), activeSubjectIds),
    countTermRecords(db.transaction("material_meta").store.index("byTermKey"), IDBKeyRange.only(termKey), activeSubjectIds),
    countTermRecords(db.transaction("attendance").store.index("byTermKey"), IDBKeyRange.only(termKey), activeSubjectIds),
    loadRecentActiveNotes(db.transaction("notes").store.index("byTermUpdated"), termKey, activeSubjectIds, subjectMap),
    countTermRecords(db.transaction("todo_items").store.index("byTermStatus"), IDBKeyRange.only([termKey, "open"]), activeSubjectIds),
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
    openTodosCount,
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
  const activeSubjectIds = new Set(subjects.filter((subject) => !subject.isArchived).map((subject) => subject.id));
  const db = await getDb();
  const openTodoCounts = await loadOpenTodoCountsBySubject(
    db.transaction("todo_items").store.index("byTermStatus"),
    termKey,
    activeSubjectIds,
  );
  return {
    periods,
    slots: slots.filter((slot) => slot.activeSlotKey).map((slot) => ({
      slot,
      subject: subjectMap.get(slot.subjectId) || null,
      openTodoCount: openTodoCounts.get(slot.subjectId) || 0,
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

  const [slots, periods, notesCount, materialsCount, attendanceCount, openTodosCount, doneTodosCount] = await Promise.all([
    getSlotsBySubject(subjectId),
    loadPeriodDefinitions(subject.termKey),
    countNotesBySubject(subjectId),
    countMaterialsBySubject(subjectId),
    countAttendanceBySubject(subjectId),
    countOpenTodosBySubject(subjectId),
    countDoneTodosBySubject(subjectId),
  ]);

  return {
    subject,
    periods,
    slots: slots.filter((slot) => slot.activeSlotKey),
    notesCount,
    materialsCount,
    attendanceCount,
    openTodosCount,
    doneTodosCount,
  };
}

export async function loadTodosPageData(termKey) {
  const subjects = await getSubjectsByTerm(termKey);
  const activeSubjects = subjects.filter((subject) => !subject.isArchived);
  const activeSubjectIds = new Set(activeSubjects.map((subject) => subject.id));
  const subjectMap = mapSubjects(subjects);
  const db = await getDb();
  const [openTodos, doneTodos] = await Promise.all([
    loadTodoRecordsByStatus(db.transaction("todo_items").store.index("byTermStatus"), termKey, "open", activeSubjectIds, subjectMap),
    loadTodoRecordsByStatus(db.transaction("todo_items").store.index("byTermStatus"), termKey, "done", activeSubjectIds, subjectMap),
  ]);

  return { openTodos, doneTodos };
}

export { loadSubjectNotes, loadSubjectMaterials, loadSubjectAttendance, loadSubjectTodos };
