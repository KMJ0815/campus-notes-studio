import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { deepEqualJson, emptyNoteDraft, isValidDateOnly, normalizeDateOnlyInputValue } from "../../lib/utils";
import { Field, IconButton, Modal, TextArea, TextInput } from "../../components/ui";

export function NoteFormModal({ open, subject, initialValue, onClose, onSave }) {
  const [draft, setDraft] = useState(() => emptyNoteDraft(subject?.id || ""));
  const [initialSnapshot, setInitialSnapshot] = useState(() => emptyNoteDraft(subject?.id || ""));
  const [lectureDateError, setLectureDateError] = useState("");
  const [contentError, setContentError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      const seed = initialValue || emptyNoteDraft(subject?.id || "");
      const nextDraft = {
        ...seed,
        lectureDate: normalizeDateOnlyInputValue(seed.lectureDate),
      };
      setDraft(nextDraft);
      setInitialSnapshot(nextDraft);
      setLectureDateError("");
      setContentError("");
    }
  }, [open, initialValue, subject?.id]);

  const isDirty = !deepEqualJson(draft, initialSnapshot);

  function requestClose() {
    if (saving) return;
    if (isDirty && !window.confirm("未保存の変更があります。破棄しますか？")) return;
    onClose();
  }

  async function handleSave() {
    const lectureDate = normalizeDateOnlyInputValue(draft.lectureDate);
    if (!draft.title.trim() && !draft.bodyText.trim()) {
      setContentError("タイトルか本文のどちらかを入力してください。");
      return;
    }
    if (!isValidDateOnly(lectureDate)) {
      setLectureDateError("講義日は必須です。");
      return;
    }

    setSaving(true);
    try {
      await onSave({ ...draft, lectureDate });
      onClose();
    } catch {
      return;
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={requestClose}
      title={draft?.id ? "ノートを編集" : "ノートを追加"}
      subtitle={subject ? `${subject.name} に紐づくノート` : ""}
    >
      {draft ? (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-[1fr_220px]">
            <Field label="タイトル">
              <TextInput
                value={draft.title}
                onChange={(event) => {
                  const value = event.target.value;
                  setDraft((current) => ({ ...current, title: value }));
                  if (contentError && (value.trim() || draft.bodyText.trim())) setContentError("");
                }}
                placeholder="例: 第3回 講義メモ"
              />
            </Field>
            <Field label="講義日">
              <>
                <TextInput
                  type="date"
                  required
                  value={draft.lectureDate || ""}
                  onChange={(event) => {
                    const value = event.target.value;
                    setDraft((current) => ({ ...current, lectureDate: value }));
                    if (lectureDateError) setLectureDateError("");
                  }}
                  onBlur={(event) => {
                    const value = event.target.value;
                    if (!value || !isValidDateOnly(normalizeDateOnlyInputValue(value))) {
                      setLectureDateError("講義日は必須です。");
                    }
                  }}
                />
                {lectureDateError ? <p className="text-xs text-rose-600">{lectureDateError}</p> : null}
              </>
            </Field>
          </div>
          <Field label="本文">
            <TextArea
              value={draft.bodyText}
              onChange={(event) => {
                const value = event.target.value;
                setDraft((current) => ({ ...current, bodyText: value }));
                if (contentError && (value.trim() || draft.title.trim())) setContentError("");
              }}
              placeholder="授業内容、気づき、課題メモなど"
              className="min-h-[320px]"
            />
            {contentError ? <p className="mt-1 text-xs text-rose-600">{contentError}</p> : null}
          </Field>
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-6">
        <IconButton tone="light" onClick={requestClose}>
          キャンセル
        </IconButton>
        <IconButton icon={CheckCircle2} onClick={handleSave} disabled={saving}>
          保存
        </IconButton>
      </div>
    </Modal>
  );
}
