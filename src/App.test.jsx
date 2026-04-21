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
  DashboardPage: () => <div>dashboard-loaded</div>,
}));

vi.mock("./features/timetable/TimetablePage", () => ({
  TimetablePage: ({ detailPanel, slotItems = [], onOpenSettings, onSelectSubject }) => (
    <div>
      <button type="button" onClick={onOpenSettings}>
        open-settings
      </button>
      <div>{`timetable-open-todo-counts-${slotItems.filter((item) => item.subject).map((item) => item.openTodoCount || 0).join(",") || "none"}`}</div>
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
  LibraryPage: ({ archivedSubjects, onRestoreSubject }) => (
    <div>
      {archivedSubjects.map((subject) => (
        <button key={subject.id} type="button" onClick={() => onRestoreSubject(subject)}>
          restore-{subject.id}
        </button>
      ))}
    </div>
  ),
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
      onChangeTab,
      onCreateNote,
      onEditSubject,
      onDeleteTodo,
      onSaveAttendance,
      onSaveTodo,
      tabLoading,
      todos,
    }) => {
      const [result, setResult] = React.useState("idle");
      const [attendanceResult, setAttendanceResult] = React.useState("idle");
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
              setTodoDeleteResult("deleting");
              onDeleteTodo({
                id: "todo-1",
                subjectId: header?.subject?.id || "subject-1",
                title: "再提出",
              })
                .then((value) => setTodoDeleteResult(`resolved-${value?.status || "deleted"}`))
                .catch(() => setTodoDeleteResult("rejected"));
            }}
          >
            delete-todo
          </button>
          <div>{`todo-delete-${todoDeleteResult}`}</div>
          <div>{`detail-loading-${tabLoading ? "yes" : "no"}`}</div>
          <div>{`detail-tab-${detailTab}`}</div>
          <div>{`detail-items-${currentItems.map((item) => item.id).join(",") || "none"}`}</div>
          <div>{`subject-header-${header?.subject?.name || "none"}`}</div>
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
  SubjectFormModal: ({ open, initialValue, onSave }) => (
    open ? (
      <div data-testid="subject-modal">
        <div>{initialValue?.baseUpdatedAt || ""}</div>
        <button
          type="button"
          onClick={() => onSave({
            ...initialValue,
            name: `${initialValue?.name || "授業"} 改`,
            termKey: initialValue?.termKey || "2026-spring",
            teacherName: initialValue?.teacherName || "",
            room: initialValue?.room || "",
            color: initialValue?.color || "#4f46e5",
            memo: initialValue?.memo || "",
            selectedSlotKeys: initialValue?.selectedSlotKeys || [],
          })}
        >
          save-subject
        </button>
      </div>
    ) : null
  ),
}));

vi.mock("./features/notes/NoteFormModal", () => ({
  NoteFormModal: ({ open, subject }) => (
    open ? <div>{`note-subject-${subject?.name || "none"}`}</div> : null
  ),
}));

vi.mock("./features/materials/MaterialNoteModal", () => ({
  MaterialNoteModal: () => null,
}));

vi.mock("./features/settings/SettingsModal", () => ({
  SettingsModal: ({ onImportApplied, open }) => (
    open ? (
      <div data-testid="settings-modal">
        <button type="button" onClick={() => onImportApplied({ warnings: [{ code: "MISSING_MATERIAL_FILE", materialId: "material-1" }] })}>
          import-applied
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
import { saveAttendance } from "./db/repositories/attendance";
import { getSettings, loadTermEditorState } from "./db/repositories/settings";
import { restoreSubject, saveSubject } from "./db/repositories/subjects";
import { deleteTodo, saveTodo } from "./db/repositories/todos";
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
  loadDashboardSummary.mockReset();
  loadLibrarySubjects.mockReset();
  loadTimetable.mockReset();
  restoreSubject.mockReset();
  saveSubject.mockReset();
  saveAttendance.mockReset();
  deleteTodo.mockReset();
  loadSubjectAttendance.mockReset();
  loadSubjectHeader.mockReset();
  loadSubjectMaterials.mockReset();
  loadSubjectNotes.mockReset();
  loadSubjectTodos.mockReset();
  loadTodosPageData.mockReset();
  clearMaterialFileStorage.mockReset();
  saveTodo.mockReset();

  getSettings.mockResolvedValue(settings);
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
  saveAttendance.mockResolvedValue(undefined);
  deleteTodo.mockResolvedValue(undefined);
  saveTodo.mockResolvedValue(undefined);
  saveSubject.mockResolvedValue(undefined);
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
      expect(screen.getByText("detail-loading-yes")).not.toBeNull();
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

    expect(screen.getByText("detail-loading-yes")).not.toBeNull();

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
});
