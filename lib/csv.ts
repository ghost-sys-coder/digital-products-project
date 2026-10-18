export function csvCell(value: string | number | null) {
  const text = String(value ?? "");
  const safe = /^(\s*[=+\-@]|[\t\r\n])/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}
