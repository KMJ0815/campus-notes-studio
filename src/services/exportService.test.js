import { afterEach, beforeEach, describe, expect, it } from "vitest";
import JSZip from "jszip";
import { ensureSeedData, deleteAppDb, getDb, resetDbConnection } from "../db/schema";
import { prepareExport } from "./exportService";

describe("exportService", () => {
  beforeEach(async () => {
    await deleteAppDb();
    resetDbConnection();
    await ensureSeedData();
  });

  afterEach(async () => {
    await deleteAppDb();
    resetDbConnection();
  });

  it("warns on missing files only when file export is enabled", async () => {
    const db = await getDb();
    await db.put("term_meta", {
      termKey: "2026-fall",
      label: "2026年度 秋学期",
      updatedAt: "2026-04-17T12:00:00.000Z",
    });
    await db.put("material_meta", {
      id: "material-1",
      subjectId: "subject-1",
      displayName: "lecture.pdf",
      mimeType: "application/pdf",
      fileExt: "pdf",
      sizeBytes: 123,
      note: "",
      createdAt: "2026-04-17T12:00:00.000Z",
      updatedAt: "2026-04-17T12:00:00.000Z",
    });

    let result = await prepareExport();
    expect(result.status).toBe("missing_files");
    expect(result.missingFiles).toHaveLength(1);

    await db.put("settings", {
      ...(await db.get("settings", "app-settings")),
      exportIncludeFiles: false,
    });

    result = await prepareExport();
    expect(result.status).toBe("ready");
    expect(result.missingFiles).toHaveLength(0);

    const zip = await JSZip.loadAsync(result.blob);
    const manifest = JSON.parse(await zip.file("data/manifest.json").async("string"));
    expect(manifest.version).toBe(3);
    expect(manifest.termMeta).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          termKey: "2026-fall",
          label: "2026年度 秋学期",
        }),
      ]),
    );
  });
});
