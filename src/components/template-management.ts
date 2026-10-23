export function normalizeTemplateName(value: string): string | null {
  const normalized = value.trim();
  return normalized || null;
}

/**
 * 展示层排序：将默认模板提到首位，其余保持存储原序（稳定）。
 * 不改传入数组、不动存储；仅用于列表渲染，避免影响 checksum / revision 等仓库语义。
 */
export function orderTemplatesWithFirstDefault<T extends { id: string }>(
  templates: readonly T[],
  defaultId: string | null,
): T[] {
  const copy = [...templates];
  if (!defaultId) return copy;
  const index = copy.findIndex((item) => item.id === defaultId);
  if (index <= 0) return copy; // 不存在（-1）或已在首位（0）：保持原序
  const [defaultItem] = copy.splice(index, 1);
  copy.unshift(defaultItem);
  return copy;
}
