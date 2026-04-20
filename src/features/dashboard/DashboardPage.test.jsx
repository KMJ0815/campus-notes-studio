import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DashboardPage } from "./DashboardPage";

describe("DashboardPage", () => {
  it("renders the open todo count stat", () => {
    render(
      <DashboardPage
        summary={{
          activeSubjectsCount: 4,
          notesCount: 12,
          materialsCount: 3,
          attendanceCount: 9,
          openTodosCount: 5,
          todayClasses: [],
          recentNotes: [],
        }}
        onOpenTimetable={vi.fn()}
        onOpenSubject={vi.fn()}
        onEditRecentNote={vi.fn()}
      />,
    );

    expect(screen.getByText("未完了ToDo")).not.toBeNull();
    expect(screen.getByText("5")).not.toBeNull();
  });

  it("keeps the timetable action working", () => {
    const onOpenTimetable = vi.fn();
    render(
      <DashboardPage
        summary={{
          activeSubjectsCount: 1,
          notesCount: 0,
          materialsCount: 0,
          attendanceCount: 0,
          openTodosCount: 0,
          todayClasses: [],
          recentNotes: [],
        }}
        onOpenTimetable={onOpenTimetable}
        onOpenSubject={vi.fn()}
        onEditRecentNote={vi.fn()}
      />,
    );

    screen.getAllByRole("button", { name: "時間割へ" }).forEach((button) => {
      fireEvent.click(button);
    });
    expect(onOpenTimetable).toHaveBeenCalled();
  });
});
