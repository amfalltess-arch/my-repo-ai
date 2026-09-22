export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(data.error ?? `Request failed (${res.status})`, res.status);
  }
  return data as T;
}

async function uploadForm<T>(path: string, form: FormData): Promise<T> {
  const res = await fetch(`/api${path}`, { method: "POST", body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error ?? `Upload failed (${res.status})`, res.status);
  return data as T;
}

interface UploadPrep {
  direct: boolean;
  uploadUrl?: string;
  storageKey?: string;
  headers?: Record<string, string>;
}

/**
 * Uploads a source video. Prefers a direct browser -> S3/R2 upload with a
 * presigned URL (required on Vercel, where request bodies are capped at 4.5 MB)
 * and falls back to a multipart upload through the app server when the active
 * storage driver cannot presign (local disk in development).
 */
async function uploadVideo<T>(file: File): Promise<T> {
  const prep = await request<UploadPrep>("/videos/upload-url", {
    method: "POST",
    body: JSON.stringify({
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      rightsConfirmed: true,
    }),
  });

  if (!prep.direct || !prep.uploadUrl || !prep.storageKey) {
    const form = new FormData();
    form.append("file", file);
    form.append("rightsConfirmed", "true");
    return uploadForm<T>("/videos", form);
  }

  try {
    const put = await fetch(prep.uploadUrl, {
      method: "PUT",
      headers: prep.headers,
      body: file,
    });
    if (!put.ok) {
      throw new ApiError(`Upload to storage failed (${put.status}).`, put.status);
    }
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(
      "Upload to storage failed. Check that the bucket's CORS rules allow PUT from this site.",
      0,
    );
  }

  return request<T>("/videos", {
    method: "POST",
    body: JSON.stringify({
      storageKey: prep.storageKey,
      fileName: file.name,
      mimeType: file.type,
      rightsConfirmed: true,
    }),
  });
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  uploadVideo,
  upload: uploadForm,
};
