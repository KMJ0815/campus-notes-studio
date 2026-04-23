import { getDb } from "../db/schema";
import { getMaterialFile } from "./materialFileStore";
import { todayIso, triggerDownload } from "../lib/utils";
import { buildMaterialArchivePath, createBackupManifest } from "./backupManifest";

let jsZipConstructorPromise = null;

async function loadJsZipConstructor() {
  if (!jsZipConstructorPromise) {
    jsZipConstructorPromise = import("jszip").then((module) => module.default);
  }
  return jsZipConstructorPromise;
}

async function collectExportSnapshot() {
  const db = await getDb();
  const [settings, termMeta, periods, subjects, slots, notes, attendance, todos, materialMeta] = await Promise.all([
    db.get("settings", "app-settings"),
    db.getAll("term_meta"),
    db.getAll("period_definitions"),
    db.getAll("subjects"),
    db.getAll("slots"),
    db.getAll("notes"),
    db.getAll("attendance"),
    db.getAll("todo_items"),
    db.getAll("material_meta"),
  ]);

  return {
    settings,
    termMeta,
    periods,
    subjects,
    slots,
    notes,
    attendance,
    todos,
    materialMeta,
  };
}

async function buildZip(snapshot, fileEntries = [], artifact = {}) {
  const JSZip = await loadJsZipConstructor();
  const zip = new JSZip();
  const manifest = createBackupManifest(snapshot, fileEntries, artifact);

  zip.file("data/manifest.json", JSON.stringify(manifest, null, 2));

  for (const { meta, blob, path } of fileEntries) {
    zip.file(path || buildMaterialArchivePath(meta), blob);
  }

  return zip.generateAsync({ type: "blob" });
}

export async function prepareExport({ allowMissingFiles = false, includeFilesOverride } = {}) {
  const snapshot = await collectExportSnapshot();
  const includeFiles = includeFilesOverride ?? snapshot.settings?.exportIncludeFiles !== false;
  const materialsCount = snapshot.materialMeta.length;

  if (!includeFiles) {
    const artifact = {
      includesMaterialFiles: false,
      hasMissingMaterialFiles: false,
    };
    const blob = await buildZip(snapshot, [], artifact);
    return { status: "ready", blob, filename: `campus-notes-export-${todayIso()}.zip`, missingFiles: [], artifact, materialsCount };
  }

  const missingFiles = [];
  const availableFiles = [];
  for (const meta of snapshot.materialMeta) {
    const file = await getMaterialFile(meta.id, { preferredStorage: meta.storageBackend });
    if (!file.exists || !file.blob) {
      missingFiles.push(meta);
      continue;
    }
    availableFiles.push({ meta, blob: file.blob, path: buildMaterialArchivePath(meta) });
  }

  if (missingFiles.length > 0 && !allowMissingFiles) {
    return { status: "missing_files", missingFiles, filename: `campus-notes-export-${todayIso()}.zip` };
  }

  const artifact = {
    includesMaterialFiles: true,
    hasMissingMaterialFiles: missingFiles.length > 0,
  };
  const blob = await buildZip(snapshot, availableFiles, artifact);
  return { status: "ready", blob, filename: `campus-notes-export-${todayIso()}.zip`, missingFiles, artifact, materialsCount };
}

export function downloadExportResult(result) {
  if (result?.blob && result.filename) {
    triggerDownload(result.blob, result.filename);
  }
}
