import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsModal } from "./SettingsModal";

const prepareExportMock = vi.fn();
const downloadExportResultMock = vi.fn();
const readImportArchiveMock = vi.fn();
const applyImportArchiveMock = vi.fn();

vi.mock("../../services/exportService", () => ({
  prepareExport: (...args) => prepareExportMock(...args),
  downloadExportResult: (...args) => downloadExportResultMock(...args),
}));

vi.mock("../../services/importService", () => ({
  readImportArchive: (...args) => readImportArchiveMock(...args),
  applyImportArchive: (...args) => applyImportArchiveMock(...args),
}));

const initialSettings = {
  currentTermKey: "2026-spring",
  termLabel: "2026年度 春学期",
  exportIncludeFiles: true,
};

const initialPeriods = [
  {
    id: "period:2026-spring:1",
    termKey: "2026-spring",
    periodNo: 1,
    label: "1限",
    startTime: "09:00",
    endTime: "10:40",
    isEnabled: true,
  },
];

function buildTermEditorState(overrides = {}) {
  return {
    termKey: "2026-spring",
    label: "2026年度 春学期",
    periods: initialPeriods,
    exists: true,
    isValidStructuredTermKey: true,
    ...overrides,
  };
}

function renderModal(overrides = {}) {
  const loadTermEditorState = overrides.loadTermEditorState || vi.fn().mockResolvedValue(buildTermEditorState());
  const onClose = overrides.onClose || vi.fn();
  const onSave = overrides.onSave || vi.fn().mockResolvedValue(undefined);
  const onImportApplied = overrides.onImportApplied || vi.fn();

  render(
    <SettingsModal
      open
      initialSettings={overrides.initialSettings || initialSettings}
      initialTermEditorState={overrides.initialTermEditorState || buildTermEditorState()}
      loadTermEditorState={loadTermEditorState}
      onClose={onClose}
      onSave={onSave}
      onImportApplied={onImportApplied}
    />,
  );

  return { loadTermEditorState, onClose, onSave, onImportApplied };
}

function setPendingTerm(year, season) {
  fireEvent.change(screen.getByLabelText("年度"), { target: { value: year } });
  fireEvent.change(screen.getByLabelText("学期"), { target: { value: season } });
}

afterEach(() => {
  cleanup();
  prepareExportMock.mockReset();
  downloadExportResultMock.mockReset();
  readImportArchiveMock.mockReset();
  applyImportArchiveMock.mockReset();
});

