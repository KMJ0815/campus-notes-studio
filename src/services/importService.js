import JSZip from "jszip";
import { normalizePeriodDrafts, validateAndNormalizePeriodDrafts } from "../db/repositories/periods";
import { getDb } from "../db/schema";
import { ATTENDANCE_STATUS_OPTIONS, DAY_DEFS, TERM_META_STORE, TODO_STATUS_OPTIONS } from "../lib/constants";
import { createAppError } from "../lib/errors";
import {
  activeSlotKeyFor,
  fileExtension,
  isValidDateOnly,
  normalizeDateOnlyInputValue,
  normalizeSubjectColorInput,
  nowIso,
  suggestedTermLabel,
} from "../lib/utils";
import {
  BACKUP_MANIFEST_PATH,
  IMPORT_STORE_NAMES,
  buildMaterialArchivePath,
  normalizeImportedManifest,
} from "./backupManifest";
import { clearMaterialFileStorage } from "./materialFileStore";

const TODO_STATUS_VALUES = new Set(TODO_STATUS_OPTIONS.map((option) => option.value));
const ATTENDANCE_STATUS_VALUES = new Set(ATTENDANCE_STATUS_OPTIONS.map((option) => option.value));
const VALID_WEEKDAY_KEYS = new Set(DAY_DEFS.map((day) => day.key));

function assertStringField(value, label, { allowEmpty = true } = {}) {
  if (typeof value !== "string") {
    throw createAppError("IMPORT_INVALID", `${label} は文字列である必要があります。`);
  }
  if (!allowEmpty && !value.trim()) {
    throw createAppError("IMPORT_INVALID", `${label} が空です。`);
  }
}

function assertOptionalStringField(value, label, options) {
  if (value === undefined || value === null) return;
  assertStringField(value, label, options);
}

function assertBooleanField(value, label) {
  if (typeof value !== "boolean") {
    throw createAppError("IMPORT_INVALID", `${label} は boolean である必要があります。`);
  }
}

function assertArrayField(value, label) {
  if (!Array.isArray(value)) {
    throw createAppError("IMPORT_INVALID", `${label} は配列である必要があります。`);
  }
}

function ensureUniqueIds(items, label) {
  const seen = new Set();
  for (const item of items) {
    if (!item?.id) {
      throw createAppError("IMPORT_INVALID", `${label} に ID が欠けています。`);
    }
    if (seen.has(item.id)) {
      throw createAppError("IMPORT_INVALID", `${label} の ID が重複しています: ${item.id}`);
    }
    seen.add(item.id);
  }
}

function ensureUniqueKey(items, keyName, label) {
  const seen = new Set();
  for (const item of items) {
    const value = item?.[keyName];
    if (!value) {
      throw createAppError("IMPORT_INVALID", `${label} に ${keyName} が欠けています。`);
    }
    if (seen.has(value)) {
      throw createAppError("IMPORT_INVALID", `${label} の ${keyName} が重複しています: ${value}`);
    }
    seen.add(value);
  }
}

function ensureUniqueComposite(items, label, valueForItem, describeValue = (value) => value) {
  const seen = new Set();
  for (const item of items) {
    const value = valueForItem(item);
    if (!value) {
      throw createAppError("IMPORT_INVALID", `${label}の一意キーを計算できません。`);
    }
    if (seen.has(value)) {
      throw createAppError("IMPORT_INVALID", `${label}の組み合わせが重複しています: ${describeValue(value, item)}`);
    }
    seen.add(value);
  }
}

function buildSlotSnapshot(slot, periodsByTerm) {
  if (!slot) return null;
  const periods = periodsByTerm.get(slot.termKey) || [];
  const period = periods.find((item) => item.periodNo === slot.periodNo);
  return {
    weekday: slot.weekday,
    periodNo: slot.periodNo,
    label: period?.label || `${slot.periodNo}限`,
    startTime: period?.startTime || "",
    endTime: period?.endTime || "",
    isHistorical: !slot.activeSlotKey,
  };
}

function normalizeImportDateOnly(value, { allowEmpty = false } = {}) {
  if (value === undefined || value === null || value === "") {
    return allowEmpty ? "" : null;
  }
  return normalizeDateOnlyInputValue(value) || null;
}

function assertDateOnly(value, label, { allowEmpty = false } = {}) {
  if (allowEmpty && value === "") return;
  if (!isValidDateOnly(value || "")) {
    throw createAppError("IMPORT_INVALID", `${label} の日付が不正です。`);
  }
}

