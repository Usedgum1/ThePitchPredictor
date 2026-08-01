/**
 * @param {ArrayBuffer} buffer
 * @returns {Promise<{ headers: unknown[], rows: unknown[][], sheetName: string }>}
 */
export async function parseExcelBuffer(buffer) {
  if (typeof XLSX === "undefined") {
    throw new Error("Excel library failed to load. Check your network connection.");
  }
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  if (!workbook.SheetNames.length) throw new Error("Workbook has no sheets.");

  const preferred = workbook.SheetNames.find(
    (name) => String(name).trim().toLowerCase() === "game history"
  );
  const sheetName = preferred || workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  /** @type {unknown[][]} */
  const grid = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: null,
    raw: true,
  });
  if (!grid.length) throw new Error(`Sheet "${sheetName}" is empty.`);
  const headers = (grid[0] ?? []).map((h) => String(h ?? "").trim());
  const rows = grid.slice(1).filter((row) => row.some((c) => c != null && c !== ""));
  return { headers, rows, sheetName };
}

/**
 * @param {File} file
 * @param {(ratio: number) => void} [onProgress]
 * @returns {Promise<ArrayBuffer>}
 */
export function readFileAsArrayBuffer(file, onProgress) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onprogress = (event) => {
      if (event.lengthComputable && onProgress) onProgress(event.loaded / event.total);
    };
    reader.onload = () => resolve(/** @type {ArrayBuffer} */ (reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file."));
    reader.readAsArrayBuffer(file);
  });
}
