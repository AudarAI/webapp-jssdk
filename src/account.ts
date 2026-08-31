import { HttpClient } from "./client";
import {
  AccountMeResponse,
  ApiKeyItem,
  BalanceResponse,
  CreateApiKeyRequest,
  CreateApiKeyResponse,
  DashboardResponse,
  GuestLoginRequest,
  GuestLoginResponse,
  TopUpRequest,
  UpdateApiKeyRequest,
  UsageListResponse,
  UsageStatsParams,
  UsageStatsResponse,
} from "./types";

export class AccountApi {
  constructor(private readonly _http: HttpClient) {}

  /**
   * Guest login — creates or reuses a guest account based on device fingerprint.
   * This endpoint does NOT require authentication.
   */
  async guestLogin(data?: GuestLoginRequest): Promise<GuestLoginResponse> {
    return this._http.requestNoAuth<GuestLoginResponse>("POST", "/v1/account/guest", {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data ?? {}),
    });
  }

  /** Get the current authenticated user's profile. */
  async getMe(): Promise<AccountMeResponse> {
    return this._http.request<AccountMeResponse>("GET", "/v1/account/me");
  }

  /**
   * Sync/auto-register a Keycloak user.
   * On first login, creates a personal tenant with free credits.
   */
  async sync(): Promise<AccountMeResponse> {
    return this._http.request<AccountMeResponse>("POST", "/v1/account/sync");
  }

  /** Get the current tenant's wallet balance. */
  async getBalance(): Promise<BalanceResponse> {
    return this._http.request<BalanceResponse>("GET", "/v1/account/balance");
  }

  /** Top up the current tenant's wallet balance. */
  async topUp(data: TopUpRequest): Promise<BalanceResponse> {
    return this._http.request<BalanceResponse>("POST", "/v1/account/balance/topup", {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  }

  /** List all API keys for the current tenant. */
  async listApiKeys(): Promise<ApiKeyItem[]> {
    return this._http.request<ApiKeyItem[]>("GET", "/v1/account/api-keys");
  }

  /** Create a new API key. The plaintext key is returned once only. */
  async createApiKey(data: CreateApiKeyRequest): Promise<CreateApiKeyResponse> {
    return this._http.request<CreateApiKeyResponse>("POST", "/v1/account/api-keys", {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  }

  /** Update an API key's owner-editable fields (allowed_origins, description).
   *  Partial: omitted fields keep their current value. Owner only — the API
   *  returns 403 for a key belonging to another user in the tenant. */
  async updateApiKey(apiKeyId: string, data: UpdateApiKeyRequest): Promise<ApiKeyItem> {
    return this._http.request<ApiKeyItem>(
      "PATCH",
      `/v1/account/api-keys/${encodeURIComponent(apiKeyId)}`,
      {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      },
    );
  }

  /** Revoke an API key permanently. */
  async revokeApiKey(apiKeyId: string): Promise<void> {
    await this._http.request<unknown>(
      "DELETE",
      `/v1/account/api-keys/${encodeURIComponent(apiKeyId)}`,
    );
  }

  /** List usage records for the current tenant (paginated, filterable). */
  async listUsage(params?: {
    service?: string;
    start_date?: string;
    end_date?: string;
    page?: number;
    page_size?: number;
  }): Promise<UsageListResponse> {
    return this._http.request<UsageListResponse>("GET", "/v1/account/usage", {
      query: params as Record<string, string | number | undefined>,
    });
  }

  /** Get usage statistics with per-service summary and time-series data. */
  async getUsageStats(params: UsageStatsParams): Promise<UsageStatsResponse> {
    return this._http.request<UsageStatsResponse>("GET", "/v1/account/usage/stats", {
      query: params as unknown as Record<string, string | undefined>,
    });
  }

  /** Get the dashboard summary (monthly cost, API key count, balance). */
  async getDashboard(): Promise<DashboardResponse> {
    return this._http.request<DashboardResponse>("GET", "/v1/account/dashboard");
  }
}