describe("SettingsModal", () => {
  it("closes immediately when pristine and cancel is pressed", () => {
    const confirmSpy = vi.spyOn(window, "confirm");
    const { onClose } = renderModal();

    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));

    expect(onClose).toHaveBeenCalled();
    expect(confirmSpy).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("protects dirty state and shows time inputs with existing values", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const { onClose } = renderModal();

    expect(screen.getByDisplayValue("09:00")).not.toBeNull();
    expect(screen.getByDisplayValue("10:40")).not.toBeNull();

    fireEvent.change(screen.getByDisplayValue("2026年度 春学期"), {
      target: { value: "2026年度 春学期 改" },
    });
    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));

    expect(confirmSpy).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("loads an existing term only after the pending term selection is applied", async () => {
    const loadTermEditorState = vi.fn(async (termKey) => {
      if (termKey === "2026-fall") {
        return buildTermEditorState({
          termKey: "2026-fall",
          label: "2026年度 秋学期",
          periods: [
            {
              id: "period:2026-fall:1",
              termKey: "2026-fall",
              periodNo: 1,
              label: "秋1限",
              startTime: "08:30",
              endTime: "10:00",
              isEnabled: true,
            },
          ],
        });
      }
      return buildTermEditorState();
    });

    renderModal({ loadTermEditorState });

    setPendingTerm("2026", "fall");

    expect(screen.getByRole("button", { name: "保存" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("学期の変更はまだ反映されていません。「学期を反映」を押してから保存してください。")).not.toBeNull();
    expect(loadTermEditorState).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "学期を反映" }));

    await waitFor(() => {
      expect(screen.getByDisplayValue("2026-fall")).not.toBeNull();
      expect(screen.getByDisplayValue("2026年度 秋学期")).not.toBeNull();
      expect(screen.getByDisplayValue("秋1限")).not.toBeNull();
      expect(screen.getByDisplayValue("08:30")).not.toBeNull();
      expect(screen.getByDisplayValue("10:00")).not.toBeNull();
    });
  });

  it("clones the loaded snapshot for a new empty term instead of carrying dirty rows", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const loadTermEditorState = vi.fn(async (termKey) => {
      if (termKey === "2027-spring") {
        return buildTermEditorState({
          termKey: "2027-spring",
          label: "2027年度 春学期",
          periods: [],
          exists: false,
        });
      }
      return buildTermEditorState();
    });

    renderModal({ loadTermEditorState });

    fireEvent.change(screen.getByDisplayValue("1限"), {
      target: { value: "春1限編集" },
    });
    setPendingTerm("2027", "spring");
    fireEvent.click(screen.getByRole("button", { name: "学期を反映" }));

    await waitFor(() => {
      expect(screen.getByDisplayValue("2027-spring")).not.toBeNull();
      expect(screen.getByDisplayValue("2027年度 春学期")).not.toBeNull();
      expect(screen.getByDisplayValue("1限")).not.toBeNull();
      expect(screen.queryByDisplayValue("春1限編集")).toBeNull();
    });

    expect(confirmSpy).toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("shows an inline error and rolls pending inputs back when the term load fails", async () => {
    const loadTermEditorState = vi.fn(async (termKey) => {
      if (termKey === "2026-fall") throw new Error("load failed");
      return buildTermEditorState();
    });

    renderModal({ loadTermEditorState });

    setPendingTerm("2026", "fall");
    fireEvent.click(screen.getByRole("button", { name: "学期を反映" }));

    await waitFor(() => {
      expect(screen.getByText("load failed")).not.toBeNull();
      expect(screen.getByDisplayValue("2026-spring")).not.toBeNull();
      expect(screen.getByDisplayValue("1限")).not.toBeNull();
    });

    expect(screen.getByLabelText("年度").value).toBe("2026");
    expect(screen.getByLabelText("学期").value).toBe("spring");
    expect(screen.getByRole("button", { name: "保存" }).hasAttribute("disabled")).toBe(false);
  });

  it("shows a warning and disables save for legacy invalid term keys", () => {
    renderModal({
      initialSettings: {
        currentTermKey: "legacy-term",
        termLabel: "旧学期",
        exportIncludeFiles: true,
      },
      initialTermEditorState: buildTermEditorState({
        termKey: "legacy-term",
        label: "旧学期",
        isValidStructuredTermKey: false,
      }),
    });

    expect(screen.getByText("現在の内部学期キー「legacy-term」は旧形式です。年度と学期を選び直してから保存してください。")).not.toBeNull();
    expect(screen.getByRole("button", { name: "保存" }).hasAttribute("disabled")).toBe(true);
  });

  it("passes the applied term key to onSave", async () => {
    const loadTermEditorState = vi.fn(async (termKey) => {
      if (termKey === "2026-fall") {
        return buildTermEditorState({
          termKey: "2026-fall",
          label: "2026年度 秋学期",
          periods: [
            {
              id: "period:2026-fall:1",
              termKey: "2026-fall",
              periodNo: 1,
              label: "秋1限",
              startTime: "08:30",
              endTime: "10:00",
              isEnabled: true,
            },
          ],
        });
      }
      return buildTermEditorState();
    });
    const onSave = vi.fn().mockResolvedValue(undefined);

    renderModal({ loadTermEditorState, onSave });

    setPendingTerm("2026", "fall");
    fireEvent.click(screen.getByRole("button", { name: "学期を反映" }));

    await waitFor(() => {
      expect(screen.getByDisplayValue("2026-fall")).not.toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({
        draft: expect.objectContaining({
          currentTermKey: "2026-fall",
          termLabel: "2026年度 秋学期",
        }),
        periodsLoadedForTermKey: "2026-fall",
      });
    });
  });

  it("keeps the settings modal open when save fails with a stale update", async () => {
    const onClose = vi.fn();
    const onSave = vi.fn().mockRejectedValue(Object.assign(new Error("stale"), { code: "STALE_UPDATE" }));

    renderModal({ onClose, onSave });

    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalled();
    });

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue("2026年度 春学期")).not.toBeNull();
  });

  it("uses the computed next period number for both periodNo and label when adding a row", () => {
    renderModal({
      initialTermEditorState: buildTermEditorState({
        periods: [
          initialPeriods[0],
          {
            id: "period:2026-spring:3",
            termKey: "2026-spring",
            periodNo: 3,
            label: "3限",
            startTime: "13:20",
            endTime: "15:00",
            isEnabled: true,
          },
        ],
      }),
    });

    fireEvent.click(screen.getByRole("button", { name: "コマを追加" }));

    expect(screen.getByDisplayValue("4限")).not.toBeNull();
    expect(screen.getAllByDisplayValue("4").length).toBeGreaterThan(0);
  });

  it("exports a backup from the settings entrypoint", async () => {
    prepareExportMock.mockResolvedValue({
      status: "ready",
      blob: new Blob(["zip"]),
      filename: "backup.zip",
      missingFiles: [],
    });
    renderModal();

    fireEvent.click(screen.getByRole("button", { name: "バックアップをエクスポート" }));

    await waitFor(() => {
      expect(prepareExportMock).toHaveBeenCalledWith({
        includeFilesOverride: true,
      });
      expect(downloadExportResultMock).toHaveBeenCalledWith(
        expect.objectContaining({
          filename: "backup.zip",
        }),
      );
      expect(screen.getByText("バックアップをダウンロードしました。")).not.toBeNull();
    });
  });

  it("uses the unsaved exportIncludeFiles toggle for exports from the settings modal", async () => {
    prepareExportMock.mockResolvedValue({
      status: "ready",
      blob: new Blob(["zip"]),
      filename: "backup.zip",
      missingFiles: [],
    });
    renderModal();

    fireEvent.click(screen.getByLabelText("エクスポート時に資料ファイルも ZIP に含める"));
    fireEvent.click(screen.getByRole("button", { name: "バックアップをエクスポート" }));

    await waitFor(() => {
      expect(prepareExportMock).toHaveBeenCalledWith({
        includeFilesOverride: false,
      });
    });
  });

  it("shows an import preview before applying a restore", async () => {
    readImportArchiveMock.mockResolvedValue({
      preview: {
        version: 4,
        exportedAt: "2026-04-20T00:00:00.000Z",
        currentTermKey: "2026-fall",
        currentTermLabel: "2026年度 秋学期",
        counts: {
          termMeta: 1,
          periods: 5,
          subjects: 2,
          slots: 2,
          notes: 3,
          attendance: 1,
          todos: 4,
          materials: 1,
          materialFiles: 1,
        },
        warnings: [],
      },
      archive: { token: "archive" },
    });
    renderModal();

    const fileInput = document.querySelector('input[type="file"]');
    fireEvent.change(fileInput, {
      target: {
        files: [new File(["zip"], "backup.zip", { type: "application/zip" })],
      },
    });

    await waitFor(() => {
      expect(screen.getByText("バックアップを復元")).not.toBeNull();
      expect(screen.getByText("backup.zip")).not.toBeNull();
      expect(screen.getByText("ToDo")).not.toBeNull();
    });
  });

  it("shows an inline error when the import archive is invalid", async () => {
    readImportArchiveMock.mockRejectedValue(new Error("manifest.json を解析できませんでした。"));
    renderModal();

    const fileInput = document.querySelector('input[type="file"]');
    fireEvent.change(fileInput, {
      target: {
        files: [new File(["zip"], "broken.zip", { type: "application/zip" })],
      },
    });

    await waitFor(() => {
      expect(screen.getByText("manifest.json を解析できませんでした。")).not.toBeNull();
    });
  });

  it("keeps export and import errors in separate state buckets", async () => {
    prepareExportMock.mockRejectedValue(new Error("export failed"));
    readImportArchiveMock.mockRejectedValue(new Error("import failed"));
    renderModal();

    fireEvent.click(screen.getByRole("button", { name: "バックアップをエクスポート" }));

    await waitFor(() => {
      expect(screen.getByText("export failed")).not.toBeNull();
    });

    const fileInput = document.querySelector('input[type="file"]');
    fireEvent.change(fileInput, {
      target: {
        files: [new File(["zip"], "broken.zip", { type: "application/zip" })],
      },
    });

    await waitFor(() => {
      expect(screen.getByText("export failed")).not.toBeNull();
      expect(screen.getByText("import failed")).not.toBeNull();
    });
  });

  it("applies a successful restore via the parent callback instead of reloading", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const onClose = vi.fn();
    const onImportApplied = vi.fn();
    const result = {
      warnings: [{ code: "MISSING_MATERIAL_FILE", materialId: "material-1" }],
      importedCounts: { notes: 3 },
    };

    readImportArchiveMock.mockResolvedValue({
      preview: {
        version: 4,
        exportedAt: "2026-04-20T00:00:00.000Z",
        currentTermKey: "2026-fall",
        currentTermLabel: "2026年度 秋学期",
        counts: {
          termMeta: 1,
          periods: 5,
          subjects: 2,
          slots: 2,
          notes: 3,
          attendance: 1,
          todos: 4,
          materials: 1,
          materialFiles: 1,
        },
        warnings: [],
      },
      archive: { token: "archive" },
    });
    applyImportArchiveMock.mockResolvedValue(result);

    renderModal({ onClose, onImportApplied });

    const fileInput = document.querySelector('input[type="file"]');
    fireEvent.change(fileInput, {
      target: {
        files: [new File(["zip"], "backup.zip", { type: "application/zip" })],
      },
    });

    await waitFor(() => {
      expect(screen.getByText("backup.zip")).not.toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "現在のデータを置き換えて復元" }));

    await waitFor(() => {
      expect(applyImportArchiveMock).toHaveBeenCalledWith({ token: "archive" });
      expect(onClose).toHaveBeenCalled();
      expect(onImportApplied).toHaveBeenCalledWith(result);
    });

    confirmSpy.mockRestore();
  });

  it("keeps both modals locked while an import is running", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const onClose = vi.fn();
    readImportArchiveMock.mockResolvedValue({
      preview: {
        version: 4,
        exportedAt: "2026-04-20T00:00:00.000Z",
        currentTermKey: "2026-fall",
        currentTermLabel: "2026年度 秋学期",
        counts: {
          termMeta: 1,
          periods: 5,
          subjects: 2,
          slots: 2,
          notes: 3,
          attendance: 1,
          todos: 4,
          materials: 1,
          materialFiles: 1,
        },
        warnings: [],
      },
      archive: { token: "archive" },
    });
    applyImportArchiveMock.mockImplementation(() => new Promise(() => {}));
    renderModal({ onClose });

    const fileInput = document.querySelector('input[type="file"]');
    fireEvent.change(fileInput, {
      target: {
        files: [new File(["zip"], "backup.zip", { type: "application/zip" })],
      },
    });

    await waitFor(() => {
      expect(screen.getByText("バックアップを復元")).not.toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "現在のデータを置き換えて復元" }));

    await waitFor(() => {
      expect(applyImportArchiveMock).toHaveBeenCalledWith({ token: "archive" });
      expect(screen.getByRole("button", { name: "復元中…" })).not.toBeNull();
    });

    fireEvent.keyDown(window, { key: "Escape" });
    const overlays = document.querySelectorAll(".fixed.inset-0");
    fireEvent.mouseDown(overlays[overlays.length - 1]);

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText("バックアップを復元")).not.toBeNull();
    confirmSpy.mockRestore();
  });

  it("keeps the import preview open after a restore failure and allows retry", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    readImportArchiveMock.mockResolvedValue({
      preview: {
        version: 4,
        exportedAt: "2026-04-20T00:00:00.000Z",
        currentTermKey: "2026-fall",
        currentTermLabel: "2026年度 秋学期",
        counts: {
          termMeta: 1,
          periods: 5,
          subjects: 2,
          slots: 2,
          notes: 3,
          attendance: 1,
          todos: 4,
          materials: 1,
          materialFiles: 1,
        },
        warnings: [],
      },
      archive: { token: "archive" },
    });
    applyImportArchiveMock.mockRejectedValue(new Error("restore failed"));

    renderModal();

    const fileInput = document.querySelector('input[type="file"]');
    fireEvent.change(fileInput, {
      target: {
        files: [new File(["zip"], "backup.zip", { type: "application/zip" })],
      },
    });

    await waitFor(() => {
      expect(screen.getByText("backup.zip")).not.toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "現在のデータを置き換えて復元" }));

    await waitFor(() => {
      expect(screen.getByText("restore failed")).not.toBeNull();
      expect(screen.getByText("backup.zip")).not.toBeNull();
      expect(applyImportArchiveMock).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole("button", { name: "現在のデータを置き換えて復元" }));

    await waitFor(() => {
      expect(applyImportArchiveMock).toHaveBeenCalledTimes(2);
      expect(screen.getByText("restore failed")).not.toBeNull();
      expect(screen.getByText("backup.zip")).not.toBeNull();
    });

    confirmSpy.mockRestore();
  });
});
