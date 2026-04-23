import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DETAIL_TABS } from "../../lib/constants";
import { formatDate } from "../../lib/utils";
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

  function createDeferred() {
    let resolve;
    const promise = new Promise((resolver) => {
      resolve = resolver;
    });
    return { promise, resolve };
  }

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

  it("guards archive actions while an archive request is pending", async () => {
    const deferred = createDeferred();
    const onArchiveSubject = vi.fn(() => deferred.promise);

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
          openTodosCount: 0,
          doneTodosCount: 0,
        }}
        detailTab={DETAIL_TABS.notes}
        tabLoading={false}
        notes={[]}
        materials={[]}
        attendance={[]}
        todos={[]}
        onChangeTab={vi.fn()}
        onEditSubject={vi.fn()}
        onArchiveSubject={onArchiveSubject}
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
        onSaveTodo={vi.fn()}
        onDeleteTodo={vi.fn()}
      />,
    );

    const archiveButton = screen.getByRole("button", { name: "授業をアーカイブ" });
    fireEvent.click(archiveButton);
    fireEvent.click(archiveButton);

    expect(onArchiveSubject).toHaveBeenCalledTimes(1);
    expect(archiveButton.hasAttribute("disabled")).toBe(true);

    deferred.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });

  it("hardens the subject header and note cards against long text and blank titles", () => {
    const longSubjectName = "応用データサイエンス特論".repeat(6);
    const longMemo = "https://example.com/" + "memo/".repeat(20);
    const { container } = render(
      <SubjectDetailPanel
        header={{
          subject: {
            id: "subject-1",
            name: longSubjectName,
            teacherName: "山田".repeat(8),
            room: "研究棟".repeat(8),
            color: "#4f46e5",
            isArchived: false,
            memo: longMemo,
          },
          slots: [],
          periods: [],
          notesCount: 1,
          materialsCount: 0,
          attendanceCount: 0,
          openTodosCount: 0,
          doneTodosCount: 0,
        }}
        detailTab={DETAIL_TABS.notes}
        tabLoading={false}
        notes={[
          {
            id: "note-1",
            subjectId: "subject-1",
            title: "   ",
            bodyText: longMemo,
            lectureDate: "2026-04-18",
            updatedAt: "2026-04-18T09:00:00.000Z",
          },
        ]}
        materials={[]}
        attendance={[]}
        todos={[]}
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
        onSaveTodo={vi.fn()}
        onDeleteTodo={vi.fn()}
      />,
    );

    const headerTitle = screen.getByText(longSubjectName);
    const noteTitle = screen.getByText("無題ノート");
    const noteBody = screen.getAllByText(longMemo)[1];

    expect(container.querySelector(".min-w-0.flex-1")).not.toBeNull();
    expect(headerTitle.className).toContain("break-words");
    expect(noteTitle.className).toContain("break-words");
    expect(noteBody.className).toContain("break-words");
  });

  it("hardens material cards against long filenames and memos", () => {
    const longFileName = `lecture-${"very-long-segment-".repeat(12)}pdf`;
    const longMemo = "資料メモ".repeat(20);
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
          materialsCount: 1,
          attendanceCount: 0,
          openTodosCount: 0,
          doneTodosCount: 0,
        }}
        detailTab={DETAIL_TABS.materials}
        tabLoading={false}
        notes={[]}
        materials={[
          {
            id: "material-1",
            displayName: longFileName,
            sizeBytes: 1024,
            mimeType: "application/pdf",
            fileExt: "pdf",
            note: longMemo,
            createdAt: "2026-04-18T09:00:00.000Z",
          },
        ]}
        attendance={[]}
        todos={[]}
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
        onSaveTodo={vi.fn()}
        onDeleteTodo={vi.fn()}
      />,
    );

    expect(screen.getByText(longFileName).className).toContain("break-words");
    expect(screen.getByText(longMemo).className).toContain("break-words");
  });

  it("hardens attendance cards against long memo text", () => {
    const longMemo = "https://attendance.example.com/" + "memo/".repeat(18);
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
          openTodosCount: 0,
          doneTodosCount: 0,
        }}
        detailTab={DETAIL_TABS.attendance}
        tabLoading={false}
        notes={[]}
        materials={[]}
        attendance={[
          {
            id: "attendance-1",
            lectureDate: "2026-04-18",
            status: "present",
            slotLabel: "月 1限",
            memo: longMemo,
          },
        ]}
        todos={[]}
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
        onSaveTodo={vi.fn()}
        onDeleteTodo={vi.fn()}
      />,
    );

    expect(screen.getByText(longMemo).className).toContain("break-words");
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

  it("does not load attendance slot options while another tab is active", async () => {
    const loadAttendanceSlotOptions = vi.fn().mockResolvedValue([]);
    const baseProps = {
      header: {
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
      },
      tabLoading: false,
      notes: [],
      materials: [],
      attendance: [],
      todos: [],
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
      loadAttendanceSlotOptions,
      onSaveTodo: vi.fn(),
      onDeleteTodo: vi.fn(),
    };

    const { rerender } = render(
      <SubjectDetailPanel
        {...baseProps}
        detailTab={DETAIL_TABS.notes}
      />,
    );

    await Promise.resolve();
    await Promise.resolve();
    expect(loadAttendanceSlotOptions).not.toHaveBeenCalled();

    rerender(
      <SubjectDetailPanel
        {...baseProps}
        detailTab={DETAIL_TABS.attendance}
      />,
    );

    await Promise.resolve();
    await Promise.resolve();
    expect(loadAttendanceSlotOptions).toHaveBeenCalledTimes(1);
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

  it("adds todos from the quick add row", async () => {
    const onSaveTodo = vi.fn().mockResolvedValue(undefined);

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
          openTodosCount: 0,
          doneTodosCount: 0,
        }}
        detailTab={DETAIL_TABS.todos}
        tabLoading={false}
        notes={[]}
        materials={[]}
        attendance={[]}
        todos={[]}
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
        onSaveTodo={onSaveTodo}
        onDeleteTodo={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("ToDoタイトル"), { target: { value: "レポート提出" } });
    fireEvent.change(screen.getByLabelText("ToDo期限日"), { target: { value: "2026-04-21" } });
    fireEvent.click(screen.getByRole("button", { name: "追加" }));

    await Promise.resolve();
    await Promise.resolve();
    expect(onSaveTodo).toHaveBeenCalledWith(
      expect.objectContaining({
        subjectId: "subject-1",
        title: "レポート提出",
        dueDate: "2026-04-21",
        status: "open",
      }),
    );
    expect(screen.getByLabelText("ToDo期限日").value).toBe("");
  });

  it.each([
    "2026-02-31",
    "2026-02-29",
    "2026/04/21",
    "2026-4-1",
  ])("blocks invalid quick-add due date `%s` instead of silently dropping it", (invalidValue) => {
    const onSaveTodo = vi.fn().mockResolvedValue(undefined);

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
          openTodosCount: 0,
          doneTodosCount: 0,
        }}
        detailTab={DETAIL_TABS.todos}
        tabLoading={false}
        notes={[]}
        materials={[]}
        attendance={[]}
        todos={[]}
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
        onSaveTodo={onSaveTodo}
        onDeleteTodo={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("ToDoタイトル"), { target: { value: "レポート提出" } });
    fireEvent.change(screen.getByLabelText("ToDo期限日"), { target: { value: invalidValue } });
    fireEvent.click(screen.getByRole("button", { name: "追加" }));

    expect(onSaveTodo).not.toHaveBeenCalled();
    expect(screen.getByText("期限日は YYYY-MM-DD 形式の正しい日付で入力してください。")).not.toBeNull();
  });

  it("blocks invalid attendance lecture dates before saving", () => {
    const onSaveAttendance = vi.fn();

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
          openTodosCount: 0,
          doneTodosCount: 0,
        }}
        detailTab={DETAIL_TABS.attendance}
        tabLoading={false}
        notes={[]}
        materials={[]}
        attendance={[]}
        todos={[]}
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
        onSaveAttendance={onSaveAttendance}
        onDeleteAttendance={vi.fn()}
        loadAttendanceSlotOptions={vi.fn().mockResolvedValue([])}
        onSaveTodo={vi.fn()}
        onDeleteTodo={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("YYYY-MM-DD"), { target: { value: "2026-02-31" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(onSaveAttendance).not.toHaveBeenCalled();
    expect(screen.getByText("講義日は YYYY-MM-DD 形式の正しい日付で入力してください。")).not.toBeNull();
  });

  it("submits quick add from Enter without using the add button click", async () => {
    const onSaveTodo = vi.fn().mockResolvedValue(undefined);

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
          openTodosCount: 0,
          doneTodosCount: 0,
        }}
        detailTab={DETAIL_TABS.todos}
        tabLoading={false}
        notes={[]}
        materials={[]}
        attendance={[]}
        todos={[]}
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
        onSaveTodo={onSaveTodo}
        onDeleteTodo={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("ToDoタイトル"), { target: { value: "提出物を確認" } });
    fireEvent.submit(screen.getByRole("button", { name: "追加" }).closest("form"));

    await Promise.resolve();
    expect(onSaveTodo).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "提出物を確認",
      }),
    );
  });

  it("prevents duplicate quick-add submits and only locks the quick-add controls while saving", async () => {
    const deferred = createDeferred();
    const existingTodo = {
      id: "todo-1",
      subjectId: "subject-1",
      title: "参考文献を読む",
      memo: "",
      dueDate: "2026-04-22",
      status: "open",
      completedAt: null,
      createdAt: "2026-04-18T09:00:00.000Z",
      updatedAt: "2026-04-18T09:00:00.000Z",
    };
    const onSaveTodo = vi
      .fn()
      .mockImplementationOnce(() => deferred.promise)
      .mockResolvedValue(undefined);
    const onDeleteTodo = vi.fn().mockResolvedValue(undefined);

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
          openTodosCount: 1,
          doneTodosCount: 0,
        }}
        detailTab={DETAIL_TABS.todos}
        tabLoading={false}
        notes={[]}
        materials={[]}
        attendance={[]}
        todos={[existingTodo]}
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
        onSaveTodo={onSaveTodo}
        onDeleteTodo={onDeleteTodo}
      />,
    );

    const titleInput = screen.getByLabelText("ToDoタイトル");
    const dueDateInput = screen.getByLabelText("ToDo期限日");
    const addButton = screen.getByRole("button", { name: "追加" });

    fireEvent.change(titleInput, { target: { value: "レポート提出" } });
    fireEvent.change(dueDateInput, { target: { value: "2026-04-21" } });

    fireEvent.click(addButton);
    fireEvent.click(addButton);

    expect(onSaveTodo).toHaveBeenCalledTimes(1);
    expect(titleInput.disabled).toBe(true);
    expect(dueDateInput.disabled).toBe(true);
    expect(addButton.disabled).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "ToDo を編集" }));
    expect(screen.getByDisplayValue("参考文献を読む")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "完了にする" }));
    expect(onSaveTodo).toHaveBeenCalledTimes(2);

    const deleteButton = screen.getByRole("button", { name: "ToDo を削除" });
    expect(deleteButton.disabled).toBe(true);
    fireEvent.click(deleteButton);
    expect(onDeleteTodo).not.toHaveBeenCalled();

    deferred.resolve(undefined);
    await Promise.resolve();
    await Promise.resolve();

    expect(titleInput.disabled).toBe(false);
    expect(dueDateInput.disabled).toBe(false);
    expect(addButton.disabled).toBe(true);
    expect(titleInput.value).toBe("");
    expect(dueDateInput.value).toBe("");

    fireEvent.change(titleInput, { target: { value: "次の課題" } });
    expect(addButton.disabled).toBe(false);
  });

  it("keeps todo drafts when only the subject slots change", async () => {
    const props = {
      detailTab: DETAIL_TABS.todos,
      tabLoading: false,
      notes: [],
      materials: [],
      attendance: [],
      todos: [
        {
          id: "todo-1",
          subjectId: "subject-1",
          title: "参考文献を読む",
          memo: "",
          dueDate: "2026-04-22",
          status: "open",
          completedAt: null,
          createdAt: "2026-04-18T09:00:00.000Z",
          updatedAt: "2026-04-18T09:00:00.000Z",
        },
      ],
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
      onSaveTodo: vi.fn().mockResolvedValue(undefined),
      onDeleteTodo: vi.fn().mockResolvedValue(undefined),
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
          openTodosCount: 1,
          doneTodosCount: 0,
        }}
      />,
    );

    fireEvent.change(screen.getByLabelText("ToDoタイトル"), { target: { value: "下書きを保持" } });
    fireEvent.click(screen.getByRole("button", { name: "ToDo を編集" }));
    fireEvent.change(screen.getByDisplayValue("参考文献を読む"), { target: { value: "参考文献を読む（更新）" } });

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
          openTodosCount: 1,
          doneTodosCount: 0,
        }}
      />,
    );

    await vi.runAllTimersAsync();

    expect(screen.getByLabelText("ToDoタイトル").value).toBe("下書きを保持");
    expect(screen.getByDisplayValue("参考文献を読む（更新）")).not.toBeNull();
  });

  it("prevents duplicate row actions while a todo item is pending", async () => {
    const deferred = createDeferred();
    const todo = {
      id: "todo-1",
      subjectId: "subject-1",
      title: "参考文献を読む",
      memo: "",
      dueDate: "2026-04-22",
      status: "open",
      completedAt: null,
      createdAt: "2026-04-18T09:00:00.000Z",
      updatedAt: "2026-04-18T09:00:00.000Z",
    };
    const onSaveTodo = vi.fn().mockImplementation(() => deferred.promise);
    const onDeleteTodo = vi.fn().mockResolvedValue(undefined);

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
          openTodosCount: 1,
          doneTodosCount: 0,
        }}
        detailTab={DETAIL_TABS.todos}
        tabLoading={false}
        notes={[]}
        materials={[]}
        attendance={[]}
        todos={[todo]}
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
        onSaveTodo={onSaveTodo}
        onDeleteTodo={onDeleteTodo}
      />,
    );

    const toggleButton = screen.getByRole("button", { name: "完了にする" });
    fireEvent.click(toggleButton);
    fireEvent.click(toggleButton);

    expect(onSaveTodo).toHaveBeenCalledTimes(1);
    expect(toggleButton.disabled).toBe(true);
    expect(screen.getByRole("button", { name: "ToDo を編集" }).disabled).toBe(true);
    expect(screen.getByRole("button", { name: "ToDo を削除" }).disabled).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "ToDo を削除" }));
    expect(onDeleteTodo).not.toHaveBeenCalled();

    deferred.resolve(undefined);
    await Promise.resolve();
    await Promise.resolve();

    expect(screen.getByRole("button", { name: "完了にする" }).disabled).toBe(false);
  });

  it("keeps the attendance draft intact when save fails", async () => {
    const onSaveAttendance = vi.fn().mockRejectedValue(Object.assign(new Error("stale"), { code: "STALE_UPDATE" }));

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
          periods: [{ periodNo: 1, label: "1限", startTime: "09:00", endTime: "10:40" }],
          notesCount: 0,
          materialsCount: 0,
          attendanceCount: 0,
          openTodosCount: 0,
          doneTodosCount: 0,
        }}
        detailTab={DETAIL_TABS.attendance}
        tabLoading={false}
        notes={[]}
        materials={[]}
        attendance={[]}
        todos={[]}
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
        onSaveAttendance={onSaveAttendance}
        onDeleteAttendance={vi.fn()}
        loadAttendanceSlotOptions={vi.fn().mockResolvedValue([])}
        onSaveTodo={vi.fn()}
        onDeleteTodo={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("メモ"), {
      target: { value: "保存失敗でも残るメモ" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await Promise.resolve();
    await Promise.resolve();

    expect(onSaveAttendance).toHaveBeenCalledTimes(1);
    expect(screen.getByDisplayValue("保存失敗でも残るメモ")).not.toBeNull();
  });

  it("keeps the next subject attendance draft intact when a previous subject save resolves later", async () => {
    const deferred = createDeferred();
    const onSaveAttendance = vi.fn().mockImplementation((draft) => {
      if (draft.subjectId === "subject-1") return deferred.promise;
      return Promise.resolve();
    });
    const props = {
      detailTab: DETAIL_TABS.attendance,
      tabLoading: false,
      notes: [],
      materials: [],
      attendance: [],
      todos: [],
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
      onSaveAttendance,
      onDeleteAttendance: vi.fn(),
      loadAttendanceSlotOptions: vi.fn().mockResolvedValue([]),
      onSaveTodo: vi.fn(),
      onDeleteTodo: vi.fn(),
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
          openTodosCount: 0,
          doneTodosCount: 0,
        }}
      />,
    );

    fireEvent.change(screen.getByLabelText("メモ"), {
      target: { value: "A のメモ" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    rerender(
      <SubjectDetailPanel
        {...props}
        header={{
          subject: {
            id: "subject-2",
            name: "解析学",
            teacherName: "佐藤",
            room: "302",
            color: "#0f766e",
            isArchived: false,
            memo: "",
          },
          slots: [],
          periods: [{ periodNo: 1, label: "1限", startTime: "09:00", endTime: "10:40" }],
          notesCount: 0,
          materialsCount: 0,
          attendanceCount: 0,
          openTodosCount: 0,
          doneTodosCount: 0,
        }}
      />,
    );

    fireEvent.change(screen.getByLabelText("メモ"), {
      target: { value: "B のメモ" },
    });

    deferred.resolve(undefined);
    await Promise.resolve();
    await Promise.resolve();

    expect(screen.getByDisplayValue("B のメモ")).not.toBeNull();
    expect(screen.getByRole("button", { name: "保存" }).disabled).toBe(false);
  });

  it("prevents duplicate attendance saves while a save is pending", async () => {
    const deferred = createDeferred();
    const onSaveAttendance = vi.fn().mockImplementation(() => deferred.promise);

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
          periods: [{ periodNo: 1, label: "1限", startTime: "09:00", endTime: "10:40" }],
          notesCount: 0,
          materialsCount: 0,
          attendanceCount: 0,
          openTodosCount: 0,
          doneTodosCount: 0,
        }}
        detailTab={DETAIL_TABS.attendance}
        tabLoading={false}
        notes={[]}
        materials={[]}
        attendance={[]}
        todos={[]}
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
        onSaveAttendance={onSaveAttendance}
        onDeleteAttendance={vi.fn()}
        loadAttendanceSlotOptions={vi.fn().mockResolvedValue([])}
        onSaveTodo={vi.fn()}
        onDeleteTodo={vi.fn()}
      />,
    );

    const saveButton = screen.getByRole("button", { name: "保存" });
    const dateInput = screen.getByDisplayValue("2026-04-18");
    const memoInput = screen.getByLabelText("メモ");

    fireEvent.change(memoInput, {
      target: { value: "二重送信しない" },
    });
    fireEvent.click(saveButton);
    fireEvent.click(saveButton);

    expect(onSaveAttendance).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "保存中…" }).disabled).toBe(true);
    expect(dateInput.disabled).toBe(true);
    expect(memoInput.disabled).toBe(true);

    deferred.resolve(undefined);
    await Promise.resolve();
    await Promise.resolve();

    expect(screen.getByRole("button", { name: "保存" }).disabled).toBe(false);
  });

  it("keeps the next subject quick todo input intact when a previous subject save resolves later", async () => {
    const deferred = createDeferred();
    const onSaveTodo = vi.fn().mockImplementation((draft) => {
      if (draft.subjectId === "subject-1") return deferred.promise;
      return Promise.resolve();
    });
    const props = {
      detailTab: DETAIL_TABS.todos,
      tabLoading: false,
      notes: [],
      materials: [],
      attendance: [],
      todos: [],
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
      onSaveTodo,
      onDeleteTodo: vi.fn(),
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
          attendanceCount: 0,
          openTodosCount: 0,
          doneTodosCount: 0,
        }}
      />,
    );

    fireEvent.change(screen.getByLabelText("ToDoタイトル"), { target: { value: "A の課題" } });
    fireEvent.change(screen.getByLabelText("ToDo期限日"), { target: { value: "2026-04-25" } });
    fireEvent.click(screen.getByRole("button", { name: "追加" }));

    rerender(
      <SubjectDetailPanel
        {...props}
        header={{
          subject: {
            id: "subject-2",
            name: "解析学",
            teacherName: "佐藤",
            room: "302",
            color: "#0f766e",
            isArchived: false,
            memo: "",
          },
          slots: [],
          periods: [],
          notesCount: 0,
          materialsCount: 0,
          attendanceCount: 0,
          openTodosCount: 0,
          doneTodosCount: 0,
        }}
      />,
    );

    fireEvent.change(screen.getByLabelText("ToDoタイトル"), { target: { value: "B の課題" } });
    fireEvent.change(screen.getByLabelText("ToDo期限日"), { target: { value: "2026-04-26" } });

    deferred.resolve(undefined);
    await Promise.resolve();
    await Promise.resolve();

    expect(screen.getByLabelText("ToDoタイトル").value).toBe("B の課題");
    expect(screen.getByLabelText("ToDo期限日").value).toBe("2026-04-26");
    expect(screen.getByRole("button", { name: "追加" }).disabled).toBe(false);
  });

  it("edits an existing todo in the modal", async () => {
    const onSaveTodo = vi.fn().mockResolvedValue(undefined);

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
          openTodosCount: 1,
          doneTodosCount: 0,
        }}
        detailTab={DETAIL_TABS.todos}
        tabLoading={false}
        notes={[]}
        materials={[]}
        attendance={[]}
        todos={[
          {
            id: "todo-1",
            subjectId: "subject-1",
            title: "参考文献を読む",
            memo: "",
            dueDate: "2026-04-22",
            status: "open",
            completedAt: null,
            createdAt: "2026-04-18T09:00:00.000Z",
            updatedAt: "2026-04-18T09:00:00.000Z",
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
        onSaveTodo={onSaveTodo}
        onDeleteTodo={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "ToDo を編集" }));
    fireEvent.change(screen.getByDisplayValue("参考文献を読む"), { target: { value: "参考文献を読む（更新）" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await Promise.resolve();
    expect(onSaveTodo).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "todo-1",
        title: "参考文献を読む（更新）",
        baseUpdatedAt: "2026-04-18T09:00:00.000Z",
      }),
    );
  });

  it("keeps the todo editor open when save fails", async () => {
    const onSaveTodo = vi.fn().mockRejectedValue(Object.assign(new Error("stale"), { code: "STALE_UPDATE" }));

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
          openTodosCount: 1,
          doneTodosCount: 0,
        }}
        detailTab={DETAIL_TABS.todos}
        tabLoading={false}
        notes={[]}
        materials={[]}
        attendance={[]}
        todos={[
          {
            id: "todo-1",
            subjectId: "subject-1",
            title: "参考文献を読む",
            memo: "",
            dueDate: "2026-04-22",
            status: "open",
            completedAt: null,
            createdAt: "2026-04-18T09:00:00.000Z",
            updatedAt: "2026-04-18T09:00:00.000Z",
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
        onSaveTodo={onSaveTodo}
        onDeleteTodo={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "ToDo を編集" }));
    fireEvent.change(screen.getByDisplayValue("参考文献を読む"), { target: { value: "参考文献を読む（更新）" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await Promise.resolve();
    await Promise.resolve();
    await vi.runAllTimersAsync();

    expect(onSaveTodo).toHaveBeenCalledTimes(1);
    expect(screen.getByDisplayValue("参考文献を読む（更新）")).not.toBeNull();
    expect(screen.getByRole("heading", { name: "ToDo を編集" })).not.toBeNull();
  });

  it("keeps the todo editor open when delete is cancelled", async () => {
    const onDeleteTodo = vi.fn().mockResolvedValue({ status: "cancelled" });

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
          openTodosCount: 1,
          doneTodosCount: 0,
        }}
        detailTab={DETAIL_TABS.todos}
        tabLoading={false}
        notes={[]}
        materials={[]}
        attendance={[]}
        todos={[
          {
            id: "todo-1",
            subjectId: "subject-1",
            title: "参考文献を読む",
            memo: "",
            dueDate: "2026-04-22",
            status: "open",
            completedAt: null,
            createdAt: "2026-04-18T09:00:00.000Z",
            updatedAt: "2026-04-18T09:00:00.000Z",
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
        onSaveTodo={vi.fn().mockResolvedValue(undefined)}
        onDeleteTodo={onDeleteTodo}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "ToDo を編集" }));
    fireEvent.click(screen.getAllByRole("button", { name: "ToDo を削除" })[0]);

    await Promise.resolve();
    await Promise.resolve();

    expect(onDeleteTodo).toHaveBeenCalledTimes(1);
    expect(screen.getByDisplayValue("参考文献を読む")).not.toBeNull();
  });

  it("keeps the todo editor open when delete fails", async () => {
    const onDeleteTodo = vi.fn().mockRejectedValue(new Error("delete failed"));

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
          openTodosCount: 1,
          doneTodosCount: 0,
        }}
        detailTab={DETAIL_TABS.todos}
        tabLoading={false}
        notes={[]}
        materials={[]}
        attendance={[]}
        todos={[
          {
            id: "todo-1",
            subjectId: "subject-1",
            title: "参考文献を読む",
            memo: "",
            dueDate: "2026-04-22",
            status: "open",
            completedAt: null,
            createdAt: "2026-04-18T09:00:00.000Z",
            updatedAt: "2026-04-18T09:00:00.000Z",
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
        onSaveTodo={vi.fn().mockResolvedValue(undefined)}
        onDeleteTodo={onDeleteTodo}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "ToDo を編集" }));
    fireEvent.click(screen.getAllByRole("button", { name: "ToDo を削除" })[0]);

    await Promise.resolve();
    await Promise.resolve();

    expect(screen.getByDisplayValue("参考文献を読む")).not.toBeNull();
  });

  it("prompts before closing a dirty todo editor", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

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
          openTodosCount: 1,
          doneTodosCount: 0,
        }}
        detailTab={DETAIL_TABS.todos}
        tabLoading={false}
        notes={[]}
        materials={[]}
        attendance={[]}
        todos={[
          {
            id: "todo-1",
            subjectId: "subject-1",
            title: "参考文献を読む",
            memo: "",
            dueDate: "2026-04-22",
            status: "open",
            completedAt: null,
            createdAt: "2026-04-18T09:00:00.000Z",
            updatedAt: "2026-04-18T09:00:00.000Z",
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
        onSaveTodo={vi.fn().mockResolvedValue(undefined)}
        onDeleteTodo={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "ToDo を編集" }));
    fireEvent.change(screen.getByDisplayValue("参考文献を読む"), { target: { value: "参考文献を読む（更新）" } });
    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));

    expect(confirmSpy).toHaveBeenCalledWith("未保存の変更があります。破棄しますか？");
    expect(screen.getByDisplayValue("参考文献を読む（更新）")).not.toBeNull();
    confirmSpy.mockRestore();
  });

  it("shows todo updated timestamps with second-level precision", () => {
    const updatedAt = "2026-04-18T09:00:05+09:00";
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
          openTodosCount: 1,
          doneTodosCount: 0,
        }}
        detailTab={DETAIL_TABS.todos}
        tabLoading={false}
        notes={[]}
        materials={[]}
        attendance={[]}
        todos={[
          {
            id: "todo-1",
            subjectId: "subject-1",
            title: "参考文献を読む",
            memo: "",
            dueDate: "2026-04-22",
            status: "open",
            completedAt: null,
            createdAt: "2026-04-18T09:00:00.000Z",
            updatedAt,
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
        onSaveTodo={vi.fn()}
        onDeleteTodo={vi.fn()}
      />,
    );

    expect(screen.getByText(`更新 ${formatDate(updatedAt)}`)).not.toBeNull();
  });
});