function wrapInvalidPeriodError(error, termKey) {
  if (error?.code !== "INVALID_PERIOD") {
    throw error;
  }
  throw createAppError(
    "IMPORT_INVALID",
    `${suggestedTermLabel(termKey)} のコマ定義が不正です。${error.message}`,
    { cause: error },
  );
}

function validateManifestShape(manifest) {
  assertStringField(manifest.settings.currentTermKey, "settings.currentTermKey", { allowEmpty: false });
  assertStringField(manifest.settings.termLabel, "settings.termLabel", { allowEmpty: false });
  assertBooleanField(manifest.settings.exportIncludeFiles, "settings.exportIncludeFiles");

  manifest.termMeta.forEach((item, index) => {
    assertStringField(item.termKey, `termMeta[${index}].termKey`, { allowEmpty: false });
    assertStringField(item.label, `termMeta[${index}].label`);
  });

  manifest.periods.forEach((period, index) => {
    assertStringField(period.termKey, `periods[${index}].termKey`, { allowEmpty: false });
    assertStringField(period.label, `periods[${index}].label`, { allowEmpty: false });
    assertStringField(period.startTime, `periods[${index}].startTime`, { allowEmpty: false });
    assertStringField(period.endTime, `periods[${index}].endTime`, { allowEmpty: false });
    assertBooleanField(period.isEnabled, `periods[${index}].isEnabled`);
  });

  manifest.subjects.forEach((subject, index) => {
    assertStringField(subject.termKey, `subjects[${index}].termKey`, { allowEmpty: false });
    assertStringField(subject.name, `subjects[${index}].name`, { allowEmpty: false });
    assertOptionalStringField(subject.teacherName, `subjects[${index}].teacherName`);
    assertOptionalStringField(subject.room, `subjects[${index}].room`);
    assertOptionalStringField(subject.color, `subjects[${index}].color`);
    assertOptionalStringField(subject.memo, `subjects[${index}].memo`);
    assertBooleanField(subject.isArchived, `subjects[${index}].isArchived`);
    assertArrayField(subject.restoreSlotIds, `subjects[${index}].restoreSlotIds`);
  });

  manifest.slots.forEach((slot, index) => {
    assertStringField(slot.termKey, `slots[${index}].termKey`, { allowEmpty: false });
    assertStringField(slot.subjectId, `slots[${index}].subjectId`, { allowEmpty: false });
    assertStringField(slot.weekday, `slots[${index}].weekday`, { allowEmpty: false });
    assertOptionalStringField(slot.activeSlotKey, `slots[${index}].activeSlotKey`);
    assertBooleanField(slot.isArchived, `slots[${index}].isArchived`);
  });

  manifest.notes.forEach((note, index) => {
    assertStringField(note.subjectId, `notes[${index}].subjectId`, { allowEmpty: false });
    assertOptionalStringField(note.title, `notes[${index}].title`);
    assertOptionalStringField(note.bodyText, `notes[${index}].bodyText`);
    assertStringField(note.lectureDate, `notes[${index}].lectureDate`, { allowEmpty: false });
  });

  manifest.attendance.forEach((record, index) => {
    assertStringField(record.subjectId, `attendance[${index}].subjectId`, { allowEmpty: false });
    assertStringField(record.lectureDate, `attendance[${index}].lectureDate`, { allowEmpty: false });
    assertOptionalStringField(record.timetableSlotId, `attendance[${index}].timetableSlotId`);
    assertStringField(record.status, `attendance[${index}].status`, { allowEmpty: false });
    assertOptionalStringField(record.memo, `attendance[${index}].memo`);
  });

  manifest.todos.forEach((todo, index) => {
    assertStringField(todo.subjectId, `todos[${index}].subjectId`, { allowEmpty: false });
    assertStringField(todo.title, `todos[${index}].title`);
    assertOptionalStringField(todo.memo, `todos[${index}].memo`);
    assertOptionalStringField(todo.dueDate, `todos[${index}].dueDate`);
    assertStringField(todo.status, `todos[${index}].status`, { allowEmpty: false });
    assertOptionalStringField(todo.completedAt, `todos[${index}].completedAt`);
  });

  manifest.materials.forEach((material, index) => {
    assertStringField(material.subjectId, `materials[${index}].subjectId`, { allowEmpty: false });
    assertStringField(material.displayName, `materials[${index}].displayName`, { allowEmpty: false });
    assertOptionalStringField(material.mimeType, `materials[${index}].mimeType`);
    assertOptionalStringField(material.fileExt, `materials[${index}].fileExt`);
    assertOptionalStringField(material.note, `materials[${index}].note`);
    assertOptionalStringField(material.storageBackend, `materials[${index}].storageBackend`);
  });

  manifest.materialFiles.forEach((fileEntry, index) => {
    assertStringField(fileEntry.id, `materialFiles[${index}].id`, { allowEmpty: false });
    assertStringField(fileEntry.path, `materialFiles[${index}].path`, { allowEmpty: false });
    assertOptionalStringField(fileEntry.displayName, `materialFiles[${index}].displayName`);
    assertOptionalStringField(fileEntry.mimeType, `materialFiles[${index}].mimeType`);
  });
}

