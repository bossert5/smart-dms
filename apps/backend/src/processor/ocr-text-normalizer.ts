export function normalizeOcrText(text: string): string {
  return text
    .replace(/\u00ad/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/([A-Za-zÀ-ÖØ-öø-ÿ])-\r?\n\s*([a-zà-öø-ÿ])/g, '$1$2')
    .replace(/(\d{1,2})\s*[.,‚]\s*(\d{1,2})\s*[.,‚]\s*(\d{2,4})/g, '$1.$2.$3')
    .replace(/[ \t]+([,.;:!?])/g, '$1')
    .replace(/(\d{1,2}\.\d{1,2}\.\d{2,4})\.+/g, '$1.')
    .replace(/([([{])\s+/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+\r?\n/g, '\n')
    .trim();
}
