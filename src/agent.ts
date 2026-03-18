import { HttpClient } from "./client";
import {
  AgentCreate,
  AgentUpdate,
  AgentResponse,
  AgentChatResponse,
  RoomCreate,
  RoomUpdate,
  RoomResponse,
  SessionResponse,
  MessageCreate,
  MessageResponse,
  MessageListResponse,
  LiveKitTokenResponse,
} from "./types";

export class AgentApi {
  constructor(private readonly _http: HttpClient) {}

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
   * Returns `{session_id, room_id}` — pass `session_id` to `getLiveKitToken()` next.
   *
   * @example
   * const { session_id } = await client.agent.chat(agentId, "Hello");
   * const { token, livekit_url } = await client.agent.getLiveKitToken(session_id);
   * // Connect to LiveKit with token + livekit_url via @livekit/client SDK
   */
  async chat(agentId: string, message: string, metadata?: Record<string, unknown>): Promise<AgentChatResponse> {
    return this._http.request<AgentChatResponse>("POST", `/v1/agent/agents/${encodeURIComponent(agentId)}/chat`, {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, ...(metadata ? { metadata } : {}) }),
    });
  }

  // ── Room Management ───────────────────────────────────────────────────────

  async listRooms(): Promise<RoomResponse[]> {
    return this._http.request<RoomResponse[]>("GET", "/v1/agent/rooms");
  }

  async createRoom(data: RoomCreate): Promise<RoomResponse> {
    return this._http.request<RoomResponse>("POST", "/v1/agent/rooms", {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  }

  async getRoom(roomId: string): Promise<RoomResponse> {
    return this._http.request<RoomResponse>("GET", `/v1/agent/rooms/${encodeURIComponent(roomId)}`);
  }

  async updateRoom(roomId: string, data: RoomUpdate): Promise<RoomResponse> {
    return this._http.request<RoomResponse>("PUT", `/v1/agent/rooms/${encodeURIComponent(roomId)}`, {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  }

  async deleteRoom(roomId: string): Promise<void> {
    await this._http.request<unknown>("DELETE", `/v1/agent/rooms/${encodeURIComponent(roomId)}`);
  }

  async createSession(roomId: string, config?: Record<string, unknown>): Promise<SessionResponse> {
    return this._http.request<SessionResponse>("POST", `/v1/agent/rooms/${encodeURIComponent(roomId)}/sessions`, {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config ? { config } : {}),
    });
  }

  // ── Session Management ────────────────────────────────────────────────────

  async getSession(sessionId: string): Promise<SessionResponse> {
    return this._http.request<SessionResponse>("GET", `/v1/agent/sessions/${encodeURIComponent(sessionId)}`);
  }

  async pauseSession(sessionId: string): Promise<SessionResponse> {
    return this._http.request<SessionResponse>("POST", `/v1/agent/sessions/${encodeURIComponent(sessionId)}/pause`);
  }

  async resumeSession(sessionId: string): Promise<SessionResponse> {
    return this._http.request<SessionResponse>("POST", `/v1/agent/sessions/${encodeURIComponent(sessionId)}/resume`);
  }

  async endSession(sessionId: string): Promise<SessionResponse> {
    return this._http.request<SessionResponse>("POST", `/v1/agent/sessions/${encodeURIComponent(sessionId)}/end`);
  }

  async listMessages(
    sessionId: string,
    params?: { page?: number; page_size?: number }
  ): Promise<MessageListResponse> {
    return this._http.request<MessageListResponse>(
      "GET",
      `/v1/agent/sessions/${encodeURIComponent(sessionId)}/messages`,
      { query: params as Record<string, number | undefined> },
    );
  }

  async appendMessage(sessionId: string, data: MessageCreate): Promise<MessageResponse> {
    return this._http.request<MessageResponse>(
      "POST",
      `/v1/agent/sessions/${encodeURIComponent(sessionId)}/messages`,
      {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      },
    );
  }

  // ── Voice ─────────────────────────────────────────────────────────────────

  /**
   * Get a LiveKit token for the given session.
   * Pass the returned `token` and `livekit_url` to the `@livekit/client` SDK to join the room.
   */
  async getLiveKitToken(sessionId: string): Promise<LiveKitTokenResponse> {
    return this._http.request<LiveKitTokenResponse>(
      "POST",
      `/v1/agent/sessions/${encodeURIComponent(sessionId)}/livekit-token`,
    );
  }
}
