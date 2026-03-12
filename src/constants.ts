export const DIGEST_FILENAME_SUFFIX = "ダイジェスト";
export const LEGACY_FILENAME_SUFFIX = "デイリーダイジェスト";

export function digestPath(folder: string, date: string): string {
  return `${folder}/${date} ${DIGEST_FILENAME_SUFFIX}.md`;
}

export function legacyDigestPath(folder: string, date: string): string {
  return `${folder}/${date} ${LEGACY_FILENAME_SUFFIX}.md`;
}
