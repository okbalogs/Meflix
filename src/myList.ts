const MY_LIST_KEY = "meflix_my_list";

export function loadMyList(): string[] {
  try {
    return JSON.parse(localStorage.getItem(MY_LIST_KEY) || "[]");
  } catch { return []; }
}

function saveMyList(list: string[]): void {
  try { localStorage.setItem(MY_LIST_KEY, JSON.stringify(list)); } catch {}
}

export function toggleMyList(list: string[], path: string): string[] {
  const idx = list.indexOf(path);
  const next = idx >= 0 ? list.filter((_, i) => i !== idx) : [path, ...list];
  saveMyList(next);
  return next;
}
