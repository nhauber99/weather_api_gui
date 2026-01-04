const STORAGE_KEY = "weatherApiKeys";

const readStore = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    console.warn("Failed to read API keys", error);
    return {};
  }
};

const writeStore = (payload) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn("Failed to store API keys", error);
  }
};

export const getApiKeys = () => readStore();

export const getApiKey = (provider) => {
  const keys = readStore();
  const value = keys?.[provider];
  return typeof value === "string" && value.trim() ? value.trim() : null;
};

export const setApiKeys = (nextKeys) => {
  if (!nextKeys || typeof nextKeys !== "object") {
    return;
  }
  const current = readStore();
  const merged = { ...current };
  Object.entries(nextKeys).forEach(([key, value]) => {
    merged[key] = typeof value === "string" ? value.trim() : "";
  });
  writeStore(merged);
};
