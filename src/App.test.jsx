import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./app/usePwaStatus", () => ({
  usePwaStatus: () => ({
    updateAvailable: false,
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

vi.mock("./features/subjects/SubjectDetailPanel", async () => {
  const React = await import("react");

  return {
    SubjectDetailPanel: ({ attendance, detailTab, header, materials, notes, onChangeTab, onSaveTodo, tabLoading, todos }) => {
      const [result, setResult] = React.useState("idle");
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
          <div>{`detail-loading-${tabLoading ? "yes" : "no"}`}</div>
          <div>{`detail-tab-${detailTab}`}</div>
          <div>{`detail-items-${currentItems.map((item) => item.id).join(",") || "none"}`}</div>
          <div>{`subject-header-${header?.subject?.name || "none"}`}</div>
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
  SubjectFormModal: ({ open, initialValue }) => (
    open ? <div data-testid="subject-modal">{initialValue?.baseUpdatedAt || ""}</div> : null
  ),
}));

vi.mock("./features/notes/NoteFormModal", () => ({
  NoteFormModal: () => null,
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
import { getSettings, loadTermEditorState } from "./db/repositories/settings";
import { restoreSubject } from "./db/repositories/subjects";
import { saveTodo } from "./db/repositories/todos";
import {
  loadDashboardSummary,
  loadLibrarySubjects,
  loadSubjectAttendance,
  loadSubjectHeader,
  loadSubjectMaterials,
  loadSubjectNotes,
  loadSubjectTodos,
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
  loadSubjectAttendance.mockReset();
  loadSubjectHeader.mockReset();
  loadSubjectMaterials.mockReset();
  loadSubjectNotes.mockReset();
  loadSubjectTodos.mockReset();
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
  clearMaterialFileStorage.mockResolvedValue(undefined);
  saveTodo.mockResolvedValue(undefined);
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
      expect(screen.getByTestId("subject-modal").textContent).toBe("2026-04-19T10:00:00.000Z");
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
});
