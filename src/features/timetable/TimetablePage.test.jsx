import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TimetablePage } from "./TimetablePage";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("TimetablePage", () => {
  it("shows subject name and room without rendering teacher names inside timetable cells", () => {
    render(
      <TimetablePage
        periods={[
          {
            id: "period-1",
            periodNo: 1,
            label: "1限",
            startTime: "09:00",
            endTime: "10:40",
            isEnabled: true,
          },
        ]}
        slotItems={[
          {
            slot: { id: "slot-1", weekday: "mon", periodNo: 1, activeSlotKey: "2026-spring:mon:1" },
            subject: {
              id: "subject-1",
              name: "統計学",
              teacherName: "山田 太郎",
              room: "301",
              color: "#4f46e5",
              isArchived: false,
            },
            openTodoCount: 2,
          },
        ]}
        onSelectSubject={vi.fn()}
        onCreateSubject={vi.fn()}
        onOpenSettings={vi.fn()}
        onExport={vi.fn()}
        detailPanel={<div>detail-panel</div>}
      />,
    );

    expect(screen.getByText("統計学")).not.toBeNull();
    expect(screen.getByText("301")).not.toBeNull();
    expect(screen.queryByText("山田 太郎")).toBeNull();
    expect(screen.getByLabelText("統計学、未完了 ToDo 2 件")).not.toBeNull();
  });

  it("keeps horizontal overflow inside the timetable card on narrow layouts", () => {
    const { container } = render(
      <TimetablePage
        periods={[
          {
            id: "period-1",
            periodNo: 1,
            label: "1限",
            startTime: "09:00",
            endTime: "10:40",
            isEnabled: true,
          },
        ]}
        slotItems={[]}
        onSelectSubject={vi.fn()}
        onCreateSubject={vi.fn()}
        onOpenSettings={vi.fn()}
        onExport={vi.fn()}
        detailPanel={<div>detail-panel</div>}
      />,
    );

    const root = container.firstElementChild;
    const scrollFrame = container.querySelector(".overflow-x-auto");

    expect(root?.className).toContain("min-w-0");
    expect(scrollFrame?.className).toContain("min-w-0");
    expect(scrollFrame?.firstElementChild?.className).toContain("min-w-[540px]");
  });
});
