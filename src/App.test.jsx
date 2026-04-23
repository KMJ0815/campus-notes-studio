import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./app/usePwaStatus", () => ({
  usePwaStatus: () => ({
    updateAvailable: false,
    applyPwaUpdate: vi.fn(),
  }),
}));

vi.mock("./app/AppShell", () => ({
  AppShell: ({ children, onPageChange }) => (
    <div>
      <button type="button" onClick={() => onPageChange("dashboard")}>
        go-dashboard
      </button>
      <button type="button" onClick={() => onPageChange("timetable")}>
        go-timetable
      </button>
      <button type="button" onClick={() => onPageChange("library")}>
        go-library
      </button>
      <button type="button" onClick={() => onPageChange("todos")}>
        go-todos
      </button>
      {children}
    </div>
  ),
}));

vi.mock("./features/dashboard/DashboardPage", () => ({
  DashboardPage: ({ summary }) => (
    <div>
      <div>dashboard-loaded</div>
      <div>{`dashboard-stats-${summary?.activeSubjectsCount || 0}-${summary?.notesCount || 0}-${summary?.materialsCount || 0}-${summary?.attendanceCount || 0}-${summary?.openTodosCount || 0}`}</div>
      <div>{`dashboard-today-${summary?.todayClasses?.map((item) => item.subject?.id || "none").join(",") || "none"}`}</div>
      <div>{`dashboard-recent-notes-${summary?.recentNotes?.map((note) => note.id).join(",") || "none"}`}</div>
    </div>
  ),
}));

vi.mock("./features/timetable/TimetablePage", () => ({
  TimetablePage: ({ detailPanel, slotItems = [], onOpenSettings, onSelectSubject }) => (
    <div>
      <button type="button" onClick={onOpenSettings}>
        open-settings
      </button>
      <div>{`timetable-open-todo-counts-${slotItems.filter((item) => item.subject).map((item) => item.openTodoCount || 0).join(",") || "none"}`}</div>
      <div>{`timetable-open-todo-by-subject-${slotItems.filter((item) => item.subject).map((item) => `${item.subject.id}:${item.openTodoCount || 0}`).join(",") || "none"}`}</div>
      <div>{`timetable-subject-ids-${slotItems.filter((item) => item.subject).map((item) => item.subject.id).join(",") || "none"}`}</div>
      {slotItems.map((item) => (
        item.subject ? (
          <button key={item.slot.id} type="button" onClick={() => onSelectSubject(item.subject.id)}>
            select-{item.subject.id}
          </button>
        ) : null
      ))}
      {detailPanel}
    </div>
  ),
}));

vi.mock("./features/subjects/LibraryPage", () => ({
  LibraryPage: ({ activeSubjects = [], archivedSubjects = [], onArchiveSubject, onEditSubject, onRestoreSubject, onSelectSubject }) => {
    const safeActiveSubjects = Array.isArray(activeSubjects) ? activeSubjects : [];
    const safeArchivedSubjects = Array.isArray(archivedSubjects) ? archivedSubjects : [];

    return (
      <div>
        <div>{`library-active-${safeActiveSubjects.map((subject) => subject.id).join(",") || "none"}`}</div>
        <div>{`library-active-slots-${safeActiveSubjects.map((subject) => `${subject.id}:${(subject.slots || []).map((slot) => `${slot.weekday}-${slot.periodNo}`).join("|") || "none"}`).join(",") || "none"}`}</div>
        <div>{`library-archived-${safeArchivedSubjects.map((subject) => subject.id).join(",") || "none"}`}</div>
        <div>{`library-archived-slots-${safeArchivedSubjects.map((subject) => `${subject.id}:${(subject.slots || []).map((slot) => `${slot.weekday}-${slot.periodNo}`).join("|") || "none"}`).join(",") || "none"}`}</div>
        {safeActiveSubjects.map((subject) => (
          <div key={subject.id}>
            <button type="button" onClick={() => onSelectSubject?.(subject.id)}>
              select-library-{subject.id}
            </button>
            <button type="button" onClick={() => onEditSubject?.(subject)}>
              edit-library-{subject.id}
            </button>
            <button type="button" onClick={() => onArchiveSubject?.(subject)}>
              archive-library-{subject.id}
            </button>
          </div>
        ))}
        {safeArchivedSubjects.map((subject) => (
        <button key={subject.id} type="button" onClick={() => onRestoreSubject(subject)}>
          restore-{subject.id}
        </button>
        ))}
      </div>
    );
  },
}));

vi.mock("./features/todos/TodosPage", () => ({
  TodosPage: ({ doneTodos = [], onOpenSubject, openTodos = [] }) => (
    <div>
      <div>{`todos-page-open-${openTodos.map((todo) => todo.id).join(",") || "none"}`}</div>
      <div>{`todos-page-done-${doneTodos.map((todo) => todo.id).join(",") || "none"}`}</div>
      <div>{`todos-page-subjects-${openTodos.map((todo) => todo.subject?.name || "none").join(",") || "none"}`}</div>
      {openTodos[0]?.subject ? (
        <button type="button" onClick={() => onOpenSubject(openTodos[0].subject.id)}>
          open-todo-subject
        </button>
      ) : null}
    </div>
  ),
}));

vi.mock("./features/subjects/SubjectDetailPanel", async () => {
  const React = await import("react");

  return {
    SubjectDetailPanel: ({
      attendance,
      detailTab,
      header,
      materials,
      notes,
      onArchiveSubject,
      onChangeTab,
      onCreateNote,
      onDeleteAttendance,
      onDeleteMaterial,
      onDeleteNote,
      onEditSubject,
      onUploadMaterials,
      onDeleteTodo,
      onSaveAttendance,
      onSaveTodo,
      tabLoading,
      todos,
    }) => {
      const [result, setResult] = React.useState("idle");
      const [attendanceResult, setAttendanceResult] = React.useState("idle");
      const [noteDeleteResult, setNoteDeleteResult] = React.useState("idle");
      const [materialUploadResult, setMaterialUploadResult] = React.useState("idle");
      const [materialDeleteResult, setMaterialDeleteResult] = React.useState("idle");
      const [attendanceDeleteResult, setAttendanceDeleteResult] = React.useState("idle");
      const [archiveResult, setArchiveResult] = React.useState("idle");
      const [todoDeleteResult, setTodoDeleteResult] = React.useState("idle");
      const itemsByTab = {
        notes,
        materials,
        attendance,
        todos,
      };
      const currentItems = itemsByTab[detailTab] || [];

      return (
        <div>
          <button
            type="button"
            onClick={() => {
              setResult("saving");
              onSaveTodo({
                id: "todo-1",
                subjectId: "subject-1",
                title: "再提出",
                memo: "",
                dueDate: "2026-04-21",
                status: "open",
                completedAt: null,
                baseUpdatedAt: "2026-04-19T10:00:00.000Z",
              })
                .then(() => setResult("resolved"))
                .catch(() => setResult("rejected"));
            }}
          >
            save-todo
          </button>
          <div>{`todo-save-${result}`}</div>
          <button
            type="button"
            onClick={() => {
              setAttendanceResult("saving");
              onSaveAttendance({
                id: "attendance-1",
                subjectId: header?.subject?.id || "subject-1",
                lectureDate: "2026-04-21",
                timetableSlotId: "",
                status: "present",
                memo: "",
                baseUpdatedAt: "2026-04-19T10:00:00.000Z",
              })
                .then(() => setAttendanceResult("resolved"))
                .catch(() => setAttendanceResult("rejected"));
            }}
          >
            save-attendance
          </button>
          <div>{`attendance-save-${attendanceResult}`}</div>
          <button
            type="button"
            onClick={() => {
              setAttendanceDeleteResult("deleting");
              Promise.resolve(onDeleteAttendance?.({
                id: "attendance-1",
                subjectId: header?.subject?.id || "subject-1",
                lectureDate: "2026-04-21",
                timetableSlotId: "",
                status: "present",
                memo: "",
                updatedAt: "2026-04-19T10:00:00.000Z",
              }))
                .then(() => setAttendanceDeleteResult("resolved"))
                .catch(() => setAttendanceDeleteResult("rejected"));
            }}
          >
            delete-attendance
          </button>
          <div>{`attendance-delete-${attendanceDeleteResult}`}</div>
          <button
            type="button"
            onClick={() => {
              setNoteDeleteResult("deleting");
              Promise.resolve(onDeleteNote?.({
                id: "note-1",
                subjectId: header?.subject?.id || "subject-1",
                title: "第1回",
                bodyText: "本文",
                lectureDate: "2026-04-21",
              }))
                .then(() => setNoteDeleteResult("resolved"))
                .catch(() => setNoteDeleteResult("rejected"));
            }}
          >
            delete-note
          </button>
          <div>{`note-delete-${noteDeleteResult}`}</div>
          <button
            type="button"
            onClick={() => {
              setMaterialUploadResult("saving");
              onUploadMaterials?.([
                new File(["material"], "slide.pdf", { type: "application/pdf" }),
              ])
                .then(() => setMaterialUploadResult("resolved"))
                .catch(() => setMaterialUploadResult("rejected"));
            }}
          >
            upload-materials
          </button>
          <div>{`material-upload-${materialUploadResult}`}</div>
          <button
            type="button"
            onClick={() => {
              setMaterialDeleteResult("deleting");
              Promise.resolve(onDeleteMaterial?.({
                id: "material-1",
                subjectId: header?.subject?.id || "subject-1",
                displayName: "slide.pdf",
                sizeBytes: 1024,
                mimeType: "application/pdf",
                fileExt: "pdf",
                note: "",
                createdAt: "2026-04-19T10:00:00.000Z",
                updatedAt: "2026-04-19T10:00:00.000Z",
              }))
                .then(() => setMaterialDeleteResult("resolved"))
                .catch(() => setMaterialDeleteResult("rejected"));
            }}
          >
            delete-material
          </button>
          <div>{`material-delete-${materialDeleteResult}`}</div>
          <button
            type="button"
            onClick={() => {
              setTodoDeleteResult("deleting");
              onDeleteTodo({
                id: "todo-1",
                subjectId: header?.subject?.id || "subject-1",
                title: "再提出",
                status: "open",
                dueDate: "2026-04-21",
                updatedAt: "2026-04-19T10:00:00.000Z",
              })
                .then((value) => setTodoDeleteResult(`resolved-${value?.status || "deleted"}`))
                .catch(() => setTodoDeleteResult("rejected"));
            }}
          >
            delete-todo
          </button>
          <div>{`todo-delete-${todoDeleteResult}`}</div>
          <button
            type="button"
            onClick={() => {
              setArchiveResult("archiving");
              onArchiveSubject?.(header?.subject)
                .then(() => setArchiveResult("resolved"))
                .catch(() => setArchiveResult("rejected"));
            }}
          >
            archive-subject
          </button>
          <div>{`archive-subject-${archiveResult}`}</div>
          <div>{`detail-loading-${tabLoading ? "yes" : "no"}`}</div>
          <div>{`detail-tab-${detailTab}`}</div>
          <div>{`detail-items-${currentItems.map((item) => item.id).join(",") || "none"}`}</div>
          <div>{`subject-header-${header?.subject?.name || "none"}`}</div>
          <div>{`subject-header-slots-${header?.slots?.map((slot) => `${slot.weekday}-${slot.periodNo}`).join(",") || "none"}`}</div>
          <div>{`subject-header-counts-${header?.notesCount || 0}-${header?.materialsCount || 0}-${header?.attendanceCount || 0}-${header?.openTodosCount || 0}-${header?.doneTodosCount || 0}`}</div>
          <button type="button" onClick={() => onEditSubject?.(header?.subject)}>
            edit-subject
          </button>
          <button type="button" onClick={() => onCreateNote?.(header?.subject?.id || "subject-1")}>
            create-note
          </button>
          <button type="button" onClick={() => onChangeTab("notes")}>
            tab-notes
          </button>
          <button type="button" onClick={() => onChangeTab("materials")}>
            tab-materials
          </button>
          <button type="button" onClick={() => onChangeTab("attendance")}>
            tab-attendance
          </button>
          <button type="button" onClick={() => onChangeTab("todos")}>
            tab-todos
          </button>
        </div>
      );
    },
  };
});

