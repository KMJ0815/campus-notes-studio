import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsModal } from "./SettingsModal";

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

  render(
    <SettingsModal
      open
      sourceTermKey="2026-spring"
      initialSettings={overrides.initialSettings || initialSettings}
      initialTermEditorState={overrides.initialTermEditorState || buildTermEditorState()}
      loadTermEditorState={loadTermEditorState}
      onClose={onClose}
      onSave={onSave}
    />,
  );

  return { loadTermEditorState, onClose, onSave };
}

function setPendingTerm(year, season) {
  fireEvent.change(screen.getByLabelText("年度"), { target: { value: year } });
  fireEvent.change(screen.getByLabelText("学期"), { target: { value: season } });
}

afterEach(() => {
  cleanup();
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
        sourceTermKey: "2026-spring",
        draft: expect.objectContaining({
          currentTermKey: "2026-fall",
          termLabel: "2026年度 秋学期",
        }),
        periodsLoadedForTermKey: "2026-fall",
      });
    });
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
});
