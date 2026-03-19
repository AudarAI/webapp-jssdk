import { HttpClient } from "./client";
import { SkillCreate, SkillUpdate, SkillResponse } from "./types";

export class SkillApi {
  constructor(private readonly _http: HttpClient) {}

  async list(): Promise<SkillResponse[]> {
    return this._http.request<SkillResponse[]>("GET", "/v1/agent/skills");
  }

  async create(data: SkillCreate): Promise<SkillResponse> {
    return this._http.request<SkillResponse>("POST", "/v1/agent/skills", {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  }

  async get(skillId: string): Promise<SkillResponse> {
    return this._http.request<SkillResponse>("GET", `/v1/agent/skills/${encodeURIComponent(skillId)}`);
  }

  async update(skillId: string, data: SkillUpdate): Promise<SkillResponse> {
    return this._http.request<SkillResponse>("PUT", `/v1/agent/skills/${encodeURIComponent(skillId)}`, {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  }

  async delete(skillId: string): Promise<void> {
    await this._http.request<unknown>("DELETE", `/v1/agent/skills/${encodeURIComponent(skillId)}`);
  }
}
