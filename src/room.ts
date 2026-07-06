import { HttpClient } from "./client";
import { RoomCreate, RoomUpdate, RoomResponse, RoomAddAgent, RoomAgentListResponse, SessionCreate, SessionResponse, LiveKitTokenRequest, LiveKitTokenResponse, VoiceSessionResponse } from "./types";

export class RoomApi {
  constructor(private readonly _http: HttpClient) {}

  // ── Room CRUD ─────────────────────────────────────────────────────────────

  async list(): Promise<RoomResponse[]> {
    return this._http.request<RoomResponse[]>("GET", "/v1/agent/rooms");
  }

  async create(data: RoomCreate): Promise<RoomResponse> {
    return this._http.request<RoomResponse>("POST", "/v1/agent/rooms", {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  }

  async get(roomId: string): Promise<RoomResponse> {
    return this._http.request<RoomResponse>("GET", `/v1/agent/rooms/${encodeURIComponent(roomId)}`);
  }

  async update(roomId: string, data: RoomUpdate): Promise<RoomResponse> {
    return this._http.request<RoomResponse>("PUT", `/v1/agent/rooms/${encodeURIComponent(roomId)}`, {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  }

  /** Archive (soft-delete) a room. */
  async delete(roomId: string): Promise<void> {
    await this._http.request<unknown>("DELETE", `/v1/agent/rooms/${encodeURIComponent(roomId)}`);
  }

  /**
   * Generate phases from the provided speaking_rules via LLM and save the result.
   */
  async generatePhases(roomId: string, speakingRules: string): Promise<RoomResponse> {
    return this._http.request<RoomResponse>(
      "POST",
      `/v1/agent/rooms/${encodeURIComponent(roomId)}/phases/generate`,
      {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ speaking_rules: speakingRules }),
      },
    );
  }

  // ── Room agents ───────────────────────────────────────────────────────────

  async listAgents(roomId: string): Promise<RoomAgentListResponse> {
    return this._http.request<RoomAgentListResponse>("GET", `/v1/agent/rooms/${encodeURIComponent(roomId)}/agents`);
  }

  async addAgent(roomId: string, agentId: string, count?: number): Promise<RoomAgentListResponse> {
    const body: RoomAddAgent = { agent_id: agentId, ...(count !== undefined ? { count } : {}) };
    return this._http.request<RoomAgentListResponse>(
      "POST",
      `/v1/agent/rooms/${encodeURIComponent(roomId)}/agents`,
      { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    );
  }

  async removeAgent(roomId: string, agentId: string): Promise<RoomAgentListResponse> {
    return this._http.request<RoomAgentListResponse>(
      "DELETE",
      `/v1/agent/rooms/${encodeURIComponent(roomId)}/agents/${encodeURIComponent(agentId)}`,
    );
  }

  // ── Session creation ──────────────────────────────────────────────────────

  /**
   * Start a new session for this room.
   *
   * Pass `voice_id` to override the agent's default voice for this session.
   *
   * @example
   * const session = await client.agent.rooms.startSession(roomId, { voice_id: "Aria" });
   */
  async startSession(roomId: string, data?: SessionCreate): Promise<SessionResponse> {
    const { voice_id, config, participants } = data ?? {};
    const body = {
      ...(participants !== undefined ? { participants } : {}),
      config: {
        ...config,
        ...(voice_id ? { voice_id } : {}),
      },
    };
    return this._http.request<SessionResponse>(
      "POST",
      `/v1/agent/rooms/${encodeURIComponent(roomId)}/sessions`,
      {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
  }

  /** List all sessions for the given room. */
  async listSessions(roomId: string): Promise<SessionResponse[]> {
    return this._http.request<SessionResponse[]>(
      "GET",
      `/v1/agent/rooms/${encodeURIComponent(roomId)}/sessions`,
    );
  }

  /**
   * Start a session for a multi-agent room and fetch its LiveKit token in a
   * single call — the room-level equivalent of `agent.createVoiceSession()`.
   *
   * Combines `startSession()` + the session livekit-token endpoint so callers
   * get ready-to-connect credentials (`token` + `livekit_url`) without a second
   * round-trip. Session-scoped fields (`voice_id`, `config`, `participants`,
   * `media_overrides`) configure the session; identity fields (`user_id`,
   * `user_name`) and interruption overrides are applied to the LiveKit token.
   *
   * @example
   * const res = await client.agent.rooms.createVoiceSession(roomId, {
   *   user_name: "Website Visitor",
   * });
   * const room = new Room();
   * await room.connect(res.livekit_url, res.token);
   */
  async createVoiceSession(
    roomId: string,
    data?: SessionCreate & LiveKitTokenRequest,
  ): Promise<VoiceSessionResponse> {
    const d = data ?? {};
    const session = await this.startSession(roomId, {
      ...(d.voice_id ? { voice_id: d.voice_id } : {}),
      ...(d.config ? { config: d.config } : {}),
      ...(d.participants ? { participants: d.participants } : {}),
      ...(d.media_overrides ? { media_overrides: d.media_overrides } : {}),
    });

    const tokenReq: LiveKitTokenRequest = {
      ...(d.user_id ? { user_id: d.user_id } : {}),
      ...(d.user_name ? { user_name: d.user_name } : {}),
      ...(d.media_overrides ? { media_overrides: d.media_overrides } : {}),
      ...(d.allow_interruptions !== undefined ? { allow_interruptions: d.allow_interruptions } : {}),
      ...(d.allow_interruptions_opening !== undefined
        ? { allow_interruptions_opening: d.allow_interruptions_opening }
        : {}),
    };
    const hasTokenReq = Object.keys(tokenReq).length > 0;

    const lk = await this._http.request<LiveKitTokenResponse>(
      "POST",
      `/v1/agent/sessions/${encodeURIComponent(session.id)}/livekit-token`,
      hasTokenReq
        ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(tokenReq) }
        : undefined,
    );

    return {
      session_id: lk.session_id ?? session.id,
      room_id: session.room_id,
      token: lk.token,
      room_name: lk.room_name,
      livekit_url: lk.livekit_url,
    };
  }
}
