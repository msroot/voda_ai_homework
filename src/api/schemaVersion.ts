/** Public label for an asset schema version (API + reports). DB/Mongo store the integer. */
export function formatSchemaVersion(version: number): string {
  return `v_${version}`;
}

export function parseSchemaVersion(label: string): number {
  const match = /^v_(\d+)$/.exec(label);
  if (!match) {
    throw new Error(`Invalid schema version label: ${label}`);
  }
  return Number(match[1]);
}
