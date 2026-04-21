import { SETTINGS_ID } from "../lib/constants";
import { createAppError } from "../lib/errors";
import { safeFileName, suggestedTermLabel } from "../lib/utils";

export const BACKUP_VERSION = 4;
export const MIN_IMPORT_VERSION = 3;
export const MAX_IMPORT_VERSION = 4;
export const BACKUP_MANIFEST_PATH = "data/manifest.json";

export const IMPORT_STORE_NAMES = [
  "settings",
  "term_meta",
  "period_definitions",
  "subjects",
  "slots",
  "notes",
  "attendance",
  "todo_items",
  "material_meta",
  "material_files",
];

function ensureSnapshotArray(value) {
  return Array.isArray(value) ? value : [];
}

function ensureImportArray(value, label) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw createAppError("IMPORT_INVALID", `${label} は配列である必要があります。`);
  }
  return value;
}

function ensureOptionalString(value, label) {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") {
    throw createAppError("IMPORT_INVALID", `${label} は文字列である必要があります。`);
  }
  return value;
}

function ensureOptionalBoolean(value, label, defaultValue = true) {
  if (value === undefined || value === null) return defaultValue;
  if (typeof value !== "boolean") {
    throw createAppError("IMPORT_INVALID", `${label} は boolean である必要があります。`);
  }
  return value;
}

function normalizeArtifactMeta(rawArtifact, settings, materials, materialFiles, version) {
  const fallbackIncludesMaterialFiles =
    version < 4
      ? true
      : materialFiles.length > 0 || (settings.exportIncludeFiles !== false && materials.length > 0);

  if (rawArtifact === undefined || rawArtifact === null) {
    return {
      includesMaterialFiles: fallbackIncludesMaterialFiles,
      hasMissingMaterialFiles: false,
    };
  }

  if (typeof rawArtifact !== "object" || Array.isArray(rawArtifact)) {
    throw createAppError("IMPORT_INVALID", "artifact は object である必要があります。");
  }

  return {
    includesMaterialFiles: ensureOptionalBoolean(rawArtifact.includesMaterialFiles, "artifact.includesMaterialFiles", fallbackIncludesMaterialFiles),
    hasMissingMaterialFiles: ensureOptionalBoolean(rawArtifact.hasMissingMaterialFiles, "artifact.hasMissingMaterialFiles", false),
  };
}

export function buildMaterialArchivePath(meta) {
  return `materials/${meta.id}_${safeFileName(meta.displayName || "file")}`;
}

export function createBackupManifest(snapshot, fileEntries = [], artifact = {}) {
  const materialMeta = ensureSnapshotArray(snapshot.materialMeta);
  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    settings: snapshot.settings || null,
    artifact: {
      includesMaterialFiles: Boolean(artifact.includesMaterialFiles),
      hasMissingMaterialFiles: Boolean(artifact.hasMissingMaterialFiles),
    },
    termMeta: ensureSnapshotArray(snapshot.termMeta),
    periods: ensureSnapshotArray(snapshot.periods),
    subjects: ensureSnapshotArray(snapshot.subjects),
    slots: ensureSnapshotArray(snapshot.slots),
    notes: ensureSnapshotArray(snapshot.notes),
    attendance: ensureSnapshotArray(snapshot.attendance),
    todos: ensureSnapshotArray(snapshot.todos),
    materials: materialMeta,
    materialFiles: fileEntries.map(({ meta, path }) => ({
      id: meta.id,
      path: path || buildMaterialArchivePath(meta),
      displayName: meta.displayName || "",
      mimeType: meta.mimeType || "",
      sizeBytes: Number(meta.sizeBytes || 0),
    })),
  };
}

export function normalizeImportedManifest(rawManifest) {
  if (!rawManifest || typeof rawManifest !== "object") {
    throw createAppError("IMPORT_INVALID", "バックアップ manifest が壊れています。");
  }

  const version = Number(rawManifest.version);
  if (!Number.isInteger(version) || version < MIN_IMPORT_VERSION || version > MAX_IMPORT_VERSION) {
    throw createAppError(
      "IMPORT_VERSION_UNSUPPORTED",
      `このバックアップ形式には対応していません。対応バージョンは ${MIN_IMPORT_VERSION} から ${MAX_IMPORT_VERSION} です。`,
    );
  }

  const settings = rawManifest.settings;
  if (!settings || typeof settings !== "object") {
    throw createAppError("IMPORT_INVALID", "設定データが見つかりません。");
  }

  if (typeof settings.currentTermKey !== "string") {
    throw createAppError("IMPORT_INVALID", "settings.currentTermKey は文字列である必要があります。");
  }

  const currentTermKey = settings.currentTermKey.trim();
  if (!currentTermKey) {
    throw createAppError("IMPORT_INVALID", "現在学期キーが見つかりません。");
  }

  const materials = ensureImportArray(rawManifest.materials, "materials");
  const materialFiles = version >= 4
    ? ensureImportArray(rawManifest.materialFiles, "materialFiles")
    : materials.map((meta) => ({
        id: meta.id,
        path: buildMaterialArchivePath(meta),
        displayName: meta.displayName || "",
        mimeType: meta.mimeType || "",
        sizeBytes: Number(meta.sizeBytes || 0),
      }));
  const normalizedSettings = {
    ...settings,
    id: SETTINGS_ID,
    currentTermKey,
    termLabel: ensureOptionalString(settings.termLabel, "settings.termLabel").trim() || suggestedTermLabel(currentTermKey),
    exportIncludeFiles: ensureOptionalBoolean(settings.exportIncludeFiles, "settings.exportIncludeFiles", true),
  };
  const artifact = normalizeArtifactMeta(rawManifest.artifact, normalizedSettings, materials, materialFiles, version);

  return {
    version,
    exportedAt: rawManifest.exportedAt || "",
    settings: normalizedSettings,
    artifact,
    termMeta: ensureImportArray(rawManifest.termMeta, "termMeta"),
    periods: ensureImportArray(rawManifest.periods, "periods"),
    subjects: ensureImportArray(rawManifest.subjects, "subjects"),
    slots: ensureImportArray(rawManifest.slots, "slots"),
    notes: ensureImportArray(rawManifest.notes, "notes"),
    attendance: ensureImportArray(rawManifest.attendance, "attendance"),
    todos: version >= 4 ? ensureImportArray(rawManifest.todos, "todos") : [],
    materials,
    materialFiles,
  };
}
