import { HttpClient } from "./client";
import { ArchetypeCreate, ArchetypeUpdate, ArchetypeResponse } from "./types";

export class ArchetypeApi {
  constructor(private readonly _http: HttpClient) {}

  async list(): Promise<ArchetypeResponse[]> {
    return this._http.request<ArchetypeResponse[]>("GET", "/v1/agent/archetypes");
  }

  async create(data: ArchetypeCreate): Promise<ArchetypeResponse> {
    return this._http.request<ArchetypeResponse>("POST", "/v1/agent/archetypes", {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  }

  async get(archetypeId: string): Promise<ArchetypeResponse> {
    return this._http.request<ArchetypeResponse>("GET", `/v1/agent/archetypes/${encodeURIComponent(archetypeId)}`);
  }

  async update(archetypeId: string, data: ArchetypeUpdate): Promise<ArchetypeResponse> {
    return this._http.request<ArchetypeResponse>("PUT", `/v1/agent/archetypes/${encodeURIComponent(archetypeId)}`, {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  }

  async delete(archetypeId: string): Promise<void> {
    await this._http.request<unknown>("DELETE", `/v1/agent/archetypes/${encodeURIComponent(archetypeId)}`);
  }
}
