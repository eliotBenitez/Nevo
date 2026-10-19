/** Export asset file name; splits on both separators like Rust `Path::file_name` on Windows. */
export function assetBasename(src: string): string {
  return src.split(/[\\/]/).filter(Boolean).pop() ?? src
}
