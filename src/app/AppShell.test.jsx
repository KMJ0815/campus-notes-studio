import { cleanup, render, screen, within } from "@testing-library/react";
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
});
