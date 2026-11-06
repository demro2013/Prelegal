/** Empty in production, where the backend serves the frontend. */
const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    /** Written for people, when the backend gave a single message. */
    readonly detail: string | null,
  ) {
    super(`Request failed with status ${status}`);
  }
}

export async function apiRequest<T>(
  path: string,
  options: { method?: "GET" | "POST"; body?: unknown } = {},
): Promise<T> {
  const response = await fetch(`${API_BASE}/api${path}`, {
    method: options.method ?? "GET",
    // The session cookie has to reach the backend on the dev server's other origin.
    credentials: "include",
    ...(options.body !== undefined && {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(options.body),
    }),
  });
  if (!response.ok) {
    const data: { detail?: unknown } = await response.json().catch(() => ({}));
    throw new ApiError(
      response.status,
      typeof data.detail === "string" ? data.detail : null,
    );
  }
  return response.status === 204 ? (undefined as T) : response.json();
}
