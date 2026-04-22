import {
  MATERIAL_ALLOWED_EXTENSIONS,
  MATERIAL_MAX_FILE_SIZE,
} from "../../lib/constants";
import { createAppError } from "../../lib/errors";
import { fileExtension, nowIso, sortByUpdated, triggerDownload, uid } from "../../lib/utils";
import { getDb } from "../schema";
import { deleteMaterialFile, getMaterialFile, saveMaterialFile } from "../../services/materialFileStore";

const openedMaterialUrls = new Map();
let pagehideBound = false;
const PREVIEW_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const PREVIEW_MIME_TYPES_BY_EXTENSION = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};
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
    for (const url of [...openedMaterialUrls.keys()]) {
      cleanupMaterialUrl(url);
    }
  });
  pagehideBound = true;
}

function normalizeMimeType(value) {
  return String(value || "").split(";")[0].trim().toLowerCase();
}

function isGenericMimeType(mimeType) {
  return !mimeType || ["application/octet-stream", "binary/octet-stream", "application/unknown"].includes(mimeType);
}

function inferPreviewMimeTypeFromExtension(fileExt) {
  return PREVIEW_MIME_TYPES_BY_EXTENSION[fileExt || ""] || "";
}

function resolveMaterialMimeType(mimeType, fileExt) {
  const normalizedMime = normalizeMimeType(mimeType);
  if (PREVIEW_MIME_TYPES.has(normalizedMime)) return normalizedMime;
  if (isGenericMimeType(normalizedMime)) {
    return inferPreviewMimeTypeFromExtension(fileExt) || "";
  }
  return normalizedMime;
}

function resolvePreviewMimeType({ mimeType, fileExt }) {
  const normalizedMime = normalizeMimeType(mimeType);
  if (PREVIEW_MIME_TYPES.has(normalizedMime)) return normalizedMime;
  const inferredMime = inferPreviewMimeTypeFromExtension(fileExt);
  if (!inferredMime) return "";
  return isGenericMimeType(normalizedMime) ? inferredMime : "";
}

function cleanupMaterialUrl(url) {
  const entry = openedMaterialUrls.get(url);
  if (!entry) return;
  if (entry.closeWatcherId && typeof window !== "undefined") {
    window.clearInterval(entry.closeWatcherId);
  }
  URL.revokeObjectURL(url);
  openedMaterialUrls.delete(url);
}

function trackMaterialUrl(url, previewWindow) {
  ensureMaterialUrlCleanup();
  const entry = { closeWatcherId: null };
  if (previewWindow && typeof window !== "undefined") {
    entry.closeWatcherId = window.setInterval(() => {
      if (!previewWindow.closed) return;
      cleanupMaterialUrl(url);
    }, 1000);
  }
  openedMaterialUrls.set(url, entry);
}

function createPreviewBlob(blob, mimeType) {
  if (!mimeType || normalizeMimeType(blob?.type) === mimeType) return blob;
  return new Blob([blob], { type: mimeType });
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
    const materialMeta = {
      id: materialId,
      subjectId,
      termKey: subject.termKey,
      displayName: file.name,
      mimeType: resolveMaterialMimeType(file.type, extension),
      fileExt: extension,
      storageBackend: saveResult?.storage || "indexeddb",
      sizeBytes: file.size,
      note,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await metaStore.put(materialMeta);
    await tx.done;
    return materialMeta;
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
  return createMaterial(subjectId, file, note);
}

export async function saveMaterialsBatch(subjectId, files, note = "") {
  validateMaterialFiles(files);
  const createdMaterials = [];

  try {
    for (const file of files) {
      const materialMeta = await createMaterial(subjectId, file, note);
      createdMaterials.push(materialMeta);
    }
  } catch (error) {
    const db = await getDb();
    for (const materialMeta of createdMaterials) {
      await deleteMaterialFile(materialMeta.id).catch(() => {});
      await db.delete("material_meta", materialMeta.id).catch(() => {});
    }
    throw error;
  }

  return createdMaterials;
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
  const savedMaterial = {
    ...existing,
    note,
    updatedAt: nowIso(),
  };
  await tx.store.put(savedMaterial);
  await tx.done;
  return savedMaterial;
}

function shouldPreviewMaterial({ mimeType, fileExt }) {
  return Boolean(resolvePreviewMimeType({ mimeType, fileExt }));
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

    const actualFileExt = meta.fileExt || fileExtension(meta.displayName);
    const actualMimeType = resolveMaterialMimeType(file.blob.type || meta.mimeType, actualFileExt);
    const previewMimeType = resolvePreviewMimeType({ mimeType: actualMimeType, fileExt: actualFileExt });
    const previewAllowed = Boolean(previewMimeType);

    if (!previewAllowed) {
      if (previewWindow) previewWindow.close();
      triggerDownload(file.blob, meta.displayName);
      return { downloaded: true, blocked: false };
    }

    if (!previewWindow) {
      triggerDownload(file.blob, meta.displayName);
      return { downloaded: true, blocked: true };
    }

    const previewBlob = createPreviewBlob(file.blob, previewMimeType);
    const url = URL.createObjectURL(previewBlob);
    trackMaterialUrl(url, previewWindow);
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
