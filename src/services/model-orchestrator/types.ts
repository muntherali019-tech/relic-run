// Shared types for the model-orchestrator service.
//
// A ModelOrchestrator turns a text prompt into a ModelResponse by calling an
// external image-generation provider (or falling back to a mock). Concrete
// orchestrators (e.g. SDXLOrchestrator) implement this contract so callers can
// swap providers without changing call sites.

// The payload an orchestrator returns. `data` is intentionally open-ended
// because providers return different shapes (a hosted URL, inline base64, or an
// unknown raw body); the well-known fields are typed and extra keys are allowed.
export interface ModelResponse {
  id: string;
  data: {
    prompt?: string;
    url?: string;
    base64?: string;
    mime?: string;
    raw?: unknown;
    [key: string]: unknown;
  };
}

export interface ModelOrchestrator {
  generate(prompt: string, opts?: Record<string, any>): Promise<ModelResponse>;
}
