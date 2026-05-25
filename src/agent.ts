import { HttpClient } from "./client";
import { AgentCreate, AgentUpdate, AgentResponse, AgentChatResponse, MediaOverrides, VoiceSessionRequest, VoiceSessionResponse } from "./types";
import { KnowledgeApi } from "./knowledge";
import { ToolApi } from "./tool";
import { SkillApi } from "./skill";
import { ArchetypeApi } from "./archetype";
import { RoomApi } from "./room";
import { SessionApi } from "./session";
import { ChannelApi } from "./channel";

export class AgentApi {
  readonly knowledge: KnowledgeApi;
  readonly tools: ToolApi;
  readonly skills: SkillApi;
  readonly archetypes: ArchetypeApi;
  readonly rooms: RoomApi;
  readonly sessions: SessionApi;
  readonly channels: ChannelApi;

  constructor(private readonly _http: HttpClient) {
    this.knowledge = new KnowledgeApi(_http);
    this.tools = new ToolApi(_http);
    this.skills = new SkillApi(_http);
    this.archetypes = new ArchetypeApi(_http);
    this.rooms = new RoomApi(_http);
    this.sessions = new SessionApi(_http);
    this.channels = new ChannelApi(_http);
  }

  // ── Agent Management ──────────────────────────────────────────────────────

  async listAgents(): Promise<AgentResponse[]> {
    return this._http.request<AgentResponse[]>("GET", "/v1/agent/agents");
  }

  /** Returns all platform agents. Accessible by any authenticated user regardless of tenant. */
  async listPlatformAgents(): Promise<AgentResponse[]> {
    return this._http.request<AgentResponse[]>("GET", "/v1/agent/agents/platform");
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
   * @param options.voice_id - Override the agent's default voice for this session.
   *
   * @example
   * const { session_id } = await client.agent.chat(agentId, "Hello", { voice_id: "Aria" });
   * const { token, livekit_url } = await client.agent.sessions.getLiveKitToken(session_id);
   * // Connect to LiveKit with token + livekit_url via @livekit/client SDK
   */
  async chat(
    agentId: string,
    message: string,
    options?: { voice_id?: string; metadata?: Record<string, unknown>; media_overrides?: MediaOverrides },
  ): Promise<AgentChatResponse> {
    return this._http.request<AgentChatResponse>("POST", `/v1/agent/agents/${encodeURIComponent(agentId)}/chat`, {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        ...(options?.voice_id ? { voice_id: options.voice_id } : {}),
        ...(options?.metadata ? { metadata: options.metadata } : {}),
        ...(options?.media_overrides ? { media_overrides: options.media_overrides } : {}),
      }),
    });
  }

  /**
   * Create a voice session and get a LiveKit token in a single call.
   * This is faster than calling `chat()` + `sessions.getLiveKitToken()` separately
   * as it eliminates one HTTP round-trip and one auth resolution.
   *
   * @example
   * const res = await client.agent.createVoiceSession(agentId, {
   *   voice_id: "Aria",
   *   user_name: "Alice",
   * });
   * // Connect to LiveKit directly:
   * const room = new Room();
   * await room.connect(res.livekit_url, res.token);
   */
  async createVoiceSession(
    agentId: string,
    options?: VoiceSessionRequest,
  ): Promise<VoiceSessionResponse> {
    return this._http.request<VoiceSessionResponse>(
      "POST",
      `/v1/agent/agents/${encodeURIComponent(agentId)}/voice-session`,
      {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(options ?? {}),
      },
    );
  }
}