vi.mock("./features/subjects/SubjectFormModal", () => ({
  SubjectFormModal: ({ open, initialValue, onClose, onSave }) => (
    open ? (
      <div data-testid="subject-modal">
        <div>{initialValue?.baseUpdatedAt || ""}</div>
        <button
          type="button"
          onClick={() => {
            void onSave({
              ...initialValue,
              name: `${initialValue?.name || "授業"} 改`,
              termKey: initialValue?.termKey || "2026-spring",
              teacherName: initialValue?.teacherName || "",
              room: initialValue?.room || "",
              color: initialValue?.color || "#4f46e5",
              memo: initialValue?.memo || "",
              selectedSlotKeys: initialValue?.selectedSlotKeys || [],
            }).then(() => onClose()).catch(() => undefined);
          }}
        >
          save-subject
        </button>
        <button
          type="button"
          onClick={() => {
            void onSave({
              ...initialValue,
              name: `${initialValue?.name || "授業"} 改`,
              termKey: initialValue?.termKey || "2026-spring",
              teacherName: initialValue?.teacherName || "",
              room: initialValue?.room || "",
              color: initialValue?.color || "#4f46e5",
              memo: initialValue?.memo || "",
              selectedSlotKeys: initialValue?.selectedSlotKeys?.length ? initialValue.selectedSlotKeys : ["mon-1"],
            }).then(() => onClose()).catch(() => undefined);
          }}
        >
          save-subject-with-slot
        </button>
      </div>
    ) : null
  ),
}));

vi.mock("./features/notes/NoteFormModal", () => ({
  NoteFormModal: ({ open, subject, initialValue, onClose, onSave }) => (
    open ? (
      <div data-testid="note-modal">
        <div>{`note-subject-${subject?.name || "none"}`}</div>
        <div>{`note-lecture-date-${initialValue?.lectureDate || "none"}`}</div>
        <button
          type="button"
          onClick={() => {
            void onSave({
              id: initialValue?.id || null,
              baseUpdatedAt: initialValue?.baseUpdatedAt || null,
              subjectId: initialValue?.subjectId || subject?.id || "subject-1",
              title: initialValue?.title || "第1回",
              bodyText: initialValue?.bodyText || "本文",
              lectureDate: initialValue?.lectureDate || "2026-04-18",
            }).then(() => onClose()).catch(() => undefined);
          }}
        >
          save-note
        </button>
      </div>
    ) : null
  ),
}));

vi.mock("./features/materials/MaterialNoteModal", () => ({
  MaterialNoteModal: () => null,
}));

vi.mock("./features/settings/SettingsModal", () => ({
  SettingsModal: ({ initialSettings, initialTermEditorState, onImportApplied, onSave, open }) => (
    open ? (
      <div data-testid="settings-modal">
        <button type="button" onClick={() => onImportApplied({ warnings: [{ code: "MISSING_MATERIAL_FILE", materialId: "material-1" }] })}>
          import-applied
        </button>
        <button
          type="button"
          onClick={() => {
            void onSave({
              draft: {
                currentTermKey: initialSettings?.currentTermKey || "2026-spring",
                termLabel: initialSettings?.termLabel || "2026年度 春学期",
                exportIncludeFiles: initialSettings?.exportIncludeFiles ?? true,
                periods: initialTermEditorState?.periods || [],
                baseUpdatedAt: initialSettings?.updatedAt || "2026-04-20T09:00:00.000Z",
              },
              periodsLoadedForTermKey: initialTermEditorState?.termKey || initialSettings?.currentTermKey || "2026-spring",
            }).catch(() => undefined);
          }}
        >
          save-settings
        </button>
      </div>
    ) : null
  ),
}));

vi.mock("./db/schema", () => ({
  ensureSeedData: vi.fn(),
  deleteAppDb: vi.fn(),
  resetDbConnection: vi.fn(),
}));

vi.mock("./db/repositories/settings", () => ({
  getSettings: vi.fn(),
  loadTermEditorState: vi.fn(),
  saveSettingsBundle: vi.fn(),
}));

vi.mock("./db/repositories/periods", () => ({
  loadPeriodDefinitions: vi.fn(),
}));

vi.mock("./db/repositories/subjects", () => ({
  archiveSubject: vi.fn(),
  restoreSubject: vi.fn(),
  saveSubject: vi.fn(),
}));

vi.mock("./db/repositories/notes", () => ({
  deleteNote: vi.fn(),
  saveNote: vi.fn(),
}));

vi.mock("./db/repositories/attendance", () => ({
  deleteAttendance: vi.fn(),
  getAttendanceSlotOptions: vi.fn(),
  saveAttendance: vi.fn(),
}));

vi.mock("./db/repositories/todos", () => ({
  deleteTodo: vi.fn(),
  saveTodo: vi.fn(),
}));

vi.mock("./db/repositories/materials", () => ({
  deleteMaterial: vi.fn(),
  openMaterial: vi.fn(),
  saveMaterialsBatch: vi.fn(),
  updateMaterialNote: vi.fn(),
}));

vi.mock("./services/loaders", () => ({
  loadDashboardSummary: vi.fn(),
  loadLibrarySubjects: vi.fn(),
  loadSubjectAttendance: vi.fn(),
  loadSubjectHeader: vi.fn(),
  loadSubjectMaterials: vi.fn(),
  loadSubjectNotes: vi.fn(),
  loadSubjectTodos: vi.fn(),
  loadTodosPageData: vi.fn(),
  loadTimetable: vi.fn(),
}));

vi.mock("./services/exportService", () => ({
  downloadExportResult: vi.fn(),
  prepareExport: vi.fn(),
}));

vi.mock("./services/materialFileStore", () => ({
  clearMaterialFileStorage: vi.fn().mockResolvedValue(undefined),
}));

import App from "./App";
import { ensureSeedData, deleteAppDb, resetDbConnection } from "./db/schema";
import { deleteAttendance, saveAttendance } from "./db/repositories/attendance";
import { deleteNote, saveNote } from "./db/repositories/notes";
import { getSettings, loadTermEditorState, saveSettingsBundle } from "./db/repositories/settings";
import { archiveSubject, restoreSubject, saveSubject } from "./db/repositories/subjects";
import { deleteTodo, saveTodo } from "./db/repositories/todos";
import { deleteMaterial, saveMaterialsBatch, updateMaterialNote } from "./db/repositories/materials";
import {
  loadDashboardSummary,
  loadLibrarySubjects,
  loadSubjectAttendance,
  loadSubjectHeader,
  loadSubjectMaterials,
  loadSubjectNotes,
  loadSubjectTodos,
  loadTodosPageData,
  loadTimetable,
} from "./services/loaders";
import { clearMaterialFileStorage } from "./services/materialFileStore";

const settings = {
  currentTermKey: "2026-spring",
  termLabel: "2026年度 春学期",
  exportIncludeFiles: true,
};

