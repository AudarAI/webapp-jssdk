import { HttpClient } from "./client";
import {
  IngestTextRequest,
  KnowledgeCreate,
  KnowledgeDocumentResponse,
  KnowledgeResponse,
  KnowledgeUpdate,
  SearchRequest,
  SearchResultItem,
} from "./types";

export class KnowledgeApi {
  constructor(private readonly _http: HttpClient) {}

  // ── Knowledge CRUD ────────────────────────────────────────────────────────

  async list(): Promise<KnowledgeResponse[]> {
    return this._http.request<KnowledgeResponse[]>("GET", "/v1/agent/knowledge");
  }

  async create(data: KnowledgeCreate): Promise<KnowledgeResponse> {
    return this._http.request<KnowledgeResponse>("POST", "/v1/agent/knowledge", {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  }

  async get(knowledgeId: string): Promise<KnowledgeResponse> {
    return this._http.request<KnowledgeResponse>(
      "GET",
      `/v1/agent/knowledge/${encodeURIComponent(knowledgeId)}`,
    );
  }

  async update(knowledgeId: string, data: KnowledgeUpdate): Promise<KnowledgeResponse> {
    return this._http.request<KnowledgeResponse>(
      "PUT",
      `/v1/agent/knowledge/${encodeURIComponent(knowledgeId)}`,
      {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      },
    );
  }

  async delete(knowledgeId: string): Promise<void> {
    await this._http.request<unknown>(
      "DELETE",
      `/v1/agent/knowledge/${encodeURIComponent(knowledgeId)}`,
    );
  }

  // ── Ingestion ─────────────────────────────────────────────────────────────

  /**
   * Ingest plain text or a URL into the knowledge base.
   * Returns immediately (202); poll `get()` until `embedding_status === "completed"`.
   *
   * @example
   * await client.knowledge.ingest(id, { source_type: "text", text: "..." });
   * await client.knowledge.ingest(id, { source_type: "url", url: "https://..." });
   */
  async ingest(knowledgeId: string, data: IngestTextRequest): Promise<void> {
    await this._http.request<unknown>(
      "POST",
      `/v1/agent/knowledge/${encodeURIComponent(knowledgeId)}/ingest`,
      {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      },
    );
  }

  /**
   * Upload a file (txt, md, pdf, docx) for ingestion.
   * Returns immediately (202); poll `get()` until `embedding_status === "completed"`.
   */
  async ingestFile(knowledgeId: string, file: File | Blob, filename?: string): Promise<void> {
    const formData = new FormData();
    formData.append("file", file, filename ?? (file instanceof File ? file.name : "upload"));
    await this._http.request<unknown>(
      "POST",
      `/v1/agent/knowledge/${encodeURIComponent(knowledgeId)}/ingest-file`,
      { body: formData },
    );
  }

  /**
   * Delete all existing chunks and re-ingest from `source_uri` (URL sources only).
   * Returns immediately (202).
   */
  async reingest(knowledgeId: string): Promise<void> {
    await this._http.request<unknown>(
      "POST",
      `/v1/agent/knowledge/${encodeURIComponent(knowledgeId)}/reingest`,
    );
  }

  // ── Document chunks ───────────────────────────────────────────────────────

  /** List all stored chunks. Embedding vectors are not included. */
  async listDocuments(knowledgeId: string): Promise<KnowledgeDocumentResponse[]> {
    return this._http.request<KnowledgeDocumentResponse[]>(
      "GET",
      `/v1/agent/knowledge/${encodeURIComponent(knowledgeId)}/documents`,
    );
  }

  async deleteDocument(knowledgeId: string, docId: string): Promise<void> {
    await this._http.request<unknown>(
      "DELETE",
      `/v1/agent/knowledge/${encodeURIComponent(knowledgeId)}/documents/${encodeURIComponent(docId)}`,
    );
  }

  // ── Semantic search ───────────────────────────────────────────────────────

  /**
   * Semantic search over the knowledge base.
   * Requires `embedding_status === "completed"`.
   *
   * @example
   * const results = await client.knowledge.search(id, { query: "什么是向量数据库", top_k: 3 });
   * for (const r of results) console.log(r.score, r.content);
   */
  async search(knowledgeId: string, data: SearchRequest): Promise<SearchResultItem[]> {
    return this._http.request<SearchResultItem[]>(
      "POST",
      `/v1/agent/knowledge/${encodeURIComponent(knowledgeId)}/search`,
      {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      },
    );
  }
}
