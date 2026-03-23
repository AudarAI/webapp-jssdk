import { HttpClient } from "./client";
import { AgentCreate, AgentUpdate, AgentResponse, AgentChatResponse } from "./types";
import { KnowledgeApi } from "./knowledge";
import { ToolApi } from "./tool";
import { SkillApi } from "./skill";
import { RoomApi } from "./room";
import { SessionApi } from "./session";

export class AgentApi {
  readonly knowledge: KnowledgeApi;
  readonly tools: ToolApi;
  readonly skills: SkillApi;
  readonly rooms: RoomApi;
  readonly sessions: SessionApi;

  constructor(private readonly _http: HttpClient) {
    this.knowledge = new KnowledgeApi(_http);
    this.tools = new ToolApi(_http);
    this.skills = new SkillApi(_http);
    this.rooms = new RoomApi(_http);
    this.sessions = new SessionApi(_http);
  }

  // ── Agent Management ──────────────────────────────────────────────────────

  async listAgents(): Promise<AgentResponse[]> {
    return this._http.request<AgentResponse[]>("GET", "/v1/agent/agents");
  }

  async createAgent(data: AgentCreate): Promise<AgentResponse> {
    return this._http.request<AgentResponse>("POST", "/v1/agent/agents", {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  }

  async getAgent(agentId: string): Promise<AgentResponse> {
    return this._http.request<AgentResponse>("GET", `/v1/agent/agents/${encodeURIComponent(agentId)}`);
  }

  async updateAgent(agentId: string, data: AgentUpdate): Promise<AgentResponse> {
    return this._http.request<AgentResponse>("PUT", `/v1/agent/agents/${encodeURIComponent(agentId)}`, {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  }

  async deleteAgent(agentId: string): Promise<void> {
    await this._http.request<unknown>("DELETE", `/v1/agent/agents/${encodeURIComponent(agentId)}`);
  }

  /**
   * Quick-start a voice session with an agent.
   * Returns `{session_id, room_id}` — pass `session_id` to `sessions.getLiveKitToken()` next.
   *
   * @example
   * const { session_id } = await client.agent.chat(agentId, "Hello");
   * const { token, livekit_url } = await client.agent.sessions.getLiveKitToken(session_id);
   * // Connect to LiveKit with token + livekit_url via @livekit/client SDK
   */
  async chat(agentId: string, message: string, metadata?: Record<string, unknown>): Promise<AgentChatResponse> {
    return this._http.request<AgentChatResponse>("POST", `/v1/agent/agents/${encodeURIComponent(agentId)}/chat`, {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, ...(metadata ? { metadata } : {}) }),
    });
  }
}
