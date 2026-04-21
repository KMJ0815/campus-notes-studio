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
      termKey: "2026-fall",
      displayName: "lecture.pdf",
      mimeType: "application/pdf",
      fileExt: "pdf",
      sizeBytes: 123,
      note: "",
      createdAt: "2026-04-17T12:00:00.000Z",
      updatedAt: "2026-04-17T12:00:00.000Z",
    });
    await db.put("todo_items", {
      id: "todo-1",
      subjectId: "subject-1",
      termKey: "2026-fall",
      title: "課題提出",
      memo: "",
      dueDate: "2026-04-20",
      status: "open",
      completedAt: null,
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
    expect(manifest.version).toBe(4);
    expect(manifest.artifact).toEqual({
      includesMaterialFiles: false,
      hasMissingMaterialFiles: false,
    });
    expect(manifest.termMeta).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          termKey: "2026-fall",
          label: "2026年度 秋学期",
        }),
      ]),
    );
    expect(manifest.todos).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "todo-1",
          title: "課題提出",
        }),
      ]),
    );
  });

  it("honors includeFilesOverride without mutating persisted settings", async () => {
    const db = await getDb();
    await db.put("material_meta", {
      id: "material-1",
      subjectId: "subject-1",
      termKey: "2026-spring",
      displayName: "lecture.pdf",
      mimeType: "application/pdf",
      fileExt: "pdf",
      sizeBytes: 123,
      note: "",
      createdAt: "2026-04-17T12:00:00.000Z",
      updatedAt: "2026-04-17T12:00:00.000Z",
    });

    const result = await prepareExport({ includeFilesOverride: false });
    expect(result.status).toBe("ready");
    expect(result.missingFiles).toHaveLength(0);
    expect(result.artifact).toEqual({
      includesMaterialFiles: false,
      hasMissingMaterialFiles: false,
    });

    const zip = await JSZip.loadAsync(result.blob);
    const manifest = JSON.parse(await zip.file("data/manifest.json").async("string"));
    expect(manifest.artifact).toEqual({
      includesMaterialFiles: false,
      hasMissingMaterialFiles: false,
    });

    const settings = await db.get("settings", "app-settings");
    expect(settings.exportIncludeFiles).toBe(true);
  });

  it("records missing-file exports as artifact metadata when continuing without blobs", async () => {
    const db = await getDb();
    await db.put("material_meta", {
      id: "material-1",
      subjectId: "subject-1",
      termKey: "2026-spring",
      displayName: "lecture.pdf",
      mimeType: "application/pdf",
      fileExt: "pdf",
      sizeBytes: 123,
      note: "",
      createdAt: "2026-04-17T12:00:00.000Z",
      updatedAt: "2026-04-17T12:00:00.000Z",
    });

    const result = await prepareExport({ allowMissingFiles: true });
    expect(result.status).toBe("ready");
    expect(result.missingFiles).toHaveLength(1);
    expect(result.artifact).toEqual({
      includesMaterialFiles: true,
      hasMissingMaterialFiles: true,
    });

    const zip = await JSZip.loadAsync(result.blob);
    const manifest = JSON.parse(await zip.file("data/manifest.json").async("string"));
    expect(manifest.artifact).toEqual({
      includesMaterialFiles: true,
      hasMissingMaterialFiles: true,
    });
  });
});
