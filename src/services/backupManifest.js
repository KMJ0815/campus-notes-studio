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

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

export function buildMaterialArchivePath(meta) {
  return `materials/${meta.id}_${safeFileName(meta.displayName || "file")}`;
}

export function createBackupManifest(snapshot, fileEntries = []) {
  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    settings: snapshot.settings || null,
    termMeta: ensureArray(snapshot.termMeta),
    periods: ensureArray(snapshot.periods),
    subjects: ensureArray(snapshot.subjects),
    slots: ensureArray(snapshot.slots),
    notes: ensureArray(snapshot.notes),
    attendance: ensureArray(snapshot.attendance),
    todos: ensureArray(snapshot.todos),
    materials: ensureArray(snapshot.materialMeta),
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

  const currentTermKey = String(settings.currentTermKey || "").trim();
  if (!currentTermKey) {
    throw createAppError("IMPORT_INVALID", "現在学期キーが見つかりません。");
  }

  return {
    version,
    exportedAt: rawManifest.exportedAt || "",
    settings: {
      ...settings,
      id: SETTINGS_ID,
      currentTermKey,
      termLabel: String(settings.termLabel || "").trim() || suggestedTermLabel(currentTermKey),
      exportIncludeFiles: settings.exportIncludeFiles !== false,
    },
    termMeta: ensureArray(rawManifest.termMeta),
    periods: ensureArray(rawManifest.periods),
    subjects: ensureArray(rawManifest.subjects),
    slots: ensureArray(rawManifest.slots),
    notes: ensureArray(rawManifest.notes),
    attendance: ensureArray(rawManifest.attendance),
    todos: version >= 4 ? ensureArray(rawManifest.todos) : [],
    materials: ensureArray(rawManifest.materials),
    materialFiles: version >= 4
      ? ensureArray(rawManifest.materialFiles)
      : ensureArray(rawManifest.materials).map((meta) => ({
          id: meta.id,
          path: buildMaterialArchivePath(meta),
          displayName: meta.displayName || "",
          mimeType: meta.mimeType || "",
          sizeBytes: Number(meta.sizeBytes || 0),
        })),
  };
}
