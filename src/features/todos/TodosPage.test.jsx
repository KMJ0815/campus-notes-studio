import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TodosPage } from "./TodosPage";
import { formatDate } from "../../lib/utils";

const subject = {
  id: "subject-1",
  name: "統計学",
};

const openTodo = {
  id: "todo-open",
  subjectId: "subject-1",
  subject,
  title: "レポート提出",
  memo: "章末課題をまとめる",
  dueDate: "2026-04-22",
  status: "open",
  completedAt: null,
  updatedAt: "2026-04-20T09:00:00.000Z",
};

const doneTodo = {
  id: "todo-done",
  subjectId: "subject-1",
  subject,
  title: "配布資料を読む",
  memo: "",
  dueDate: "",
  status: "done",
  completedAt: "2026-04-19T09:00:00.000Z",
  updatedAt: "2026-04-19T09:00:00.000Z",
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("TodosPage", () => {
  it("shows open todos first and reveals done todos only after expanding the completed section", () => {
    render(
      <TodosPage
        openTodos={[openTodo]}
        doneTodos={[doneTodo]}
        onOpenSubject={vi.fn()}
        onSaveTodo={vi.fn().mockResolvedValue(undefined)}
        onDeleteTodo={vi.fn().mockResolvedValue({ status: "deleted" })}
      />,
    );

    expect(screen.getByText("レポート提出")).not.toBeNull();
    expect(screen.queryByText("配布資料を読む")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /表示 \(1\)/ }));

    expect(screen.getByText("配布資料を読む")).not.toBeNull();
  });

  it("opens the editor from the row title", () => {
    render(
      <TodosPage
        openTodos={[openTodo]}
        doneTodos={[]}
        onOpenSubject={vi.fn()}
        onSaveTodo={vi.fn().mockResolvedValue(undefined)}
        onDeleteTodo={vi.fn().mockResolvedValue({ status: "deleted" })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "レポート提出" }));

    expect(screen.getByText("タイトル")).not.toBeNull();
    expect(screen.getByDisplayValue("2026-04-22")).not.toBeNull();
  });

  it("toggles todo status and routes to the selected subject", () => {
    const onOpenSubject = vi.fn();
    const onSaveTodo = vi.fn().mockResolvedValue(undefined);

    render(
      <TodosPage
        openTodos={[openTodo]}
        doneTodos={[]}
        onOpenSubject={onOpenSubject}
        onSaveTodo={onSaveTodo}
        onDeleteTodo={vi.fn().mockResolvedValue({ status: "deleted" })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "統計学" }));
    fireEvent.click(screen.getByRole("button", { name: "完了" }));

    expect(onOpenSubject).toHaveBeenCalledWith("subject-1");
    expect(onSaveTodo).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "todo-open",
        subjectId: "subject-1",
        status: "done",
      }),
    );
  });

  it("swallows toggle failures and releases the pending state", async () => {
    const onSaveTodo = vi.fn().mockRejectedValue(new Error("save failed"));

    render(
      <TodosPage
        openTodos={[openTodo]}
        doneTodos={[]}
        onOpenSubject={vi.fn()}
        onSaveTodo={onSaveTodo}
        onDeleteTodo={vi.fn().mockResolvedValue({ status: "deleted" })}
      />,
    );

    const toggleButton = screen.getByRole("button", { name: "完了" });
    fireEvent.click(toggleButton);

    expect(toggleButton.disabled).toBe(true);
    await Promise.resolve();
    await Promise.resolve();

    expect(onSaveTodo).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "完了" }).disabled).toBe(false);
  });

  it("keeps the editor open and releases pending state when delete fails", async () => {
    const onDeleteTodo = vi.fn().mockRejectedValue(new Error("delete failed"));

    render(
      <TodosPage
        openTodos={[openTodo]}
        doneTodos={[]}
        onOpenSubject={vi.fn()}
        onSaveTodo={vi.fn().mockResolvedValue(undefined)}
        onDeleteTodo={onDeleteTodo}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "レポート提出" }));
    fireEvent.click(screen.getByRole("button", { name: "削除" }));

    expect(screen.getByRole("button", { name: "削除" }).disabled).toBe(true);
    await Promise.resolve();
    await Promise.resolve();

    expect(onDeleteTodo).toHaveBeenCalledTimes(1);
    expect(screen.getByText("タイトル")).not.toBeNull();
    expect(screen.getByRole("button", { name: "削除" }).disabled).toBe(false);
  });

  it("shows updated timestamps with second-level precision", () => {
    const updatedAt = "2026-04-18T09:00:05+09:00";
    render(
      <TodosPage
        openTodos={[{ ...openTodo, updatedAt }]}
        doneTodos={[]}
        onOpenSubject={vi.fn()}
        onSaveTodo={vi.fn().mockResolvedValue(undefined)}
        onDeleteTodo={vi.fn().mockResolvedValue({ status: "deleted" })}
      />,
    );

    expect(screen.getByText(`更新 ${formatDate(updatedAt)}`)).not.toBeNull();
  });
});
