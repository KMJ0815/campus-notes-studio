import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NoteFormModal } from "./NoteFormModal";

describe("NoteFormModal", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-18T09:00:00+09:00"));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("protects dirty state on close", () => {
    const onClose = vi.fn();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

    render(
      <NoteFormModal
        open
        subject={{ id: "subject-1", name: "統計学" }}
        initialValue={{ id: null, subjectId: "subject-1", title: "", bodyText: "", lectureDate: "2026-04-17" }}
        onClose={onClose}
        onSave={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("例: 第3回 講義メモ"), {
      target: { value: "第1回" },
    });
    fireEvent.click(screen.getByText("キャンセル"));

    expect(confirmSpy).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("uses the local current date for new notes and blocks empty lecture dates", () => {
    const onSave = vi.fn();

    render(
      <NoteFormModal
        open
        subject={{ id: "subject-1", name: "統計学" }}
        initialValue={null}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );

    const dateInput = screen.getAllByLabelText("講義日").at(-1);
    expect(dateInput.value).toBe("2026-04-18");

    fireEvent.change(screen.getByPlaceholderText("例: 第3回 講義メモ"), {
      target: { value: "第1回" },
    });
    fireEvent.change(dateInput, {
      target: { value: "" },
    });
    fireEvent.click(screen.getByText("保存"));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText("講義日は必須です。")).not.toBeNull();
  });

  it("normalizes existing lecture dates into the date input", () => {
    render(
      <NoteFormModal
        open
        subject={{ id: "subject-1", name: "統計学" }}
        initialValue={{ id: "note-1", subjectId: "subject-1", title: "第1回", bodyText: "", lectureDate: "2026-04-18T00:00:00.000Z" }}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    const dateInput = screen.getAllByLabelText("講義日").at(-1);
    expect(dateInput.value).toBe("2026-04-18");
  });

  it("keeps the modal open when save fails", async () => {
    const onClose = vi.fn();
    const onSave = vi.fn().mockRejectedValue(new Error("save failed"));

    render(
      <NoteFormModal
        open
        subject={{ id: "subject-1", name: "統計学" }}
        initialValue={{ id: "note-1", subjectId: "subject-1", title: "第1回", bodyText: "", lectureDate: "2026-04-18" }}
        onClose={onClose}
        onSave={onSave}
      />,
    );

    fireEvent.click(screen.getByText("保存"));

    await act(async () => {
      await Promise.resolve();
    });
    expect(onSave).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue("2026-04-18")).not.toBeNull();
  });
});
