export class ApiError extends Error {
  status: number;
  error: string;

  constructor(status: number, error: string, message: string) {
    super(message);
    this.status = status;
    this.error = error;
  }
}

let onUnauthorized: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

function fail(status: number, body: string): never {
  if (status === 401 && onUnauthorized) onUnauthorized();
  let parsed: { error?: string; message?: string } = {};
  try {
    parsed = JSON.parse(body) as { error?: string; message?: string };
  } catch {
    parsed = {};
  }
  throw new ApiError(status, parsed.error ?? 'internal', parsed.message ?? 'Erreur inattendue.');
}

function parse<T>(body: string): T {
  if (body.length === 0) return undefined as T;
  return JSON.parse(body) as T;
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, credentials: 'same-origin' });
  const body = await res.text();
  if (!res.ok) fail(res.status, body);
  return parse<T>(body);
}

export function apiGet<T>(path: string): Promise<T> {
  return request<T>(path, { method: 'GET' });
}

export function apiPost<T>(path: string, body?: unknown): Promise<T> {
  if (body === undefined) return request<T>(path, { method: 'POST' });
  return request<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function apiDelete<T>(path: string): Promise<T> {
  return request<T>(path, { method: 'DELETE' });
}

export function apiUpload<T>(
  path: string,
  form: FormData,
  onProgress?: (ratio: number) => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', path);
    xhr.withCredentials = true;

    xhr.upload.addEventListener('progress', (event) => {
      if (onProgress && event.lengthComputable) onProgress(event.loaded / event.total);
    });

    xhr.addEventListener('load', () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        try {
          fail(xhr.status, xhr.responseText);
        } catch (err) {
          reject(err);
        }
        return;
      }
      try {
        resolve(parse<T>(xhr.responseText));
      } catch (err) {
        reject(err);
      }
    });

    xhr.addEventListener('error', () => {
      reject(new ApiError(0, 'internal', "Impossible de joindre le serveur."));
    });

    xhr.send(form);
  });
}
