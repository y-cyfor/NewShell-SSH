// INT-5: 使用crypto.randomUUID替代Math.random
export function generateId(prefix: string): string {
  const randomPart = crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 9)}`;
  return prefix ? `${prefix}-${randomPart}` : randomPart;
}
