const BASE_URL = "";

class ApiClient {
  private async request<T>(url: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      ...options.headers as Record<string, string>,
    };
    if (options.body && typeof options.body === "string") {
      headers["Content-Type"] = "application/json";
    }

    const response = await fetch(`${BASE_URL}${url}`, {
      ...options,
      headers,
      credentials: "same-origin",
    });

    if (response.status === 401) {
      if (!url.includes("/auth/")) {
        window.location.href = "/deck/login";
      }
      throw new Error("Unauthorized");
    }

    if (!response.ok) {
      const body = await response.json().catch(() => ({ message: "Request failed" }));
      throw new Error(body.message || `HTTP ${response.status}`);
    }

    if (response.status === 204) return undefined as T;
    return response.json();
  }

  get<T>(url: string): Promise<T> {
    return this.request<T>(url);
  }

  post<T>(url: string, body: unknown): Promise<T> {
    return this.request<T>(url, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  patch<T>(url: string, body: unknown): Promise<T> {
    return this.request<T>(url, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  }

  put<T>(url: string, body: unknown): Promise<T> {
    return this.request<T>(url, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  }

  delete<T>(url: string): Promise<T> {
    return this.request<T>(url, {
      method: "DELETE",
    });
  }
}

export const client = new ApiClient();
