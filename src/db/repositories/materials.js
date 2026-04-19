import {
  MATERIAL_ALLOWED_EXTENSIONS,
  MATERIAL_MAX_FILE_SIZE,
} from "../../lib/constants";
import { createAppError } from "../../lib/errors";
import { fileExtension, nowIso, sortByUpdated, triggerDownload, uid } from "../../lib/utils";
import { getDb } from "../schema";
import { deleteMaterialFile, getMaterialFile, saveMaterialFile } from "../../services/materialFileStore";

const MATERIAL_URL_TTL_MS = 60000;
const openedMaterialUrls = new Set();
let pagehideBound = false;
const PREVIEW_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const ALLOWED_MIME_TYPES_BY_EXTENSION = {
  pdf: new Set(["application/pdf"]),
  txt: new Set(["text/plain"]),
  md: new Set(["text/markdown", "text/plain"]),
  csv: new Set(["text/csv", "application/csv", "text/plain"]),
  doc: new Set(["application/msword"]),
  docx: new Set(["application/vnd.openxmlformats-officedocument.wordprocessingml.document"]),
  ppt: new Set(["application/vnd.ms-powerpoint"]),
  pptx: new Set(["application/vnd.openxmlformats-officedocument.presentationml.presentation"]),
  xls: new Set(["application/vnd.ms-excel"]),
  xlsx: new Set(["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]),
  jpg: new Set(["image/jpeg"]),
  jpeg: new Set(["image/jpeg"]),
  png: new Set(["image/png"]),
  webp: new Set(["image/webp"]),
  zip: new Set(["application/zip", "application/x-zip-compressed", "multipart/x-zip"]),
};

function ensureMaterialUrlCleanup() {
  if (pagehideBound || typeof window === "undefined") return;
  window.addEventListener("pagehide", () => {
    for (const url of openedMaterialUrls) {
      URL.revokeObjectURL(url);
    }
    openedMaterialUrls.clear();
  });
  pagehideBound = true;
}

function normalizeMimeType(value) {
  return String(value || "").split(";")[0].trim().toLowerCase();
}

function scheduleMaterialUrlRevoke(url) {
  setTimeout(() => {
    if (!openedMaterialUrls.has(url)) return;
    URL.revokeObjectURL(url);
    openedMaterialUrls.delete(url);
  }, MATERIAL_URL_TTL_MS);
}

function validateMaterialFile(file) {
  if (file.size > MATERIAL_MAX_FILE_SIZE) {
    throw createAppError("MATERIAL_TOO_LARGE", "資料ファイルが大きすぎます。50MB 以下にしてください。");
  }

  const extension = fileExtension(file.name);
  if (!extension) {
    throw createAppError("MATERIAL_EXTENSION", "拡張子のないファイルは保存できません。対応形式のファイルを選択してください。");
  }
  if (!MATERIAL_ALLOWED_EXTENSIONS.has(extension)) {
    throw createAppError("MATERIAL_EXTENSION", `この拡張子はまだ受け付けていません: .${extension}`);
  }

  const mimeType = normalizeMimeType(file.type);
  const allowedMimeTypes = ALLOWED_MIME_TYPES_BY_EXTENSION[extension];
  if (mimeType && allowedMimeTypes && !allowedMimeTypes.has(mimeType)) {
    throw createAppError("MATERIAL_MIME", "ファイル形式と MIME タイプが一致しません。安全な資料ファイルを選択してください。");
  }
}

async function createMaterial(subjectId, file, note = "") {
  const materialId = uid();
  const extension = fileExtension(file.name);
  const timestamp = nowIso();

  const saveResult = await saveMaterialFile(materialId, file);

  try {
    const db = await getDb();
    const tx = db.transaction(["material_meta", "subjects"], "readwrite");
    const subjectStore = tx.objectStore("subjects");
    const metaStore = tx.objectStore("material_meta");
    const subject = await subjectStore.get(subjectId);
    if (!subject) {
      throw createAppError("NOT_FOUND", "授業が見つかりませんでした。");
    }
    await metaStore.put({
      id: materialId,
      subjectId,
      termKey: subject.termKey,
      displayName: file.name,
      mimeType: file.type || "application/octet-stream",
      fileExt: extension,
      storageBackend: saveResult?.storage || "indexeddb",
      sizeBytes: file.size,
      note,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await tx.done;
    return materialId;
  } catch (error) {
    await deleteMaterialFile(materialId);
    throw error;
  }
}

export function validateMaterialFiles(files = []) {
  for (const file of files) {
    validateMaterialFile(file);
  }
}

export async function loadSubjectMaterials(subjectId) {
  const db = await getDb();
  const items = await db.getAllFromIndex("material_meta", "bySubjectId", subjectId);
  return sortByUpdated(items);
}

export async function countMaterialsBySubject(subjectId) {
  const db = await getDb();
  return db.countFromIndex("material_meta", "bySubjectId", subjectId);
}

export async function saveMaterial(subjectId, file, note = "") {
  validateMaterialFiles([file]);
  await createMaterial(subjectId, file, note);
}

export async function saveMaterialsBatch(subjectId, files, note = "") {
  validateMaterialFiles(files);
  const createdMaterialIds = [];

  try {
    for (const file of files) {
      const materialId = await createMaterial(subjectId, file, note);
      createdMaterialIds.push(materialId);
    }
  } catch (error) {
    const db = await getDb();
    for (const materialId of createdMaterialIds) {
      await deleteMaterialFile(materialId).catch(() => {});
      await db.delete("material_meta", materialId).catch(() => {});
    }
    throw error;
  }
}

export async function updateMaterialNote(materialId, note, baseUpdatedAt = null) {
  const db = await getDb();
  const tx = db.transaction("material_meta", "readwrite");
  const existing = await tx.store.get(materialId);
  if (!existing) {
    throw createAppError("STALE_DRAFT", "この資料は既に削除されています。");
  }
  if (baseUpdatedAt && existing.updatedAt !== baseUpdatedAt) {
    throw createAppError("STALE_UPDATE", "この資料メモは別の画面で更新されています。開き直してから保存してください。");
  }
  await tx.store.put({
    ...existing,
    note,
    updatedAt: nowIso(),
  });
  await tx.done;
}

function shouldPreviewMaterial({ mimeType, fileExt }) {
  const normalizedMime = normalizeMimeType(mimeType);
  if (normalizedMime) return PREVIEW_MIME_TYPES.has(normalizedMime);
  return PREVIEW_MIME_TYPES.has(
    fileExt === "pdf"
      ? "application/pdf"
      : fileExt === "jpg" || fileExt === "jpeg"
        ? "image/jpeg"
        : fileExt === "png"
          ? "image/png"
          : fileExt === "webp"
            ? "image/webp"
            : "",
  );
}

export async function openMaterial(meta) {
  const previewWindow = shouldPreviewMaterial(meta)
    ? window.open("about:blank", "_blank", "noopener,noreferrer")
    : null;

  try {
    const file = await getMaterialFile(meta.id, { preferredStorage: meta.storageBackend });
    if (!file.exists || !file.blob) {
      if (previewWindow) previewWindow.close();
      throw createAppError("MATERIAL_MISSING", "ファイル本体が見つかりませんでした。");
    }

    const actualMimeType = normalizeMimeType(file.blob.type || meta.mimeType);
    const actualFileExt = meta.fileExt || fileExtension(meta.displayName);
    const previewAllowed = shouldPreviewMaterial({ mimeType: actualMimeType, fileExt: actualFileExt });

    if (!previewAllowed) {
      if (previewWindow) previewWindow.close();
      triggerDownload(file.blob, meta.displayName);
      return { downloaded: true, blocked: false };
    }

    if (!previewWindow) {
      triggerDownload(file.blob, meta.displayName);
      return { downloaded: true, blocked: true };
    }

    ensureMaterialUrlCleanup();
    const url = URL.createObjectURL(file.blob);
    openedMaterialUrls.add(url);
    scheduleMaterialUrlRevoke(url);
    previewWindow.location.href = url;
    return { downloaded: false, blocked: false };
  } catch (error) {
    if (previewWindow && !previewWindow.closed) {
      previewWindow.close();
    }
    throw error;
  }
}

export async function deleteMaterial(materialId) {
  const db = await getDb();
  const existing = await db.get("material_meta", materialId);
  if (!existing) {
    throw createAppError("STALE_DRAFT", "この資料は既に削除されています。");
  }

  let fileDeleted = false;
  let cleanupWarning = false;
  let cleanupError = null;

  try {
    fileDeleted = await deleteMaterialFile(materialId);
    cleanupWarning = !fileDeleted;
  } catch (error) {
    cleanupWarning = true;
    cleanupError = error instanceof Error ? error.message : String(error);
  }

  const tx = db.transaction("material_meta", "readwrite");
  await tx.store.delete(materialId);
  await tx.done;
  return { fileDeleted, cleanupWarning, cleanupError };
}
