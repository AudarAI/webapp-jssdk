import { HttpClient } from "./client";
import { SessionResponse, SessionWithContextResponse, SessionListResponse, Participant, MessageCreate, MessageResponse, MessageListResponse, LiveKitTokenResponse, LiveKitTokenRequest } from "./types";

export class SessionApi {
  constructor(private readonly _http: HttpClient) {}

  // ── Session lifecycle ─────────────────────────────────────────────────────

  /** List all sessions for the tenant, with associated room and agent context. */
  async list(params?: { status?: string; page?: number; page_size?: number }): Promise<SessionListResponse> {
    return this._http.request<SessionListResponse>("GET", "/v1/agent/sessions", {
      query: params as Record<string, string | number | undefined>,
    });
  }

  async get(sessionId: string): Promise<SessionResponse> {
    return this._http.request<SessionResponse>("GET", `/v1/agent/sessions/${encodeURIComponent(sessionId)}`);
  }

  async pause(sessionId: string): Promise<SessionResponse> {
    return this._http.request<SessionResponse>("POST", `/v1/agent/sessions/${encodeURIComponent(sessionId)}/pause`);
  }

  async resume(sessionId: string): Promise<SessionResponse> {
    return this._http.request<SessionResponse>("POST", `/v1/agent/sessions/${encodeURIComponent(sessionId)}/resume`);
  }

  async end(sessionId: string): Promise<SessionResponse> {
    return this._http.request<SessionResponse>("POST", `/v1/agent/sessions/${encodeURIComponent(sessionId)}/end`);
  }

  /** List participants currently in the session. */
  async getParticipants(sessionId: string): Promise<Participant[]> {
    return this._http.request<Participant[]>("GET", `/v1/agent/sessions/${encodeURIComponent(sessionId)}/participants`);
  }

  // ── Messages ──────────────────────────────────────────────────────────────

  async listMessages(
    sessionId: string,
    params?: { page?: number; page_size?: number },
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
   *
   * @param data - Optional user identity for the LiveKit participant.
   *   `user_id`: used as LiveKit participant identity (defaults to the authenticated user's ID).
   *   `user_name`: display name shown in the room (defaults to the authenticated user's name).
   *   Third-party integrations should pass their end-user's ID/name here to avoid identity conflicts.
   */
  async getLiveKitToken(sessionId: string, data?: LiveKitTokenRequest): Promise<LiveKitTokenResponse> {
    return this._http.request<LiveKitTokenResponse>(
      "POST",
      `/v1/agent/sessions/${encodeURIComponent(sessionId)}/livekit-token`,
      data ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) } : undefined,
    );
  }

  /**
   * Join an already-active session as a new participant.
   *
   * Use this when a session is already in `preparing` or `running` state
   * (i.e. another user has already called `getLiveKitToken`).
   * Returns a LiveKit token for the existing room without re-creating it.
   *
   * @param data - Optional user identity for the new LiveKit participant.
   */
  async join(sessionId: string, data?: LiveKitTokenRequest): Promise<LiveKitTokenResponse> {
    return this._http.request<LiveKitTokenResponse>(
      "POST",
      `/v1/agent/sessions/${encodeURIComponent(sessionId)}/join`,
      data ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) } : undefined,
    );
  }
}
