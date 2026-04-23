import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildPeriodId } from "../../lib/utils";
import { ensureSeedData, deleteAppDb, resetDbConnection } from "../schema";
import { loadPeriodDefinitions } from "./periods";
import { getSettings, saveSettingsBundle } from "./settings";
import { archiveSubject, saveSubject } from "./subjects";

function settingsDraft(currentTermKey, termLabel = currentTermKey) {
  return {
    currentTermKey,
    termLabel,
    exportIncludeFiles: true,
  };
}

describe("settings repository", () => {
  beforeEach(async () => {
    await deleteAppDb();
    resetDbConnection();
    await ensureSeedData();
  });

  afterEach(async () => {
    await deleteAppDb();
    resetDbConnection();
  });

  it("re-keys periods for a new term without mutating the source term", async () => {
    const springPeriods = await loadPeriodDefinitions("2026-spring");
    const customSpringPeriods = springPeriods.map((period) =>
      period.periodNo === 1 ? { ...period, label: "春カスタム1限" } : period,
    );

    await saveSettingsBundle({
      draftSettings: settingsDraft("2026-spring", "2026年度 春学期"),
      draftPeriods: customSpringPeriods,
      periodsLoadedForTermKey: "2026-spring",
    });

    await saveSettingsBundle({
      draftSettings: settingsDraft("2026-fall", "2026年度 秋学期"),
      draftPeriods: customSpringPeriods,
      periodsLoadedForTermKey: "2026-fall",
    });

    const [savedSettings, savedSpringPeriods, savedFallPeriods] = await Promise.all([
      getSettings(),
      loadPeriodDefinitions("2026-spring"),
      loadPeriodDefinitions("2026-fall"),
    ]);

    expect(savedSettings.currentTermKey).toBe("2026-fall");
    expect(savedSpringPeriods[0].id).toBe(buildPeriodId("2026-spring", 1));
    expect(savedSpringPeriods[0].label).toBe("春カスタム1限");
    expect(savedFallPeriods[0].id).toBe(buildPeriodId("2026-fall", 1));
    expect(savedFallPeriods[0].label).toBe("春カスタム1限");
  });

  it("switches to an existing term and saves that term's edited periods", async () => {
    const springPeriods = await loadPeriodDefinitions("2026-spring");
    const customFallPeriods = springPeriods.map((period) =>
      period.periodNo === 1 ? { ...period, label: "秋カスタム1限" } : period,
    );

    await saveSettingsBundle({
      draftSettings: settingsDraft("2026-fall", "2026年度 秋学期"),
      draftPeriods: customFallPeriods,
      periodsLoadedForTermKey: "2026-fall",
    });

    const currentFallPeriods = await loadPeriodDefinitions("2026-fall");
    await saveSettingsBundle({
      draftSettings: settingsDraft("2026-fall", "2026年度 秋学期"),
      draftPeriods: currentFallPeriods.map((period) =>
        period.periodNo === 1 ? { ...period, label: "秋1限を再編集" } : period,
      ),
      periodsLoadedForTermKey: "2026-fall",
    });

    const [savedSettings, savedFallPeriods] = await Promise.all([
      getSettings(),
      loadPeriodDefinitions("2026-fall"),
    ]);

    expect(savedSettings.currentTermKey).toBe("2026-fall");
    expect(savedFallPeriods[0].id).toBe(buildPeriodId("2026-fall", 1));
    expect(savedFallPeriods[0].label).toBe("秋1限を再編集");
  });

  it("saves when period numbers are reordered within the same term", async () => {
    const springPeriods = await loadPeriodDefinitions("2026-spring");
    const reorderedPeriods = springPeriods.map((period) => {
      if (period.periodNo === 1) {
        return { ...period, periodNo: 2, label: "入れ替え後2限" };
      }
      if (period.periodNo === 2) {
        return { ...period, periodNo: 1, label: "入れ替え後1限" };
      }
      return period;
    });

    await saveSettingsBundle({
      draftSettings: settingsDraft("2026-spring", "2026年度 春学期"),
      draftPeriods: reorderedPeriods,
      periodsLoadedForTermKey: "2026-spring",
    });

    const savedPeriods = await loadPeriodDefinitions("2026-spring");
    expect(savedPeriods.find((period) => period.periodNo === 1)?.label).toBe("入れ替え後1限");
    expect(savedPeriods.find((period) => period.periodNo === 2)?.label).toBe("入れ替え後2限");
    expect(savedPeriods.find((period) => period.periodNo === 1)?.id).toBe(buildPeriodId("2026-spring", 1));
    expect(savedPeriods.find((period) => period.periodNo === 2)?.id).toBe(buildPeriodId("2026-spring", 2));
  });

  it("protects periods referenced by archived subjects waiting for restore", async () => {
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

    const periods = await loadPeriodDefinitions("2026-spring");
    const disabledPeriods = periods.map((period) =>
      period.periodNo === 1 ? { ...period, isEnabled: false } : period,
    );

    await expect(
      saveSettingsBundle({
        draftSettings: settingsDraft("2026-spring", "2026年度 春学期"),
        draftPeriods: disabledPeriods,
        periodsLoadedForTermKey: "2026-spring",
      }),
    ).rejects.toMatchObject({ code: "PERIOD_IN_USE" });
  });

  it("rejects saving when the loaded periods belong to another term", async () => {
    const springPeriods = await loadPeriodDefinitions("2026-spring");

    await expect(
      saveSettingsBundle({
        draftSettings: settingsDraft("2026-fall", "2026年度 秋学期"),
        draftPeriods: springPeriods,
        periodsLoadedForTermKey: "2026-spring",
      }),
    ).rejects.toMatchObject({ code: "SETTINGS_PERIODS_OUT_OF_SYNC" });
  });

  it("rejects saving a term without any period definitions", async () => {
    await expect(
      saveSettingsBundle({
        draftSettings: settingsDraft("2027-spring", "2027年度 春学期"),
        draftPeriods: [],
        periodsLoadedForTermKey: "2027-spring",
      }),
    ).rejects.toMatchObject({ code: "INVALID_PERIOD" });
  });

  it("rejects stale settings saves when updated elsewhere", async () => {
    const current = await getSettings();
    const periods = await loadPeriodDefinitions("2026-spring");

    await saveSettingsBundle({
      draftSettings: {
        ...settingsDraft("2026-spring", "2026年度 春学期 更新"),
        baseUpdatedAt: current.updatedAt,
      },
      draftPeriods: periods,
      periodsLoadedForTermKey: "2026-spring",
    });

    await expect(
      saveSettingsBundle({
        draftSettings: {
          ...settingsDraft("2026-spring", "古い設定"),
          baseUpdatedAt: current.updatedAt,
        },
        draftPeriods: periods,
        periodsLoadedForTermKey: "2026-spring",
      }),
    ).rejects.toMatchObject({ code: "STALE_UPDATE" });
  });

  it("returns the saved settings snapshot on successful writes", async () => {
    const periods = await loadPeriodDefinitions("2026-spring");

    const result = await saveSettingsBundle({
      draftSettings: settingsDraft("2026-spring", "2026年度 春学期"),
      draftPeriods: periods,
      periodsLoadedForTermKey: "2026-spring",
    });

    expect(result).toEqual(
      expect.objectContaining({
        id: "app-settings",
        currentTermKey: "2026-spring",
        termLabel: "2026年度 春学期",
        exportIncludeFiles: true,
      }),
    );
    expect(typeof result.updatedAt).toBe("string");
    expect(result.updatedAt.length).toBeGreaterThan(0);
  });
});
