import { createAppError } from "../lib/errors";
import { getDb } from "../db/schema";

function isQuotaError(error) {
  if (!error) return false;
  const name = typeof error === "object" && "name" in error ? String(error.name) : "";
  const message = typeof error === "object" && "message" in error ? String(error.message) : String(error);
  return name === "QuotaExceededError" || /quota|storage/i.test(message);
}

async function supportsOpfs() {
  return typeof navigator !== "undefined" && Boolean(navigator.storage?.getDirectory);
}

async function getOpfsRoot() {
  if (!(await supportsOpfs())) return null;
  return navigator.storage.getDirectory();
}

async function getMaterialFileHandle(materialId, create = false) {
  const root = await getOpfsRoot();
  if (!root) return null;
  const dir = await root.getDirectoryHandle("campus-notes-materials", { create: true });
  return dir.getFileHandle(materialId, { create });
}

async function getMaterialDirectoryHandle() {
  const root = await getOpfsRoot();
  if (!root) return null;
  return root.getDirectoryHandle("campus-notes-materials", { create: true });
}

async function removeOpfsEntry(name) {
  const dir = await getMaterialDirectoryHandle();
  if (!dir) return;
  try {
    await dir.removeEntry(name);
  } catch {
    // Best-effort cleanup only.
  }
}

async function saveToIndexedDb(materialId, blob) {
  const db = await getDb();
  await db.put("material_files", { id: materialId, blob });
  return { storage: "indexeddb" };
}

async function saveToOpfs(materialId, blob) {
  const dir = await getMaterialDirectoryHandle();
  const tempName = `${materialId}.tmp`;
  let tempHandle = null;

  try {
    await removeOpfsEntry(tempName);
    tempHandle = await dir.getFileHandle(tempName, { create: true });
    const tempWritable = await tempHandle.createWritable();
    await tempWritable.write(blob);
    await tempWritable.close();

    const committedBlob = await tempHandle.getFile();
    const finalHandle = await dir.getFileHandle(materialId, { create: true });
    const finalWritable = await finalHandle.createWritable();
    await finalWritable.write(committedBlob);
    await finalWritable.close();
    await removeOpfsEntry(tempName);

    const db = await getDb();
    await db.delete("material_files", materialId);
    return { storage: "opfs" };
  } catch (error) {
    await removeOpfsEntry(tempName);
    await removeOpfsEntry(materialId);
    throw error;
  }
}

export async function saveMaterialFile(materialId, blob) {
  if (await supportsOpfs()) {
    try {
      return await saveToOpfs(materialId, blob);
    } catch (opfsError) {
      try {
        return await saveToIndexedDb(materialId, blob);
      } catch (indexedDbError) {
        if (isQuotaError(opfsError) || isQuotaError(indexedDbError)) {
          throw createAppError("MATERIAL_STORAGE_QUOTA", "資料ファイルの保存容量が不足しています。不要な資料を削除してから、もう一度お試しください。");
        }
        throw createAppError("MATERIAL_STORAGE_FAILED", "資料ファイルを保存できませんでした。");
      }
    }
  }
  try {
    return await saveToIndexedDb(materialId, blob);
  } catch (error) {
    if (isQuotaError(error)) {
      throw createAppError("MATERIAL_STORAGE_QUOTA", "資料ファイルの保存容量が不足しています。不要な資料を削除してから、もう一度お試しください。");
    }
    throw createAppError("MATERIAL_STORAGE_FAILED", "資料ファイルを保存できませんでした。");
  }
}

export async function getMaterialFile(materialId, options = {}) {
  const db = await getDb();
  const readIndexedDb = async () => {
    const record = await db.get("material_files", materialId);
    if (record?.blob) {
      return { blob: record.blob, storage: "indexeddb", exists: true };
    }
    return null;
  };
  const readOpfs = async () => {
    if (!(await supportsOpfs())) return null;
    try {
      const handle = await getMaterialFileHandle(materialId, false);
      const file = await handle.getFile();
      return { blob: file, storage: "opfs", exists: true };
    } catch {
      return null;
    }
  };

  const readOrder = options.preferredStorage === "indexeddb"
    ? [readIndexedDb]
    : options.preferredStorage === "opfs"
      ? [readOpfs]
      : [readOpfs, readIndexedDb];

  for (const readFile of readOrder) {
    const result = await readFile();
    if (result?.exists) return result;
  }

  return { blob: null, storage: null, exists: false };
}

export async function clearMaterialFileStorage() {
  if (!(await supportsOpfs())) return;
  try {
    const root = await getOpfsRoot();
    await root.removeEntry("campus-notes-materials", { recursive: true });
  } catch (error) {
    if (error?.name === "NotFoundError") return;
    throw createAppError("MATERIAL_STORAGE_CLEANUP_FAILED", "古い資料ファイルのクリーンアップに失敗しました。", {
      cause: error,
    });
  }
}

export async function deleteMaterialFile(materialId) {
  let deleted = false;

  if (await supportsOpfs()) {
    try {
      const root = await getOpfsRoot();
      const dir = await root.getDirectoryHandle("campus-notes-materials", { create: true });
      await dir.removeEntry(materialId);
      deleted = true;
    } catch {
      // Ignore and continue with IndexedDB fallback cleanup.
    }
  }

  const db = await getDb();
  const record = await db.get("material_files", materialId);
  if (record) {
    await db.delete("material_files", materialId);
    deleted = true;
  }

  return deleted;
}
