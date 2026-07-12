import test from 'node:test';
import assert from 'node:assert/strict';
import nock from 'nock';
import { SDXLOrchestrator } from '../../src/services/model-orchestrator/orchestrator.ts';

test('SDXLOrchestrator calls the external API and returns the image url', async () => {
  const apiUrl = 'http://mock-sdxl.test';
  const modelId = 'sdxl-beta-v1';
  const scope = nock(apiUrl)
    .post(`/v1/generation/${modelId}/text-to-image`)
    .reply(200, { output: [{ url: 'https://cdn.example.com/render1.png' }] })
    .persist();

  const orchestrator = new SDXLOrchestrator({ apiUrl, apiKey: 'key', modelId });
  const res = await orchestrator.generate('test prompt');

  assert.equal(res.data.url, 'https://cdn.example.com/render1.png');
  scope.done();
  nock.cleanAll();
});
