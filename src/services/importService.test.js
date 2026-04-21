import { afterEach, beforeEach, describe, expect, it } from "vitest";
import JSZip from "jszip";
import { deleteAppDb, ensureSeedData, getDb, resetDbConnection } from "../db/schema";
import { buildMaterialArchivePath } from "./backupManifest";
import { applyImportArchive, readImportArchive } from "./importService";

function buildBaseManifest(overrides = {}) {
  return {
    version: 4,
    exportedAt: "2026-04-20T00:00:00.000Z",
    settings: {
      id: "app-settings",
      currentTermKey: "2026-fall",
      termLabel: "2026年度 秋学期",
      exportIncludeFiles: true,
      updatedAt: "2026-04-20T00:00:00.000Z",
    },
    termMeta: [
      {
        termKey: "2026-fall",
        label: "2026年度 秋学期",
        updatedAt: "2026-04-20T00:00:00.000Z",
      },
    ],
    periods: [
      {
        id: "period:2026-fall:1",
        termKey: "2026-fall",
        periodNo: 1,
        label: "1限",
        startTime: "09:00",
        endTime: "10:40",
        isEnabled: true,
        createdAt: "2026-04-20T00:00:00.000Z",
        updatedAt: "2026-04-20T00:00:00.000Z",
      },
    ],
    subjects: [
      {
        id: "subject-1",
        termKey: "2026-fall",
        name: "第三世界論",
        teacherName: "山田",
        room: "301",
        color: "#4f46e5",
        memo: "",
        isArchived: false,
        restoreSlotIds: [],
        createdAt: "2026-04-20T00:00:00.000Z",
        updatedAt: "2026-04-20T00:00:00.000Z",
      },
    ],
    slots: [
      {
        id: "slot-1",
        termKey: "2026-fall",
        subjectId: "subject-1",
        weekday: "mon",
        periodNo: 1,
        activeSlotKey: "2026-fall:mon:1",
        isArchived: false,
        createdAt: "2026-04-20T00:00:00.000Z",
        updatedAt: "2026-04-20T00:00:00.000Z",
      },
    ],
    notes: [
      {
        id: "note-1",
        subjectId: "subject-1",
        termKey: "2026-fall",
        title: "第1回",
        bodyText: "本文",
        lectureDate: "2026-04-20",
        createdAt: "2026-04-20T00:00:00.000Z",
        updatedAt: "2026-04-20T00:00:00.000Z",
      },
    ],
    attendance: [
      {
        id: "attendance-1",
        subjectId: "subject-1",
        termKey: "2026-fall",
        lectureDate: "2026-04-20",
        timetableSlotId: "slot-1",
        status: "present",
        memo: "",
        createdAt: "2026-04-20T00:00:00.000Z",
        updatedAt: "2026-04-20T00:00:00.000Z",
      },
    ],
    todos: [
      {
        id: "todo-1",
        subjectId: "subject-1",
        termKey: "2026-fall",
        title: "レポート",
        memo: "",
        dueDate: "2026-04-25",
        status: "open",
        completedAt: null,
        createdAt: "2026-04-20T00:00:00.000Z",
        updatedAt: "2026-04-20T00:00:00.000Z",
      },
    ],
    materials: [
      {
        id: "material-1",
        subjectId: "subject-1",
        termKey: "2026-fall",
        displayName: "lecture.pdf",
        mimeType: "application/pdf",
        fileExt: "pdf",
        sizeBytes: 12,
        note: "",
        storageBackend: "opfs",
        createdAt: "2026-04-20T00:00:00.000Z",
        updatedAt: "2026-04-20T00:00:00.000Z",
      },
    ],
    materialFiles: [
      {
        id: "material-1",
        path: "materials/material-1_lecture.pdf",
        displayName: "lecture.pdf",
        mimeType: "application/pdf",
        sizeBytes: 12,
      },
    ],
    ...overrides,
  };
}

async function buildArchive(manifest, files = []) {
  const zip = new JSZip();
  zip.file("data/manifest.json", JSON.stringify(manifest, null, 2));
  for (const file of files) {
    zip.file(file.path, file.content);
  }
  return zip.generateAsync({ type: "blob" });
}

