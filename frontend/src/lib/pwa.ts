interface NetworkInformation extends EventTarget {
  saveData?: boolean
}

/** True when the user has Data Saver enabled (Save-Data). Unsupported browsers default to false. */
export function isSaveDataEnabled(): boolean {
  const connection = (navigator as Navigator & { connection?: NetworkInformation }).connection
  return connection?.saveData ?? false
}
