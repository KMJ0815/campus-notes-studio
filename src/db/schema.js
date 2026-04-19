import { deleteDB, openDB } from "idb";
import {
  DB_NAME,
  DB_VERSION,
  DEFAULT_TERM_KEY,
  DEFAULT_TERM_LABEL,
  SETTINGS_ID,
  TERM_META_STORE,
} from "../lib/constants";
import {
  activeSlotKeyFor,
  buildPeriodId,
  defaultPeriodsForTerm,
  normalizeDateOnlyInputValue,
  normalizeTimeInputValue,
  nowIso,
  suggestedTermLabel,
} from "../lib/utils";

let dbPromise = null;

function ensureStore(db, transaction, name, options) {
  if (!db.objectStoreNames.contains(name)) {
    return db.createObjectStore(name, options);
  }
  return transaction.objectStore(name);
}

function ensureIndex(store, name, keyPath, options) {
  if (!store.indexNames.contains(name)) {
    store.createIndex(name, keyPath, options);
  }
}

async function migrateSettingsAndPeriods(transaction) {
  const settingsStore = transaction.objectStore("settings");
  const periodStore = transaction.objectStore("period_definitions");
  const settings = await settingsStore.get(SETTINGS_ID);
  if (!settings) return;

  const termKey = settings.currentTermKey || DEFAULT_TERM_KEY;
  const timestamp = settings.updatedAt || nowIso();
  const existingPeriods = (await periodStore.getAll()).filter((period) => period.termKey === termKey);

  if (existingPeriods.length === 0) {
    const periodsSource = Array.isArray(settings.periods) && settings.periods.length > 0 ? settings.periods : defaultPeriodsForTerm(termKey, timestamp);
    for (const period of periodsSource) {
      await periodStore.put({
        id: buildPeriodId(termKey, Number(period.periodNo)),
        termKey,
        periodNo: Number(period.periodNo),
        label: period.label,
        startTime: period.startTime,
        endTime: period.endTime,
        isEnabled: period.isEnabled !== false,
        createdAt: period.createdAt || timestamp,
        updatedAt: period.updatedAt || timestamp,
      });
    }
  }

  if ("periods" in settings) {
    const nextSettings = { ...settings };
    delete nextSettings.periods;
    await settingsStore.put(nextSettings);
  }
}

async function migrateSlots(transaction) {
  const slotStore = transaction.objectStore("slots");
  const slots = await slotStore.getAll();
  const seenActiveKeys = new Set();

  for (const slot of slots) {
    const next = { ...slot };
    next.isArchived = Boolean(slot.isArchived);
    next.updatedAt = slot.updatedAt || nowIso();
    if (!next.isArchived) {
      const activeKey = activeSlotKeyFor(slot.termKey, slot.weekday, slot.periodNo);
      if (seenActiveKeys.has(activeKey)) {
        next.isArchived = true;
        next.activeSlotKey = undefined;
      } else {
        seenActiveKeys.add(activeKey);
        next.activeSlotKey = activeKey;
      }
    } else {
      next.activeSlotKey = undefined;
    }
    await slotStore.put(next);
  }
}

async function migrateSubjects(transaction) {
  const subjectStore = transaction.objectStore("subjects");
  const slotStore = transaction.objectStore("slots");
  const [subjects, slots] = await Promise.all([subjectStore.getAll(), slotStore.getAll()]);

  for (const subject of subjects) {
    if (Array.isArray(subject.restoreSlotIds)) continue;

    const subjectSlots = slots.filter((slot) => slot.subjectId === subject.id);
    let restoreSlotIds = [];

    if (subject.isArchived && subjectSlots.length > 0) {
      const activeSlots = subjectSlots.filter((slot) => slot.activeSlotKey);
      if (activeSlots.length > 0) {
        restoreSlotIds = activeSlots.map((slot) => slot.id);
      } else {
        const latestUpdatedAt = [...subjectSlots]
          .map((slot) => slot.updatedAt || slot.createdAt || "")
          .sort()
          .at(-1);
        restoreSlotIds = subjectSlots
          .filter((slot) => (slot.updatedAt || slot.createdAt || "") === latestUpdatedAt)
          .map((slot) => slot.id);
      }
    }

    await subjectStore.put({
      ...subject,
      restoreSlotIds,
    });
  }
}