function validateManifest(data, zip) {
  const warnings = [];
  const currentTermKey = data.settings.currentTermKey;

  ensureUniqueKey(data.termMeta, "termKey", "学期ラベル");
  ensureUniqueIds(data.periods, "コマ定義");
  ensureUniqueIds(data.subjects, "授業");
  ensureUniqueIds(data.slots, "時間割コマ");
  ensureUniqueIds(data.notes, "ノート");
  ensureUniqueIds(data.attendance, "出席記録");
  ensureUniqueIds(data.todos, "ToDo");
  ensureUniqueIds(data.materialMeta, "資料");
  ensureUniqueIds(data.materialFiles, "資料ファイル");
  ensureUniqueKey(data.materialFiles, "path", "資料ファイル");

  const termMetaKeys = new Set(data.termMeta.map((item) => item?.termKey).filter(Boolean));
  if (!termMetaKeys.has(currentTermKey)) {
    throw createAppError("IMPORT_INVALID", "現在学期の term meta が見つかりません。");
  }

  ensureUniqueComposite(
    data.periods,
    "コマ定義",
    (period) => `${period?.termKey || ""}:${period?.periodNo || ""}`,
  );

  const currentPeriods = data.periods.filter((period) => period?.termKey === currentTermKey);
  if (currentPeriods.length === 0) {
    throw createAppError("IMPORT_INVALID", "現在学期のコマ定義が見つかりません。");
  }

  const periodKeys = new Set();
  const enabledPeriodKeys = new Set();
  const periodsByTerm = new Map();
  for (const period of data.periods) {
    if (!period.termKey || !termMetaKeys.has(period.termKey)) {
      throw createAppError("IMPORT_INVALID", `コマ定義 ${period.id} の termKey が不正です。`);
    }
    if (!Number.isInteger(period.periodNo) || period.periodNo < 1) {
      throw createAppError("IMPORT_INVALID", `コマ定義 ${period.id} の periodNo が不正です。`);
    }
    if (!periodsByTerm.has(period.termKey)) {
      periodsByTerm.set(period.termKey, []);
    }
    periodsByTerm.get(period.termKey).push(period);
  }

  for (const [termKey, periods] of periodsByTerm.entries()) {
    let sanitized;
    try {
      sanitized = validateAndNormalizePeriodDrafts(termKey, periods, { preserveExistingId: true });
    } catch (error) {
      wrapInvalidPeriodError(error, termKey);
    }

    for (const period of sanitized) {
      const periodKey = `${period.termKey}:${period.periodNo}`;
      periodKeys.add(periodKey);
      if (period.isEnabled) {
        enabledPeriodKeys.add(periodKey);
      }
    }
  }

  const subjectMap = new Map(data.subjects.map((subject) => [subject.id, subject]));
  for (const subject of data.subjects) {
    if (!subject.termKey || !termMetaKeys.has(subject.termKey)) {
      throw createAppError("IMPORT_INVALID", `授業 ${subject.id} の termKey が不正です。`);
    }
  }

  const slotMap = new Map(data.slots.map((slot) => [slot.id, slot]));
  const activeSlotKeys = new Set();

  for (const slot of data.slots) {
    const subject = subjectMap.get(slot.subjectId);
    if (!subject) {
      throw createAppError("IMPORT_INVALID", `存在しない授業を参照する時間割コマがあります: ${slot.id}`);
    }
    if (slot.termKey !== subject.termKey) {
      throw createAppError("IMPORT_INVALID", `時間割コマ ${slot.id} の termKey が授業と一致しません。`);
    }
    if (!VALID_WEEKDAY_KEYS.has(slot.weekday)) {
      throw createAppError("IMPORT_INVALID", `時間割コマ ${slot.id} の曜日が不正です。`);
    }
    const periodKey = `${slot.termKey}:${slot.periodNo}`;
    if (!periodKeys.has(periodKey)) {
      throw createAppError("IMPORT_INVALID", `時間割コマ ${slot.id} に対応するコマ定義がありません。`);
    }

    if (slot.isArchived) {
      if (slot.activeSlotKey) {
        throw createAppError("IMPORT_INVALID", `アーカイブ済み時間割コマ ${slot.id} に activeSlotKey が残っています。`);
      }
      continue;
    }

    const activeKey = activeSlotKeyFor(slot.termKey, slot.weekday, slot.periodNo);
    if (slot.activeSlotKey !== activeKey) {
      throw createAppError("IMPORT_INVALID", `時間割コマ ${slot.id} の activeSlotKey が不正です。`);
    }
    if (!enabledPeriodKeys.has(periodKey)) {
      throw createAppError("IMPORT_INVALID", `時間割コマ ${slot.id} が無効なコマ定義を参照しています。`);
    }
    if (subject.isArchived) {
      throw createAppError("IMPORT_INVALID", `アーカイブ済み授業 ${subject.id} に有効な時間割コマが残っています。`);
    }
    if (activeSlotKeys.has(activeKey)) {
      throw createAppError("IMPORT_INVALID", `同じコマに複数の授業が割り当てられています: ${activeKey}`);
    }
    activeSlotKeys.add(activeKey);
  }

  for (const subject of data.subjects) {
    if (!subject.isArchived && subject.restoreSlotIds.length > 0) {
      throw createAppError("IMPORT_INVALID", `未アーカイブ授業 ${subject.id} に restoreSlotIds が残っています。`);
    }

    const seenRestoreSlotIds = new Set();
    for (const slotId of subject.restoreSlotIds) {
      if (!slotId) {
        throw createAppError("IMPORT_INVALID", `授業 ${subject.id} の restoreSlotIds に空要素があります。`);
      }
      if (seenRestoreSlotIds.has(slotId)) {
        throw createAppError("IMPORT_INVALID", `授業 ${subject.id} の restoreSlotIds が重複しています: ${slotId}`);
      }
      seenRestoreSlotIds.add(slotId);
      const slot = slotMap.get(slotId);
      if (!slot) {
        throw createAppError("IMPORT_INVALID", `授業 ${subject.id} の restoreSlotIds が存在しない時間割コマを参照しています: ${slotId}`);
      }
      if (slot.subjectId !== subject.id) {
        throw createAppError("IMPORT_INVALID", `授業 ${subject.id} の restoreSlotIds が別授業の時間割コマを参照しています: ${slotId}`);
      }
      if (!slot.isArchived || slot.activeSlotKey) {
        throw createAppError("IMPORT_INVALID", `授業 ${subject.id} の restoreSlotIds に復元用ではない時間割コマが含まれています: ${slotId}`);
      }
    }
  }

  const validateSubjectRecord = (item, label) => {
    if (!subjectMap.has(item.subjectId)) {
      throw createAppError("IMPORT_INVALID", `${label} が存在しない授業を参照しています: ${item.id}`);
    }
  };

  data.notes.forEach((note) => {
    validateSubjectRecord(note, "ノート");
    assertDateOnly(note.lectureDate, `ノート ${note.id}`);
  });
  data.materialMeta.forEach((material) => validateSubjectRecord(material, "資料"));
  data.todos.forEach((todo) => {
    validateSubjectRecord(todo, "ToDo");
    assertDateOnly(todo.dueDate, `ToDo ${todo.id}`, { allowEmpty: true });
    if (!TODO_STATUS_VALUES.has(todo.status)) {
      throw createAppError("IMPORT_INVALID", `ToDo ${todo.id} の状態が不正です。`);
    }
  });

  ensureUniqueComposite(
    data.attendance,
    "出席記録",
    (record) => `${record?.subjectId || ""}:${record?.lectureDate || ""}:${record?.timetableSlotId || ""}`,
  );

  for (const record of data.attendance) {
    validateSubjectRecord(record, "出席記録");
    assertDateOnly(record.lectureDate, `出席記録 ${record.id}`);
    if (!ATTENDANCE_STATUS_VALUES.has(record.status)) {
      throw createAppError("IMPORT_INVALID", `出席記録 ${record.id} の状態が不正です。`);
    }
    if (record.timetableSlotId) {
      const slot = slotMap.get(record.timetableSlotId);
      if (!slot || slot.subjectId !== record.subjectId) {
        throw createAppError("IMPORT_INVALID", `出席記録 ${record.id} のコマ参照が不正です。`);
      }
    }
  }

  const materialFileMap = new Map();
  for (const fileEntry of data.materialFiles) {
    if (!fileEntry?.path) {
      throw createAppError("IMPORT_INVALID", `資料ファイル ${fileEntry?.id || "unknown"} の path が欠けています。`);
    }
    materialFileMap.set(fileEntry.id, fileEntry);
  }

  for (const material of data.materialMeta) {
    const expectedPath = materialFileMap.get(material.id)?.path || buildMaterialArchivePath(material);
    if (!zip.file(expectedPath)) {
      warnings.push({
        code: "MISSING_MATERIAL_FILE",
        materialId: material.id,
        displayName: material.displayName || material.id,
      });
    }
  }

  return { warnings, materialFileMap };
}

