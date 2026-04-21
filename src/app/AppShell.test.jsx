import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "./AppShell";
import { PAGE_DEFS } from "../lib/constants";

const baseProps = {
  page: PAGE_DEFS.dashboard,
  onPageChange: vi.fn(),
  settings: {
    currentTermKey: "2026-spring",
    termLabel: "2026年度 春学期",
  },
  busy: false,
  stats: {
    activeSubjectsCount: 4,
    notesCount: 12,
    materialsCount: 6,
    attendanceCount: 9,
    openTodosCount: 3,
    todayClasses: [{ id: "slot-1" }, { id: "slot-2" }],
  },
  pwaState: {
    isOnline: true,
    isInstalledApp: false,
    installPromptEvent: null,
    updateAvailable: false,
    applyPwaUpdate: vi.fn(),
    handleInstallApp: vi.fn(),
    pwaRegistrationState: "ready",
  },
  onCreateSubject: vi.fn(),
  onOpenSettings: vi.fn(),
  onExport: vi.fn(),
};

function renderAppShell(props = {}) {
  return render(
    <AppShell {...baseProps} {...props}>
      <div>page-body</div>
    </AppShell>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AppShell", () => {
  it("renders the status card around the current term, today's classes, open todos, and online state", () => {
    renderAppShell();

    const statusCard = screen.getByRole("region", { name: "現在の学期ステータス" });
    const card = within(statusCard);

    expect(card.getByText("現在の学期")).not.toBeNull();
    expect(card.getByText("2026年度 春学期")).not.toBeNull();
    expect(card.getByText("今日の授業")).not.toBeNull();
    expect(card.getByText("2件")).not.toBeNull();
    expect(card.getByText("未完了ToDo")).not.toBeNull();
    expect(card.getByText("3件")).not.toBeNull();
    expect(card.getByText("オンライン")).not.toBeNull();
  });

  it("shows the term label only once and keeps the main header focused on page context", () => {
    renderAppShell();

    expect(screen.getAllByText("2026年度 春学期").length).toBe(1);
    expect(screen.getByText("今学期の動きと最近の更新を確認")).not.toBeNull();
    expect(screen.getByRole("heading", { name: "ダッシュボード" })).not.toBeNull();
    expect(screen.queryByText("今学期の状況")).toBeNull();
  });

  it("keeps the main content shrinkable and exposes the update action only when a PWA update exists", () => {
    const { container, rerender } = renderAppShell();

    expect(container.querySelector("main")?.className).toContain("min-w-0");
    expect(screen.queryByRole("button", { name: "更新を適用" })).toBeNull();

    rerender(
      <AppShell {...baseProps} pwaState={{ ...baseProps.pwaState, updateAvailable: true }}>
        <div>page-body</div>
      </AppShell>,
    );

    expect(screen.getByRole("button", { name: "更新を適用" })).not.toBeNull();
  });

  it("routes the status-card metrics and navigation to timetable and todos", () => {
    renderAppShell();

    fireEvent.click(screen.getByRole("button", { name: /今日の授業/ }));
    fireEvent.click(screen.getByRole("button", { name: /未完了ToDo/ }));
    fireEvent.click(screen.getByRole("button", { name: "ToDo" }));

    expect(baseProps.onPageChange).toHaveBeenNthCalledWith(1, PAGE_DEFS.timetable);
    expect(baseProps.onPageChange).toHaveBeenNthCalledWith(2, PAGE_DEFS.todos);
    expect(baseProps.onPageChange).toHaveBeenNthCalledWith(3, PAGE_DEFS.todos);
  });
});
