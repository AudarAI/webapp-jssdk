import { HttpClient } from "./client";
import {
  AppItem,
  CreateAppRequest,
  CreateAppResponse,
  ResetSecretResponse,
  UpdateAppRequest,
} from "./types";

export class AppApi {
  constructor(private readonly _http: HttpClient) {}

  /** List all third-party apps for the current tenant. */
  async list(): Promise<AppItem[]> {
    return this._http.request<AppItem[]>("GET", "/v1/account/apps");
  }

  /**
   * Create a new app. Returns the plaintext secret once only — store it securely.
   * The `app_id` is public (safe for frontend), the `secret` is confidential (backend only).
   */
  async create(data: CreateAppRequest): Promise<CreateAppResponse> {
    return this._http.request<CreateAppResponse>("POST", "/v1/account/apps", {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  }

  /** Update an app's name and/or allowed_origins. */
  async update(appUuid: string, data: UpdateAppRequest): Promise<AppItem> {
    return this._http.request<AppItem>(
      "PATCH",
      `/v1/account/apps/${encodeURIComponent(appUuid)}`,
      {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      },
    );
  }

  /** Revoke an app permanently. The app_id and secret become immediately invalid. */
  async revoke(appUuid: string): Promise<void> {
    await this._http.request<unknown>(
      "DELETE",
      `/v1/account/apps/${encodeURIComponent(appUuid)}`,
    );
  }

  /**
   * Rotate an app's secret. The old secret is immediately invalidated.
   * Returns the new plaintext secret once only — store it securely.
   */
  async resetSecret(appUuid: string): Promise<ResetSecretResponse> {
    return this._http.request<ResetSecretResponse>(
      "POST",
      `/v1/account/apps/${encodeURIComponent(appUuid)}/reset-secret`,
    );
  }
}
