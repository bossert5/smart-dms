export function formatFileSize(size: number | null): string {
  if (size === null) {
    return '—';
  }

  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}
