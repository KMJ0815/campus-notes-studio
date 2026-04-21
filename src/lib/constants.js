export const DAY_DEFS = [
  { key: "mon", label: "月" },
  { key: "tue", label: "火" },
  { key: "wed", label: "水" },
  { key: "thu", label: "木" },
  { key: "fri", label: "金" },
  { key: "sat", label: "土" },
];

export const DEFAULT_PERIOD_TEMPLATES = [
  { periodNo: 1, label: "1限", startTime: "09:00", endTime: "10:40", isEnabled: true },
  { periodNo: 2, label: "2限", startTime: "10:50", endTime: "12:30", isEnabled: true },
  { periodNo: 3, label: "3限", startTime: "13:20", endTime: "15:00", isEnabled: true },
  { periodNo: 4, label: "4限", startTime: "15:10", endTime: "16:50", isEnabled: true },
  { periodNo: 5, label: "5限", startTime: "17:00", endTime: "18:40", isEnabled: true },
];

export const DB_NAME = "campus-notes-studio";
export const DB_VERSION = 10;
export const SETTINGS_ID = "app-settings";
export const TERM_META_STORE = "term_meta";
export const DEFAULT_TERM_KEY = "2026-spring";
export const DEFAULT_TERM_LABEL = "2026年度 春学期";

export const MATERIAL_MAX_FILE_SIZE = 50 * 1024 * 1024;
export const MATERIAL_ALLOWED_EXTENSIONS = new Set([
  "pdf",
  "txt",
  "md",
  "csv",
  "doc",
  "docx",
  "ppt",
  "pptx",
  "xls",
  "xlsx",
  "jpg",
  "jpeg",
  "png",
  "webp",
  "zip",
]);

export const PAGE_DEFS = {
  dashboard: "dashboard",
  timetable: "timetable",
  library: "library",
  todos: "todos",
};

export const DETAIL_TABS = {
  notes: "notes",
  materials: "materials",
  attendance: "attendance",
  todos: "todos",
};

export const ATTENDANCE_STATUS_OPTIONS = [
  { value: "present", label: "出席" },
  { value: "late", label: "遅刻" },
  { value: "absent", label: "欠席" },
];

export const TODO_STATUS_OPTIONS = [
  { value: "open", label: "未完了" },
  { value: "done", label: "完了" },
];