beforeEach(() => {
  ensureSeedData.mockReset();
  deleteAppDb.mockReset();
  resetDbConnection.mockReset();
  getSettings.mockReset();
  loadTermEditorState.mockReset();
  saveSettingsBundle.mockReset();
  loadDashboardSummary.mockReset();
  loadLibrarySubjects.mockReset();
  loadTimetable.mockReset();
  archiveSubject.mockReset();
  restoreSubject.mockReset();
  saveSubject.mockReset();
  deleteAttendance.mockReset();
  saveAttendance.mockReset();
  deleteNote.mockReset();
  saveNote.mockReset();
  deleteMaterial.mockReset();
  deleteTodo.mockReset();
  saveMaterialsBatch.mockReset();
  updateMaterialNote.mockReset();
  loadSubjectAttendance.mockReset();
  loadSubjectHeader.mockReset();
  loadSubjectMaterials.mockReset();
  loadSubjectNotes.mockReset();
  loadSubjectTodos.mockReset();
  loadTodosPageData.mockReset();
  clearMaterialFileStorage.mockReset();
  saveTodo.mockReset();

  getSettings.mockResolvedValue(settings);
  saveSettingsBundle.mockResolvedValue(undefined);
  loadTermEditorState.mockResolvedValue({
    termKey: "2026-spring",
    label: "2026年度 春学期",
    periods: [],
    exists: true,
    isValidStructuredTermKey: true,
  });
  loadDashboardSummary.mockResolvedValue({
    activeSubjectsCount: 0,
    notesCount: 0,
    materialsCount: 0,
    attendanceCount: 0,
    openTodosCount: 0,
    todayClasses: [],
    recentNotes: [],
  });
  loadLibrarySubjects.mockResolvedValue({
    periods: [],
    activeSubjects: [],
    archivedSubjects: [],
  });
  loadTimetable.mockResolvedValue({
    periods: [],
    slots: [],
  });
  loadSubjectAttendance.mockResolvedValue([]);
  loadSubjectHeader.mockResolvedValue(null);
  loadSubjectMaterials.mockResolvedValue([]);
  loadSubjectNotes.mockResolvedValue([]);
  loadSubjectTodos.mockResolvedValue([]);
  loadTodosPageData.mockResolvedValue({
    openTodos: [],
    doneTodos: [],
  });
  clearMaterialFileStorage.mockResolvedValue(undefined);
  archiveSubject.mockImplementation(async (subjectId) => ({
    ...buildSubject(subjectId, "統計学"),
    isArchived: true,
    updatedAt: "2026-04-20T09:00:00.000Z",
  }));
  saveAttendance.mockImplementation(async (draft) => buildSavedAttendance(draft));
  deleteAttendance.mockResolvedValue(buildSavedAttendance());
  deleteNote.mockResolvedValue(buildSavedNote());
  saveNote.mockImplementation(async (draft) => buildSavedNote(draft));
  deleteMaterial.mockResolvedValue({ cleanupWarning: false, cleanupError: null });
  deleteTodo.mockResolvedValue(buildSavedTodo());
  saveMaterialsBatch.mockImplementation(async (subjectId, files = []) => (
    files.map((file, index) => buildSavedMaterial(subjectId, {
      id: `material-${index + 1}`,
      displayName: file.name,
      mimeType: file.type || "application/octet-stream",
      fileExt: file.name.split(".").pop() || "",
      sizeBytes: file.size,
    }))
  ));
  updateMaterialNote.mockImplementation(async (materialId, note) => buildSavedMaterial("subject-1", { id: materialId, note }));
  saveTodo.mockImplementation(async (draft) => buildSavedTodoMutation(draft));
  saveSubject.mockImplementation(async (draft) => ({
    ...buildSubject(draft.id || "subject-1", draft.name || "授業"),
    termKey: draft.termKey || "2026-spring",
    teacherName: draft.teacherName || "",
    room: draft.room || "",
    color: draft.color || "#4f46e5",
    memo: draft.memo || "",
    updatedAt: "2026-04-20T09:00:00.000Z",
  }));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function createDeferred() {
  let resolve;
  const promise = new Promise((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

function buildSubject(id, name, color = "#4f46e5") {
  return {
    id,
    termKey: "2026-spring",
    name,
    teacherName: "",
    room: "",
    color,
    memo: "",
    isArchived: false,
  };
}

function buildSavedTodo(draft = {}) {
  const updatedAt = draft.updatedAt || "2026-04-20T09:00:00.000Z";
  return {
    id: draft.id || "todo-1",
    subjectId: draft.subjectId || "subject-1",
    termKey: draft.termKey || "2026-spring",
    title: draft.title || "再提出",
    memo: draft.memo || "",
    dueDate: draft.dueDate || "",
    status: draft.status || "open",
    completedAt: draft.status === "done" ? draft.completedAt || updatedAt : null,
    createdAt: draft.createdAt || "2026-04-19T10:00:00.000Z",
    updatedAt,
  };
}

function buildSavedTodoMutation(draft = {}, previousStatus = null) {
  return {
    todo: buildSavedTodo(draft),
    previousStatus,
  };
}

function buildSavedNote(draft = {}) {
  return {
    id: draft.id || "note-1",
    subjectId: draft.subjectId || "subject-1",
    termKey: draft.termKey || "2026-spring",
    title: draft.title || "第1回",
    bodyText: draft.bodyText || "本文",
    lectureDate: draft.lectureDate || "2026-04-18",
    createdAt: draft.createdAt || "2026-04-19T10:00:00.000Z",
    updatedAt: draft.updatedAt || "2026-04-20T09:00:00.000Z",
  };
}

function buildSavedAttendance(draft = {}) {
  return {
    id: draft.id || "attendance-1",
    subjectId: draft.subjectId || "subject-1",
    termKey: draft.termKey || "2026-spring",
    lectureDate: draft.lectureDate || "2026-04-21",
    timetableSlotId: draft.timetableSlotId || "",
    slotSnapshot: draft.slotSnapshot || null,
    status: draft.status || "present",
    memo: draft.memo || "",
    createdAt: draft.createdAt || "2026-04-19T10:00:00.000Z",
    updatedAt: draft.updatedAt || "2026-04-20T09:00:00.000Z",
  };
}

function buildSavedMaterial(subjectId = "subject-1", overrides = {}) {
  return {
    id: overrides.id || "material-1",
    subjectId,
    termKey: overrides.termKey || "2026-spring",
    displayName: overrides.displayName || "slide.pdf",
    mimeType: overrides.mimeType || "application/pdf",
    fileExt: overrides.fileExt || "pdf",
    storageBackend: overrides.storageBackend || "indexeddb",
    sizeBytes: overrides.sizeBytes || 1024,
    note: overrides.note || "",
    createdAt: overrides.createdAt || "2026-04-19T10:00:00.000Z",
    updatedAt: overrides.updatedAt || "2026-04-20T09:00:00.000Z",
  };
}

describe("App subject action contracts", () => {
  it("rejects stale attendance saves so the detail panel can keep its draft", async () => {
    saveAttendance.mockRejectedValueOnce(Object.assign(new Error("stale"), { code: "STALE_UPDATE" }));
    loadTimetable.mockResolvedValue({
      periods: [],
      slots: [
        {
          slot: { id: "slot-1", weekday: "mon", periodNo: 1, activeSlotKey: "2026-spring:mon:1" },
          subject: buildSubject("subject-1", "統計学"),
        },
      ],
    });
    loadSubjectHeader.mockResolvedValue({
      subject: buildSubject("subject-1", "統計学"),
      periods: [],
      slots: [],
      notesCount: 0,
      materialsCount: 0,
      attendanceCount: 0,
      openTodosCount: 0,
      doneTodosCount: 0,
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("dashboard-loaded")).not.toBeNull();
    });

    fireEvent.click(screen.getByText("go-timetable"));
    fireEvent.click(screen.getByText("select-subject-1"));
    fireEvent.click(screen.getByText("tab-attendance"));
    fireEvent.click(screen.getByText("save-attendance"));

    await waitFor(() => {
      expect(screen.getByText("attendance-save-rejected")).not.toBeNull();
    });
  });

  it("does not reuse a pending attendance save across different subjects", async () => {
    const deferred = createDeferred();
    const subjectOne = buildSubject("subject-1", "統計学");
    const subjectTwo = buildSubject("subject-2", "解析学");

    saveAttendance.mockImplementation((draft) => {
      if (draft.subjectId === "subject-1") return deferred.promise;
      return Promise.resolve(undefined);
    });
    loadTimetable.mockResolvedValue({
      periods: [],
      slots: [
        {
          slot: { id: "slot-1", weekday: "mon", periodNo: 1, activeSlotKey: "2026-spring:mon:1" },
          subject: subjectOne,
        },
        {
          slot: { id: "slot-2", weekday: "tue", periodNo: 2, activeSlotKey: "2026-spring:tue:2" },
          subject: subjectTwo,
        },
      ],
    });
    loadSubjectHeader.mockImplementation((subjectId) => Promise.resolve({
      subject: subjectId === "subject-1" ? subjectOne : subjectTwo,
      periods: [],
      slots: [],
      notesCount: 0,
      materialsCount: 0,
      attendanceCount: 0,
      openTodosCount: 0,
      doneTodosCount: 0,
    }));

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("dashboard-loaded")).not.toBeNull();
    });

    fireEvent.click(screen.getByText("go-timetable"));
    fireEvent.click(screen.getByText("select-subject-1"));

    await waitFor(() => {
      expect(screen.getByText("subject-header-統計学")).not.toBeNull();
    });

    fireEvent.click(screen.getByText("save-attendance"));
    expect(saveAttendance).toHaveBeenCalledWith(
      expect.objectContaining({
        subjectId: "subject-1",
      }),
    );

    fireEvent.click(screen.getByText("select-subject-2"));
    await waitFor(() => {
      expect(screen.getByText("subject-header-解析学")).not.toBeNull();
    });

    fireEvent.click(screen.getByText("save-attendance"));

    await waitFor(() => {
      expect(saveAttendance).toHaveBeenCalledTimes(2);
      expect(saveAttendance).toHaveBeenNthCalledWith(2, expect.objectContaining({ subjectId: "subject-2" }));
    });

    deferred.resolve(undefined);
    await Promise.resolve();
    await Promise.resolve();
  });

  it("returns a cancelled status for todo deletes that the user aborts", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    loadTimetable.mockResolvedValue({
      periods: [],
      slots: [
        {
          slot: { id: "slot-1", weekday: "mon", periodNo: 1, activeSlotKey: "2026-spring:mon:1" },
          subject: buildSubject("subject-1", "統計学"),
        },
      ],
    });
    loadSubjectHeader.mockResolvedValue({
      subject: buildSubject("subject-1", "統計学"),
      periods: [],
      slots: [],
      notesCount: 0,
      materialsCount: 0,
      attendanceCount: 0,
      openTodosCount: 1,
      doneTodosCount: 0,
    });
    loadSubjectTodos
      .mockResolvedValueOnce([
        {
          id: "todo-1",
          subjectId: "subject-1",
          title: "再提出",
          memo: "",
          dueDate: "2026-04-21",
          status: "open",
          completedAt: null,
          updatedAt: "2026-04-19T10:00:00.000Z",
        },
      ])
      .mockRejectedValueOnce(new Error("refresh failed"));

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("dashboard-loaded")).not.toBeNull();
    });

    fireEvent.click(screen.getByText("go-timetable"));
    fireEvent.click(screen.getByText("select-subject-1"));
    fireEvent.click(screen.getByText("tab-todos"));
    fireEvent.click(screen.getByText("delete-todo"));

    await waitFor(() => {
      expect(screen.getByText("todo-delete-resolved-cancelled")).not.toBeNull();
    });

    expect(deleteTodo).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("returns a stale status for todo deletes that were already applied elsewhere", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    deleteTodo.mockRejectedValueOnce(Object.assign(new Error("stale"), { code: "STALE_DRAFT" }));
    loadTimetable.mockResolvedValue({
      periods: [],
      slots: [
        {
          slot: { id: "slot-1", weekday: "mon", periodNo: 1, activeSlotKey: "2026-spring:mon:1" },
          subject: buildSubject("subject-1", "統計学"),
        },
      ],
    });
    loadSubjectHeader.mockResolvedValue({
      subject: buildSubject("subject-1", "統計学"),
      periods: [],
      slots: [],
      notesCount: 0,
      materialsCount: 0,
      attendanceCount: 0,
      openTodosCount: 1,
      doneTodosCount: 0,
    });
    loadSubjectTodos.mockResolvedValue([
      {
        id: "todo-1",
        subjectId: "subject-1",
        title: "再提出",
        memo: "",
        dueDate: "2026-04-21",
        status: "open",
        completedAt: null,
        updatedAt: "2026-04-19T10:00:00.000Z",
      },
    ]);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("dashboard-loaded")).not.toBeNull();
    });

    fireEvent.click(screen.getByText("go-timetable"));
    fireEvent.click(screen.getByText("select-subject-1"));
    fireEvent.click(screen.getByText("tab-todos"));
    fireEvent.click(screen.getByText("delete-todo"));

    await waitFor(() => {
      expect(screen.getByText("todo-delete-resolved-stale")).not.toBeNull();
    });

    expect(loadTimetable.mock.calls.length).toBeGreaterThanOrEqual(2);

    confirmSpy.mockRestore();
  });

  it("keeps the subject modal open and refreshes collections when overwrite-confirm save turns stale", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const subject = buildSubject("subject-1", "統計学");
    const refreshedSubject = { ...subject, name: "統計学 改" };
    saveSubject
      .mockRejectedValueOnce(Object.assign(new Error("conflict"), {
        code: "SLOT_CONFLICT",
        data: {
          conflicts: [
            {
              weekday: "mon",
              periodNo: 1,
              subjectName: "既存授業",
              willBecomeSlotless: false,
            },
          ],
        },
      }))
      .mockRejectedValueOnce(Object.assign(new Error("stale"), { code: "STALE_UPDATE" }));
    loadTimetable.mockResolvedValue({
      periods: [],
      slots: [
        {
          slot: { id: "slot-1", weekday: "mon", periodNo: 1, activeSlotKey: "2026-spring:mon:1" },
          subject,
        },
      ],
    });
    loadSubjectHeader
      .mockResolvedValueOnce({
        subject,
        periods: [],
        slots: [],
        notesCount: 0,
        materialsCount: 0,
        attendanceCount: 0,
        openTodosCount: 0,
        doneTodosCount: 0,
      })
      .mockResolvedValueOnce({
        subject: refreshedSubject,
        periods: [],
        slots: [],
        notesCount: 0,
        materialsCount: 0,
        attendanceCount: 0,
        openTodosCount: 0,
        doneTodosCount: 0,
      });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("dashboard-loaded")).not.toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "go-timetable" }));
    fireEvent.click(screen.getByRole("button", { name: "select-subject-1" }));

    await waitFor(() => {
      expect(screen.getByText("subject-header-統計学")).not.toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "edit-subject" }));
    fireEvent.click(screen.getByRole("button", { name: "save-subject" }));

    await waitFor(() => {
      expect(saveSubject).toHaveBeenCalledTimes(2);
      expect(screen.getByTestId("subject-modal")).not.toBeNull();
      expect(loadDashboardSummary.mock.calls.length).toBeGreaterThan(1);
      expect(loadTimetable.mock.calls.length).toBeGreaterThan(1);
      expect(loadLibrarySubjects.mock.calls.length).toBeGreaterThan(1);
      expect(loadTodosPageData.mock.calls.length).toBeGreaterThan(1);
      expect(screen.getByText("授業を保存できませんでした。")).not.toBeNull();
      expect(screen.getByText("subject-header-統計学 改")).not.toBeNull();
    });

    confirmSpy.mockRestore();
  });

  it("keeps the subject modal open and shows the invalid-slot error on overwrite-confirm retry failures", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const subject = buildSubject("subject-1", "統計学");
    saveSubject
      .mockRejectedValueOnce(Object.assign(new Error("conflict"), {
        code: "SLOT_CONFLICT",
        data: {
          conflicts: [
            {
              weekday: "mon",
              periodNo: 1,
              subjectName: "既存授業",
              willBecomeSlotless: false,
            },
          ],
        },
      }))
      .mockRejectedValueOnce(Object.assign(new Error("invalid"), {
        code: "INVALID_SLOT_SELECTION",
        message: "同じ時間のコマを重複して選択できません。",
      }));
    loadTimetable.mockResolvedValue({
      periods: [],
      slots: [
        {
          slot: { id: "slot-1", weekday: "mon", periodNo: 1, activeSlotKey: "2026-spring:mon:1" },
          subject,
        },
      ],
    });
    loadSubjectHeader.mockResolvedValue({
      subject,
      periods: [],
      slots: [],
      notesCount: 0,
      materialsCount: 0,
      attendanceCount: 0,
      openTodosCount: 0,
      doneTodosCount: 0,
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("dashboard-loaded")).not.toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "go-timetable" }));
    fireEvent.click(screen.getByRole("button", { name: "select-subject-1" }));

    await waitFor(() => {
      expect(screen.getByText("subject-header-統計学")).not.toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "edit-subject" }));
    fireEvent.click(screen.getByRole("button", { name: "save-subject" }));

    await waitFor(() => {
      expect(saveSubject).toHaveBeenCalledTimes(2);
      expect(screen.getByTestId("subject-modal")).not.toBeNull();
      expect(screen.getByText("同じ時間のコマを重複して選択できません。")).not.toBeNull();
    });

    confirmSpy.mockRestore();
  });
});

