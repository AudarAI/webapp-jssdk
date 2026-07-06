import { HttpClient } from "./client";
import {
  AcceptInvitationRequest,
  CreateTenantRequest,
  InviteMemberRequest,
  InviteResponse,
  SwitchTenantRequest,
  SwitchTenantResponse,
  TenantItem,
  TenantMemberItem,
  UpdateTenantRequest,
} from "./types";

export class TenantApi {
  constructor(private readonly _http: HttpClient) {}

  /** List all tenants the current user belongs to. */
  async list(): Promise<TenantItem[]> {
    return this._http.request<TenantItem[]>("GET", "/v1/account/tenants");
  }

  /** Create a new tenant. The caller becomes owner and gets a wallet. */
  async create(data: CreateTenantRequest): Promise<TenantItem> {
    return this._http.request<TenantItem>("POST", "/v1/account/tenants", {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  }

  /** Get a specific tenant by ID. */
  async get(tenantId: string): Promise<TenantItem> {
    return this._http.request<TenantItem>(
      "GET",
      `/v1/account/tenants/${encodeURIComponent(tenantId)}`,
    );
  }

  /** Update a tenant's name and/or region. Requires owner/admin role. */
  async update(tenantId: string, data: UpdateTenantRequest): Promise<TenantItem> {
    return this._http.request<TenantItem>(
      "PUT",
      `/v1/account/tenants/${encodeURIComponent(tenantId)}`,
      {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      },
    );
  }

  /** Delete a tenant. Only the owner can delete. */
  async delete(tenantId: string): Promise<void> {
    await this._http.request<unknown>(
      "DELETE",
      `/v1/account/tenants/${encodeURIComponent(tenantId)}`,
    );
  }

  /** List all members of a tenant. */
  async listMembers(tenantId: string): Promise<TenantMemberItem[]> {
    return this._http.request<TenantMemberItem[]>(
      "GET",
      `/v1/account/tenants/${encodeURIComponent(tenantId)}/members`,
    );
  }

  /** Invite a user to a tenant by email. Requires owner/admin role. */
  async inviteMember(tenantId: string, data: InviteMemberRequest): Promise<InviteResponse> {
    return this._http.request<InviteResponse>(
      "POST",
      `/v1/account/tenants/${encodeURIComponent(tenantId)}/invite`,
      {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      },
    );
  }

  /** Leave a tenant. Owner cannot leave; they must delete or transfer ownership. */
  async leave(tenantId: string): Promise<void> {
    await this._http.request<unknown>(
      "POST",
      `/v1/account/tenants/${encodeURIComponent(tenantId)}/leave`,
    );
  }

  /** Remove a member from a tenant. Requires owner/admin role. */
  async removeMember(tenantId: string, userId: string): Promise<void> {
    await this._http.request<unknown>(
      "DELETE",
      `/v1/account/tenants/${encodeURIComponent(tenantId)}/members/${encodeURIComponent(userId)}`,
    );
  }

  /** Accept an invitation to join a tenant using the invite token. */
  async acceptInvitation(data: AcceptInvitationRequest): Promise<TenantItem> {
    return this._http.request<TenantItem>(
      "POST",
      "/v1/account/tenants/invitations/accept",
      {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      },
    );
  }

  /**
   * Switch the active tenant. Returns a new session token (stk_) valid for 24h.
   * Use the returned `access_token` to initialize a new client or seed the token manager.
   */
  async switch(data: SwitchTenantRequest): Promise<SwitchTenantResponse> {
    return this._http.request<SwitchTenantResponse>(
      "POST",
      "/v1/account/tenants/switch",
      {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      },
    );
  }
}
