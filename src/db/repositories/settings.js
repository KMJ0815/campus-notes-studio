import { SETTINGS_ID, TERM_META_STORE } from "../../lib/constants";
import { createAppError } from "../../lib/errors";
import { isValidStructuredTermKey, nowIso, suggestedTermLabel } from "../../lib/utils";
import { getDb } from "../schema";
import { loadPeriodDefinitions } from "./periods";
import { savePeriodDefinitionsInTransaction } from "./periods";

export async function getSettings() {
  const db = await getDb();
  return db.get("settings", SETTINGS_ID);
}

export async function loadTermEditorState(termKey) {
  const trimmedTermKey = termKey.trim();
  const db = await getDb();
  const [termMeta, periods] = await Promise.all([
    db.get(TERM_META_STORE, trimmedTermKey),
    loadPeriodDefinitions(trimmedTermKey),
  ]);
  return {
    termKey: trimmedTermKey,
    label: termMeta?.label || suggestedTermLabel(trimmedTermKey),
    periods,
    exists: Boolean(termMeta || periods.length > 0),
    isValidStructuredTermKey: isValidStructuredTermKey(trimmedTermKey),
  };
}

export async function saveSettingsBundle({
  draftSettings,
  draftPeriods,
  periodsLoadedForTermKey,
}) {
  const targetTermKey = draftSettings.currentTermKey.trim();
  if (!isValidStructuredTermKey(targetTermKey)) {
    throw createAppError("INVALID_TERM_KEY", "内部学期キーは YYYY-spring または YYYY-fall 形式で入力してください。");
  }
  if (periodsLoadedForTermKey && periodsLoadedForTermKey !== targetTermKey) {
    throw createAppError("SETTINGS_PERIODS_OUT_OF_SYNC", "学期切替の読み込みが完了していません。もう一度設定画面を開いて保存してください。");
  }

  const db = await getDb();
  const tx = db.transaction(["settings", TERM_META_STORE, "period_definitions", "slots", "subjects"], "readwrite");
  const settingsStore = tx.objectStore("settings");
  const termMetaStore = tx.objectStore(TERM_META_STORE);
  const existingSettings = await settingsStore.get(SETTINGS_ID);
  if (draftSettings.baseUpdatedAt && existingSettings?.updatedAt && existingSettings.updatedAt !== draftSettings.baseUpdatedAt) {
    throw createAppError("STALE_UPDATE", "この設定は別の画面で更新されています。開き直してから保存してください。");
  }
  const existingTermMeta = await termMetaStore.get(targetTermKey);
  const nextLabel = draftSettings.termLabel.trim() || suggestedTermLabel(targetTermKey);

  await savePeriodDefinitionsInTransaction(tx, targetTermKey, draftPeriods);
  const termMetaUpdatedAt = nowIso();
  await termMetaStore.put({
    ...(existingTermMeta || {}),
    termKey: targetTermKey,
    label: nextLabel,
    updatedAt: termMetaUpdatedAt,
  });

  const settingsUpdatedAt = nowIso();
  const savedSettings = {
    ...(existingSettings || { id: SETTINGS_ID }),
    id: SETTINGS_ID,
    currentTermKey: targetTermKey,
    termLabel: nextLabel,
    exportIncludeFiles: Boolean(draftSettings.exportIncludeFiles),
    updatedAt: settingsUpdatedAt,
  };
  await settingsStore.put(savedSettings);

  await tx.done;
  return savedSettings;
}
