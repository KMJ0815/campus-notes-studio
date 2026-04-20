import { useEffect, useMemo, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { deepEqualJson, emptyTodoDraft, isValidDateOnly, normalizeDateOnlyInputValue } from "../../lib/utils";
import { Field, IconButton, Modal, SelectInput, TextArea, TextInput } from "../../components/ui";
import { TODO_STATUS_OPTIONS } from "../../lib/constants";

export function TodoFormModal({ open, subject, initialValue, onClose, onSave }) {
  const emptyDraft = useMemo(() => emptyTodoDraft(subject?.id || ""), [subject?.id]);
  const [draft, setDraft] = useState(emptyDraft);
  const [initialSnapshot, setInitialSnapshot] = useState(emptyDraft);
  const [titleError, setTitleError] = useState("");
  const [dueDateError, setDueDateError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const seed = initialValue || emptyTodoDraft(subject?.id || "");
    const nextDraft = {
      ...seed,
      dueDate: normalizeDateOnlyInputValue(seed.dueDate),
    };
    setDraft(nextDraft);
    setInitialSnapshot(nextDraft);
    setTitleError("");
    setDueDateError("");
  }, [emptyDraft, initialValue, open, subject?.id]);

  const isDirty = !deepEqualJson(draft, initialSnapshot);

  function requestClose() {
    if (saving) return;
    if (isDirty && !window.confirm("未保存の変更があります。破棄しますか？")) return;
    onClose();
  }

  async function handleSave() {
    const dueDate = normalizeDateOnlyInputValue(draft.dueDate);
    if (!draft.title.trim()) {
      setTitleError("ToDo のタイトルは必須です。");
      return;
    }
    if (draft.dueDate && !isValidDateOnly(dueDate)) {
      setDueDateError("期限日は正しい日付で入力してください。");
      return;
    }

    setSaving(true);
    try {
      await onSave({ ...draft, dueDate });
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
      lockClose={saving}
      title={draft?.id ? "ToDo を編集" : "ToDo を追加"}
      subtitle={subject ? `${subject.name} に紐づくタスク` : ""}
      maxWidth="max-w-2xl"
    >
      {draft ? (
        <div className="space-y-4">
          <Field label="タイトル">
            <>
              <TextInput
                value={draft.title}
                onChange={(event) => {
                  setDraft((current) => ({ ...current, title: event.target.value }));
                  if (titleError && event.target.value.trim()) setTitleError("");
                }}
                placeholder="例: レポート提出"
              />
              {titleError ? <p className="text-xs text-rose-600">{titleError}</p> : null}
            </>
          </Field>

          <div className="grid gap-4 md:grid-cols-[220px_220px]">
            <Field label="期限">
              <>
                <TextInput
                  type="date"
                  value={draft.dueDate || ""}
                  onChange={(event) => {
                    setDraft((current) => ({ ...current, dueDate: event.target.value }));
                    if (dueDateError) setDueDateError("");
                  }}
                />
                {dueDateError ? <p className="text-xs text-rose-600">{dueDateError}</p> : null}
              </>
            </Field>
            <Field label="状態">
              <SelectInput
                value={draft.status}
                onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value }))}
              >
                {TODO_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </SelectInput>
            </Field>
          </div>

          <Field label="メモ">
            <TextArea
              value={draft.memo}
              onChange={(event) => setDraft((current) => ({ ...current, memo: event.target.value }))}
              placeholder="課題の条件、提出先、注意点など"
              className="min-h-[180px]"
            />
          </Field>
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-6">
        <IconButton tone="light" onClick={requestClose} disabled={saving}>
          キャンセル
        </IconButton>
        <IconButton icon={CheckCircle2} onClick={handleSave} disabled={saving}>
          保存
        </IconButton>
      </div>
    </Modal>
  );
}
