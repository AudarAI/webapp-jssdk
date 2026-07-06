import { HttpClient } from "./client";
import {
  WebhookDeliveryListResponse,
  WebhookDeliveryResponse,
  WebhookEndpointCreate,
  WebhookEndpointCreatedResponse,
  WebhookEndpointListResponse,
  WebhookEndpointResponse,
  WebhookEndpointUpdate,
} from "./types";

export class WebhookApi {
  constructor(private readonly _http: HttpClient) {}

  // ── Endpoints CRUD ─────────────────────────────────────────────────────────

  /**
   * Create a webhook endpoint. Returns the plaintext secret once only.
   * The secret is used to verify webhook signatures (HMAC-SHA256).
   */
  async createEndpoint(data: WebhookEndpointCreate): Promise<WebhookEndpointCreatedResponse> {
    return this._http.request<WebhookEndpointCreatedResponse>(
      "POST",
      "/v1/agent/webhooks/endpoints",
      {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      },
    );
  }

  /** List all webhook endpoints for the current tenant. */
  async listEndpoints(): Promise<WebhookEndpointListResponse> {
    return this._http.request<WebhookEndpointListResponse>(
      "GET",
      "/v1/agent/webhooks/endpoints",
    );
  }

  /** Get a specific webhook endpoint by ID. */
  async getEndpoint(endpointId: string): Promise<WebhookEndpointResponse> {
    return this._http.request<WebhookEndpointResponse>(
      "GET",
      `/v1/agent/webhooks/endpoints/${encodeURIComponent(endpointId)}`,
    );
  }

  /** Update a webhook endpoint's URL, event_types, description, or enabled status. */
  async updateEndpoint(endpointId: string, data: WebhookEndpointUpdate): Promise<WebhookEndpointResponse> {
    return this._http.request<WebhookEndpointResponse>(
      "PATCH",
      `/v1/agent/webhooks/endpoints/${encodeURIComponent(endpointId)}`,
      {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      },
    );
  }

  /** Delete a webhook endpoint permanently. */
  async deleteEndpoint(endpointId: string): Promise<void> {
    await this._http.request<unknown>(
      "DELETE",
      `/v1/agent/webhooks/endpoints/${encodeURIComponent(endpointId)}`,
    );
  }

  /**
   * Rotate the endpoint's signing secret. The old secret is immediately invalidated.
   * Returns the new plaintext secret once only.
   */
  async rotateSecret(endpointId: string): Promise<WebhookEndpointCreatedResponse> {
    return this._http.request<WebhookEndpointCreatedResponse>(
      "POST",
      `/v1/agent/webhooks/endpoints/${encodeURIComponent(endpointId)}/rotate-secret`,
    );
  }

  /**
   * Send a synthetic `webhook.ping` test event to the endpoint.
   * The endpoint must subscribe to `webhook.*` or `*` to receive it.
   */
  async testEndpoint(endpointId: string): Promise<{ queued: boolean }> {
    return this._http.request<{ queued: boolean }>(
      "POST",
      `/v1/agent/webhooks/endpoints/${encodeURIComponent(endpointId)}/test`,
    );
  }

  // ── Deliveries ─────────────────────────────────────────────────────────────

  /** List webhook deliveries (paginated, filterable by endpoint, status, event_type). */
  async listDeliveries(params?: {
    endpoint_id?: string;
    status?: string;
    event_type?: string;
    page?: number;
    page_size?: number;
  }): Promise<WebhookDeliveryListResponse> {
    return this._http.request<WebhookDeliveryListResponse>(
      "GET",
      "/v1/agent/webhooks/deliveries",
      { query: params as Record<string, string | number | undefined> },
    );
  }

  /** Get a specific webhook delivery by ID. */
  async getDelivery(deliveryId: string): Promise<WebhookDeliveryResponse> {
    return this._http.request<WebhookDeliveryResponse>(
      "GET",
      `/v1/agent/webhooks/deliveries/${encodeURIComponent(deliveryId)}`,
    );
  }

  /** Retry a failed delivery. Resets the delivery status to pending for re-dispatch. */
  async retryDelivery(deliveryId: string): Promise<WebhookDeliveryResponse> {
    return this._http.request<WebhookDeliveryResponse>(
      "POST",
      `/v1/agent/webhooks/deliveries/${encodeURIComponent(deliveryId)}/retry`,
    );
  }
}