describe("importService", () => {
  beforeEach(async () => {
    await deleteAppDb();
    resetDbConnection();
    await ensureSeedData();
  });

  afterEach(async () => {
    await deleteAppDb();
    resetDbConnection();
  });

  it("imports a v4 backup as a replace-only restore and stores materials in IndexedDB", async () => {
    const manifest = buildBaseManifest();
    const archiveBlob = await buildArchive(manifest, [
      {
        path: manifest.materialFiles[0].path,
        content: "pdf-bytes",
      },
    ]);

    const { preview, archive } = await readImportArchive(archiveBlob);
    expect(preview.counts.todos).toBe(1);
    expect(preview.warnings).toHaveLength(0);

    const result = await applyImportArchive(archive);
    expect(result.importedCounts.materialFilesRestored).toBe(1);

    const db = await getDb();
    const settings = await db.get("settings", "app-settings");
    const todo = await db.get("todo_items", "todo-1");
    const materialMeta = await db.get("material_meta", "material-1");
    const materialFile = await db.get("material_files", "material-1");

    expect(settings.currentTermKey).toBe("2026-fall");
    expect(todo.title).toBe("レポート");
    expect(materialMeta.storageBackend).toBe("indexeddb");
    expect(materialFile).toEqual(
      expect.objectContaining({
        id: "material-1",
        blob: expect.anything(),
      }),
    );
  });

  it("accepts a v3 backup and normalizes todos to an empty list", async () => {
    const manifest = buildBaseManifest();
    delete manifest.todos;
    delete manifest.materialFiles;
    manifest.version = 3;

    const archiveBlob = await buildArchive(manifest, [
      {
        path: buildMaterialArchivePath(manifest.materials[0]),
        content: "pdf-bytes",
      },
    ]);

    const { preview, archive } = await readImportArchive(archiveBlob);
    expect(preview.version).toBe(3);
    expect(preview.counts.todos).toBe(0);

    await applyImportArchive(archive);

    const db = await getDb();
    expect(await db.getAll("todo_items")).toHaveLength(0);
    expect(await db.get("material_files", "material-1")).toBeTruthy();
  });

  it("rejects invalid backups with broken subject references", async () => {
    const manifest = buildBaseManifest({
      notes: [
        {
          id: "note-1",
          subjectId: "missing-subject",
          title: "壊れたノート",
          bodyText: "",
          lectureDate: "2026-04-20",
          createdAt: "2026-04-20T00:00:00.000Z",
          updatedAt: "2026-04-20T00:00:00.000Z",
        },
      ],
    });
    const archiveBlob = await buildArchive(manifest);

    await expect(readImportArchive(archiveBlob)).rejects.toMatchObject({
      code: "IMPORT_INVALID",
    });
  });

  it("warns about missing material files but still allows restore", async () => {
    const manifest = buildBaseManifest();
    const archiveBlob = await buildArchive(manifest);

    const { preview, archive } = await readImportArchive(archiveBlob);
    expect(preview.warnings).toHaveLength(1);

    await applyImportArchive(archive);
    const db = await getDb();
    expect(await db.get("material_meta", "material-1")).toBeTruthy();
    expect(await db.get("material_files", "material-1")).toBeUndefined();
  });

  it("rejects duplicate logical slots during preview after activeSlotKey normalization", async () => {
    const manifest = buildBaseManifest({
      slots: [
        {
          id: "slot-1",
          termKey: "2026-fall",
          subjectId: "subject-1",
          weekday: "mon",
          periodNo: 1,
          activeSlotKey: "",
          isArchived: false,
          createdAt: "2026-04-20T00:00:00.000Z",
          updatedAt: "2026-04-20T00:00:00.000Z",
        },
        {
          id: "slot-2",
          termKey: "2026-fall",
          subjectId: "subject-1",
          weekday: "mon",
          periodNo: 1,
          activeSlotKey: "2026-fall:mon:1",
          isArchived: false,
          createdAt: "2026-04-20T00:00:00.000Z",
          updatedAt: "2026-04-20T00:00:00.000Z",
        },
      ],
      attendance: [],
    });
    const archiveBlob = await buildArchive(manifest);

    await expect(readImportArchive(archiveBlob)).rejects.toMatchObject({
      code: "IMPORT_INVALID",
      message: expect.stringContaining("同じコマに複数の授業"),
    });
  });

  it("rejects duplicate period definitions during preview", async () => {
    const manifest = buildBaseManifest({
      periods: [
        {
          id: "period:2026-fall:1",
          termKey: "2026-fall",
          periodNo: 1,
          label: "1限",
          startTime: "09:00",
          endTime: "10:40",
          isEnabled: true,
          createdAt: "2026-04-20T00:00:00.000Z",
          updatedAt: "2026-04-20T00:00:00.000Z",
        },
        {
          id: "period:2026-fall:1b",
          termKey: "2026-fall",
          periodNo: 1,
          label: "重複1限",
          startTime: "11:00",
          endTime: "12:40",
          isEnabled: true,
          createdAt: "2026-04-20T00:00:00.000Z",
          updatedAt: "2026-04-20T00:00:00.000Z",
        },
      ],
    });
    const archiveBlob = await buildArchive(manifest);

    await expect(readImportArchive(archiveBlob)).rejects.toMatchObject({
      code: "IMPORT_INVALID",
      message: expect.stringContaining("コマ定義の組み合わせが重複"),
    });
  });

  it("rejects duplicate attendance composite keys during preview", async () => {
    const manifest = buildBaseManifest({
      attendance: [
        {
          id: "attendance-1",
          subjectId: "subject-1",
          termKey: "2026-fall",
          lectureDate: "2026-04-20",
          timetableSlotId: "slot-1",
          status: "present",
          memo: "",
          createdAt: "2026-04-20T00:00:00.000Z",
          updatedAt: "2026-04-20T00:00:00.000Z",
        },
        {
          id: "attendance-2",
          subjectId: "subject-1",
          termKey: "2026-fall",
          lectureDate: "2026-04-20",
          timetableSlotId: "slot-1",
          status: "late",
          memo: "",
          createdAt: "2026-04-20T00:00:00.000Z",
          updatedAt: "2026-04-20T00:00:00.000Z",
        },
      ],
    });
    const archiveBlob = await buildArchive(manifest);

    await expect(readImportArchive(archiveBlob)).rejects.toMatchObject({
      code: "IMPORT_INVALID",
      message: expect.stringContaining("出席記録の組み合わせが重複"),
    });
  });

  it("rejects backups whose current term has no enabled periods", async () => {
    const manifest = buildBaseManifest({
      periods: [
        {
          id: "period:2026-fall:1",
          termKey: "2026-fall",
          periodNo: 1,
          label: "1限",
          startTime: "09:00",
          endTime: "10:40",
          isEnabled: false,
          createdAt: "2026-04-20T00:00:00.000Z",
          updatedAt: "2026-04-20T00:00:00.000Z",
        },
      ],
      slots: [],
      attendance: [],
    });
    const archiveBlob = await buildArchive(manifest);

    await expect(readImportArchive(archiveBlob)).rejects.toMatchObject({
      code: "IMPORT_INVALID",
      message: expect.stringContaining("有効なコマは 1 件以上必要です。"),
    });
  });

  it("rejects backups with invalid period time ranges", async () => {
    const manifest = buildBaseManifest({
      periods: [
        {
          id: "period:2026-fall:1",
          termKey: "2026-fall",
          periodNo: 1,
          label: "1限",
          startTime: "10:40",
          endTime: "09:00",
          isEnabled: true,
          createdAt: "2026-04-20T00:00:00.000Z",
          updatedAt: "2026-04-20T00:00:00.000Z",
        },
      ],
      slots: [],
      attendance: [],
    });
    const archiveBlob = await buildArchive(manifest);

    await expect(readImportArchive(archiveBlob)).rejects.toMatchObject({
      code: "IMPORT_INVALID",
      message: expect.stringContaining("開始・終了時刻が不正"),
    });
  });

  it("rejects backups with invalid slot weekdays", async () => {
    const manifest = buildBaseManifest({
      slots: [
        {
          id: "slot-1",
          termKey: "2026-fall",
          subjectId: "subject-1",
          weekday: "sun",
          periodNo: 1,
          activeSlotKey: "2026-fall:sun:1",
          isArchived: false,
          createdAt: "2026-04-20T00:00:00.000Z",
          updatedAt: "2026-04-20T00:00:00.000Z",
        },
      ],
      attendance: [],
    });
    const archiveBlob = await buildArchive(manifest);

    await expect(readImportArchive(archiveBlob)).rejects.toMatchObject({
      code: "IMPORT_INVALID",
      message: expect.stringContaining("曜日が不正"),
    });
  });

  it("rejects active slots that reference disabled periods", async () => {
    const manifest = buildBaseManifest({
      periods: [
        {
          id: "period:2026-fall:1",
          termKey: "2026-fall",
          periodNo: 1,
          label: "1限",
          startTime: "09:00",
          endTime: "10:40",
          isEnabled: false,
          createdAt: "2026-04-20T00:00:00.000Z",
          updatedAt: "2026-04-20T00:00:00.000Z",
        },
        {
          id: "period:2026-fall:2",
          termKey: "2026-fall",
          periodNo: 2,
          label: "2限",
          startTime: "10:50",
          endTime: "12:30",
          isEnabled: true,
          createdAt: "2026-04-20T00:00:00.000Z",
          updatedAt: "2026-04-20T00:00:00.000Z",
        },
      ],
      slots: [
        {
          id: "slot-1",
          termKey: "2026-fall",
          subjectId: "subject-1",
          weekday: "mon",
          periodNo: 1,
          activeSlotKey: "2026-fall:mon:1",
          isArchived: false,
          createdAt: "2026-04-20T00:00:00.000Z",
          updatedAt: "2026-04-20T00:00:00.000Z",
        },
      ],
      attendance: [],
    });
    const archiveBlob = await buildArchive(manifest);

    await expect(readImportArchive(archiveBlob)).rejects.toMatchObject({
      code: "IMPORT_INVALID",
      message: expect.stringContaining("無効なコマ定義を参照"),
    });
  });

  it("rejects duplicate material file paths during preview", async () => {
    const base = buildBaseManifest();
    const manifest = buildBaseManifest({
      materials: [
        base.materials[0],
        {
          ...base.materials[0],
          id: "material-2",
          displayName: "lecture-copy.pdf",
        },
      ],
      materialFiles: [
        base.materialFiles[0],
        {
          id: "material-2",
          path: base.materialFiles[0].path,
          displayName: "lecture-copy.pdf",
          mimeType: "application/pdf",
          sizeBytes: 12,
        },
      ],
    });
    const archiveBlob = await buildArchive(manifest);

    await expect(readImportArchive(archiveBlob)).rejects.toMatchObject({
      code: "IMPORT_INVALID",
      message: expect.stringContaining("資料ファイル の path が重複"),
    });
  });

  it("rejects non-array top-level fields during preview", async () => {
    const manifest = {
      ...buildBaseManifest(),
      notes: { broken: true },
    };
    const archiveBlob = await buildArchive(manifest);

    await expect(readImportArchive(archiveBlob)).rejects.toMatchObject({
      code: "IMPORT_INVALID",
      message: expect.stringContaining("notes は配列"),
    });
  });

  it("rejects non-string subject names during preview", async () => {
    const base = buildBaseManifest();
    const manifest = buildBaseManifest({
      subjects: [
        {
          ...base.subjects[0],
          name: 42,
        },
      ],
    });
    const archiveBlob = await buildArchive(manifest);

    await expect(readImportArchive(archiveBlob)).rejects.toMatchObject({
      code: "IMPORT_INVALID",
      message: expect.stringContaining("subjects[0].name は文字列"),
    });
  });

  it("rejects non-boolean period flags during preview", async () => {
    const base = buildBaseManifest();
    const manifest = buildBaseManifest({
      periods: [
        {
          ...base.periods[0],
          isEnabled: "yes",
        },
      ],
    });
    const archiveBlob = await buildArchive(manifest);

    await expect(readImportArchive(archiveBlob)).rejects.toMatchObject({
      code: "IMPORT_INVALID",
      message: expect.stringContaining("periods[0].isEnabled は boolean"),
    });
  });

  it("rejects non-array restoreSlotIds during preview", async () => {
    const base = buildBaseManifest();
    const manifest = buildBaseManifest({
      subjects: [
        {
          ...base.subjects[0],
          restoreSlotIds: "slot-1",
        },
      ],
    });
    const archiveBlob = await buildArchive(manifest);

    await expect(readImportArchive(archiveBlob)).rejects.toMatchObject({
      code: "IMPORT_INVALID",
      message: expect.stringContaining("subjects[0].restoreSlotIds は配列"),
    });
  });

  it("rejects non-integer slot period numbers during preview", async () => {
    const base = buildBaseManifest();
    const manifest = buildBaseManifest({
      slots: [
        {
          ...base.slots[0],
          periodNo: "1",
        },
      ],
    });
    const archiveBlob = await buildArchive(manifest);

    await expect(readImportArchive(archiveBlob)).rejects.toMatchObject({
      code: "IMPORT_INVALID",
      message: expect.stringContaining("slots[0].periodNo は 1 以上の整数"),
    });
  });

  it("rejects blank todo titles during preview", async () => {
    const base = buildBaseManifest();
    const manifest = buildBaseManifest({
      todos: [
        {
          ...base.todos[0],
          title: "   ",
        },
      ],
    });
    const archiveBlob = await buildArchive(manifest);

    await expect(readImportArchive(archiveBlob)).rejects.toMatchObject({
      code: "IMPORT_INVALID",
      message: expect.stringContaining("todos[0].title が空"),
    });
  });
});
