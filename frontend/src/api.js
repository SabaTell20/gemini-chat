// api.js - every call to the backend goes through here.
// The login cookie is HttpOnly, so the browser sends it by itself.

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export async function errorFrom(response) {
  let message = `Something went wrong (${response.status}).`;
  try {
    const body = await response.json();
    if (typeof body.detail === "string") message = body.detail;
  } catch {
    /* no JSON: keep the general message */
  }
  // the login is gone (logged out elsewhere, password changed): show the login page
  if (response.status === 401 && !response.url.includes("/api/auth/")) {
    window.dispatchEvent(new Event("auth-lost"));
  }
  return new ApiError(response.status, message);
}

async function request(method, path, body) {
  const response = await fetch("/api" + path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) throw await errorFrom(response);
  return response.json();
}

export const api = {
  get: (path) => request("GET", path),
  post: (path, body) => request("POST", path, body),
  put: (path, body) => request("PUT", path, body),
  patch: (path, body) => request("PATCH", path, body),
  delete: (path) => request("DELETE", path),
};
