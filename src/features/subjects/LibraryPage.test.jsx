import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LibraryPage } from "./LibraryPage";

describe("LibraryPage", () => {
  it("hardens subject cards against long text overflow", () => {
    const longSubjectName = "計算社会科学演習".repeat(7);
    const longTeacherLine = "山田太郎".repeat(8);
    const { container } = render(
      <LibraryPage
        activeSubjects={[
          {
            id: "subject-1",
            name: longSubjectName,
            teacherName: longTeacherLine,
            room: "研究棟".repeat(8),
            color: "#4f46e5",
            memo: "",
            slots: [
              {
                id: "slot-1",
                weekday: "mon",
                periodNo: 1,
              },
            ],
          },
        ]}
        archivedSubjects={[
          {
            id: "subject-2",
            name: longSubjectName,
            teacherName: longTeacherLine,
          },
        ]}
        periods={[
          {
            periodNo: 1,
            label: "1限",
          },
        ]}
        search=""
        onSearchChange={vi.fn()}
        onSelectSubject={vi.fn()}
        onEditSubject={vi.fn()}
        onArchiveSubject={vi.fn()}
        onRestoreSubject={vi.fn()}
        onCreateSubject={vi.fn()}
      />,
    );

    const activeCard = screen.getAllByText(longSubjectName)[0].closest('[role="button"]');
    const activeTitle = screen.getAllByText(longSubjectName)[0];
    const archivedTitle = screen.getAllByText(longSubjectName)[1];
    const teacherLine = screen.getAllByText(new RegExp(longTeacherLine))[0];

    expect(container.querySelector(".min-w-0.flex-1")).not.toBeNull();
    expect(activeCard?.className).toContain("overflow-hidden");
    expect(activeTitle.className).toContain("break-words");
    expect(teacherLine.className).toContain("break-words");
    expect(archivedTitle.className).toContain("break-words");
  });
});
