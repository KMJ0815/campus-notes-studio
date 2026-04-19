export function createAppError(code, message, data = {}) {
  const error = new Error(message);
  error.code = code;
  error.data = data;
  return error;
}

export function errorMessage(error, fallback = "処理に失敗しました。") {
  if (!error) return fallback;
  if (typeof error === "string") return error;
  return error.message || fallback;
}