function buildPreview(data, validation) {
  return {
    version: data.version,
    exportedAt: data.exportedAt,
    currentTermKey: data.settings.currentTermKey,
    currentTermLabel: data.settings.termLabel,
    counts: {
      termMeta: data.termMeta.length,
      periods: data.periods.length,
      subjects: data.subjects.length,
      slots: data.slots.length,
      notes: data.notes.length,
      attendance: data.attendance.length,
      todos: data.todos.length,
      materials: data.materialMeta.length,
      materialFiles: data.materialFiles.length,
    },
    warnings: validation.warnings,
  };
}

function normalizeImportData(manifest) {
  validateManifestShape(manifest);
  const timestamp = nowIso();
  const subjectMap = new Map(manifest.subjects.map((subject) => [subject.id, subject]));
  const periodsByTerm = new Map();
  for (const period of manifest.periods) {
    if (!periodsByTerm.has(period.termKey)) {
      periodsByTerm.set(period.termKey, []);
    }
    periodsByTerm.get(period.termKey).push(period);
  }

  const subjects = manifest.subjects.map((subject) => ({
    ...subject,
    color: normalizeSubjectColorInput(subject.color),
    restoreSlotIds: subject.restoreSlotIds,
    updatedAt: subject.updatedAt || subject.createdAt || timestamp,
  }));

  const slots = manifest.slots.map((slot) => ({
    ...slot,
    activeSlotKey: slot.isArchived ? undefined : activeSlotKeyFor(slot.termKey, slot.weekday, slot.periodNo),
    isArchived: Boolean(slot.isArchived),
    updatedAt: slot.updatedAt || slot.createdAt || timestamp,
  }));
  const slotMap = new Map(slots.map((slot) => [slot.id, slot]));

  const notes = manifest.notes.map((note) => ({
    ...note,
    termKey: subjectMap.get(note.subjectId)?.termKey || note.termKey || "",
    lectureDate: normalizeImportDateOnly(note.lectureDate),
    updatedAt: note.updatedAt || note.createdAt || timestamp,
  }));

  const attendance = manifest.attendance.map((record) => {
    const linkedSlot = record.timetableSlotId ? slotMap.get(record.timetableSlotId) : null;
    const subject = subjectMap.get(record.subjectId);
    const slotSnapshot = record.slotSnapshot === undefined
      ? buildSlotSnapshot(linkedSlot, periodsByTerm)
      : record.slotSnapshot;
    return {
      ...record,
      termKey: subject?.termKey || record.termKey || "",
      lectureDate: normalizeImportDateOnly(record.lectureDate),
      timetableSlotId: record.timetableSlotId ?? "",
      slotSnapshot,
      updatedAt: record.updatedAt || record.createdAt || timestamp,
    };
  });

  const todos = manifest.todos.map((todo) => ({
    ...todo,
    termKey: subjectMap.get(todo.subjectId)?.termKey || todo.termKey || "",
    dueDate: normalizeImportDateOnly(todo.dueDate, { allowEmpty: true }),
    updatedAt: todo.updatedAt || todo.createdAt || timestamp,
  }));

  const materialMeta = manifest.materials.map((material) => ({
    ...material,
    termKey: subjectMap.get(material.subjectId)?.termKey || material.termKey || "",
    note: material.note || "",
    fileExt: material.fileExt || fileExtension(material.displayName),
    storageBackend: "indexeddb",
    updatedAt: material.updatedAt || material.createdAt || timestamp,
  }));

  const termMeta = manifest.termMeta.map((item) => ({
    termKey: item.termKey,
    label: item.label || suggestedTermLabel(item.termKey),
    updatedAt: item.updatedAt || timestamp,
  }));

  const settings = {
    ...manifest.settings,
    termLabel: manifest.settings.termLabel || suggestedTermLabel(manifest.settings.currentTermKey),
    updatedAt: manifest.settings.updatedAt || timestamp,
  };

  const periods = [...periodsByTerm.entries()].flatMap(([termKey, periodsDraft]) =>
    normalizePeriodDrafts(termKey, periodsDraft, { preserveExistingId: true }).map((period) => ({
      ...period,
      updatedAt: period.updatedAt || period.createdAt || timestamp,
    })),
  );

  return {
    version: manifest.version,
    exportedAt: manifest.exportedAt,
    settings,
    termMeta,
    periods,
    subjects,
    slots,
    notes,
    attendance,
    todos,
    materialMeta,
    materialFiles: manifest.materialFiles.map((fileEntry) => ({
      ...fileEntry,
      sizeBytes: Number(fileEntry?.sizeBytes || 0),
    })),
  };
}

