import { HttpClient } from "./client";
import { ToolCreate, ToolUpdate, ToolResponse, BuiltinCatalogEntry } from "./types";

export class ToolApi {
  constructor(private readonly _http: HttpClient) {}

  async list(): Promise<ToolResponse[]> {
    return this._http.request<ToolResponse[]>("GET", "/v1/agent/tools");
  }

  async create(data: ToolCreate): Promise<ToolResponse> {
    return this._http.request<ToolResponse>("POST", "/v1/agent/tools", {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  }

  async listBuiltins(): Promise<BuiltinCatalogEntry[]> {
    return this._http.request<BuiltinCatalogEntry[]>("GET", "/v1/agent/tools/builtins");
  }

  async get(toolId: string): Promise<ToolResponse> {
    return this._http.request<ToolResponse>("GET", `/v1/agent/tools/${encodeURIComponent(toolId)}`);
  }

  async update(toolId: string, data: ToolUpdate): Promise<ToolResponse> {
    return this._http.request<ToolResponse>("PUT", `/v1/agent/tools/${encodeURIComponent(toolId)}`, {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  }

  async delete(toolId: string): Promise<void> {
    await this._http.request<unknown>("DELETE", `/v1/agent/tools/${encodeURIComponent(toolId)}`);
  }
}
