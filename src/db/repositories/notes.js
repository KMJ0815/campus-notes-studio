import { isValidDateOnly, normalizeDateOnlyInputValue, nowIso, sortByUpdated, uid } from "../../lib/utils";
import { createAppError } from "../../lib/errors";
import { getDb } from "../schema";

export async function loadSubjectNotes(subjectId) {
  const db = await getDb();
  const items = await db.getAllFromIndex("notes", "bySubjectId", subjectId);
  return sortByUpdated(
    items.map((item) => ({
      ...item,
      lectureDate: normalizeDateOnlyInputValue(item.lectureDate),
    })),
  );
}

export async function countNotesBySubject(subjectId) {
  const db = await getDb();
  return db.countFromIndex("notes", "bySubjectId", subjectId);
}

export async function saveNote(noteDraft) {
  const lectureDate = normalizeDateOnlyInputValue(noteDraft.lectureDate);
  if (!isValidDateOnly(lectureDate)) {
    throw createAppError("INVALID_NOTE_DATE", "講義日は必須です。正しい日付を入力してください。");
  }

  const db = await getDb();
  const tx = db.transaction(["notes", "subjects"], "readwrite");
  const existing = noteDraft.id ? await tx.objectStore("notes").get(noteDraft.id) : null;
  if (noteDraft.id && !existing) {
    throw createAppError("STALE_DRAFT", "このノートは既に削除されています。再作成するには新規ノートとして保存してください。");
  }
  if (noteDraft.id && noteDraft.baseUpdatedAt && existing.updatedAt !== noteDraft.baseUpdatedAt) {
    throw createAppError("STALE_UPDATE", "このノートは別の画面で更新されています。開き直してから保存してください。");
  }
  const subject = await tx.objectStore("subjects").get(noteDraft.subjectId);
  if (!subject) {
    throw createAppError("NOT_FOUND", "授業が見つかりませんでした。");
  }
  await tx.objectStore("notes").put({
    id: noteDraft.id || uid(),
    subjectId: noteDraft.subjectId,
    termKey: subject.termKey,
    title: noteDraft.title.trim() || "無題ノート",
    bodyText: noteDraft.bodyText,
    lectureDate,
    createdAt: existing?.createdAt || nowIso(),
    updatedAt: nowIso(),
  });
  await tx.done;
}

export async function loadRecentNotesByTerm(termKey, limit = 6) {
  const db = await getDb();
  const tx = db.transaction("notes");
  const index = tx.store.index("byTermUpdated");
  const range = IDBKeyRange.bound([termKey, ""], [termKey, "\uffff"]);
  const results = [];
  let cursor = await index.openCursor(range, "prev");

  while (cursor && results.length < limit) {
    results.push({
      ...cursor.value,
      lectureDate: normalizeDateOnlyInputValue(cursor.value.lectureDate),
    });
    cursor = await cursor.continue();
  }

  await tx.done;
  return results;
}

export async function deleteNote(noteId) {
  const db = await getDb();
  const existing = await db.get("notes", noteId);
  if (!existing) {
    throw createAppError("STALE_DRAFT", "このノートは既に削除されています。");
  }
  await db.delete("notes", noteId);
}
