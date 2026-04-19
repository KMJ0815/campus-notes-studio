import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { deleteAppDb, ensureSeedData, getDb, resetDbConnection } from "../schema";
import { loadPeriodDefinitions, savePeriodDefinitionsInTransaction } from "./periods";

describe("periods repository", () => {
  beforeEach(async () => {
    await deleteAppDb();
    resetDbConnection();
    await ensureSeedData();
  });

  afterEach(async () => {
    await deleteAppDb();
    resetDbConnection();
  });

  it("normalizes stored time values on read", async () => {
    const db = await getDb();
    await db.put("period_definitions", {
      id: "period:2026-spring:1",
      termKey: "2026-spring",
      periodNo: 1,
      label: "1限",
      startTime: "9:00:00",
      endTime: "10:40:00",
      isEnabled: true,
      createdAt: "2026-04-17T12:00:00.000Z",
      updatedAt: "2026-04-17T12:00:00.000Z",
    });

    const periods = await loadPeriodDefinitions("2026-spring");
    expect(periods[0].startTime).toBe("09:00");
    expect(periods[0].endTime).toBe("10:40");
  });

  it("requires at least one enabled period", async () => {
    const db = await getDb();
    const tx = db.transaction(["period_definitions", "slots", "subjects"], "readwrite");
    const currentPeriods = await loadPeriodDefinitions("2026-spring");

    await expect(
      savePeriodDefinitionsInTransaction(
        tx,
        "2026-spring",
        currentPeriods.map((period) => ({ ...period, isEnabled: false })),
      ),
    ).rejects.toMatchObject({ code: "INVALID_PERIOD" });

    await tx.done.catch(() => {});
  });
});
