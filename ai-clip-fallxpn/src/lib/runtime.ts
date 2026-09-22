/**
 * Serverless detection (Vercel, Netlify, or any AWS-Lambda-based host).
 * Set `SERVERLESS=true` yourself if a platform is not detected.
 *
 * On these hosts the web tier cannot: write to local disk, run ffprobe/yt-dlp/
 * pg_dump, accept request bodies over ~4.5 MB, or hold connections open for long.
 */
export function isServerless(): boolean {
  return Boolean(
    process.env.SERVERLESS === "true" ||
      process.env.VERCEL ||
      process.env.NETLIFY ||
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.LAMBDA_TASK_ROOT,
  );
}

/**
 * How long a Server-Sent-Events response may stay open before it closes itself
 * (the browser's EventSource reconnects and immediately receives the current
 * state). Netlify's default synchronous function limit is 10 s; Vercel allows
 * much longer. Override with SSE_MAX_LIFETIME_SEC.
 */
export function sseLifetimeMs(): number {
  const override = Number(process.env.SSE_MAX_LIFETIME_SEC);
  if (Number.isFinite(override) && override > 0) return override * 1000;
  if (process.env.VERCEL) return 290_000;
  if (isServerless()) return 8_000;
  return 290_000;
}
