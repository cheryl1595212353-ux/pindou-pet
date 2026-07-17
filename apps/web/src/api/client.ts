import type { paths } from "@pindou/contracts";

import { decodeApiError } from "./errors";

const API_BASE = "/api/v1";

export type ApiPaths = paths;

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const response = await fetch(`${API_BASE}${normalizedPath}`, {
    ...init,
    credentials: "include",
  });

  if (!response.ok) {
    throw await decodeApiError(response);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}
