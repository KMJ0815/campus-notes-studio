import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ensureSeedData, deleteAppDb, getDb, resetDbConnection } from "../schema";
import { saveSubject, getSlotsBySubject } from "./subjects";
import { deleteAttendance, getAttendanceSlotOptions, loadSubjectAttendance, saveAttendance } from "./attendance";

describe("attendance repository", () => {
  beforeEach(async () => {
    await deleteAppDb();
    resetDbConnection();
    await ensureSeedData();
  });

  afterEach(async () => {
    await deleteAppDb();
    resetDbConnection();
  });

  it("requires timetableSlotId when the same weekday has multiple slots", async () => {
    const subject = await saveSubject({
      termKey: "2026-spring",
      name: "演習",
      teacherName: "",
      room: "",
      color: "#4f46e5",
      memo: "",
      isArchived: false,
      selectedSlotKeys: ["mon-1", "mon-2"],
    });

    await expect(
      saveAttendance({
        subjectId: subject.id,
        lectureDate: "2026-04-20",
        timetableSlotId: "",
        status: "present",
        memo: "",
      }),
    ).rejects.toMatchObject({ code: "ATTENDANCE_SLOT_REQUIRED" });

    const slots = await getSlotsBySubject(subject.id);
    await saveAttendance({
      subjectId: subject.id,
      lectureDate: "2026-04-20",
      timetableSlotId: slots[0].id,
      status: "present",
      memo: "",
    });
    await saveAttendance({
      subjectId: subject.id,
      lectureDate: "2026-04-20",
      timetableSlotId: slots[1].id,
      status: "late",
      memo: "",
    });

    const records = await loadSubjectAttendance(subject.id);
    expect(records).toHaveLength(2);
  });

  it("ignores archived slots in candidates and upserts on the same subject/date/slot", async () => {
    const subject = await saveSubject({
      termKey: "2026-spring",
      name: "演習",
      teacherName: "",
      room: "",
      color: "#4f46e5",
      memo: "",
      isArchived: false,
      selectedSlotKeys: ["mon-1", "mon-2"],
    });

    await saveSubject({
      id: subject.id,
      termKey: "2026-spring",
      name: "演習",
      teacherName: "",
      room: "",
      color: "#4f46e5",
      memo: "",
      isArchived: false,
      selectedSlotKeys: ["mon-1"],
    });

    const slotOptions = await getAttendanceSlotOptions(subject.id, "2026-04-20");
    expect(slotOptions).toHaveLength(1);
    expect(slotOptions[0].periodNo).toBe(1);

    await saveAttendance({
      subjectId: subject.id,
      lectureDate: "2026-04-20",
      timetableSlotId: "",
      status: "present",
      memo: "初回",
    });

    await saveAttendance({
      subjectId: subject.id,
      lectureDate: "2026-04-20",
      timetableSlotId: "",
      status: "late",
      memo: "更新",
    });

    const records = await loadSubjectAttendance(subject.id);
    expect(records).toHaveLength(1);
    expect(records[0].status).toBe("late");
    expect(records[0].memo).toBe("更新");

    const slots = await getSlotsBySubject(subject.id);
    const activeSlot = slots.find((slot) => slot.activeSlotKey);
    expect(records[0].timetableSlotId).toBe(activeSlot.id);
  });

  it("keeps an existing unlinked attendance record unlinked when editing after timetable changes", async () => {
    const subject = await saveSubject({
      termKey: "2026-spring",
      name: "演習",
      teacherName: "",
      room: "",
      color: "#4f46e5",
      memo: "",
      isArchived: false,
      selectedSlotKeys: ["mon-1"],
    });

    await saveAttendance({
      subjectId: subject.id,
      lectureDate: "2026-04-18",
      timetableSlotId: "",
      status: "present",
      memo: "初回",
    });

    await saveSubject({
      id: subject.id,
      termKey: "2026-spring",
      name: "演習",
      teacherName: "",
      room: "",
      color: "#4f46e5",
      memo: "",
      isArchived: false,
      selectedSlotKeys: ["sat-1"],
    });

    const existing = (await loadSubjectAttendance(subject.id))[0];
    await saveAttendance({
      id: existing.id,
      subjectId: subject.id,
      lectureDate: "2026-04-18",
      timetableSlotId: "",
      status: "late",
      memo: "編集後",
    });

    const records = await loadSubjectAttendance(subject.id);
    expect(records).toHaveLength(1);
    expect(records[0].timetableSlotId).toBe("");
    expect(records[0].status).toBe("late");
    expect(records[0].memo).toBe("編集後");
  });

  it("upserts the same lecture date instead of splitting into linked and unlinked records when a sole slot appears later", async () => {
    const subject = await saveSubject({
      termKey: "2026-spring",
      name: "演習",
      teacherName: "",
      room: "",
      color: "#4f46e5",
      memo: "",
      isArchived: false,
      selectedSlotKeys: ["mon-1"],
    });

    await saveAttendance({
      subjectId: subject.id,
      lectureDate: "2026-04-18",
      timetableSlotId: "",
      status: "present",
      memo: "未紐付け",
    });

    await saveSubject({
      id: subject.id,
      termKey: "2026-spring",
      name: "演習",
      teacherName: "",
      room: "",
      color: "#4f46e5",
      memo: "",
      isArchived: false,
      selectedSlotKeys: ["sat-1"],
    });

    await saveAttendance({
      subjectId: subject.id,
      lectureDate: "2026-04-18",
      timetableSlotId: "",
      status: "late",
      memo: "後から候補ができた",
    });

    const slots = await getSlotsBySubject(subject.id);
    const activeSlot = slots.find((slot) => slot.activeSlotKey);
    const records = await loadSubjectAttendance(subject.id);
    expect(records).toHaveLength(1);
    expect(records[0].timetableSlotId).toBe(activeSlot.id);
    expect(records[0].status).toBe("late");
    expect(records[0].memo).toBe("後から候補ができた");
  });

  it("rejects adding a linked record when an unlinked record already exists on the same date and multiple candidates now exist", async () => {
    const subject = await saveSubject({
      termKey: "2026-spring",
      name: "演習",
      teacherName: "",
      room: "",
      color: "#4f46e5",
      memo: "",
      isArchived: false,
      selectedSlotKeys: ["mon-1"],
    });

    await saveAttendance({
      subjectId: subject.id,
      lectureDate: "2026-04-18",
      timetableSlotId: "",
      status: "present",
      memo: "未紐付け",
    });

    await saveSubject({
      id: subject.id,
      termKey: "2026-spring",
      name: "演習",
      teacherName: "",
      room: "",
      color: "#4f46e5",
      memo: "",
      isArchived: false,
      selectedSlotKeys: ["sat-1", "sat-2"],
    });

    const slots = await getSlotsBySubject(subject.id);
    const saturdaySlot = slots.find((slot) => slot.activeSlotKey && slot.periodNo === 1);

    await expect(
      saveAttendance({
        subjectId: subject.id,
        lectureDate: "2026-04-18",
        timetableSlotId: saturdaySlot.id,
        status: "late",
        memo: "重複させない",
      }),
    ).rejects.toMatchObject({ code: "ATTENDANCE_DUPLICATE" });

    const records = await loadSubjectAttendance(subject.id);
    expect(records).toHaveLength(1);
    expect(records[0].timetableSlotId).toBe("");
    expect(records[0].memo).toBe("未紐付け");
  });

  it("auto-links an edited record to the sole candidate when it was originally linked", async () => {
    const subject = await saveSubject({
      termKey: "2026-spring",
      name: "演習",
      teacherName: "",
      room: "",
      color: "#4f46e5",
      memo: "",
      isArchived: false,
      selectedSlotKeys: ["mon-1", "tue-1"],
    });

    const initialSlots = await getSlotsBySubject(subject.id);
    const mondaySlot = initialSlots.find((slot) => slot.weekday === "mon");
    await saveAttendance({
      subjectId: subject.id,
      lectureDate: "2026-04-20",
      timetableSlotId: mondaySlot.id,
      status: "present",
      memo: "月曜分",
    });

    const existing = (await loadSubjectAttendance(subject.id))[0];
    await saveAttendance({
      id: existing.id,
      subjectId: subject.id,
      lectureDate: "2026-04-21",
      timetableSlotId: "",
      status: "late",
      memo: "火曜へ変更",
    });

    const updated = (await loadSubjectAttendance(subject.id))[0];
    expect(updated.lectureDate).toBe("2026-04-21");
    expect(updated.timetableSlotId).not.toBe("");
    expect(updated.slotLabel).toContain("火");
    expect(updated.status).toBe("late");
  });

  it("allows editing an attendance record linked to an archived slot", async () => {
    const subject = await saveSubject({
      termKey: "2026-spring",
      name: "演習",
      teacherName: "",
      room: "",
      color: "#4f46e5",
      memo: "",
      isArchived: false,
      selectedSlotKeys: ["mon-1", "mon-2"],
    });

    const originalSlots = await getSlotsBySubject(subject.id);
    const archivedCandidate = originalSlots.find((slot) => slot.periodNo === 2);
    await saveAttendance({
      subjectId: subject.id,
      lectureDate: "2026-04-20",
      timetableSlotId: archivedCandidate.id,
      status: "present",
      memo: "初回",
    });

    await saveSubject({
      id: subject.id,
      termKey: "2026-spring",
      name: "演習",
      teacherName: "",
      room: "",
      color: "#4f46e5",
      memo: "",
      isArchived: false,
      selectedSlotKeys: ["mon-1"],
    });

    const optionsWithoutHistory = await getAttendanceSlotOptions(subject.id, "2026-04-20");
    expect(optionsWithoutHistory).toHaveLength(1);
    expect(optionsWithoutHistory[0].periodNo).toBe(1);

    const optionsWithHistory = await getAttendanceSlotOptions(subject.id, "2026-04-20", {
      includeSlotIds: [archivedCandidate.id],
    });
    expect(optionsWithHistory).toHaveLength(2);
    expect(optionsWithHistory.find((option) => option.id === archivedCandidate.id)?.label).toContain("(履歴)");

    const existing = (await loadSubjectAttendance(subject.id))[0];
    await saveAttendance({
      id: existing.id,
      subjectId: subject.id,
      lectureDate: "2026-04-20",
      timetableSlotId: archivedCandidate.id,
      status: "late",
      memo: "編集後",
    });

    const records = await loadSubjectAttendance(subject.id);
    expect(records).toHaveLength(1);
    expect(records[0].status).toBe("late");
    expect(records[0].memo).toBe("編集後");
    expect(records[0].slotSnapshot).toMatchObject({
      periodNo: 2,
      isHistorical: false,
    });
    expect(records[0].slotLabel).toBe("月 2限 (10:50-12:30)");
  });

  it("rejects editing a record into another existing subject/date/slot record", async () => {
    const subject = await saveSubject({
      termKey: "2026-spring",
      name: "演習",
      teacherName: "",
      room: "",
      color: "#4f46e5",
      memo: "",
      isArchived: false,
      selectedSlotKeys: ["mon-1", "mon-2"],
    });

    const slots = await getSlotsBySubject(subject.id);
    const firstSlot = slots.find((slot) => slot.periodNo === 1);
    const secondSlot = slots.find((slot) => slot.periodNo === 2);

    await saveAttendance({
      subjectId: subject.id,
      lectureDate: "2026-04-20",
      timetableSlotId: firstSlot.id,
      status: "present",
      memo: "1限",
    });
    await saveAttendance({
      subjectId: subject.id,
      lectureDate: "2026-04-20",
      timetableSlotId: secondSlot.id,
      status: "late",
      memo: "2限",
    });

    const recordsBefore = await loadSubjectAttendance(subject.id);
    const firstRecord = recordsBefore.find((record) => record.timetableSlotId === firstSlot.id);

    await expect(
      saveAttendance({
        id: firstRecord.id,
        subjectId: subject.id,
        lectureDate: "2026-04-20",
        timetableSlotId: secondSlot.id,
        status: "absent",
        memo: "衝突",
      }),
    ).rejects.toMatchObject({ code: "ATTENDANCE_DUPLICATE" });

    const recordsAfter = await loadSubjectAttendance(subject.id);
    expect(recordsAfter).toHaveLength(2);
    expect(recordsAfter.find((record) => record.timetableSlotId === firstSlot.id)?.status).toBe("present");
    expect(recordsAfter.find((record) => record.timetableSlotId === secondSlot.id)?.status).toBe("late");
  });

  it("rejects invalid lecture dates and statuses", async () => {
    const subject = await saveSubject({
      termKey: "2026-spring",
      name: "演習",
      teacherName: "",
      room: "",
      color: "#4f46e5",
      memo: "",
      isArchived: false,
      selectedSlotKeys: ["mon-1"],
    });

    await expect(
      saveAttendance({
        subjectId: subject.id,
        lectureDate: "",
        timetableSlotId: "",
        status: "present",
        memo: "",
      }),
    ).rejects.toMatchObject({ code: "INVALID_ATTENDANCE_DATE" });

    await expect(
      saveAttendance({
        subjectId: subject.id,
        lectureDate: "2026-04-20",
        timetableSlotId: "",
        status: "unknown",
        memo: "",
      }),
    ).rejects.toMatchObject({ code: "INVALID_ATTENDANCE_STATUS" });
  });

  it("allows saving attendance without a linked slot when that lecture date has no timetable candidate", async () => {
    const subject = await saveSubject({
      termKey: "2026-spring",
      name: "演習",
      teacherName: "",
      room: "",
      color: "#4f46e5",
      memo: "",
      isArchived: false,
      selectedSlotKeys: ["mon-1"],
    });

    await expect(
      saveAttendance({
        subjectId: subject.id,
        lectureDate: "2026-04-18",
        timetableSlotId: "",
        status: "present",
        memo: "",
      }),
    ).resolves.toBeUndefined();

    const records = await loadSubjectAttendance(subject.id);
    expect(records).toHaveLength(1);
    expect(records[0].timetableSlotId).toBe("");
  });

  it("normalizes stored attendance lecture dates on read", async () => {
    const subject = await saveSubject({
      termKey: "2026-spring",
      name: "演習",
      teacherName: "",
      room: "",
      color: "#4f46e5",
      memo: "",
      isArchived: false,
      selectedSlotKeys: ["mon-1"],
    });

    const db = await getDb();
    await db.put("attendance", {
      id: "attendance-legacy",
      subjectId: subject.id,
      termKey: "2026-spring",
      lectureDate: "2026-04-20T00:00:00.000Z",
      timetableSlotId: null,
      status: "present",
      memo: "",
      createdAt: "2026-04-17T12:00:00.000Z",
      updatedAt: "2026-04-17T12:00:00.000Z",
    });

    const records = await loadSubjectAttendance(subject.id);
    expect(records[0].lectureDate).toBe("2026-04-20");
    expect(records[0].timetableSlotId).toBe("");
  });

  it("rejects stale attendance drafts instead of recreating deleted records", async () => {
    const subject = await saveSubject({
      termKey: "2026-spring",
      name: "演習",
      teacherName: "",
      room: "",
      color: "#4f46e5",
      memo: "",
      isArchived: false,
      selectedSlotKeys: ["mon-1"],
    });

    await saveAttendance({
      subjectId: subject.id,
      lectureDate: "2026-04-20",
      timetableSlotId: "",
      status: "present",
      memo: "初回",
    });
    const existing = (await loadSubjectAttendance(subject.id))[0];

    await deleteAttendance(existing.id);

    await expect(
      saveAttendance({
        id: existing.id,
        subjectId: subject.id,
        lectureDate: "2026-04-20",
        timetableSlotId: "",
        status: "late",
        memo: "復活させない",
      }),
    ).rejects.toMatchObject({ code: "STALE_DRAFT" });

    expect(await loadSubjectAttendance(subject.id)).toHaveLength(0);
  });

  it("sorts same-day attendance by period number and puts unlinked records last", async () => {
    const subject = await saveSubject({
      termKey: "2026-spring",
      name: "演習",
      teacherName: "",
      room: "",
      color: "#4f46e5",
      memo: "",
      isArchived: false,
      selectedSlotKeys: ["mon-1", "mon-2"],
    });

    const [firstSlot, secondSlot] = await getSlotsBySubject(subject.id);
    await saveAttendance({
      subjectId: subject.id,
      lectureDate: "2026-04-20",
      timetableSlotId: secondSlot.id,
      status: "present",
      memo: "2限",
    });
    await saveAttendance({
      subjectId: subject.id,
      lectureDate: "2026-04-20",
      timetableSlotId: firstSlot.id,
      status: "late",
      memo: "1限",
    });
    const db = await getDb();
    await db.put("attendance", {
      id: "attendance-unlinked",
      subjectId: subject.id,
      termKey: "2026-spring",
      lectureDate: "2026-04-20",
      timetableSlotId: "",
      status: "absent",
      memo: "未指定",
      createdAt: "2026-04-20T09:00:00.000Z",
      updatedAt: "2026-04-20T09:00:00.000Z",
    });

    const records = await loadSubjectAttendance(subject.id);
    expect(records).toHaveLength(3);
    expect(records[0].timetableSlotId).toBe(firstSlot.id);
    expect(records[1].timetableSlotId).toBe(secondSlot.id);
    expect(records[2].timetableSlotId).toBe("");
  });

  it("preserves an existing slot snapshot when only memo/status are edited", async () => {
    const subject = await saveSubject({
      termKey: "2026-spring",
      name: "演習",
      teacherName: "",
      room: "",
      color: "#4f46e5",
      memo: "",
      isArchived: false,
      selectedSlotKeys: ["mon-1"],
    });

    await saveAttendance({
      subjectId: subject.id,
      lectureDate: "2026-04-20",
      timetableSlotId: "",
      status: "present",
      memo: "初回",
    });

    const [existing] = await loadSubjectAttendance(subject.id);
    const db = await getDb();
    const period = await db.getFromIndex("period_definitions", "byTermPeriod", ["2026-spring", 1]);
    await db.put("period_definitions", {
      ...period,
      label: "A限",
      startTime: "08:00",
      endTime: "09:30",
    });

    await saveAttendance({
      id: existing.id,
      subjectId: subject.id,
      lectureDate: existing.lectureDate,
      timetableSlotId: existing.timetableSlotId,
      status: "late",
      memo: "更新",
      baseUpdatedAt: existing.updatedAt,
    });

    const [updated] = await loadSubjectAttendance(subject.id);
    expect(updated.slotSnapshot).toMatchObject({
      label: "1限",
      startTime: "09:00",
      endTime: "10:40",
    });
    expect(updated.memo).toBe("更新");
    expect(updated.status).toBe("late");
  });

  it("rejects deleting an already removed attendance record", async () => {
    await expect(deleteAttendance("missing-attendance")).rejects.toMatchObject({ code: "STALE_DRAFT" });
  });
});
