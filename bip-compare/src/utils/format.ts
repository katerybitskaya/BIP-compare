export function formatSize(kb: number | null): string {
  if (kb === null) return '–';
  if (kb >= 1024) return `${(kb / 1024).toFixed(1)} MB`;
  return `${kb.toFixed(1)} KB`;
}

export function formatDate(value: string | null): string {
  return value ?? '–';
}