async function migrateAttendance(transaction) {
  const attendanceStore = transaction.objectStore("attendance");
  const records = await attendanceStore.getAll();
  for (const record of records) {
    await attendanceStore.put({
      ...record,
      timetableSlotId: record.timetableSlotId ?? "",
      updatedAt: record.updatedAt || nowIso(),
    });
  }
}

async function migrateTermScopedRecords(transaction) {
  const [subjectStore, notesStore, attendanceStore, materialMetaStore] = [
    transaction.objectStore("subjects"),
    transaction.objectStore("notes"),
    transaction.objectStore("attendance"),
    transaction.objectStore("material_meta"),
  ];
  const subjects = await subjectStore.getAll();
  const subjectTermMap = new Map(subjects.map((subject) => [subject.id, subject.termKey || ""]));

  for (const note of await notesStore.getAll()) {
    await notesStore.put({
      ...note,
      termKey: subjectTermMap.get(note.subjectId) || note.termKey || "",
      updatedAt: note.updatedAt || nowIso(),
    });
  }

  for (const record of await attendanceStore.getAll()) {
    await attendanceStore.put({
      ...record,
      termKey: subjectTermMap.get(record.subjectId) || record.termKey || "",
      timetableSlotId: record.timetableSlotId ?? "",
      updatedAt: record.updatedAt || nowIso(),
    });
  }

  for (const item of await materialMetaStore.getAll()) {
    await materialMetaStore.put({
      ...item,
      termKey: subjectTermMap.get(item.subjectId) || item.termKey || "",
      note: item.note || "",
      updatedAt: item.updatedAt || nowIso(),
    });
  }
}

async function migrateNotes(transaction) {
  const notesStore = transaction.objectStore("notes");
  const items = await notesStore.getAll();
  for (const item of items) {
    await notesStore.put({
      ...item,
      lectureDate: normalizeDateOnlyInputValue(item.lectureDate),
      updatedAt: item.updatedAt || nowIso(),
    });
  }
}

async function migrateMaterialMeta(transaction) {
  const metaStore = transaction.objectStore("material_meta");
  const items = await metaStore.getAll();
  for (const item of items) {
    await metaStore.put({
      ...item,
      note: item.note || "",
      updatedAt: item.updatedAt || nowIso(),
    });
  }
}

async function migrateTermMeta(transaction) {
  const [settingsStore, subjectStore, periodStore, termMetaStore] = [
    transaction.objectStore("settings"),
    transaction.objectStore("subjects"),
    transaction.objectStore("period_definitions"),
    transaction.objectStore(TERM_META_STORE),
  ];
  const [settings, subjects, periods, existingTermMeta] = await Promise.all([
    settingsStore.get(SETTINGS_ID),
    subjectStore.getAll(),
    periodStore.getAll(),
    termMetaStore.getAll(),
  ]);

  const timestamp = nowIso();
  const existingByTerm = new Map(existingTermMeta.map((item) => [item.termKey, item]));
  const termKeys = new Set([
    settings?.currentTermKey || DEFAULT_TERM_KEY,
    ...subjects.map((subject) => subject.termKey).filter(Boolean),
    ...periods.map((period) => period.termKey).filter(Boolean),
  ]);

  for (const termKey of termKeys) {
    const existing = existingByTerm.get(termKey);
    const label = termKey === settings?.currentTermKey
      ? settings?.termLabel || existing?.label || suggestedTermLabel(termKey)
      : existing?.label || suggestedTermLabel(termKey);
    await termMetaStore.put({
      termKey,
      label,
      updatedAt: existing?.updatedAt || settings?.updatedAt || timestamp,
    });
  }
}