export async function readImportArchive(file) {
  let zip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    throw createAppError("IMPORT_INVALID", "ZIP ファイルを読み込めませんでした。");
  }

  const manifestFile = zip.file(BACKUP_MANIFEST_PATH);
  if (!manifestFile) {
    throw createAppError("IMPORT_INVALID", "バックアップ manifest が見つかりません。");
  }

  let rawManifest;
  try {
    rawManifest = JSON.parse(await manifestFile.async("string"));
  } catch {
    throw createAppError("IMPORT_INVALID", "manifest.json を解析できませんでした。");
  }

  const manifest = normalizeImportedManifest(rawManifest);
  const normalized = normalizeImportData(manifest);
  const validation = validateManifest(normalized, zip);

  return {
    preview: buildPreview(normalized, validation),
    archive: {
      zip,
      manifest,
      normalized,
      validation,
    },
  };
}

function wrapImportTransactionError(error) {
  if (error?.code) return error;

  const message = String(error?.message || "");
  if (error?.name === "ConstraintError" || /constraint|unique/i.test(message)) {
    return createAppError(
      "IMPORT_CONFLICT",
      "バックアップ内に重複データがあり、復元できませんでした。別のバックアップを選ぶか ZIP の内容を確認してください。",
      { cause: error },
    );
  }
  if (error?.name === "AbortError") {
    return createAppError(
      "IMPORT_INVALID",
      "バックアップ内の整合性が崩れているため、復元を完了できませんでした。ZIP の内容を確認してください。",
      { cause: error },
    );
  }
  return error;
}

