export class ApiError extends Error {
  constructor(message, { status, body } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

export async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      accept: "application/json",
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...options.headers
    }
  });

  const text = await response.text();
  const body = text ? parseJson(text) : null;

  if (!response.ok) {
    throw new ApiError(`HTTP ${response.status} from ${url}`, {
      status: response.status,
      body
    });
  }

  return body;
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