describe("App bootstrap errors", () => {
  it("shows an initialization error screen when seed loading fails", async () => {
    ensureSeedData.mockRejectedValue(new Error("idb broken"));

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("アプリを初期化できませんでした。")).not.toBeNull();
      expect(screen.getByRole("button", { name: "再試行" })).not.toBeNull();
      expect(screen.getByRole("button", { name: "ローカルDBをリセット" })).not.toBeNull();
    });
  });

  it("retries bootstrap from the error screen", async () => {
    ensureSeedData
      .mockRejectedValueOnce(new Error("first failure"))
      .mockResolvedValueOnce(undefined);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("アプリを初期化できませんでした。")).not.toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "再試行" }));

    await waitFor(() => {
      expect(screen.getByText("dashboard-loaded")).not.toBeNull();
    });
  });

  it("resets the local database and retries bootstrap from the error screen", async () => {
    ensureSeedData
      .mockRejectedValueOnce(new Error("first failure"))
      .mockResolvedValueOnce(undefined);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("アプリを初期化できませんでした。")).not.toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "ローカルDBをリセット" }));

    await waitFor(() => {
      expect(clearMaterialFileStorage).toHaveBeenCalled();
      expect(deleteAppDb).toHaveBeenCalled();
      expect(resetDbConnection).toHaveBeenCalled();
      expect(screen.getByText("dashboard-loaded")).not.toBeNull();
    });
  });

  it("opens the restored slotless subject with the latest updatedAt", async () => {
    const restoredSubject = {
      id: "subject-1",
      termKey: "2026-spring",
      name: "復元済み授業",
      teacherName: "",
      room: "",
      color: "#4f46e5",
      memo: "",
      isArchived: false,
      updatedAt: "2026-04-19T10:00:00.000Z",
    };

    loadLibrarySubjects.mockResolvedValue({
      periods: [],
      activeSubjects: [],
      archivedSubjects: [
        {
          ...restoredSubject,
          isArchived: true,
          updatedAt: "2026-04-19T09:00:00.000Z",
          slots: [],
        },
      ],
    });
    restoreSubject.mockResolvedValue({
      restoredSlotCount: 0,
      subject: restoredSubject,
    });
    loadSubjectHeader.mockResolvedValue({
      subject: restoredSubject,
      periods: [],
      slots: [],
      notesCount: 0,
      materialsCount: 0,
      attendanceCount: 0,
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("dashboard-loaded")).not.toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "go-library" }));
    fireEvent.click(screen.getByRole("button", { name: "restore-subject-1" }));

    await waitFor(() => {
      expect(screen.getByTestId("subject-modal").textContent).toContain("2026-04-19T10:00:00.000Z");
    });
  });

  it("restores archived subjects into visible caches before deferred refresh completes", async () => {
    const slot = { id: "slot-1", termKey: "2026-spring", subjectId: "subject-1", weekday: "mon", periodNo: 1, activeSlotKey: "2026-spring:mon:1" };
    const archivedSubject = {
      ...buildSubject("subject-1", "統計学"),
      isArchived: true,
      updatedAt: "2026-04-19T09:00:00.000Z",
      slots: [slot],
    };
    const restoredSubject = {
      ...archivedSubject,
      isArchived: false,
      updatedAt: "2026-04-19T10:00:00.000Z",
    };

    loadDashboardSummary
      .mockResolvedValueOnce({
        activeSubjectsCount: 0,
        notesCount: 0,
        materialsCount: 0,
        attendanceCount: 0,
        openTodosCount: 0,
        todayClasses: [],
        recentNotes: [],
      })
      .mockRejectedValueOnce(new Error("refresh failed"));
    loadLibrarySubjects.mockResolvedValueOnce({
      periods: [{ periodNo: 1, label: "1限", startTime: "", endTime: "" }],
      activeSubjects: [],
      archivedSubjects: [archivedSubject],
    }).mockRejectedValueOnce(new Error("refresh failed"));
    loadTimetable
      .mockResolvedValueOnce({
        periods: [{ periodNo: 1, label: "1限", startTime: "", endTime: "" }],
        slots: [],
      })
      .mockRejectedValueOnce(new Error("refresh failed"));
    loadTodosPageData
      .mockResolvedValueOnce({ openTodos: [], doneTodos: [] })
      .mockRejectedValueOnce(new Error("refresh failed"));
    restoreSubject.mockResolvedValueOnce({
      restoredSlotCount: 1,
      restoredSlots: [slot],
      subject: restoredSubject,
    });
    loadSubjectHeader.mockResolvedValueOnce({
      subject: restoredSubject,
      periods: [{ periodNo: 1, label: "1限", startTime: "", endTime: "" }],
      slots: [slot],
      notesCount: 2,
      materialsCount: 1,
      attendanceCount: 1,
      openTodosCount: 1,
      doneTodosCount: 1,
    });
    loadSubjectNotes.mockResolvedValueOnce([
      {
        id: "note-1",
        subjectId: "subject-1",
        title: "第1回",
        bodyText: "本文",
        lectureDate: "2026-04-21",
        updatedAt: "2026-04-20T09:00:00.000Z",
      },
    ]);
    loadSubjectTodos.mockResolvedValueOnce([
      {
        id: "todo-1",
        subjectId: "subject-1",
        title: "再提出",
        memo: "",
        dueDate: "2026-04-21",
        status: "open",
        completedAt: null,
        updatedAt: "2026-04-20T09:00:00.000Z",
      },
      {
        id: "todo-2",
        subjectId: "subject-1",
        title: "提出済み",
        memo: "",
        dueDate: "",
        status: "done",
        completedAt: "2026-04-20T08:00:00.000Z",
        updatedAt: "2026-04-20T08:00:00.000Z",
      },
    ]);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("dashboard-loaded")).not.toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "go-library" }));
    fireEvent.click(screen.getByRole("button", { name: "restore-subject-1" }));

    await waitFor(() => {
      expect(screen.getByText("library-active-subject-1")).not.toBeNull();
      expect(screen.getByText("library-active-slots-subject-1:mon-1")).not.toBeNull();
      expect(screen.getByText("授業は復元済みですが、表示更新に失敗しました。")).not.toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "go-dashboard" }));
    expect(screen.getByText("dashboard-stats-1-2-1-1-1")).not.toBeNull();
    expect(screen.getByText("dashboard-recent-notes-note-1")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "go-timetable" }));
    expect(screen.getByText("timetable-subject-ids-subject-1")).not.toBeNull();
    expect(screen.getByText("timetable-open-todo-counts-1")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "go-todos" }));
    expect(screen.getByText("todos-page-open-todo-1")).not.toBeNull();
    expect(screen.getByText("todos-page-done-todo-2")).not.toBeNull();
  });

  it("rejects stale todo saves so the editor can stay open", async () => {
    saveTodo.mockRejectedValueOnce(Object.assign(new Error("stale"), { code: "STALE_UPDATE" }));

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("dashboard-loaded")).not.toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "go-timetable" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "save-todo" })).not.toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "save-todo" }));

    await waitFor(() => {
      expect(screen.getByText("todo-save-rejected")).not.toBeNull();
    });

    expect(loadTimetable.mock.calls.length).toBeGreaterThanOrEqual(2);

    expect(saveTodo).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "todo-1",
        subjectId: "subject-1",
        title: "再提出",
      }),
    );
  });

  it("keeps the stale todo save error visible even when stale resync fails", async () => {
    saveTodo.mockRejectedValueOnce(Object.assign(new Error("stale"), { code: "STALE_UPDATE" }));

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("dashboard-loaded")).not.toBeNull();
    });

    loadDashboardSummary.mockRejectedValueOnce(new Error("resync failed"));
    fireEvent.click(screen.getByRole("button", { name: "go-timetable" }));
    fireEvent.click(screen.getByRole("button", { name: "save-todo" }));

    await waitFor(() => {
      expect(screen.getByText("todo-save-rejected")).not.toBeNull();
      expect(screen.getByText("ToDo を保存できませんでした。")).not.toBeNull();
      expect(screen.getByText("ToDo の再同期に失敗しました。")).not.toBeNull();
    });
  });

  it("resolves todo saves and warns when post-save refresh fails", async () => {
    const subject = buildSubject("subject-1", "統計学");
    loadTimetable
      .mockResolvedValueOnce({
        periods: [],
        slots: [
          {
            slot: { id: "slot-1", weekday: "mon", periodNo: 1, activeSlotKey: "2026-spring:mon:1" },
            subject,
            openTodoCount: 0,
          },
        ],
      })
      .mockRejectedValueOnce(new Error("refresh failed"));

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("dashboard-loaded")).not.toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "go-timetable" }));
    fireEvent.click(screen.getByRole("button", { name: "save-todo" }));

    await waitFor(() => {
      expect(screen.getByText("todo-save-resolved")).not.toBeNull();
      expect(screen.getByText("timetable-open-todo-counts-1")).not.toBeNull();
      expect(screen.getByText("ToDo は保存済みですが、表示更新に失敗しました。")).not.toBeNull();
    });

    expect(saveTodo).toHaveBeenCalledTimes(1);
  });

  it("uses repository previousStatus when patching todo count deltas", async () => {
    const subject = buildSubject("subject-1", "統計学");
    loadTimetable
      .mockResolvedValueOnce({
        periods: [],
        slots: [
          {
            slot: { id: "slot-1", weekday: "mon", periodNo: 1, activeSlotKey: "2026-spring:mon:1" },
            subject,
            openTodoCount: 1,
          },
        ],
      })
      .mockRejectedValueOnce(new Error("refresh failed"));
    loadSubjectHeader
      .mockResolvedValueOnce({
        subject,
        periods: [],
        slots: [],
        notesCount: 0,
        materialsCount: 0,
        attendanceCount: 0,
        openTodosCount: 1,
        doneTodosCount: 1,
      })
      .mockRejectedValueOnce(new Error("refresh failed"));
    saveTodo.mockResolvedValueOnce(buildSavedTodoMutation({
      id: "todo-1",
      subjectId: "subject-1",
      status: "open",
      dueDate: "2026-04-21",
    }, "done"));

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("dashboard-loaded")).not.toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "go-timetable" }));
    fireEvent.click(screen.getByRole("button", { name: "select-subject-1" }));

    await waitFor(() => {
      expect(screen.getByText("subject-header-counts-0-0-0-1-1")).not.toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "save-todo" }));

    await waitFor(() => {
      expect(screen.getByText("todo-save-resolved")).not.toBeNull();
      expect(screen.getByText("subject-header-counts-0-0-0-2-0")).not.toBeNull();
      expect(screen.getByText("timetable-open-todo-counts-2")).not.toBeNull();
    });
  });

  it("resolves attendance saves and warns when post-save refresh fails", async () => {
    const subject = buildSubject("subject-1", "統計学");
    loadTimetable.mockResolvedValue({
      periods: [],
      slots: [
        {
          slot: { id: "slot-1", weekday: "mon", periodNo: 1, activeSlotKey: "2026-spring:mon:1" },
          subject,
          openTodoCount: 0,
        },
      ],
    });
    loadSubjectHeader.mockResolvedValue({
      subject,
      periods: [],
      slots: [],
      notesCount: 0,
      materialsCount: 0,
      attendanceCount: 0,
      openTodosCount: 0,
      doneTodosCount: 0,
    });
    loadDashboardSummary
      .mockResolvedValueOnce({
        activeSubjectsCount: 0,
        notesCount: 0,
        materialsCount: 0,
        attendanceCount: 0,
        openTodosCount: 0,
        todayClasses: [],
        recentNotes: [],
      })
      .mockRejectedValueOnce(new Error("refresh failed"));

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("dashboard-loaded")).not.toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "go-timetable" }));
    fireEvent.click(screen.getByRole("button", { name: "select-subject-1" }));
    fireEvent.click(screen.getByRole("button", { name: "tab-attendance" }));
    fireEvent.click(screen.getByRole("button", { name: "save-attendance" }));

    await waitFor(() => {
      expect(screen.getByText("attendance-save-resolved")).not.toBeNull();
      expect(screen.getByText("detail-items-attendance-1")).not.toBeNull();
      expect(screen.getByText("出席は保存済みですが、表示更新に失敗しました。")).not.toBeNull();
    });
  });

  it("resolves todo deletes and warns when post-delete refresh fails", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const subject = buildSubject("subject-1", "統計学");
    loadTimetable
      .mockResolvedValueOnce({
        periods: [],
        slots: [
          {
            slot: { id: "slot-1", weekday: "mon", periodNo: 1, activeSlotKey: "2026-spring:mon:1" },
            subject,
            openTodoCount: 1,
          },
        ],
      })
      .mockRejectedValueOnce(new Error("refresh failed"));
    loadSubjectHeader.mockResolvedValue({
      subject,
      periods: [],
      slots: [],
      notesCount: 0,
      materialsCount: 0,
      attendanceCount: 0,
      openTodosCount: 1,
      doneTodosCount: 0,
    });
    loadSubjectTodos.mockResolvedValue([
      {
        id: "todo-1",
        subjectId: "subject-1",
        title: "再提出",
        memo: "",
        dueDate: "2026-04-21",
        status: "open",
        completedAt: null,
        updatedAt: "2026-04-19T10:00:00.000Z",
      },
    ]);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("dashboard-loaded")).not.toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "go-timetable" }));
    fireEvent.click(screen.getByRole("button", { name: "select-subject-1" }));

    await waitFor(() => {
      expect(screen.getByText("subject-header-統計学")).not.toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "tab-todos" }));
    fireEvent.click(screen.getByRole("button", { name: "delete-todo" }));

    await waitFor(() => {
      expect(screen.getByText("todo-delete-resolved-deleted")).not.toBeNull();
      expect(screen.getByText("timetable-open-todo-counts-0")).not.toBeNull();
      expect(screen.getByText("ToDo は削除済みですが、表示更新に失敗しました。")).not.toBeNull();
    });

    confirmSpy.mockRestore();
  });

  it("uses the deleted todo returned by the repository instead of the caller status", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const subject = buildSubject("subject-1", "統計学");
    loadTimetable.mockResolvedValue({
      periods: [],
      slots: [
        {
          slot: { id: "slot-1", weekday: "mon", periodNo: 1, activeSlotKey: "2026-spring:mon:1" },
          subject,
          openTodoCount: 0,
        },
      ],
    });
    loadSubjectTodos.mockResolvedValueOnce([
      {
        id: "todo-1",
        subjectId: "subject-1",
        title: "提出済み",
        memo: "",
        dueDate: "",
        status: "done",
        completedAt: "2026-04-20T08:00:00.000Z",
        updatedAt: "2026-04-20T08:00:00.000Z",
      },
    ]);
    loadSubjectHeader
      .mockResolvedValueOnce({
        subject,
        periods: [],
        slots: [],
        notesCount: 0,
        materialsCount: 0,
        attendanceCount: 0,
        openTodosCount: 0,
        doneTodosCount: 1,
      })
      .mockResolvedValueOnce({
        subject,
        periods: [],
        slots: [],
        notesCount: 0,
        materialsCount: 0,
        attendanceCount: 0,
        openTodosCount: 0,
        doneTodosCount: 0,
      });
    deleteTodo.mockResolvedValueOnce(buildSavedTodo({
      id: "todo-1",
      subjectId: "subject-1",
      status: "done",
      completedAt: "2026-04-20T08:00:00.000Z",
    }));

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("dashboard-loaded")).not.toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "go-timetable" }));
    fireEvent.click(screen.getByRole("button", { name: "select-subject-1" }));

    await waitFor(() => {
      expect(screen.getByText("subject-header-counts-0-0-0-0-1")).not.toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "tab-todos" }));
    fireEvent.click(screen.getByRole("button", { name: "delete-todo" }));

    await waitFor(() => {
      expect(screen.getByText("todo-delete-resolved-deleted")).not.toBeNull();
      expect(screen.getByText("subject-header-counts-0-0-0-0-0")).not.toBeNull();
      expect(screen.getByText("timetable-open-todo-counts-0")).not.toBeNull();
    });

    confirmSpy.mockRestore();
  });

  it("closes the note modal and warns when post-save refresh fails", async () => {
    const subject = buildSubject("subject-1", "統計学");
    loadTimetable.mockResolvedValue({
      periods: [],
      slots: [
        {
          slot: { id: "slot-1", weekday: "mon", periodNo: 1, activeSlotKey: "2026-spring:mon:1" },
          subject,
        },
      ],
    });
    loadSubjectHeader.mockResolvedValue({
      subject,
      periods: [],
      slots: [],
      notesCount: 0,
      materialsCount: 0,
      attendanceCount: 0,
      openTodosCount: 0,
      doneTodosCount: 0,
    });
    loadDashboardSummary
      .mockResolvedValueOnce({
        activeSubjectsCount: 0,
        notesCount: 0,
        materialsCount: 0,
        attendanceCount: 0,
        openTodosCount: 0,
        todayClasses: [],
        recentNotes: [],
      })
      .mockRejectedValueOnce(new Error("refresh failed"));

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("dashboard-loaded")).not.toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "go-timetable" }));
    fireEvent.click(screen.getByRole("button", { name: "select-subject-1" }));

    await waitFor(() => {
      expect(screen.getByText("subject-header-統計学")).not.toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "create-note" }));

    await waitFor(() => {
      expect(screen.getByTestId("note-modal")).not.toBeNull();
      expect(screen.getByText(/note-lecture-date-\d{4}-\d{2}-\d{2}/)).not.toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "save-note" }));

    await waitFor(() => {
      expect(screen.queryByTestId("note-modal")).toBeNull();
      expect(screen.getByText("ノートは保存済みですが、表示更新に失敗しました。")).not.toBeNull();
    });

    expect(saveNote).toHaveBeenCalledTimes(1);
  });

  it("resolves material uploads and warns when post-save refresh fails", async () => {
    const subject = buildSubject("subject-1", "統計学");
    loadTimetable.mockResolvedValue({
      periods: [],
      slots: [
        {
          slot: { id: "slot-1", weekday: "mon", periodNo: 1, activeSlotKey: "2026-spring:mon:1" },
          subject,
          openTodoCount: 0,
        },
      ],
    });
    loadSubjectHeader.mockResolvedValue({
      subject,
      periods: [],
      slots: [],
      notesCount: 0,
      materialsCount: 0,
      attendanceCount: 0,
      openTodosCount: 0,
      doneTodosCount: 0,
    });
    loadDashboardSummary
      .mockResolvedValueOnce({
        activeSubjectsCount: 0,
        notesCount: 0,
        materialsCount: 0,
        attendanceCount: 0,
        openTodosCount: 0,
        todayClasses: [],
        recentNotes: [],
      })
      .mockRejectedValueOnce(new Error("refresh failed"));

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("dashboard-loaded")).not.toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "go-timetable" }));
    fireEvent.click(screen.getByRole("button", { name: "select-subject-1" }));
    fireEvent.click(screen.getByRole("button", { name: "tab-materials" }));
    fireEvent.click(screen.getByRole("button", { name: "upload-materials" }));

    await waitFor(() => {
      expect(screen.getByText("material-upload-resolved")).not.toBeNull();
      expect(screen.getByText("detail-items-material-1")).not.toBeNull();
      expect(screen.getByText("資料は保存済みですが、表示更新に失敗しました。")).not.toBeNull();
    });
  });

  it("resolves note deletes and warns when post-delete refresh fails", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const subject = buildSubject("subject-1", "統計学");
    loadTimetable.mockResolvedValue({
      periods: [],
      slots: [
        {
          slot: { id: "slot-1", weekday: "mon", periodNo: 1, activeSlotKey: "2026-spring:mon:1" },
          subject,
          openTodoCount: 0,
        },
      ],
    });
    loadSubjectHeader.mockResolvedValue({
      subject,
      periods: [],
      slots: [],
      notesCount: 1,
      materialsCount: 0,
      attendanceCount: 0,
      openTodosCount: 0,
      doneTodosCount: 0,
    });
    loadSubjectNotes.mockResolvedValue([
      {
        id: "note-1",
        subjectId: "subject-1",
        title: "第1回",
        bodyText: "本文",
        lectureDate: "2026-04-21",
        updatedAt: "2026-04-19T10:00:00.000Z",
      },
    ]);
    loadDashboardSummary
      .mockResolvedValueOnce({
        activeSubjectsCount: 0,
        notesCount: 1,
        materialsCount: 0,
        attendanceCount: 0,
        openTodosCount: 0,
        todayClasses: [],
        recentNotes: [],
      })
      .mockRejectedValueOnce(new Error("refresh failed"));

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("dashboard-loaded")).not.toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "go-timetable" }));
    fireEvent.click(screen.getByRole("button", { name: "select-subject-1" }));
    fireEvent.click(screen.getByRole("button", { name: "delete-note" }));

    await waitFor(() => {
      expect(screen.getByText("note-delete-resolved")).not.toBeNull();
      expect(screen.getByText("detail-items-none")).not.toBeNull();
      expect(screen.getByText("ノートは削除済みですが、表示更新に失敗しました。")).not.toBeNull();
    });

    confirmSpy.mockRestore();
  });

  it("closes the subject modal and warns when post-save refresh fails", async () => {
    const subject = buildSubject("subject-1", "統計学");
    loadTimetable
      .mockResolvedValueOnce({
        periods: [],
        slots: [
          {
            slot: { id: "slot-1", weekday: "mon", periodNo: 1, activeSlotKey: "2026-spring:mon:1" },
            subject,
          },
        ],
      })
      .mockRejectedValueOnce(new Error("refresh failed"));
    loadSubjectHeader.mockResolvedValue({
      subject,
      periods: [],
      slots: [],
      notesCount: 0,
      materialsCount: 0,
      attendanceCount: 0,
      openTodosCount: 0,
      doneTodosCount: 0,
    });
    saveSubject.mockResolvedValue({
      ...subject,
      updatedAt: "2026-04-21T09:00:00.000Z",
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("dashboard-loaded")).not.toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "go-timetable" }));
    fireEvent.click(screen.getByRole("button", { name: "select-subject-1" }));

    await waitFor(() => {
      expect(screen.getByText("subject-header-統計学")).not.toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "edit-subject" }));
    fireEvent.click(screen.getByRole("button", { name: "save-subject" }));

    await waitFor(() => {
      expect(screen.queryByTestId("subject-modal")).toBeNull();
      expect(screen.getByText("授業は保存済みですが、表示更新に失敗しました。")).not.toBeNull();
    });
  });

  it("resolves subject archive and warns when post-archive refresh fails", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const subject = buildSubject("subject-1", "統計学");
    const slot = { id: "slot-1", weekday: "mon", periodNo: 1, activeSlotKey: "2026-spring:mon:1" };
    loadDashboardSummary
      .mockResolvedValueOnce({
        activeSubjectsCount: 1,
        notesCount: 2,
        materialsCount: 1,
        attendanceCount: 1,
        openTodosCount: 1,
        todayClasses: [{ slot, subject, period: null }],
        recentNotes: [
          {
            id: "note-1",
            subjectId: "subject-1",
            title: "第1回",
            bodyText: "本文",
            lectureDate: "2026-04-21",
            updatedAt: "2026-04-20T09:00:00.000Z",
            subject,
          },
        ],
      })
      .mockRejectedValueOnce(new Error("refresh failed"));
    loadLibrarySubjects.mockResolvedValueOnce({
      periods: [],
      activeSubjects: [{ ...subject, slots: [slot] }],
      archivedSubjects: [],
    }).mockRejectedValueOnce(new Error("refresh failed"));
    loadTimetable
      .mockResolvedValueOnce({
        periods: [],
        slots: [
          {
            slot,
            subject,
            openTodoCount: 1,
          },
        ],
      })
      .mockRejectedValueOnce(new Error("refresh failed"));
    loadSubjectHeader.mockResolvedValue({
      subject,
      periods: [],
      slots: [slot],
      notesCount: 2,
      materialsCount: 1,
      attendanceCount: 1,
      openTodosCount: 1,
      doneTodosCount: 0,
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("dashboard-loaded")).not.toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "go-timetable" }));
    fireEvent.click(screen.getByRole("button", { name: "select-subject-1" }));

    await waitFor(() => {
      expect(screen.getByText("subject-header-統計学")).not.toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "archive-subject" }));

    await waitFor(() => {
      expect(screen.getByText("archive-subject-resolved")).not.toBeNull();
      expect(screen.getByText("subject-header-none")).not.toBeNull();
      expect(screen.getByText("timetable-subject-ids-none")).not.toBeNull();
      expect(screen.getByText("授業はアーカイブ済みですが、表示更新に失敗しました。")).not.toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "go-dashboard" }));
    expect(screen.getByText("dashboard-stats-0-0-0-0-0")).not.toBeNull();
    expect(screen.getByText("dashboard-today-none")).not.toBeNull();
    expect(screen.getByText("dashboard-recent-notes-none")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "go-library" }));
    expect(screen.getByText("library-active-none")).not.toBeNull();
    expect(screen.getByText("library-archived-subject-1")).not.toBeNull();
    expect(screen.getByText("library-archived-slots-subject-1:mon-1")).not.toBeNull();

    confirmSpy.mockRestore();
  });

  it("keeps subject header loading tied to the latest selected subject", async () => {
    const subjectOne = {
      id: "subject-1",
      termKey: "2026-spring",
      name: "統計学",
      teacherName: "",
      room: "",
      color: "#4f46e5",
      memo: "",
      isArchived: false,
    };
    const subjectTwo = {
      id: "subject-2",
      termKey: "2026-spring",
      name: "解析学",
      teacherName: "",
      room: "",
      color: "#0f766e",
      memo: "",
      isArchived: false,
    };
    const headerOne = createDeferred();
    const headerTwo = createDeferred();

    loadTimetable.mockResolvedValue({
      periods: [],
      slots: [
        {
          slot: { id: "slot-1", weekday: "mon", periodNo: 1, activeSlotKey: "2026-spring:mon:1" },
          subject: subjectOne,
        },
        {
          slot: { id: "slot-2", weekday: "tue", periodNo: 2, activeSlotKey: "2026-spring:tue:2" },
          subject: subjectTwo,
        },
      ],
    });
    loadSubjectHeader.mockImplementation((subjectId) => {
      if (subjectId === "subject-1") return headerOne.promise;
      if (subjectId === "subject-2") return headerTwo.promise;
      return Promise.resolve(null);
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("dashboard-loaded")).not.toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "go-timetable" }));
    fireEvent.click(screen.getByRole("button", { name: "select-subject-1" }));

    await waitFor(() => {
      expect(loadSubjectHeader).toHaveBeenCalledWith("subject-1");
    });

    fireEvent.click(screen.getByRole("button", { name: "select-subject-2" }));

    headerOne.resolve({
      subject: subjectOne,
      periods: [],
      slots: [],
      notesCount: 0,
      materialsCount: 0,
      attendanceCount: 0,
      openTodosCount: 0,
      doneTodosCount: 0,
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(loadSubjectHeader).toHaveBeenCalledWith("subject-2");

    headerTwo.resolve({
      subject: subjectTwo,
      periods: [],
      slots: [],
      notesCount: 0,
      materialsCount: 0,
      attendanceCount: 0,
      openTodosCount: 0,
      doneTodosCount: 0,
    });

    await waitFor(() => {
      expect(screen.getByText("detail-loading-no")).not.toBeNull();
      expect(screen.getByText("subject-header-解析学")).not.toBeNull();
    });
  });

  it("keeps tab loading tied to the latest selected subject tab request", async () => {
    const subjectOne = {
      id: "subject-1",
      termKey: "2026-spring",
      name: "統計学",
      teacherName: "",
      room: "",
      color: "#4f46e5",
      memo: "",
      isArchived: false,
    };
    const subjectTwo = {
      id: "subject-2",
      termKey: "2026-spring",
      name: "解析学",
      teacherName: "",
      room: "",
      color: "#0f766e",
      memo: "",
      isArchived: false,
    };
    const notesOne = createDeferred();
    const notesTwo = createDeferred();

    loadTimetable.mockResolvedValue({
      periods: [],
      slots: [
        {
          slot: { id: "slot-1", weekday: "mon", periodNo: 1, activeSlotKey: "2026-spring:mon:1" },
          subject: subjectOne,
        },
        {
          slot: { id: "slot-2", weekday: "tue", periodNo: 2, activeSlotKey: "2026-spring:tue:2" },
          subject: subjectTwo,
        },
      ],
    });
    loadSubjectHeader.mockImplementation((subjectId) =>
      Promise.resolve({
        subject: subjectId === "subject-1" ? subjectOne : subjectTwo,
        periods: [],
        slots: [],
        notesCount: 0,
        materialsCount: 0,
        attendanceCount: 0,
        openTodosCount: 0,
        doneTodosCount: 0,
      }));
    loadSubjectNotes.mockImplementation((subjectId) => {
      if (subjectId === "subject-1") return notesOne.promise;
      if (subjectId === "subject-2") return notesTwo.promise;
      return Promise.resolve([]);
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("dashboard-loaded")).not.toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "go-timetable" }));
    fireEvent.click(screen.getByRole("button", { name: "select-subject-1" }));

    await waitFor(() => {
      expect(loadSubjectNotes).toHaveBeenCalledWith("subject-1");
      expect(screen.getByText("detail-loading-yes")).not.toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "select-subject-2" }));

    await waitFor(() => {
      expect(loadSubjectNotes).toHaveBeenCalledWith("subject-2");
    });

    notesOne.resolve([]);
    await Promise.resolve();
    await Promise.resolve();

    expect(screen.getByText("detail-loading-yes")).not.toBeNull();

    notesTwo.resolve([]);

    await waitFor(() => {
      expect(screen.getByText("detail-loading-no")).not.toBeNull();
      expect(screen.getByText("subject-header-解析学")).not.toBeNull();
    });
  });

  it.each([
    {
      tab: "notes",
      openButton: "tab-notes",
      switchAwayButton: "tab-materials",
      loader: loadSubjectNotes,
      itemId: "note-fresh",
    },
    {
      tab: "materials",
      openButton: "tab-materials",
      switchAwayButton: "tab-notes",
      loader: loadSubjectMaterials,
      itemId: "material-fresh",
    },
    {
      tab: "attendance",
      openButton: "tab-attendance",
      switchAwayButton: "tab-notes",
      loader: loadSubjectAttendance,
      itemId: "attendance-fresh",
    },
    {
      tab: "todos",
      openButton: "tab-todos",
      switchAwayButton: "tab-notes",
      loader: loadSubjectTodos,
      itemId: "todo-fresh",
    },
  ])("keeps $tab cache fresh even when the tab is hidden mid-refresh", async ({ loader, itemId, openButton, switchAwayButton, tab }) => {
    const subjectOne = buildSubject("subject-1", "統計学");
    const deferred = createDeferred();

    loadTimetable.mockResolvedValue({
      periods: [],
      slots: [
        {
          slot: { id: "slot-1", weekday: "mon", periodNo: 1, activeSlotKey: "2026-spring:mon:1" },
          subject: subjectOne,
        },
      ],
    });
    loadSubjectHeader.mockResolvedValue({
      subject: subjectOne,
      periods: [],
      slots: [],
      notesCount: 0,
      materialsCount: 0,
      attendanceCount: 0,
      openTodosCount: 0,
      doneTodosCount: 0,
    });
    loader.mockImplementation((subjectId) => {
      if (subjectId === "subject-1") return deferred.promise;
      return Promise.resolve([]);
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("dashboard-loaded")).not.toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "go-timetable" }));
    fireEvent.click(screen.getByRole("button", { name: "select-subject-1" }));

    if (tab !== "notes") {
      fireEvent.click(screen.getByRole("button", { name: openButton }));
    }

    await waitFor(() => {
      expect(loader).toHaveBeenCalledWith("subject-1");
    });

    fireEvent.click(screen.getByRole("button", { name: switchAwayButton }));

    deferred.resolve([{ id: itemId }]);
    await Promise.resolve();
    await Promise.resolve();

    expect(loader).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: openButton }));

    await waitFor(() => {
      expect(screen.getByText(`detail-tab-${tab}`)).not.toBeNull();
      expect(screen.getByText(`detail-items-${itemId}`)).not.toBeNull();
    });

    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("rebootstraps the app after an import is applied", async () => {
    const subjectOne = buildSubject("subject-1", "統計学");

    loadTimetable.mockResolvedValue({
      periods: [],
      slots: [
        {
          slot: { id: "slot-1", weekday: "mon", periodNo: 1, activeSlotKey: "2026-spring:mon:1" },
          subject: subjectOne,
        },
      ],
    });
    loadSubjectHeader.mockResolvedValue({
      subject: subjectOne,
      periods: [],
      slots: [],
      notesCount: 0,
      materialsCount: 0,
      attendanceCount: 0,
      openTodosCount: 0,
      doneTodosCount: 0,
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("dashboard-loaded")).not.toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "go-timetable" }));
    fireEvent.click(screen.getByRole("button", { name: "select-subject-1" }));

    await waitFor(() => {
      expect(screen.getByText("subject-header-統計学")).not.toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "open-settings" }));

    await waitFor(() => {
      expect(screen.getByTestId("settings-modal")).not.toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "import-applied" }));

    await waitFor(() => {
      expect(screen.queryByTestId("settings-modal")).toBeNull();
      expect(screen.queryByText("subject-header-統計学")).toBeNull();
      expect(loadDashboardSummary.mock.calls.length).toBeGreaterThanOrEqual(2);
      expect(loadTimetable.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  it("loads standalone todo page data on bootstrap and refreshes it after todo saves", async () => {
    const subjectOne = buildSubject("subject-1", "統計学");

    loadTimetable.mockResolvedValue({
      periods: [],
      slots: [
        {
          slot: { id: "slot-1", weekday: "mon", periodNo: 1, activeSlotKey: "2026-spring:mon:1" },
          subject: subjectOne,
          openTodoCount: 1,
        },
      ],
    });
    loadSubjectHeader.mockResolvedValue({
      subject: subjectOne,
      periods: [],
      slots: [],
      notesCount: 0,
      materialsCount: 0,
      attendanceCount: 0,
      openTodosCount: 1,
      doneTodosCount: 0,
    });
    loadTodosPageData
      .mockResolvedValueOnce({
        openTodos: [{ id: "todo-initial", subject: subjectOne, subjectId: subjectOne.id, title: "初回課題" }],
        doneTodos: [],
      })
      .mockResolvedValue({
        openTodos: [{ id: "todo-fresh", subject: subjectOne, subjectId: subjectOne.id, title: "更新後の課題" }],
        doneTodos: [],
      });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("dashboard-loaded")).not.toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "go-todos" }));

    await waitFor(() => {
      expect(screen.getByText("todos-page-open-todo-initial")).not.toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "go-timetable" }));
    fireEvent.click(screen.getByRole("button", { name: "select-subject-1" }));
    fireEvent.click(screen.getByRole("button", { name: "save-todo" }));

    await waitFor(() => {
      expect(screen.getByText("todo-save-resolved")).not.toBeNull();
      expect(loadTodosPageData.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    fireEvent.click(screen.getByRole("button", { name: "go-todos" }));

    await waitFor(() => {
      expect(screen.getByText("todos-page-open-todo-fresh")).not.toBeNull();
    });
  });

  it("refreshes timetable todo indicators after todo saves succeed", async () => {
    const subjectOne = buildSubject("subject-1", "統計学");

    loadTimetable
      .mockResolvedValueOnce({
        periods: [],
        slots: [
          {
            slot: { id: "slot-1", weekday: "mon", periodNo: 1, activeSlotKey: "2026-spring:mon:1" },
            subject: subjectOne,
            openTodoCount: 0,
          },
        ],
      })
      .mockResolvedValue({
        periods: [],
        slots: [
          {
            slot: { id: "slot-1", weekday: "mon", periodNo: 1, activeSlotKey: "2026-spring:mon:1" },
            subject: subjectOne,
            openTodoCount: 1,
          },
        ],
      });
    loadSubjectHeader.mockResolvedValue({
      subject: subjectOne,
      periods: [],
      slots: [],
      notesCount: 0,
      materialsCount: 0,
      attendanceCount: 0,
      openTodosCount: 0,
      doneTodosCount: 0,
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("dashboard-loaded")).not.toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "go-timetable" }));
    fireEvent.click(screen.getByRole("button", { name: "select-subject-1" }));

    await waitFor(() => {
      expect(screen.getByText("timetable-open-todo-counts-0")).not.toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "save-todo" }));

    await waitFor(() => {
      expect(screen.getByText("todo-save-resolved")).not.toBeNull();
      expect(screen.getByText("timetable-open-todo-counts-1")).not.toBeNull();
    });
  });

  it("refreshes timetable todo indicators after todo deletes succeed", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const subjectOne = buildSubject("subject-1", "統計学");

    loadTimetable
      .mockResolvedValueOnce({
        periods: [],
        slots: [
          {
            slot: { id: "slot-1", weekday: "mon", periodNo: 1, activeSlotKey: "2026-spring:mon:1" },
            subject: subjectOne,
            openTodoCount: 1,
          },
        ],
      })
      .mockResolvedValue({
        periods: [],
        slots: [
          {
            slot: { id: "slot-1", weekday: "mon", periodNo: 1, activeSlotKey: "2026-spring:mon:1" },
            subject: subjectOne,
            openTodoCount: 0,
          },
        ],
      });
    loadSubjectHeader.mockResolvedValue({
      subject: subjectOne,
      periods: [],
      slots: [],
      notesCount: 0,
      materialsCount: 0,
      attendanceCount: 0,
      openTodosCount: 1,
      doneTodosCount: 0,
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("dashboard-loaded")).not.toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "go-timetable" }));
    fireEvent.click(screen.getByRole("button", { name: "select-subject-1" }));

    await waitFor(() => {
      expect(screen.getByText("timetable-open-todo-counts-1")).not.toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "delete-todo" }));

    await waitFor(() => {
      expect(screen.getByText("todo-delete-resolved-deleted")).not.toBeNull();
      expect(screen.getByText("timetable-open-todo-counts-0")).not.toBeNull();
    });

    confirmSpy.mockRestore();
  });

  it("refreshes standalone todo subject names after a subject rename", async () => {
    const subjectOld = buildSubject("subject-1", "統計学");
    const subjectNew = buildSubject("subject-1", "統計学 改");

    saveSubject.mockResolvedValue(subjectNew);
    loadTimetable.mockResolvedValue({
      periods: [],
      slots: [
        {
          slot: { id: "slot-1", weekday: "mon", periodNo: 1, activeSlotKey: "2026-spring:mon:1" },
          subject: subjectOld,
          openTodoCount: 1,
        },
      ],
    });
    loadLibrarySubjects.mockResolvedValue({
      periods: [],
      activeSubjects: [{ ...subjectNew, slots: [] }],
      archivedSubjects: [],
    });
    loadSubjectHeader
      .mockResolvedValueOnce({
        subject: subjectOld,
        periods: [],
        slots: [],
        notesCount: 0,
        materialsCount: 0,
        attendanceCount: 0,
        openTodosCount: 1,
        doneTodosCount: 0,
      })
      .mockResolvedValue({
        subject: subjectNew,
        periods: [],
        slots: [],
        notesCount: 0,
        materialsCount: 0,
        attendanceCount: 0,
        openTodosCount: 1,
        doneTodosCount: 0,
      });
    loadTodosPageData
      .mockResolvedValueOnce({
        openTodos: [{ id: "todo-1", subject: subjectOld, subjectId: subjectOld.id, title: "課題" }],
        doneTodos: [],
      })
      .mockResolvedValue({
        openTodos: [{ id: "todo-1", subject: subjectNew, subjectId: subjectNew.id, title: "課題" }],
        doneTodos: [],
      });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("dashboard-loaded")).not.toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "go-timetable" }));
    fireEvent.click(screen.getByRole("button", { name: "select-subject-1" }));

    await waitFor(() => {
      expect(screen.getByText("subject-header-統計学")).not.toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "edit-subject" }));
    fireEvent.click(screen.getByRole("button", { name: "save-subject" }));

    await waitFor(() => {
      expect(loadTodosPageData.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    fireEvent.click(screen.getByRole("button", { name: "go-todos" }));

    await waitFor(() => {
      expect(screen.getByText("todos-page-subjects-統計学 改")).not.toBeNull();
    });
  });

  it("does not let stale todo page subjects override fresher sources for note modals", async () => {
    const subjectFresh = buildSubject("subject-1", "統計学");
    const subjectStale = buildSubject("subject-1", "古い授業名");

    loadTimetable.mockResolvedValue({
      periods: [],
      slots: [
        {
          slot: { id: "slot-1", weekday: "mon", periodNo: 1, activeSlotKey: "2026-spring:mon:1" },
          subject: subjectFresh,
          openTodoCount: 1,
        },
      ],
    });
    loadSubjectHeader.mockResolvedValue({
      subject: subjectFresh,
      periods: [],
      slots: [],
      notesCount: 0,
      materialsCount: 0,
      attendanceCount: 0,
      openTodosCount: 1,
      doneTodosCount: 0,
    });
    loadTodosPageData.mockResolvedValue({
      openTodos: [{ id: "todo-1", subject: subjectStale, subjectId: subjectFresh.id, title: "課題" }],
      doneTodos: [],
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("dashboard-loaded")).not.toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "go-timetable" }));
    fireEvent.click(screen.getByRole("button", { name: "select-subject-1" }));
    fireEvent.click(screen.getByRole("button", { name: "create-note" }));

    await waitFor(() => {
      expect(screen.getByText("note-subject-統計学")).not.toBeNull();
    });
  });

  it("uses partial restore hydration even when one restore loader fails", async () => {
    const period = { periodNo: 1, label: "1限", startTime: "", endTime: "" };
    const slot = { id: "slot-1", termKey: "2026-spring", subjectId: "subject-1", weekday: "mon", periodNo: 1, activeSlotKey: "2026-spring:mon:1" };
    const archivedSubject = {
      ...buildSubject("subject-1", "統計学"),
      isArchived: true,
      updatedAt: "2026-04-19T09:00:00.000Z",
      slots: [slot],
    };
    const restoredSubject = {
      ...archivedSubject,
      isArchived: false,
      updatedAt: "2026-04-19T10:00:00.000Z",
    };

    loadDashboardSummary
      .mockResolvedValueOnce({
        activeSubjectsCount: 0,
        notesCount: 0,
        materialsCount: 0,
        attendanceCount: 0,
        openTodosCount: 0,
        todayClasses: [],
        recentNotes: [],
      })
      .mockRejectedValueOnce(new Error("refresh failed"));
    loadLibrarySubjects
      .mockResolvedValueOnce({
        periods: [period],
        activeSubjects: [],
        archivedSubjects: [archivedSubject],
      })
      .mockRejectedValueOnce(new Error("refresh failed"));
    loadTimetable
      .mockResolvedValueOnce({
        periods: [period],
        slots: [],
      })
      .mockRejectedValueOnce(new Error("refresh failed"));
    loadTodosPageData
      .mockResolvedValueOnce({ openTodos: [], doneTodos: [] })
      .mockRejectedValueOnce(new Error("refresh failed"));
    restoreSubject.mockResolvedValueOnce({
      restoredSlotCount: 1,
      restoredSlots: [slot],
      subject: restoredSubject,
    });
    loadSubjectHeader.mockRejectedValueOnce(new Error("header failed"));
    loadSubjectNotes.mockResolvedValueOnce([
      {
        id: "note-1",
        subjectId: "subject-1",
        title: "第1回",
        bodyText: "本文",
        lectureDate: "2026-04-21",
        updatedAt: "2026-04-20T09:00:00.000Z",
      },
    ]);
    loadSubjectMaterials.mockResolvedValueOnce([
      {
        id: "material-1",
        subjectId: "subject-1",
        displayName: "slide.pdf",
        sizeBytes: 1024,
        mimeType: "application/pdf",
        fileExt: "pdf",
        note: "",
        createdAt: "2026-04-19T10:00:00.000Z",
        updatedAt: "2026-04-20T09:00:00.000Z",
      },
    ]);
    loadSubjectAttendance.mockResolvedValueOnce([
      {
        id: "attendance-1",
        subjectId: "subject-1",
        lectureDate: "2026-04-21",
        timetableSlotId: "",
        slotSnapshot: null,
        status: "present",
        memo: "",
        updatedAt: "2026-04-20T09:00:00.000Z",
      },
    ]);
    loadSubjectTodos.mockResolvedValueOnce([
      {
        id: "todo-1",
        subjectId: "subject-1",
        title: "再提出",
        memo: "",
        dueDate: "2026-04-21",
        status: "open",
        completedAt: null,
        updatedAt: "2026-04-20T09:00:00.000Z",
      },
    ]);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("dashboard-loaded")).not.toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "go-library" }));
    fireEvent.click(screen.getByRole("button", { name: "restore-subject-1" }));

    await waitFor(() => {
      expect(screen.getByText("library-active-subject-1")).not.toBeNull();
      expect(screen.getByText("授業は復元済みですが、表示更新に失敗しました。")).not.toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "go-dashboard" }));
    expect(screen.getByText("dashboard-stats-1-1-1-1-1")).not.toBeNull();
    expect(screen.getByText("dashboard-recent-notes-note-1")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "go-timetable" }));
    expect(screen.getByText("timetable-subject-ids-subject-1")).not.toBeNull();
    expect(screen.getByText("timetable-open-todo-by-subject-subject-1:1")).not.toBeNull();
  });

  it("does not borrow another subject's todo badge when saving a different subject", async () => {
    const subjectOne = buildSubject("subject-1", "統計学");
    const subjectTwo = buildSubject("subject-2", "解析学");
    const periodOne = { periodNo: 1, label: "1限", startTime: "", endTime: "" };
    const periodTwo = { periodNo: 2, label: "2限", startTime: "", endTime: "" };
    const subjectTwoSlot = { id: "slot-2", weekday: "tue", periodNo: 2, activeSlotKey: "2026-spring:tue:2" };

    loadDashboardSummary
      .mockResolvedValueOnce({
        activeSubjectsCount: 2,
        notesCount: 0,
        materialsCount: 0,
        attendanceCount: 0,
        openTodosCount: 8,
        todayClasses: [],
        recentNotes: [],
      })
      .mockRejectedValueOnce(new Error("refresh failed"));
    loadLibrarySubjects
      .mockResolvedValueOnce({
        periods: [periodOne, periodTwo],
        activeSubjects: [
          { ...subjectOne, slots: [] },
          { ...subjectTwo, slots: [subjectTwoSlot] },
        ],
        archivedSubjects: [],
      })
      .mockRejectedValueOnce(new Error("refresh failed"));
    loadTimetable
      .mockResolvedValueOnce({
        periods: [periodOne, periodTwo],
        slots: [
          {
            slot: subjectTwoSlot,
            subject: subjectTwo,
            openTodoCount: 7,
          },
        ],
      })
      .mockRejectedValueOnce(new Error("refresh failed"));
    loadTodosPageData
      .mockResolvedValueOnce({
        openTodos: [
          { id: "todo-1", subjectId: "subject-1", subject: subjectOne, title: "課題A", status: "open" },
        ],
        doneTodos: [],
      })
      .mockRejectedValueOnce(new Error("refresh failed"));
    loadSubjectHeader.mockImplementation((subjectId) => {
      if (subjectId === "subject-2") {
        return Promise.resolve({
          subject: subjectTwo,
          periods: [periodOne, periodTwo],
          slots: [subjectTwoSlot],
          notesCount: 0,
          materialsCount: 0,
          attendanceCount: 0,
          openTodosCount: 7,
          doneTodosCount: 0,
        });
      }
      return Promise.resolve(null);
    });
    saveSubject.mockResolvedValueOnce({
      ...subjectOne,
      updatedAt: "2026-04-21T09:00:00.000Z",
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("dashboard-loaded")).not.toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "go-timetable" }));
    fireEvent.click(screen.getByRole("button", { name: "select-subject-2" }));

    await waitFor(() => {
      expect(screen.getByText("subject-header-counts-0-0-0-7-0")).not.toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "go-library" }));
    fireEvent.click(screen.getByRole("button", { name: "edit-library-subject-1" }));

    await waitFor(() => {
      expect(screen.getByTestId("subject-modal")).not.toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "save-subject-with-slot" }));

    await waitFor(() => {
      expect(screen.queryByTestId("subject-modal")).toBeNull();
      expect(screen.getByText("授業は保存済みですが、表示更新に失敗しました。")).not.toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "go-timetable" }));

    await waitFor(() => {
      expect(screen.getByText("timetable-open-todo-by-subject-subject-1:1,subject-2:7")).not.toBeNull();
    });
  });

  it("keeps note counts stable during stale delete recovery", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const subject = buildSubject("subject-1", "統計学");

    deleteNote.mockRejectedValueOnce(Object.assign(new Error("stale"), { code: "STALE_DRAFT" }));
    loadDashboardSummary
      .mockResolvedValueOnce({
        activeSubjectsCount: 1,
        notesCount: 1,
        materialsCount: 0,
        attendanceCount: 0,
        openTodosCount: 0,
        todayClasses: [],
        recentNotes: [],
      })
      .mockRejectedValueOnce(new Error("refresh failed"));
    loadTimetable.mockResolvedValue({
      periods: [],
      slots: [
        {
          slot: { id: "slot-1", weekday: "mon", periodNo: 1, activeSlotKey: "2026-spring:mon:1" },
          subject,
        },
      ],
    });
    loadSubjectHeader
      .mockResolvedValueOnce({
        subject,
        periods: [],
        slots: [],
        notesCount: 1,
        materialsCount: 0,
        attendanceCount: 0,
        openTodosCount: 0,
        doneTodosCount: 0,
      })
      .mockRejectedValueOnce(new Error("refresh failed"));
    loadSubjectNotes
      .mockResolvedValueOnce([
        {
          id: "note-1",
          subjectId: "subject-1",
          title: "第1回",
          bodyText: "本文",
          lectureDate: "2026-04-21",
          updatedAt: "2026-04-19T10:00:00.000Z",
        },
      ])
      .mockRejectedValueOnce(new Error("refresh failed"));

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("dashboard-loaded")).not.toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "go-timetable" }));
    fireEvent.click(screen.getByRole("button", { name: "select-subject-1" }));
    fireEvent.click(screen.getByRole("button", { name: "delete-note" }));

    await waitFor(() => {
      expect(screen.getByText("note-delete-resolved")).not.toBeNull();
      expect(screen.getByText("detail-items-none")).not.toBeNull();
      expect(screen.getByText("subject-header-counts-1-0-0-0-0")).not.toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "go-dashboard" }));
    await waitFor(() => {
      expect(screen.getByText("dashboard-stats-1-1-0-0-0")).not.toBeNull();
    });

    confirmSpy.mockRestore();
  });

  it("keeps material and attendance counts stable during stale delete recovery", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const subject = buildSubject("subject-1", "統計学");

    deleteMaterial.mockRejectedValueOnce(Object.assign(new Error("stale"), { code: "STALE_DRAFT" }));
    deleteAttendance.mockRejectedValueOnce(Object.assign(new Error("stale"), { code: "STALE_DRAFT" }));
    loadDashboardSummary
      .mockResolvedValueOnce({
        activeSubjectsCount: 1,
        notesCount: 0,
        materialsCount: 1,
        attendanceCount: 1,
        openTodosCount: 0,
        todayClasses: [],
        recentNotes: [],
      })
      .mockRejectedValueOnce(new Error("refresh failed"))
      .mockRejectedValueOnce(new Error("refresh failed"));
    loadTimetable.mockResolvedValue({
      periods: [],
      slots: [
        {
          slot: { id: "slot-1", weekday: "mon", periodNo: 1, activeSlotKey: "2026-spring:mon:1" },
          subject,
        },
      ],
    });
    loadSubjectHeader
      .mockResolvedValueOnce({
        subject,
        periods: [],
        slots: [],
        notesCount: 0,
        materialsCount: 1,
        attendanceCount: 1,
        openTodosCount: 0,
        doneTodosCount: 0,
      })
      .mockRejectedValueOnce(new Error("refresh failed"))
      .mockRejectedValueOnce(new Error("refresh failed"));
    loadSubjectMaterials
      .mockResolvedValueOnce([
        {
          id: "material-1",
          subjectId: "subject-1",
          displayName: "slide.pdf",
          sizeBytes: 1024,
          mimeType: "application/pdf",
          fileExt: "pdf",
          note: "",
          createdAt: "2026-04-19T10:00:00.000Z",
          updatedAt: "2026-04-20T09:00:00.000Z",
        },
      ])
      .mockRejectedValueOnce(new Error("refresh failed"));
    loadSubjectAttendance
      .mockResolvedValueOnce([
        {
          id: "attendance-1",
          subjectId: "subject-1",
          lectureDate: "2026-04-21",
          timetableSlotId: "",
          slotSnapshot: null,
          status: "present",
          memo: "",
          updatedAt: "2026-04-20T09:00:00.000Z",
        },
      ])
      .mockRejectedValueOnce(new Error("refresh failed"));

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("dashboard-loaded")).not.toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "go-timetable" }));
    fireEvent.click(screen.getByRole("button", { name: "select-subject-1" }));

    fireEvent.click(screen.getByRole("button", { name: "tab-materials" }));
    fireEvent.click(screen.getByRole("button", { name: "delete-material" }));

    await waitFor(() => {
      expect(screen.getByText("material-delete-resolved")).not.toBeNull();
      expect(screen.getByText("detail-items-none")).not.toBeNull();
      expect(screen.getByText("subject-header-counts-0-1-1-0-0")).not.toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "tab-attendance" }));
    fireEvent.click(screen.getByRole("button", { name: "delete-attendance" }));

    await waitFor(() => {
      expect(screen.getByText("attendance-delete-resolved")).not.toBeNull();
      expect(screen.getByText("detail-items-none")).not.toBeNull();
      expect(screen.getByText("subject-header-counts-0-1-1-0-0")).not.toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "go-dashboard" }));
    await waitFor(() => {
      expect(screen.getByText("dashboard-stats-1-0-1-1-0")).not.toBeNull();
    });

    confirmSpy.mockRestore();
  });

  it("keeps todo counts stable during stale delete recovery", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const subject = buildSubject("subject-1", "統計学");

    deleteTodo.mockRejectedValueOnce(Object.assign(new Error("stale"), { code: "STALE_DRAFT" }));
    loadDashboardSummary
      .mockResolvedValueOnce({
        activeSubjectsCount: 1,
        notesCount: 0,
        materialsCount: 0,
        attendanceCount: 0,
        openTodosCount: 1,
        todayClasses: [],
        recentNotes: [],
      })
      .mockRejectedValueOnce(new Error("refresh failed"));
    loadTimetable
      .mockResolvedValueOnce({
        periods: [],
        slots: [
          {
            slot: { id: "slot-1", weekday: "mon", periodNo: 1, activeSlotKey: "2026-spring:mon:1" },
            subject,
            openTodoCount: 1,
          },
        ],
      })
      .mockRejectedValueOnce(new Error("refresh failed"));
    loadTodosPageData
      .mockResolvedValueOnce({
        openTodos: [{ id: "todo-1", subjectId: "subject-1", subject, title: "課題", status: "open" }],
        doneTodos: [],
      })
      .mockRejectedValueOnce(new Error("refresh failed"));
    loadSubjectHeader
      .mockResolvedValueOnce({
        subject,
        periods: [],
        slots: [],
        notesCount: 0,
        materialsCount: 0,
        attendanceCount: 0,
        openTodosCount: 1,
        doneTodosCount: 0,
      })
      .mockRejectedValueOnce(new Error("refresh failed"));
    loadSubjectTodos
      .mockResolvedValueOnce([
        {
          id: "todo-1",
          subjectId: "subject-1",
          title: "課題",
          memo: "",
          dueDate: "2026-04-21",
          status: "open",
          completedAt: null,
          updatedAt: "2026-04-19T10:00:00.000Z",
        },
      ])
      .mockRejectedValueOnce(new Error("refresh failed"));

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("dashboard-loaded")).not.toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "go-timetable" }));
    fireEvent.click(screen.getByRole("button", { name: "select-subject-1" }));
    fireEvent.click(screen.getByRole("button", { name: "tab-todos" }));
    fireEvent.click(screen.getByRole("button", { name: "delete-todo" }));

    await waitFor(() => {
      expect(screen.getByText("todo-delete-resolved-stale")).not.toBeNull();
      expect(screen.getByText("detail-items-none")).not.toBeNull();
      expect(screen.getByText("subject-header-counts-0-0-0-1-0")).not.toBeNull();
      expect(screen.getByText("timetable-open-todo-by-subject-subject-1:1")).not.toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "go-dashboard" }));
    await waitFor(() => {
      expect(screen.getByText("dashboard-stats-1-0-0-0-1")).not.toBeNull();
    });

    confirmSpy.mockRestore();
  });

  it("keeps stale settings UX visible even when settings re-read fails", async () => {
    saveSettingsBundle.mockRejectedValueOnce(Object.assign(new Error("stale"), { code: "STALE_UPDATE" }));

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("dashboard-loaded")).not.toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "go-timetable" }));
    fireEvent.click(screen.getByRole("button", { name: "open-settings" }));

    await waitFor(() => {
      expect(screen.getByTestId("settings-modal")).not.toBeNull();
    });

    getSettings.mockRejectedValueOnce(new Error("settings read failed"));
    fireEvent.click(screen.getByRole("button", { name: "save-settings" }));

    await waitFor(() => {
      expect(screen.getAllByText("設定は別の画面で更新されています。").length).toBeGreaterThan(0);
      expect(screen.getByText("設定の再同期に失敗しました。")).not.toBeNull();
      expect(screen.getByTestId("settings-modal")).not.toBeNull();
    });
  });
});
