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
  TimetablePage: () => null,
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

vi.mock("./features/subjects/SubjectDetailPanel", () => ({
  SubjectDetailPanel: () => null,
}));

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
  SettingsModal: () => null,
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
import { getSettings } from "./db/repositories/settings";
import { restoreSubject } from "./db/repositories/subjects";
import { loadDashboardSummary, loadLibrarySubjects, loadTimetable } from "./services/loaders";
import { loadSubjectHeader } from "./services/loaders";
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
  loadDashboardSummary.mockReset();
  loadLibrarySubjects.mockReset();
  loadTimetable.mockReset();
  restoreSubject.mockReset();
  loadSubjectHeader.mockReset();
  clearMaterialFileStorage.mockReset();

  getSettings.mockResolvedValue(settings);
  loadDashboardSummary.mockResolvedValue({
    activeSubjectsCount: 0,
    notesCount: 0,
    materialsCount: 0,
    attendanceCount: 0,
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
  loadSubjectHeader.mockResolvedValue(null);
  clearMaterialFileStorage.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
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
      expect(screen.getByTestId("subject-modal").textContent).toBe("2026-04-19T10:00:00.000Z");
    });
  });
});