export async function applyImportArchive(archive) {
  if (!archive?.zip || (!archive?.manifest && !archive?.normalized)) {
    throw createAppError("IMPORT_INVALID", "インポート対象が読み込まれていません。");
  }

  const normalized = archive.normalized || normalizeImportData(archive.manifest);
  const validation = archive.validation || validateManifest(normalized, archive.zip);
  const materialFiles = [];

  for (const material of normalized.materialMeta) {
    const path = validation.materialFileMap.get(material.id)?.path || buildMaterialArchivePath(material);
    const file = archive.zip.file(path);
    if (!file) continue;
    materialFiles.push({
      id: material.id,
      blob: await file.async("blob"),
    });
  }

  try {
    const db = await getDb();
    const tx = db.transaction(IMPORT_STORE_NAMES, "readwrite");
    for (const storeName of IMPORT_STORE_NAMES) {
      await tx.objectStore(storeName).clear();
    }

    await tx.objectStore("settings").put(normalized.settings);
    for (const item of normalized.termMeta) await tx.objectStore(TERM_META_STORE).put(item);
    for (const item of normalized.periods) await tx.objectStore("period_definitions").put(item);
    for (const item of normalized.subjects) await tx.objectStore("subjects").put(item);
    for (const item of normalized.slots) await tx.objectStore("slots").put(item);
    for (const item of normalized.notes) await tx.objectStore("notes").put(item);
    for (const item of normalized.attendance) await tx.objectStore("attendance").put(item);
    for (const item of normalized.todos) await tx.objectStore("todo_items").put(item);
    for (const item of normalized.materialMeta) await tx.objectStore("material_meta").put(item);
    for (const item of materialFiles) {
      await tx.objectStore("material_files").put(item);
    }
    await tx.done;
  } catch (error) {
    throw wrapImportTransactionError(error);
  }

  await clearMaterialFileStorage().catch(() => {});

  return {
    warnings: validation.warnings,
    importedCounts: {
      ...buildPreview(normalized, validation).counts,
      materialFilesRestored: materialFiles.length,
    },
  };
}
