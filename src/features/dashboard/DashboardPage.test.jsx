import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DashboardPage } from "./DashboardPage";

describe("DashboardPage", () => {
  function createSummary(overrides = {}) {
    return {
      activeSubjectsCount: 0,
      notesCount: 0,
      materialsCount: 0,
      attendanceCount: 0,
      openTodosCount: 0,
      todayClasses: [],
      recentNotes: [],
      ...overrides,
    };
  }

  it("renders the open todo count stat", () => {
    render(
      <DashboardPage
        summary={createSummary({
          activeSubjectsCount: 4,
          notesCount: 12,
          materialsCount: 3,
          attendanceCount: 9,
          openTodosCount: 5,
        })}
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
        summary={createSummary({
          activeSubjectsCount: 1,
        })}
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

  it("uses the normalized preview text instead of raw body text", () => {
    render(
      <DashboardPage
        summary={createSummary({
          recentNotes: [
            {
              id: "note-1",
              title: "第1回",
              bodyText: "RAW\nBODY",
              previewText: "RAW BODY",
              updatedAt: "2026-04-21T00:00:00.000Z",
              subject: {
                id: "subject-1",
                name: "統計学",
              },
            },
          ],
        })}
        onOpenTimetable={vi.fn()}
        onOpenSubject={vi.fn()}
        onEditRecentNote={vi.fn()}
      />,
    );

    expect(screen.getByText("RAW BODY")).not.toBeNull();
    expect(screen.queryByText("RAW\nBODY")).toBeNull();
  });

  it("keeps the recent note card shrink-safe for long text", () => {
    const longTitle = "無限に長いノートタイトル".repeat(8);
    const longSubject = "計算社会科学特論".repeat(6);
    const previewText = "https://example.com/" + "very-long-path/".repeat(12);
    const { container } = render(
      <DashboardPage
        summary={createSummary({
          recentNotes: [
            {
              id: "note-1",
              title: longTitle,
              bodyText: `${previewText}\n\n${previewText}`,
              previewText,
              updatedAt: "2026-04-21T00:00:00.000Z",
              subject: {
                id: "subject-1",
                name: longSubject,
              },
            },
          ],
        })}
        onOpenTimetable={vi.fn()}
        onOpenSubject={vi.fn()}
        onEditRecentNote={vi.fn()}
      />,
    );

    const grids = container.querySelectorAll(".grid");
    const recentNoteButton = screen.getByText(longTitle).closest("button");
    const title = screen.getByText(longTitle);
    const subjectLine = screen.getByText(longSubject);
    const preview = screen.getByText(previewText);

    expect(grids[1]?.className).toContain("2xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]");
    expect(recentNoteButton?.className).toContain("overflow-hidden");
    expect(recentNoteButton?.querySelector("div.min-w-0.flex-1")).not.toBeNull();
    expect(recentNoteButton?.querySelector("span.shrink-0.whitespace-nowrap")).not.toBeNull();
    expect(title.className).toContain("break-words");
    expect(subjectLine.className).toContain("truncate");
    expect(preview.className).toContain("break-words");
  });
});
