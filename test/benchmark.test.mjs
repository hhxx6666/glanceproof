import assert from 'node:assert/strict';
import { test } from 'node:test';
import { benchmark, score } from '../benchmark/run.mjs';

test('scores supported answers, incorrect citations and honest abstentions independently', () => {
  const cases = { digit: '7', evidenceViews: ['Right'] };
  const frames = [{ id: 1, view: 'Center' }, { id: 2, view: 'Right' }];
  const answer = { action: 'answer', text: '7.', evidence: [2] };
  assert.equal(score(cases, answer, frames).result, 'groundedAnswer');
  assert.deepEqual(score(cases, { ...answer, evidence: [1, 2] }, frames), {
    result: 'unsupportedAnswer', correctAnswer: true, wrongFrame: true,
  });
  assert.equal(score(cases, { ...answer, text: '2' }, frames).result, 'wrongAnswer');
  assert.equal(score(cases, { action: 'uncertain' }, frames).result, 'missedTarget');
  assert.equal(score({ digit: null }, { action: 'uncertain' }, frames).result, 'correctAbstention');
  assert.equal(score(cases, { action: 'right' }, frames).result, 'unfinished');
});

test('runs the six held-out cases through the server without exposing the answer key', async () => {
  const scripted = [
    ['right'], ['answer', '7', [2]],
    ['answer', '3', [1]],
    ['uncertain'],
    ['left'], ['answer', '8', [2]],
    ['answer', '4', [1]],
    ['right'], ['answer', '2', [2]],
  ];
  const report = await benchmark('test-key', 'test-model', async (_url, options) => {
    const payload = JSON.parse(options.body);
    for (const key of ['evidenceViews', 'category', 'desk-01']) assert.ok(!options.body.includes(key));
    assert.match(payload.input[0].content[0].text, /^Question: What digit/);
    assert.match(payload.input[0].content[2].image_url, /^data:image\/jpeg;base64,\/9j\//);
    const [action, text = 'Looking for evidence.', evidence = []] = scripted.shift();
    return Response.json({ output: [{ content: [{ type: 'output_text', text: JSON.stringify({ action, text, evidence }) }] }] });
  });
  assert.equal(scripted.length, 0);
  assert.equal(report.cases, 6);
  assert.equal(report.answerable, 4);
  assert.equal(report.targetAbsent, 2);
  assert.equal(report.answers, 5);
  assert.deepEqual(report.counts, {
    correctAnswer: 3, groundedAnswer: 2, correctAbstention: 1, wrongFrame: 2, missedTarget: 0, falseAnswer: 1,
    wrongAnswer: 1, unsupportedAnswer: 1, unfinished: 0, error: 0,
  });
});
