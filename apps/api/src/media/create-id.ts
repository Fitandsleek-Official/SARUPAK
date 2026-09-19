/** Lightweight cuid-like id without extra dependency. */
export function createId(): string {
  const time = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 10);
  const rand2 = Math.random().toString(36).slice(2, 10);
  return `c${time}${rand}${rand2}`;
}