async function migratePeriodDefinitions(transaction) {
  const periodStore = transaction.objectStore("period_definitions");
  const periods = await periodStore.getAll();
  for (const period of periods) {
    await periodStore.put({
      ...period,
      startTime: normalizeTimeInputValue(period.startTime),
      endTime: normalizeTimeInputValue(period.endTime),
      updatedAt: period.updatedAt || nowIso(),
    });
  }
}

async function migrateAttendanceSnapshots(transaction) {
  const [attendanceStore, slotStore, subjectStore, periodStore] = [
    transaction.objectStore("attendance"),
    transaction.objectStore("slots"),
    transaction.objectStore("subjects"),
    transaction.objectStore("period_definitions"),
  ];
  const [records, slots, subjects, periods] = await Promise.all([
    attendanceStore.getAll(),
    slotStore.getAll(),
    subjectStore.getAll(),
    periodStore.getAll(),
  ]);
  const slotMap = new Map(slots.map((slot) => [slot.id, slot]));
  const subjectMap = new Map(subjects.map((subject) => [subject.id, subject]));
  const periodsByTerm = new Map();

  for (const period of periods) {
    if (!periodsByTerm.has(period.termKey)) {
      periodsByTerm.set(period.termKey, []);
    }
    periodsByTerm.get(period.termKey).push(period);
  }

  for (const record of records) {
    if (record.slotSnapshot !== undefined) continue;
    const slot = record.timetableSlotId ? slotMap.get(record.timetableSlotId) : null;
    const subject = subjectMap.get(record.subjectId);
    const termPeriods = periodsByTerm.get(subject?.termKey || record.termKey || "") || [];
    await attendanceStore.put({
      ...record,
      slotSnapshot: slot
        ? {
            weekday: slot.weekday,
            periodNo: slot.periodNo,
            label: termPeriods.find((period) => period.periodNo === slot.periodNo)?.label || `${slot.periodNo}限`,
            startTime: termPeriods.find((period) => period.periodNo === slot.periodNo)?.startTime || "",
            endTime: termPeriods.find((period) => period.periodNo === slot.periodNo)?.endTime || "",
            isHistorical: !slot.activeSlotKey,
          }
        : null,
      updatedAt: record.updatedAt || nowIso(),
    });
  }
}

async function runMigration(transaction) {
  await migrateSettingsAndPeriods(transaction);
  await migrateSlots(transaction);
  await migrateSubjects(transaction);
  await migrateAttendance(transaction);
  await migrateNotes(transaction);
  await migrateMaterialMeta(transaction);
  await migratePeriodDefinitions(transaction);
  await migrateTermMeta(transaction);
  await migrateAttendanceSnapshots(transaction);
}

function ensureIndexes(db, transaction) {
  ensureIndex(transaction.objectStore("subjects"), "byTermKey", "termKey");
  ensureIndex(transaction.objectStore("slots"), "bySubjectId", "subjectId");
  ensureIndex(transaction.objectStore("slots"), "byTermKey", "termKey");
  ensureIndex(transaction.objectStore("slots"), "byTermWeekdayPeriod", ["termKey", "weekday", "periodNo"]);
  ensureIndex(transaction.objectStore("slots"), "byActiveSlotKey", "activeSlotKey", { unique: true });
  ensureIndex(transaction.objectStore("notes"), "bySubjectId", "subjectId");
  ensureIndex(transaction.objectStore("notes"), "bySubjectUpdated", ["subjectId", "updatedAt"]);
  ensureIndex(transaction.objectStore("notes"), "byTermKey", "termKey");
  ensureIndex(transaction.objectStore("notes"), "byTermUpdated", ["termKey", "updatedAt"]);
  ensureIndex(transaction.objectStore("attendance"), "bySubjectId", "subjectId");
  ensureIndex(transaction.objectStore("attendance"), "bySubjectDate", ["subjectId", "lectureDate"]);
  ensureIndex(transaction.objectStore("attendance"), "bySubjectLectureSlot", ["subjectId", "lectureDate", "timetableSlotId"], {
    unique: true,
  });
  ensureIndex(transaction.objectStore("attendance"), "byTermKey", "termKey");
  ensureIndex(transaction.objectStore("material_meta"), "bySubjectId", "subjectId");
  ensureIndex(transaction.objectStore("material_meta"), "bySubjectCreated", ["subjectId", "createdAt"]);
  ensureIndex(transaction.objectStore("material_meta"), "byTermKey", "termKey");
  ensureIndex(transaction.objectStore("period_definitions"), "byTermKey", "termKey");
  ensureIndex(transaction.objectStore("period_definitions"), "byTermPeriod", ["termKey", "periodNo"], { unique: true });
}

