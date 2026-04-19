import JSZip from "jszip";
import { getDb } from "../db/schema";
import { getMaterialFile } from "./materialFileStore";
import { safeFileName, todayIso, triggerDownload } from "../lib/utils";

async function collectExportSnapshot() {
  const db = await getDb();
  const [settings, termMeta, periods, subjects, slots, notes, attendance, materialMeta] = await Promise.all([
    db.get("settings", "app-settings"),
    db.getAll("term_meta"),
    db.getAll("period_definitions"),
    db.getAll("subjects"),
    db.getAll("slots"),
    db.getAll("notes"),
    db.getAll("attendance"),
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
    materialMeta,
  };
}

async function buildZip(snapshot, fileEntries = []) {
  const zip = new JSZip();
  const manifest = {
    version: 3,
    exportedAt: new Date().toISOString(),
    settings: snapshot.settings,
    termMeta: snapshot.termMeta,
    periods: snapshot.periods,
    subjects: snapshot.subjects,
    slots: snapshot.slots,
    notes: snapshot.notes,
    attendance: snapshot.attendance,
    materials: snapshot.materialMeta,
  };

  zip.file("data/manifest.json", JSON.stringify(manifest, null, 2));

  for (const { meta, blob } of fileEntries) {
    zip.file(`materials/${meta.id}_${safeFileName(meta.displayName)}`, blob);
  }

  return zip.generateAsync({ type: "blob" });
}

export async function prepareExport({ allowMissingFiles = false } = {}) {
  const snapshot = await collectExportSnapshot();
  const includeFiles = snapshot.settings?.exportIncludeFiles !== false;

  if (!includeFiles) {
    const blob = await buildZip(snapshot);
    return { status: "ready", blob, filename: `campus-notes-export-${todayIso()}.zip`, missingFiles: [] };
  }

  const missingFiles = [];
  const availableFiles = [];
  for (const meta of snapshot.materialMeta) {
    const file = await getMaterialFile(meta.id, { preferredStorage: meta.storageBackend });
    if (!file.exists || !file.blob) {
      missingFiles.push(meta);
      continue;
    }
    availableFiles.push({ meta, blob: file.blob });
  }

  if (missingFiles.length > 0 && !allowMissingFiles) {
    return { status: "missing_files", missingFiles, filename: `campus-notes-export-${todayIso()}.zip` };
  }

  const blob = await buildZip(snapshot, availableFiles);
  return { status: "ready", blob, filename: `campus-notes-export-${todayIso()}.zip`, missingFiles };
}

export function downloadExportResult(result) {
  if (result?.blob && result.filename) {
    triggerDownload(result.blob, result.filename);
  }
}
