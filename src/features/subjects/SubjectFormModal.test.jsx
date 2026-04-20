import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SubjectFormModal } from "./SubjectFormModal";

const periods = [
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

afterEach(() => {
  cleanup();
});

describe("SubjectFormModal", () => {
  it("closes when pristine and keeps dirty edits on cancel reject", () => {
    const onClose = vi.fn();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

    const { rerender } = render(
      <SubjectFormModal
        open
        termKey="2026-spring"
        initialValue={{
          id: "subject-1",
          termKey: "2026-spring",
          name: "統計学",
          teacherName: "",
          room: "",
          color: "#4f46e5",
          memo: "",
          isArchived: false,
          selectedSlotKeys: [],
        }}
        periods={periods}
        occupiedSlotMap={new Map()}
        onClose={onClose}
        onSave={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText("キャンセル"));
    expect(onClose).toHaveBeenCalledTimes(1);

    rerender(
      <SubjectFormModal
        open
        termKey="2026-spring"
        initialValue={{
          id: "subject-1",
          termKey: "2026-spring",
          name: "統計学",
          teacherName: "",
          room: "",
          color: "#4f46e5",
          memo: "",
          isArchived: false,
          selectedSlotKeys: [],
        }}
        periods={periods}
        occupiedSlotMap={new Map()}
        onClose={onClose}
        onSave={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByDisplayValue("統計学"), {
      target: { value: "統計学 改" },
    });
    fireEvent.click(screen.getByText("キャンセル"));

    expect(confirmSpy).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
    confirmSpy.mockRestore();
  });

  it("normalizes invalid subject colors and blocks invalid text input on save", async () => {
    const onSave = vi.fn().mockRejectedValue(new Error("save failed"));
    const onClose = vi.fn();

    render(
      <SubjectFormModal
        open
        termKey="2026-spring"
        initialValue={{
          id: "subject-1",
          termKey: "2026-spring",
          name: "統計学",
          teacherName: "",
          room: "",
          color: "#4f46e5#f97316",
          memo: "",
          isArchived: false,
          selectedSlotKeys: [],
        }}
        periods={periods}
        occupiedSlotMap={new Map()}
        onClose={onClose}
        onSave={onSave}
      />,
    );

    const colorInputs = screen.getAllByDisplayValue("#4f46e5");
    expect(colorInputs.length).toBeGreaterThan(0);

    const colorTextInput = colorInputs.at(-1);
    fireEvent.change(colorTextInput, {
      target: { value: "#4f46e5#f97316" },
    });
    fireEvent.click(screen.getByText("保存"));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText("授業色は #RRGGBB 形式で入力してください。")).not.toBeNull();

    fireEvent.change(colorTextInput, {
      target: { value: "#f97316" },
    });
    fireEvent.click(screen.getByText("保存"));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          color: "#f97316",
        }),
      );
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("does not show archive-on-save UI and omits isArchived when saving", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);

    render(
      <SubjectFormModal
        open
        termKey="2026-spring"
        initialValue={{
          id: "subject-1",
          termKey: "2026-spring",
          name: "統計学",
          teacherName: "",
          room: "",
          color: "#4f46e5",
          memo: "",
          isArchived: false,
          selectedSlotKeys: [],
        }}
        periods={periods}
        occupiedSlotMap={new Map()}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );

    expect(screen.queryByText("アーカイブ状態で保存する")).toBeNull();

    fireEvent.click(screen.getByText("保存"));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        expect.not.objectContaining({
          isArchived: expect.anything(),
        }),
      );
    });
  });

  it("uses the shared timetable grid with internal horizontal scroll on narrow widths", () => {
    const { container } = render(
      <SubjectFormModal
        open
        termKey="2026-spring"
        initialValue={{
          id: "subject-1",
          termKey: "2026-spring",
          name: "統計学",
          teacherName: "",
          room: "",
          color: "#4f46e5",
          memo: "",
          isArchived: false,
          selectedSlotKeys: [],
        }}
        periods={periods}
        occupiedSlotMap={new Map()}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    const scrollFrame = container.querySelector(".overflow-x-auto");
    expect(scrollFrame).not.toBeNull();
    expect(scrollFrame?.firstElementChild?.className).toContain("min-w-[540px]");
  });
});
