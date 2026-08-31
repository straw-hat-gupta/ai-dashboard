async function request(path, options) {
  const res = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || `Request failed: ${res.status}`);
  return body;
}

export const api = {
  getUsage: () => request("/usage"),
  refresh: (provider) => request(`/usage/${provider}/refresh`, { method: "POST" }),
  manualUpdate: (provider, payload) =>
    request(`/usage/${provider}/manual`, { method: "POST", body: JSON.stringify(payload) }),
};
