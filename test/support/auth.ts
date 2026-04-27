export function buildAuthHeaders() {
  const token = process.env.API_AUTH_TOKEN;

  if (!token) {
    return {};
  }

  return {
    authorization: `Bearer ${token}`,
  };
}
