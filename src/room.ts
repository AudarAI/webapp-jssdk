import { HttpClient } from "./client";
import { RoomCreate, RoomUpdate, RoomResponse, RoomAddAgent, RoomAgentListResponse, SessionCreate, SessionResponse } from "./types";

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

  // ── Room agents ───────────────────────────────────────────────────────────

  async listAgents(roomId: string): Promise<RoomAgentListResponse> {
    return this._http.request<RoomAgentListResponse>("GET", `/v1/agent/rooms/${encodeURIComponent(roomId)}/agents`);
  }

  async addAgent(roomId: string, agentId: string): Promise<RoomAgentListResponse> {
    const body: RoomAddAgent = { agent_id: agentId };
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
   * @example
   * const session = await client.agent.rooms.startSession(roomId, { config: {}, participants: [] });
   */
  async startSession(roomId: string, data?: SessionCreate): Promise<SessionResponse> {
    return this._http.request<SessionResponse>(
      "POST",
      `/v1/agent/rooms/${encodeURIComponent(roomId)}/sessions`,
      {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data ?? {}),
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
}
