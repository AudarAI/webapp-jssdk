import { HttpClient } from "./client";
import { ChannelCreate, ChannelUpdate, ChannelResponse } from "./types";

export class ChannelApi {
  constructor(private readonly _http: HttpClient) {}

  async list(): Promise<ChannelResponse[]> {
    return this._http.request<ChannelResponse[]>("GET", "/v1/agent/channels");
  }

  async create(data: ChannelCreate): Promise<ChannelResponse> {
    return this._http.request<ChannelResponse>("POST", "/v1/agent/channels", {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  }

  async get(channelId: string): Promise<ChannelResponse> {
    return this._http.request<ChannelResponse>(
      "GET",
      `/v1/agent/channels/${encodeURIComponent(channelId)}`,
    );
  }

  async update(channelId: string, data: ChannelUpdate): Promise<ChannelResponse> {
    return this._http.request<ChannelResponse>(
      "PUT",
      `/v1/agent/channels/${encodeURIComponent(channelId)}`,
      {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      },
    );
  }

  /** Deactivate (soft-delete) a channel. */
  async delete(channelId: string): Promise<void> {
    await this._http.request<unknown>(
      "DELETE",
      `/v1/agent/channels/${encodeURIComponent(channelId)}`,
    );
  }
}
