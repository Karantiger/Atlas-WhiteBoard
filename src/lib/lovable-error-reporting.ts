export function reportLovableError(
  error: unknown,
  options?: { boundary?: string; [key: string]: unknown },
) {
  if (typeof window !== "undefined") {
    console.error("[Lovable Error]", error, options);
  }
}
