import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../services/materialFileStore", () => ({
  deleteMaterialFile: vi.fn(),
  getMaterialFile: vi.fn(),
  saveMaterialFile: vi.fn(),
}));

import { ensureSeedData, deleteAppDb, getDb, resetDbConnection } from "../schema";
import { deleteMaterial, openMaterial, saveMaterialsBatch, updateMaterialNote } from "./materials";
import { saveSubject } from "./subjects";
import { deleteMaterialFile, getMaterialFile, saveMaterialFile } from "../../services/materialFileStore";

describe("materials repository", () => {
  let subjectId = "";

  beforeEach(async () => {
    await deleteAppDb();
    resetDbConnection();
    await ensureSeedData();
    const subject = await saveSubject({
      termKey: "2026-spring",
      name: "国際関係論",
      teacherName: "",
      room: "",
      color: "#4f46e5",
      memo: "",
      isArchived: false,
      selectedSlotKeys: ["mon-1"],
    });
    subjectId = subject.id;
  });

  afterEach(async () => {
    window.dispatchEvent(new Event("pagehide"));
    vi.restoreAllMocks();
    await deleteAppDb();
    resetDbConnection();
  });

  it("deletes metadata and returns a warning when file cleanup fails", async () => {
    const db = await getDb();
    await db.put("material_meta", {
      id: "material-1",
      subjectId,
      termKey: "2026-spring",
      displayName: "lecture.pdf",
      mimeType: "application/pdf",
      fileExt: "pdf",
      sizeBytes: 123,
      note: "",
      createdAt: "2026-04-17T12:00:00.000Z",
      updatedAt: "2026-04-17T12:00:00.000Z",
    });

    deleteMaterialFile.mockResolvedValue(false);

    await expect(deleteMaterial("material-1")).resolves.toMatchObject({
      fileDeleted: false,
      cleanupWarning: true,
    });

    expect(await db.get("material_meta", "material-1")).toBeUndefined();
  });

  it("rejects deleting an already removed material", async () => {
    await expect(deleteMaterial("missing-material")).rejects.toMatchObject({ code: "STALE_DRAFT" });
  });

  it("revokes opened blob urls on pagehide instead of immediately", async () => {
    if (!URL.createObjectURL) {
      Object.defineProperty(URL, "createObjectURL", {
        configurable: true,
        writable: true,
        value: () => "",
      });
    }
    if (!URL.revokeObjectURL) {
      Object.defineProperty(URL, "revokeObjectURL", {
        configurable: true,
        writable: true,
        value: () => {},
      });
    }

    getMaterialFile.mockResolvedValue({
      exists: true,
      blob: new Blob(["lecture"], { type: "application/pdf" }),
    });

    const createObjectUrlSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:material-1");
    const revokeObjectUrlSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const previewWindow = {
      location: { href: "" },
      close: vi.fn(),
      closed: false,
    };
    const openSpy = vi.spyOn(window, "open").mockReturnValue(previewWindow);

    await openMaterial({ id: "material-1", mimeType: "application/pdf", fileExt: "pdf", displayName: "lecture.pdf" });

    expect(createObjectUrlSpy).toHaveBeenCalled();
    expect(openSpy).toHaveBeenCalledWith("about:blank", "_blank", "noopener,noreferrer");
    expect(previewWindow.location.href).toBe("blob:material-1");
    expect(revokeObjectUrlSpy).not.toHaveBeenCalled();

    window.dispatchEvent(new Event("pagehide"));

    expect(revokeObjectUrlSpy).toHaveBeenCalledWith("blob:material-1");
  });

  it("falls back to download when preview popup creation is blocked", async () => {
    if (!URL.createObjectURL) {
      Object.defineProperty(URL, "createObjectURL", {
        configurable: true,
        writable: true,
        value: () => "",
      });
    }

    getMaterialFile.mockResolvedValue({
      exists: true,
      blob: new Blob(["lecture"], { type: "application/pdf" }),
    });

    const createObjectUrlSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:download");
    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    const result = await openMaterial({
      id: "material-1",
      mimeType: "application/pdf",
      fileExt: "pdf",
      displayName: "lecture.pdf",
      storageBackend: "indexeddb",
    });

    expect(openSpy).toHaveBeenCalledWith("about:blank", "_blank", "noopener,noreferrer");
    expect(createObjectUrlSpy).toHaveBeenCalledWith(expect.any(Blob));
    expect(clickSpy).toHaveBeenCalled();
    expect(result).toEqual({ downloaded: true, blocked: true });
  });

  it("rejects files without an extension", async () => {
    saveMaterialFile.mockResolvedValue({ storage: "indexeddb" });

    await expect(
      saveMaterialsBatch(subjectId, [
        new File(["ok"], "README", { type: "application/pdf" }),
      ]),
    ).rejects.toMatchObject({ code: "MATERIAL_EXTENSION" });

    expect(saveMaterialFile).not.toHaveBeenCalled();
  });

  it("rejects mime type mismatches for allowed extensions", async () => {
    saveMaterialFile.mockResolvedValue({ storage: "indexeddb" });

    await expect(
      saveMaterialsBatch(subjectId, [
        new File(["html"], "lecture.pdf", { type: "text/html" }),
      ]),
    ).rejects.toMatchObject({ code: "MATERIAL_MIME" });

    expect(saveMaterialFile).not.toHaveBeenCalled();
  });

  it("aborts the whole batch when one file fails validation", async () => {
    saveMaterialFile.mockResolvedValue(undefined);

    await expect(
      saveMaterialsBatch(subjectId, [
        new File(["ok"], "lecture.pdf", { type: "application/pdf" }),
        new File(["nope"], "archive.exe", { type: "application/octet-stream" }),
      ]),
    ).rejects.toMatchObject({ code: "MATERIAL_EXTENSION" });

    const db = await getDb();
    expect(await db.getAll("material_meta")).toHaveLength(0);
    expect(saveMaterialFile).not.toHaveBeenCalled();
  });

  it("rejects stale material note updates", async () => {
    const db = await getDb();
    await db.put("material_meta", {
      id: "material-note-1",
      subjectId,
      termKey: "2026-spring",
      displayName: "lecture.pdf",
      mimeType: "application/pdf",
      fileExt: "pdf",
      storageBackend: "indexeddb",
      sizeBytes: 123,
      note: "初回",
      createdAt: "2026-04-17T12:00:00.000Z",
      updatedAt: "2026-04-17T12:00:00.000Z",
    });

    await updateMaterialNote("material-note-1", "別タブ更新", "2026-04-17T12:00:00.000Z");

    await expect(
      updateMaterialNote("material-note-1", "古い更新", "2026-04-17T12:00:00.000Z"),
    ).rejects.toMatchObject({ code: "STALE_UPDATE" });
  });

  it("rolls back metadata when a later file save fails during batch upload", async () => {
    saveMaterialFile
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("disk full"));
    deleteMaterialFile.mockResolvedValue(true);

    await expect(
      saveMaterialsBatch(subjectId, [
        new File(["1"], "lecture-1.pdf", { type: "application/pdf" }),
        new File(["2"], "lecture-2.pdf", { type: "application/pdf" }),
      ]),
    ).rejects.toThrow("disk full");

    const db = await getDb();
    expect(await db.getAll("material_meta")).toHaveLength(0);
    expect(deleteMaterialFile).toHaveBeenCalled();
  });
});
