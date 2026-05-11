import { HttpClient } from "./client";
import { ModelInfo } from "./types";

export class LlmApi {
  constructor(private readonly _http: HttpClient) {}

  /** List available LLM models registered in model_management. */
  async listModels(): Promise<ModelInfo[]> {
    return this._http.request<ModelInfo[]>("GET", "/v1/speech/llm/models");
  }
}
