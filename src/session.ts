import { HttpClient } from "./client";
import { SessionResponse, SessionWithContextResponse, SessionListResponse, Participant, MessageCreate, MessageResponse, MessageListResponse, LiveKitTokenResponse, LiveKitTokenRequest, ModeratorDispatchRequest, ModeratorDispatchResponse, RecordingInfo, ReplyToMemberRequest, ParticipantContextUpsert, ParticipantContextResponse, ParticipantContextPrivateResponse, SessionActionCreate, SessionActionResponse, ActionCountsResponse } from "./types";

export class SessionApi {
  constructor(private readonly _http: HttpClient) {}

  // ── Session lifecycle ─────────────────────────────────────────────────────

  /** List all sessions for the tenant, with associated room and agent context. */
  async list(params?: { status?: string; page?: number; page_size?: number }): Promise<SessionListResponse> {
    return this._http.request<SessionListResponse>("GET", "/v1/agent/sessions", {
      query: params as Record<string, string | number | undefined>,
    });
  }

  /** List the logged-in user's own sessions, optionally filtered by agent. */
  async listMine(params?: { agent_id?: string; status?: string; page?: number; page_size?: number }): Promise<SessionListResponse> {
    return this._http.request<SessionListResponse>("GET", "/v1/agent/sessions/me", {
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

  /**
   * Get recording metadata for a session.
   *
   * Returns `status: "pending"` while LiveKit egress is still uploading,
   * `status: "ready"` (with a presigned `presigned_url`) once the MP4 is in S3,
   * or `status: "failed"` if egress aborted. Throws 404 if this session was
   * never recorded (e.g. the agent's `media_policy.recording_enabled` was false
   * and no per-session override turned it on).
   */
  async getRecording(sessionId: string): Promise<RecordingInfo> {
    return this._http.request<RecordingInfo>(
      "GET",
      `/v1/agent/sessions/${encodeURIComponent(sessionId)}/recording`,
    );
  }

  /** List participants currently in the session. */
  async getParticipants(sessionId: string): Promise<Participant[]> {
    return this._http.request<Participant[]>("GET", `/v1/agent/sessions/${encodeURIComponent(sessionId)}/participants`);
  }

  // ── Participant Context ────────────────────────────────────────────────────

  /**
   * List participant contexts for a session.
   * Pass `include_private: true` to include private_data, instruction_override, and config_override
   * (requires tenant admin permissions).
   */
  async listParticipantContexts(
    sessionId: string,
    params?: { include_private?: boolean },
  ): Promise<ParticipantContextResponse[] | ParticipantContextPrivateResponse[]> {
    return this._http.request<ParticipantContextResponse[]>(
      "GET",
      `/v1/agent/sessions/${encodeURIComponent(sessionId)}/participants/context`,
      { query: params as Record<string, boolean | undefined> },
    );
  }

  /** Create or update the context for a specific participant (identified by ref_id). */
  async upsertParticipantContext(
    sessionId: string,
    refId: string,
    data: ParticipantContextUpsert,
  ): Promise<ParticipantContextPrivateResponse> {
    return this._http.request<ParticipantContextPrivateResponse>(
      "PUT",
      `/v1/agent/sessions/${encodeURIComponent(sessionId)}/participants/${encodeURIComponent(refId)}/context`,
      {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      },
    );
  }

  /** Delete the context for a specific participant. */
  async deleteParticipantContext(sessionId: string, refId: string): Promise<void> {
    await this._http.request<unknown>(
      "DELETE",
      `/v1/agent/sessions/${encodeURIComponent(sessionId)}/participants/${encodeURIComponent(refId)}/context`,
    );
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

  /**
   * Moderator-led mode: human moderator explicitly triggers a specific agent to respond.
   *
   * Sends a dispatch command to the voice worker via LiveKit data channel.
   * The agent will generate a reply based on the session's recent message history.
   *
   * Requires the session to be in `running` state and `talking_style` to be `"moderator-led"`.
   *
   * @param sessionId - The active session ID.
   * @param data.agent_id - UUID of the agent to trigger.
   */
  async dispatch(sessionId: string, data: ModeratorDispatchRequest): Promise<ModeratorDispatchResponse> {
    return this._http.request<ModeratorDispatchResponse>(
      "POST",
      `/v1/agent/sessions/${encodeURIComponent(sessionId)}/dispatch`,
      { headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) },
    );
  }

  /**
   * Direct a specific agent to reply (moderator-led dispatch).
   *
   * The agent replies based on the session's recent message history.
   * Requires the session's `talking_style` to be `"moderator_led"`.
   *
   * @example
   * await session.replyToMember(sessionId, { target_ref_id: agentId });
   */
  async replyToMember(sessionId: string, data: ReplyToMemberRequest): Promise<ModeratorDispatchResponse> {
    return this.dispatch(sessionId, { agent_id: data.target_ref_id });
  }

  // ── Session Actions ────────────────────────────────────────────────────────

  /**
   * Record a participant action (vote, answer, score, etc.) for this session.
   * A UNIQUE constraint prevents duplicate actions per actor/type/round.
   */
  async createAction(sessionId: string, data: SessionActionCreate): Promise<SessionActionResponse> {
    return this._http.request<SessionActionResponse>(
      "POST",
      `/v1/agent/sessions/${encodeURIComponent(sessionId)}/actions`,
      {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      },
    );
  }

  /** List all actions for a session, optionally filtered by action_type and/or round. */
  async listActions(
    sessionId: string,
    params?: { action_type?: string; round?: number },
  ): Promise<SessionActionResponse[]> {
    return this._http.request<SessionActionResponse[]>(
      "GET",
      `/v1/agent/sessions/${encodeURIComponent(sessionId)}/actions`,
      { query: params as Record<string, string | number | undefined> },
    );
  }

  /** Get aggregated action counts for a session, grouped by target participant. */
  async getActionCounts(
    sessionId: string,
    params: { action_type: string; round: number },
  ): Promise<ActionCountsResponse> {
    return this._http.request<ActionCountsResponse>(
      "GET",
      `/v1/agent/sessions/${encodeURIComponent(sessionId)}/actions/counts`,
      { query: params as Record<string, string | number> },
    );
  }
}
