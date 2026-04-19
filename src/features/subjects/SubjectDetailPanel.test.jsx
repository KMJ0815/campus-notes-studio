import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DETAIL_TABS } from "../../lib/constants";
import { SubjectDetailPanel } from "./SubjectDetailPanel";

describe("SubjectDetailPanel", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-18T09:00:00+09:00"));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("exposes accessible labels for icon-only actions", () => {
    render(
      <SubjectDetailPanel
        header={{
          subject: {
            id: "subject-1",
            name: "統計学",
            teacherName: "山田",
            room: "301",
            color: "#4f46e5",
            isArchived: false,
            memo: "",
          },
          slots: [],
          periods: [],
          notesCount: 1,
          materialsCount: 0,
          attendanceCount: 0,
        }}
        detailTab={DETAIL_TABS.notes}
        tabLoading={false}
        notes={[
          {
            id: "note-1",
            subjectId: "subject-1",
            title: "第1回",
            bodyText: "summary",
            lectureDate: "2026-04-18",
            updatedAt: "2026-04-18T09:00:00.000Z",
          },
        ]}
        materials={[]}
        attendance={[]}
        onChangeTab={vi.fn()}
        onEditSubject={vi.fn()}
        onArchiveSubject={vi.fn()}
        onCreateNote={vi.fn()}
        onEditNote={vi.fn()}
        onDeleteNote={vi.fn()}
        onUploadMaterials={vi.fn()}
        onOpenMaterial={vi.fn()}
        onEditMaterial={vi.fn()}
        onDeleteMaterial={vi.fn()}
        onMaterialPickerError={vi.fn()}
        onSaveAttendance={vi.fn()}
        onDeleteAttendance={vi.fn()}
        loadAttendanceSlotOptions={vi.fn().mockResolvedValue([])}
      />,
    );

    expect(screen.getByRole("button", { name: "授業を編集" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "授業をアーカイブ" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "ノートを編集" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "ノートを削除" })).not.toBeNull();
  });

  it("defaults attendance to the next active lecture date", () => {
    render(
      <SubjectDetailPanel
        header={{
          subject: {
            id: "subject-1",
            name: "統計学",
            teacherName: "山田",
            room: "301",
            color: "#4f46e5",
            isArchived: false,
            memo: "",
          },
          slots: [
            {
              id: "slot-1",
              weekday: "mon",
              periodNo: 1,
              activeSlotKey: "2026-spring:mon:1",
            },
          ],
          periods: [{ periodNo: 1, label: "1限", startTime: "09:00", endTime: "10:40" }],
          notesCount: 0,
          materialsCount: 0,
          attendanceCount: 0,
        }}
        detailTab={DETAIL_TABS.attendance}
        tabLoading={false}
        notes={[]}
        materials={[]}
        attendance={[]}
        onChangeTab={vi.fn()}
        onEditSubject={vi.fn()}
        onArchiveSubject={vi.fn()}
        onCreateNote={vi.fn()}
        onEditNote={vi.fn()}
        onDeleteNote={vi.fn()}
        onUploadMaterials={vi.fn()}
        onOpenMaterial={vi.fn()}
        onEditMaterial={vi.fn()}
        onDeleteMaterial={vi.fn()}
        onMaterialPickerError={vi.fn()}
        onMaterialPickerOpen={vi.fn()}
        onSaveAttendance={vi.fn()}
        onDeleteAttendance={vi.fn()}
        loadAttendanceSlotOptions={vi.fn().mockResolvedValue([
          {
            id: "slot-1",
            label: "月 1限 (09:00-10:40)",
            weekdayLabel: "月",
            periodNo: 1,
            isHistorical: false,
          },
        ])}
      />,
    );

    expect(screen.getByDisplayValue("2026-04-20")).not.toBeNull();
    expect(screen.queryByText("この日は時間割上の該当コマがありません。コマ未指定で保存されます。")).toBeNull();
  });

  it("recomputes the default attendance date when active slots arrive after render", async () => {
    const props = {
      detailTab: DETAIL_TABS.attendance,
      tabLoading: false,
      notes: [],
      materials: [],
      attendance: [],
      onChangeTab: vi.fn(),
      onEditSubject: vi.fn(),
      onArchiveSubject: vi.fn(),
      onCreateNote: vi.fn(),
      onEditNote: vi.fn(),
      onDeleteNote: vi.fn(),
      onUploadMaterials: vi.fn(),
      onOpenMaterial: vi.fn(),
      onEditMaterial: vi.fn(),
      onDeleteMaterial: vi.fn(),
      onMaterialPickerError: vi.fn(),
      onMaterialPickerOpen: vi.fn(),
      onSaveAttendance: vi.fn(),
      onDeleteAttendance: vi.fn(),
    };

    const { rerender } = render(
      <SubjectDetailPanel
        {...props}
        header={{
          subject: {
            id: "subject-1",
            name: "統計学",
            teacherName: "山田",
            room: "301",
            color: "#4f46e5",
            isArchived: false,
            memo: "",
          },
          slots: [],
          periods: [{ periodNo: 1, label: "1限", startTime: "09:00", endTime: "10:40" }],
          notesCount: 0,
          materialsCount: 0,
          attendanceCount: 0,
        }}
        loadAttendanceSlotOptions={vi.fn().mockResolvedValue([])}
      />,
    );

    expect(screen.getByDisplayValue("2026-04-18")).not.toBeNull();

    rerender(
      <SubjectDetailPanel
        {...props}
        header={{
          subject: {
            id: "subject-1",
            name: "統計学",
            teacherName: "山田",
            room: "301",
            color: "#4f46e5",
            isArchived: false,
            memo: "",
          },
          slots: [
            {
              id: "slot-1",
              weekday: "mon",
              periodNo: 1,
              activeSlotKey: "2026-spring:mon:1",
            },
          ],
          periods: [{ periodNo: 1, label: "1限", startTime: "09:00", endTime: "10:40" }],
          notesCount: 0,
          materialsCount: 0,
          attendanceCount: 0,
        }}
        loadAttendanceSlotOptions={vi.fn().mockResolvedValue([
          {
            id: "slot-1",
            label: "月 1限 (09:00-10:40)",
            weekdayLabel: "月",
            periodNo: 1,
            isHistorical: false,
          },
        ])}
      />,
    );

    await vi.runAllTimersAsync();

    expect(screen.getAllByDisplayValue("2026-04-20").length).toBeGreaterThan(0);
  });

  it("shows hydrated attendance slot labels instead of generic text", () => {
    render(
      <SubjectDetailPanel
        header={{
          subject: {
            id: "subject-1",
            name: "統計学",
            teacherName: "山田",
            room: "301",
            color: "#4f46e5",
            isArchived: false,
            memo: "",
          },
          slots: [],
          periods: [],
          notesCount: 0,
          materialsCount: 0,
          attendanceCount: 1,
        }}
        detailTab={DETAIL_TABS.attendance}
        tabLoading={false}
        notes={[]}
        materials={[]}
        attendance={[
          {
            id: "attendance-1",
            subjectId: "subject-1",
            lectureDate: "2026-04-20",
            timetableSlotId: "slot-1",
            status: "present",
            memo: "",
            slotLabel: "月 2限 (10:50-12:30) (履歴)",
          },
        ]}
        onChangeTab={vi.fn()}
        onEditSubject={vi.fn()}
        onArchiveSubject={vi.fn()}
        onCreateNote={vi.fn()}
        onEditNote={vi.fn()}
        onDeleteNote={vi.fn()}
        onUploadMaterials={vi.fn()}
        onOpenMaterial={vi.fn()}
        onEditMaterial={vi.fn()}
        onDeleteMaterial={vi.fn()}
        onMaterialPickerError={vi.fn()}
        onMaterialPickerOpen={vi.fn()}
        onSaveAttendance={vi.fn()}
        onDeleteAttendance={vi.fn()}
        loadAttendanceSlotOptions={vi.fn().mockResolvedValue([])}
      />,
    );

    expect(screen.getByText("月 2限 (10:50-12:30) (履歴)")).not.toBeNull();
    expect(screen.queryByText("コマ紐付け済み")).toBeNull();
  });

  it("opens the file picker for material uploads", () => {
    const showPicker = vi.fn();
    const onMaterialPickerOpen = vi.fn();
    Object.defineProperty(HTMLInputElement.prototype, "showPicker", {
      configurable: true,
      value: showPicker,
    });

    render(
      <SubjectDetailPanel
        header={{
          subject: {
            id: "subject-1",
            name: "統計学",
            teacherName: "山田",
            room: "301",
            color: "#4f46e5",
            isArchived: false,
            memo: "",
          },
          slots: [],
          periods: [],
          notesCount: 0,
          materialsCount: 0,
          attendanceCount: 0,
        }}
        detailTab={DETAIL_TABS.materials}
        tabLoading={false}
        notes={[]}
        materials={[]}
        attendance={[]}
        onChangeTab={vi.fn()}
        onEditSubject={vi.fn()}
        onArchiveSubject={vi.fn()}
        onCreateNote={vi.fn()}
        onEditNote={vi.fn()}
        onDeleteNote={vi.fn()}
        onUploadMaterials={vi.fn()}
        onOpenMaterial={vi.fn()}
        onEditMaterial={vi.fn()}
        onDeleteMaterial={vi.fn()}
        onMaterialPickerError={vi.fn()}
        onMaterialPickerOpen={onMaterialPickerOpen}
        onSaveAttendance={vi.fn()}
        onDeleteAttendance={vi.fn()}
        loadAttendanceSlotOptions={vi.fn().mockResolvedValue([])}
      />,
    );

    expect(screen.getAllByText("資料を追加")).toHaveLength(1);
    fireEvent.click(screen.getByText("資料を追加"));
    expect(showPicker).toHaveBeenCalled();
    expect(onMaterialPickerOpen).toHaveBeenCalled();
  });

  it("resets the attendance form when the edited record disappears from the list", async () => {
    const props = {
      detailTab: DETAIL_TABS.attendance,
      tabLoading: false,
      notes: [],
      materials: [],
      onChangeTab: vi.fn(),
      onEditSubject: vi.fn(),
      onArchiveSubject: vi.fn(),
      onCreateNote: vi.fn(),
      onEditNote: vi.fn(),
      onDeleteNote: vi.fn(),
      onUploadMaterials: vi.fn(),
      onOpenMaterial: vi.fn(),
      onEditMaterial: vi.fn(),
      onDeleteMaterial: vi.fn(),
      onMaterialPickerError: vi.fn(),
      onMaterialPickerOpen: vi.fn(),
      onSaveAttendance: vi.fn(),
      onDeleteAttendance: vi.fn(),
      loadAttendanceSlotOptions: vi.fn().mockResolvedValue([]),
    };

    const { rerender } = render(
      <SubjectDetailPanel
        {...props}
        header={{
          subject: {
            id: "subject-1",
            name: "統計学",
            teacherName: "山田",
            room: "301",
            color: "#4f46e5",
            isArchived: false,
            memo: "",
          },
          slots: [],
          periods: [],
          notesCount: 0,
          materialsCount: 0,
          attendanceCount: 1,
        }}
        attendance={[
          {
            id: "attendance-1",
            subjectId: "subject-1",
            lectureDate: "2026-04-18",
            timetableSlotId: "",
            status: "present",
            memo: "",
            slotLabel: "",
          },
        ]}
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: "出席を編集" })[0]);
    expect(screen.getByRole("button", { name: "新規入力へ戻す" })).not.toBeNull();

    rerender(
      <SubjectDetailPanel
        {...props}
        header={{
          subject: {
            id: "subject-1",
            name: "統計学",
            teacherName: "山田",
            room: "301",
            color: "#4f46e5",
            isArchived: false,
            memo: "",
          },
          slots: [],
          periods: [],
          notesCount: 0,
          materialsCount: 0,
          attendanceCount: 0,
        }}
        attendance={[]}
      />,
    );

    await vi.runAllTimersAsync();
    expect(screen.queryByRole("button", { name: "新規入力へ戻す" })).toBeNull();
  });
});
