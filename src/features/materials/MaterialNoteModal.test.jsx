import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MaterialNoteModal } from "./MaterialNoteModal";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("MaterialNoteModal", () => {
  it("keeps the modal open when save fails", async () => {
    const onClose = vi.fn();
    const onSave = vi.fn().mockRejectedValue(Object.assign(new Error("stale"), { code: "STALE_UPDATE" }));

    render(
      <MaterialNoteModal
        open
        material={{ id: "material-1", displayName: "syllabus.pdf", note: "旧メモ", updatedAt: "2026-04-20T00:00:00.000Z" }}
        onClose={onClose}
        onSave={onSave}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("配布資料の補足メモを書けます"), {
      target: { value: "更新メモ" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await Promise.resolve();
    await Promise.resolve();

    expect(onSave).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue("更新メモ")).not.toBeNull();
  });

  it("locks close interactions while saving", async () => {
    let resolveSave;
    const onClose = vi.fn();
    const onSave = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSave = resolve;
        }),
    );

    render(
      <MaterialNoteModal
        open
        material={{ id: "material-1", displayName: "syllabus.pdf", note: "旧メモ", updatedAt: "2026-04-20T00:00:00.000Z" }}
        onClose={onClose}
        onSave={onSave}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("配布資料の補足メモを書けます"), {
      target: { value: "更新メモ" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(screen.getByRole("button", { name: "キャンセル" }).hasAttribute("disabled")).toBe(true);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();

    resolveSave();
    await Promise.resolve();
  });
});
