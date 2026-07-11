import nock from 'nock';
import { SDXLOrchestrator } from '../../src/services/model-orchestrator/orchestrator';

describe('SDXLOrchestrator integration (mock)', () => {
  it('calls external api and returns url', async () => {
    const apiUrl = 'http://mock-sdxl.test';
    const modelId = 'sdxl-beta-v1';
    const scope = nock(apiUrl)
      .post(`/v1/generation/${modelId}/text-to-image`)
      .reply(200, { output: [{ url: 'https://cdn.example.com/render1.png' }] })
      .persist();

    const orchestrator = new SDXLOrchestrator({ apiUrl, apiKey: 'key', modelId });
    const res = await orchestrator.generate('test prompt');
    expect(res.data.url).toBe('https://cdn.example.com/render1.png');
    scope.done();
  });
});