export async function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      async upgrade(db, oldVersion, _newVersion, transaction) {
        ensureStore(db, transaction, "settings", { keyPath: "id" });
        ensureStore(db, transaction, TERM_META_STORE, { keyPath: "termKey" });
        ensureStore(db, transaction, "subjects", { keyPath: "id" });
        ensureStore(db, transaction, "slots", { keyPath: "id" });
        ensureStore(db, transaction, "notes", { keyPath: "id" });
        ensureStore(db, transaction, "attendance", { keyPath: "id" });
        ensureStore(db, transaction, "material_meta", { keyPath: "id" });
        ensureStore(db, transaction, "material_files", { keyPath: "id" });
        ensureStore(db, transaction, "period_definitions", { keyPath: "id" });

        if (oldVersion < 2) await runMigration(transaction);
        if (oldVersion < 3) await migrateSubjects(transaction);
        if (oldVersion < 4) await migrateAttendance(transaction);
        if (oldVersion < 5) {
          await migrateNotes(transaction);
          await migratePeriodDefinitions(transaction);
        }
        if (oldVersion < 6) {
          await migrateAttendance(transaction);
          await migrateNotes(transaction);
          await migratePeriodDefinitions(transaction);
          await migrateTermScopedRecords(transaction);
        }
        if (oldVersion < 7) {
          await migrateAttendance(transaction);
          await migrateNotes(transaction);
          await migratePeriodDefinitions(transaction);
        }
        if (oldVersion < 8) {
          await migrateTermMeta(transaction);
          await migrateAttendanceSnapshots(transaction);
        }

        ensureIndexes(db, transaction);
      },
    });
  }
  return dbPromise;
}

export async function ensureSeedData() {
  const db = await getDb();
  const settings = await db.get("settings", SETTINGS_ID);
  if (!settings) {
    const timestamp = nowIso();
    await db.put("settings", {
      id: SETTINGS_ID,
      currentTermKey: DEFAULT_TERM_KEY,
      termLabel: DEFAULT_TERM_LABEL,
      exportIncludeFiles: true,
      updatedAt: timestamp,
    });
    for (const period of defaultPeriodsForTerm(DEFAULT_TERM_KEY, timestamp)) {
      await db.put("period_definitions", period);
    }
    await db.put(TERM_META_STORE, {
      termKey: DEFAULT_TERM_KEY,
      label: DEFAULT_TERM_LABEL,
      updatedAt: timestamp,
    });
    return;
  }

  const currentTermMeta = await db.get(TERM_META_STORE, settings.currentTermKey);
  if (!currentTermMeta) {
    await db.put(TERM_META_STORE, {
      termKey: settings.currentTermKey,
      label: settings.termLabel || suggestedTermLabel(settings.currentTermKey),
      updatedAt: settings.updatedAt || nowIso(),
    });
  }

  const currentPeriods = await db.getAllFromIndex("period_definitions", "byTermKey", settings.currentTermKey);
  if (currentPeriods.length === 0) {
    const timestamp = settings.updatedAt || nowIso();
    for (const period of defaultPeriodsForTerm(settings.currentTermKey, timestamp)) {
      await db.put("period_definitions", period);
    }
  }
}

export async function deleteAppDb() {
  if (dbPromise) {
    const db = await dbPromise;
    db.close();
    dbPromise = null;
  }
  await deleteDB(DB_NAME);
}

export function resetDbConnection() {
  if (dbPromise) {
    dbPromise.then((db) => db.close()).catch(() => {});
  }
  dbPromise = null;
}
