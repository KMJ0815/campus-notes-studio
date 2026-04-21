import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/schema", () => ({
  getDb: vi.fn(),
}));

import { getDb } from "../db/schema";
import { clearMaterialFileStorage, getMaterialFile, saveMaterialFile } from "./materialFileStore";

describe("materialFileStore", () => {
  const originalStorage = navigator.storage;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    Object.defineProperty(navigator, "storage", {
      configurable: true,
      value: originalStorage,
    });
  });

  it("falls back to IndexedDB when OPFS save fails", async () => {
    const db = {
      put: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    };
    getDb.mockResolvedValue(db);

    Object.defineProperty(navigator, "storage", {
      configurable: true,
      value: {
        getDirectory: vi.fn().mockResolvedValue({
          getDirectoryHandle: vi.fn().mockResolvedValue({
            getFileHandle: vi.fn().mockResolvedValue({
              createWritable: vi.fn().mockRejectedValue(new Error("opfs failed")),
            }),
          }),
        }),
      },
    });

    const result = await saveMaterialFile("material-1", new Blob(["lecture"], { type: "application/pdf" }));

    expect(result).toMatchObject({ storage: "indexeddb" });
    expect(db.put).toHaveBeenCalledWith("material_files", expect.objectContaining({ id: "material-1" }));
  });

  it("cleans up partial OPFS files before falling back to IndexedDB", async () => {
    const db = {
      put: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    };
    getDb.mockResolvedValue(db);

    const removeEntry = vi.fn().mockResolvedValue(undefined);
    const tempWritable = {
      write: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const finalWritable = {
      write: vi.fn().mockRejectedValue(new Error("final write failed")),
      close: vi.fn().mockResolvedValue(undefined),
    };

    Object.defineProperty(navigator, "storage", {
      configurable: true,
      value: {
        getDirectory: vi.fn().mockResolvedValue({
          getDirectoryHandle: vi.fn().mockResolvedValue({
            getFileHandle: vi.fn()
              .mockResolvedValueOnce({
                createWritable: vi.fn().mockResolvedValue(tempWritable),
                getFile: vi.fn().mockResolvedValue(new Blob(["lecture"], { type: "application/pdf" })),
              })
              .mockResolvedValueOnce({
                createWritable: vi.fn().mockResolvedValue(finalWritable),
              }),
            removeEntry,
          }),
        }),
      },
    });

    const result = await saveMaterialFile("material-1", new Blob(["lecture"], { type: "application/pdf" }));

    expect(result).toMatchObject({ storage: "indexeddb" });
    expect(removeEntry).toHaveBeenCalledWith("material-1.tmp");
    expect(removeEntry).toHaveBeenCalledWith("material-1");
    expect(db.put).toHaveBeenCalledWith("material_files", expect.objectContaining({ id: "material-1" }));
  });

  it("returns a quota error when both OPFS and IndexedDB saves fail because of storage limits", async () => {
    const db = {
      put: vi.fn().mockRejectedValue(new DOMException("quota", "QuotaExceededError")),
      delete: vi.fn().mockResolvedValue(undefined),
    };
    getDb.mockResolvedValue(db);

    Object.defineProperty(navigator, "storage", {
      configurable: true,
      value: {
        getDirectory: vi.fn().mockResolvedValue({
          getDirectoryHandle: vi.fn().mockResolvedValue({
            getFileHandle: vi.fn().mockResolvedValue({
              createWritable: vi.fn().mockRejectedValue(new DOMException("quota", "QuotaExceededError")),
            }),
          }),
        }),
      },
    });

    await expect(
      saveMaterialFile("material-1", new Blob(["lecture"], { type: "application/pdf" })),
    ).rejects.toMatchObject({ code: "MATERIAL_STORAGE_QUOTA" });
  });

  it("does not fall back to OPFS when IndexedDB is the declared backend", async () => {
    const db = {
      get: vi.fn().mockResolvedValue(undefined),
    };
    getDb.mockResolvedValue(db);

    const getFile = vi.fn().mockResolvedValue(new Blob(["lecture"], { type: "application/pdf" }));
    Object.defineProperty(navigator, "storage", {
      configurable: true,
      value: {
        getDirectory: vi.fn().mockResolvedValue({
          getDirectoryHandle: vi.fn().mockResolvedValue({
            getFileHandle: vi.fn().mockResolvedValue({
              getFile,
            }),
          }),
        }),
      },
    });

    const result = await getMaterialFile("material-1", { preferredStorage: "indexeddb" });

    expect(result).toEqual({ blob: null, storage: null, exists: false });
    expect(getFile).not.toHaveBeenCalled();
  });

  it("throws when OPFS cleanup fails for reasons other than a missing directory", async () => {
    Object.defineProperty(navigator, "storage", {
      configurable: true,
      value: {
        getDirectory: vi.fn().mockResolvedValue({
          removeEntry: vi.fn().mockRejectedValue(new Error("locked")),
        }),
      },
    });

    await expect(clearMaterialFileStorage()).rejects.toMatchObject({
      code: "MATERIAL_STORAGE_CLEANUP_FAILED",
    });
  });
});
