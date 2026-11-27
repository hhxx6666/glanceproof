import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { makeServer } from '../server.mjs';
import { TASKS, VIEWS, offlineDecision, visible } from '../public/desk.mjs';

test('the tabletop reaches every target and cites a view where the target is visible', () => {
  for (const task of TASKS) {
    const frames = [{ id: 1, pose: VIEWS[1] }];
    const visited = new Set([VIEWS[1]]);
    assert.equal(visible(frames[0].pose, task), false);
    let decision = offlineDecision(task, frames);
    while (decision.action === 'left' || decision.action === 'right') {
      const pose = decision.action === 'left' ? VIEWS[0] : VIEWS[2];
      assert.ok(!visited.has(pose));
      visited.add(pose);
      frames.push({ id: frames.length + 1, pose });
      decision = offlineDecision(task, frames);
    }
    assert.equal(decision.action, 'answer');
    assert.ok(visible(frames[decision.evidence[0] - 1].pose, task));
    assert.deepEqual(decision.evidence, [task.id === 'key' ? 2 : 3]);
  }
});

async function local(t, options) {
  const server = makeServer(options);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

const sample = {
  source: 'camera', question: 'Where is the red mug?', lastStep: false,
  frames: [{ id: 1, view: 'Webcam', image: 'data:image/jpeg;base64,AAAA' }],
};

function send(url, payload, headers = {}) {
  return fetch(`${url}/api/decide`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(payload),
  });
}

test('serves the offline app even without an API key', async t => {
  const url = await local(t);
  assert.equal((await (await fetch(`${url}/api/status`)).json()).gpt, false);
  assert.match(await (await fetch(url)).text(), /Look before you answer/);
  assert.equal((await send(url, sample)).status, 503);
});

test('passes captured frames to the Responses API and validates returned citations', async t => {
  const calls = [];
  const decisions = [
    { action: 'left', text: 'Move left to see the rest of the desk.', evidence: [] },
    { action: 'answer', text: 'The red mug is beside the notebook.', evidence: [2] },
    { action: 'answer', text: 'The red mug is beside the notebook.', evidence: [3] },
  ];
  const url = await local(t, {
    apiKey: 'test-key',
    fetcher: async (endpoint, init) => {
      assert.equal(endpoint, 'https://api.openai.com/v1/responses');
      calls.push(JSON.parse(init.body));
      return Response.json({ output: [{ type: 'message', content: [
        { type: 'output_text', text: JSON.stringify(decisions.shift()) },
      ] }] });
    },
  });
  assert.equal((await send(url, sample, { Origin: 'https://example.com' })).status, 403);
  assert.equal((await send(url, { ...sample, frames: [] })).status, 400);
  const tooMany = Array.from({ length: 5 }, (_, index) => ({ ...sample.frames[0], id: index + 1 }));
  assert.equal((await send(url, { ...sample, frames: tooMany })).status, 400);
  assert.equal((await (await send(url, sample)).json()).action, 'left');
  const followup = { ...sample, frames: [...sample.frames, { ...sample.frames[0], id: 2 }] };
  assert.deepEqual((await (await send(url, followup)).json()).evidence, [2]);
  assert.equal((await send(url, followup)).status, 502);
  assert.equal(calls[1].store, false);
  assert.equal(calls[1].input[0].content.filter(item => item.type === 'input_image').length, 2);
  assert.deepEqual(calls[1].text.format.schema.properties.evidence.items.enum, [1, 2]);
});
