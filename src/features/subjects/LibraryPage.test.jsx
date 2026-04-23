import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LibraryPage } from "./LibraryPage";

describe("LibraryPage", () => {
  afterEach(() => {
    cleanup();
  });

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

  it("guards archive and restore actions per subject while a request is pending", async () => {
    let resolveArchive;
    let resolveRestore;
    const onArchiveSubject = vi.fn(() => new Promise((resolve) => {
      resolveArchive = resolve;
    }));
    const onRestoreSubject = vi.fn(() => new Promise((resolve) => {
      resolveRestore = resolve;
    }));

    render(
      <LibraryPage
        activeSubjects={[
          {
            id: "subject-1",
            name: "統計学",
            teacherName: "",
            room: "",
            color: "#4f46e5",
            memo: "",
            slots: [],
          },
        ]}
        archivedSubjects={[
          {
            id: "subject-2",
            name: "解析学",
            teacherName: "",
            slots: [],
          },
        ]}
        periods={[]}
        search=""
        onSearchChange={vi.fn()}
        onSelectSubject={vi.fn()}
        onEditSubject={vi.fn()}
        onArchiveSubject={onArchiveSubject}
        onRestoreSubject={onRestoreSubject}
        onCreateSubject={vi.fn()}
      />,
    );

    const archiveButton = screen.getAllByRole("button", { name: "授業をアーカイブ" })[0];
    fireEvent.click(archiveButton);
    fireEvent.click(archiveButton);

    await waitFor(() => {
      expect(onArchiveSubject).toHaveBeenCalledTimes(1);
      expect(archiveButton.hasAttribute("disabled")).toBe(true);
    });

    resolveArchive();
    await waitFor(() => {
      expect(archiveButton.hasAttribute("disabled")).toBe(false);
    });

    const restoreButton = screen.getByRole("button", { name: "復元" });
    fireEvent.click(restoreButton);
    fireEvent.click(restoreButton);

    await waitFor(() => {
      expect(onRestoreSubject).toHaveBeenCalledTimes(1);
      expect(restoreButton.hasAttribute("disabled")).toBe(true);
    });

    resolveRestore();
    await waitFor(() => {
      expect(restoreButton.hasAttribute("disabled")).toBe(false);
    });
  });
});
