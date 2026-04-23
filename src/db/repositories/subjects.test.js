import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ensureSeedData, deleteAppDb, getDb, resetDbConnection } from "../schema";
import { saveSubject, archiveSubject, restoreSubject, getSlotsBySubject, getSubject } from "./subjects";

describe("subjects repository", () => {
  beforeEach(async () => {
    await deleteAppDb();
    resetDbConnection();
    await ensureSeedData();
  });

  afterEach(async () => {
    await deleteAppDb();
    resetDbConnection();
  });

  it("blocks duplicate active timetable slots", async () => {
    await saveSubject({
      termKey: "2026-spring",
      name: "国際関係論",
      teacherName: "",
      room: "",
      color: "#4f46e5",
      memo: "",
      isArchived: false,
      selectedSlotKeys: ["mon-1"],
    });

    await expect(
      saveSubject({
        termKey: "2026-spring",
        name: "統計学",
        teacherName: "",
        room: "",
        color: "#0f172a",
        memo: "",
        isArchived: false,
        selectedSlotKeys: ["mon-1"],
      }),
    ).rejects.toMatchObject({
      code: "SLOT_CONFLICT",
      data: {
        conflicts: [
          expect.objectContaining({
            subjectName: "国際関係論",
            willBecomeSlotless: true,
          }),
        ],
      },
    });
  });

  it("fails restore when archived slots are already occupied", async () => {
    const first = await saveSubject({
      termKey: "2026-spring",
      name: "国際関係論",
      teacherName: "",
      room: "",
      color: "#4f46e5",
      memo: "",
      isArchived: false,
      selectedSlotKeys: ["mon-1"],
    });

    await archiveSubject(first.id);

    await saveSubject({
      termKey: "2026-spring",
      name: "統計学",
      teacherName: "",
      room: "",
      color: "#0f172a",
      memo: "",
      isArchived: false,
      selectedSlotKeys: ["mon-1"],
    });

    await expect(restoreSubject(first.id)).rejects.toMatchObject({ code: "RESTORE_CONFLICT" });
  });

  it("restores only the slots that were active at archive time", async () => {
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

    await saveSubject({
      id: subject.id,
      termKey: "2026-spring",
      name: "演習",
      teacherName: "",
      room: "",
      color: "#4f46e5",
      memo: "",
      isArchived: false,
      selectedSlotKeys: ["tue-1"],
    });

    await archiveSubject(subject.id);

    await saveSubject({
      termKey: "2026-spring",
      name: "別授業",
      teacherName: "",
      room: "",
      color: "#0f172a",
      memo: "",
      isArchived: false,
      selectedSlotKeys: ["mon-1"],
    });

    await restoreSubject(subject.id);

    const slots = await getSlotsBySubject(subject.id);
    const activeSlots = slots.filter((slot) => slot.activeSlotKey);

    expect(activeSlots).toHaveLength(1);
    expect(activeSlots[0].weekday).toBe("tue");
    expect(activeSlots[0].periodNo).toBe(1);
    expect(slots.some((slot) => slot.weekday === "mon" && slot.periodNo === 1 && !slot.activeSlotKey)).toBe(true);
  });

  it("rejects invalid or disabled slot selections", async () => {
    await expect(
      saveSubject({
        termKey: "2026-spring",
        name: "不正コマ",
        teacherName: "",
        room: "",
        color: "#4f46e5",
        memo: "",
        isArchived: false,
        selectedSlotKeys: ["sun-1"],
      }),
    ).rejects.toMatchObject({ code: "INVALID_SLOT_SELECTION" });

    await expect(
      saveSubject({
        termKey: "2026-spring",
        name: "不正コマ",
        teacherName: "",
        room: "",
        color: "#4f46e5",
        memo: "",
        isArchived: false,
        selectedSlotKeys: ["mon-99"],
      }),
    ).rejects.toMatchObject({ code: "INVALID_SLOT_SELECTION" });

    const db = await getDb();
    const period = await db.getFromIndex("period_definitions", "byTermPeriod", ["2026-spring", 1]);
    await db.put("period_definitions", { ...period, isEnabled: false });

    await expect(
      saveSubject({
        termKey: "2026-spring",
        name: "無効コマ",
        teacherName: "",
        room: "",
        color: "#4f46e5",
        memo: "",
        isArchived: false,
        selectedSlotKeys: ["mon-1"],
      }),
    ).rejects.toMatchObject({ code: "INVALID_SLOT_SELECTION" });
  });

  it("blocks restore when the archived slot's period is disabled", async () => {
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

    await archiveSubject(subject.id);

    const db = await getDb();
    const period = await db.getFromIndex("period_definitions", "byTermPeriod", ["2026-spring", 1]);
    await db.put("period_definitions", { ...period, isEnabled: false });

    await expect(restoreSubject(subject.id)).rejects.toMatchObject({ code: "RESTORE_PERIOD_DISABLED" });
  });

  it("rejects re-archiving an already archived subject without clearing restoreSlotIds", async () => {
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

    await archiveSubject(subject.id);
    const archivedBeforeRetry = await getSubject(subject.id);

    await expect(archiveSubject(subject.id)).rejects.toMatchObject({ code: "ALREADY_ARCHIVED_SUBJECT" });

    const archivedAfterRetry = await getSubject(subject.id);
    expect(archivedAfterRetry.restoreSlotIds).toEqual(archivedBeforeRetry.restoreSlotIds);
    expect(archivedAfterRetry.restoreSlotIds).toHaveLength(2);
  });

  it("rejects restoring an already active subject", async () => {
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

    await expect(restoreSubject(subject.id)).rejects.toMatchObject({ code: "ALREADY_ACTIVE_SUBJECT" });

    const slots = await getSlotsBySubject(subject.id);
    expect(slots.filter((slot) => slot.activeSlotKey)).toHaveLength(1);
  });

  it("rejects archiving through saveSubject and validates required fields", async () => {
    await expect(
      saveSubject({
        termKey: "2026-spring",
        name: "演習",
        teacherName: "",
        room: "",
        color: "#4f46e5",
        memo: "",
        isArchived: true,
        selectedSlotKeys: ["mon-1"],
      }),
    ).rejects.toMatchObject({ code: "ARCHIVE_VIA_ACTION_REQUIRED" });

    await expect(
      saveSubject({
        termKey: "2026-spring",
        name: "   ",
        teacherName: "",
        room: "",
        color: "#4f46e5",
        memo: "",
        isArchived: false,
        selectedSlotKeys: ["mon-1"],
      }),
    ).rejects.toMatchObject({ code: "INVALID_SUBJECT" });

    await expect(
      saveSubject({
        termKey: "2026-spring",
        name: "演習",
        teacherName: "",
        room: "",
        color: "blue",
        memo: "",
        isArchived: false,
        selectedSlotKeys: ["mon-1"],
      }),
    ).rejects.toMatchObject({ code: "INVALID_SUBJECT_COLOR" });
  });
});
