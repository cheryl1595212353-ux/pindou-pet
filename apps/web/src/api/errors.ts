export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
  };
}

export class ApiClientError extends Error {
  readonly code: string;
  readonly status: number;

  constructor({ code, message, status }: { code: string; message: string; status: number }) {
    super(message);
    this.name = "ApiClientError";
    this.code = code;
    this.status = status;
  }
}

export async function decodeApiError(response: Response): Promise<ApiClientError> {
  try {
    const body = (await response.json()) as Partial<ApiErrorBody>;
    const code = body.error?.code;
    const message = body.error?.message;
    if (typeof code === "string" && typeof message === "string") {
      return new ApiClientError({ code, message, status: response.status });
    }
  } catch {
    // The stable fallback below also covers non-JSON upstream responses.
  }

  return new ApiClientError({
    code: "UNEXPECTED_RESPONSE",
    message: "服务暂时不可用，请稍后重试",
    status: response.status,
  });
}

