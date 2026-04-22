import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TodoFormModal } from "./TodoFormModal";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("TodoFormModal", () => {
  it("keeps due dates when saving and shows the optional-date helper", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);

    render(
      <TodoFormModal
        open
        subject={{ id: "subject-1", name: "統計学" }}
        initialValue={null}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("例: レポート提出"), {
      target: { value: "発表準備" },
    });
    fireEvent.change(screen.getByPlaceholderText("YYYY-MM-DD"), {
      target: { value: "2026-04-21" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByText("期限は任意です。入力する場合は `YYYY-MM-DD` 形式で保存されます。")).not.toBeNull();
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "発表準備",
        dueDate: "2026-04-21",
      }),
    );
  });

  it.each([
    "2026-02-31",
    "2026-02-29",
    "2026/04/21",
    "2026-4-1",
  ])("blocks invalid due date input `%s` instead of silently saving without a deadline", (invalidValue) => {
    const onSave = vi.fn();

    render(
      <TodoFormModal
        open
        subject={{ id: "subject-1", name: "統計学" }}
        initialValue={null}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("例: レポート提出"), {
      target: { value: "発表準備" },
    });
    fireEvent.change(screen.getByPlaceholderText("YYYY-MM-DD"), {
      target: { value: invalidValue },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText("期限日は YYYY-MM-DD 形式の正しい日付で入力してください。")).not.toBeNull();
  });

  it("supports escape close while not saving", () => {
    const onClose = vi.fn();

    render(
      <TodoFormModal
        open
        subject={{ id: "subject-1", name: "統計学" }}
        initialValue={null}
        onClose={onClose}
        onSave={vi.fn()}
      />,
    );

    fireEvent.keyDown(window, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
