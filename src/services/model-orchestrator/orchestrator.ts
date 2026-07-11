import axios from 'axios';
import { ModelOrchestrator, ModelResponse } from './types';

export class SDXLOrchestrator implements ModelOrchestrator {
  apiKey?: string;
  apiUrl?: string;
  modelId: string;
  timeout = 60_000;

  constructor(opts: { apiUrl?: string; apiKey?: string; modelId?: string } = {}) {
    this.apiKey = opts.apiKey || process.env.SDXL_API_KEY;
    this.apiUrl = opts.apiUrl || process.env.SDXL_API_URL || 'https://api.stability.ai';
    this.modelId = opts.modelId || process.env.SDXL_MODEL || 'sdxl-beta-v1';
  }

  private async post(path: string, payload: any) {
    if (!this.apiUrl) {
      // fallback to mock
      return { data: { url: `mock://sdxl/${Date.now()}` } };
    }
    const url = this.apiUrl.replace(/\/$/, '') + path;
    const headers: any = { 'Content-Type': 'application/json' };
    if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;
    const resp = await axios.post(url, payload, { headers, timeout: this.timeout });
    return resp;
  }

  /**
   * Generate an image using Stability SDXL-compatible endpoint. Supports options: seed, steps, cfg_scale, negative_prompt
   */
  async generate(prompt: string, opts: any = {}): Promise<ModelResponse> {
    try {
      const payload = {
        text_prompts: [
          {
            text: prompt,
            weight: 1
          }
        ],
        cfg_scale: opts.cfg_scale ?? 7,
        clip_guidance_preset: opts.clip_guidance_preset ?? 'FAST_BLUE',
        height: opts.height ?? 1024,
        width: opts.width ?? 1024,
        samples: 1,
        steps: opts.steps ?? 28,
        seed: opts.seed ?? Math.floor(Math.random() * 1_000_000_000)
      };

      // If negative prompt provided, include as a negative text prompt (some providers use negative_prompt)
      if (opts.negative_prompt) {
        (payload as any).text_prompts.push({ text: "NOT: " + opts.negative_prompt, weight: -1 });
      }

      // Stability-style endpoint path
      const path = `/v1/generation/${this.modelId}/text-to-image`;
      const resp = await this.post(path, payload);

      // Handle common response shapes
      // 1) { artifacts: [{ base64: '...', mime: 'image/png' }] }
      if (resp.data && resp.data.artifacts && Array.isArray(resp.data.artifacts) && resp.data.artifacts[0].base64) {
        const artifact = resp.data.artifacts[0];
        return { id: `sdxl-${Date.now()}`, data: { prompt, base64: artifact.base64, mime: artifact.mime || 'image/png' } };
      }

      // 2) { output: [{ url: 'https://...' }] } OR { url: '...' }
      const url = resp.data.output?.[0]?.url || resp.data.url || resp.data.result?.[0]?.url || null;
      if (url) return { id: `sdxl-${Date.now()}`, data: { prompt, url } };

      // 3) unknown shape — return raw body
      return { id: `sdxl-${Date.now()}`, data: { prompt, raw: resp.data } };
    } catch (err) {
      console.warn('SDXL generate failed, returning mock', err instanceof Error ? err.message : err);
      return { id: `sdxl-mock-${Date.now()}`, data: { prompt, url: `mock://sdxl/${Date.now()}` } };
    }
  }
}
