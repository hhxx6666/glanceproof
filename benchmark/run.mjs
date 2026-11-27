import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { loadEnvFile } from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { makeServer } from '../server.mjs';

const moves = { left: 'Left', right: 'Right' };

export function score(caseInfo, decision, frames) {
  if (decision.action === 'uncertain') return { result: caseInfo.digit === null ? 'correctAbstention' : 'missedTarget' };
  if (decision.action !== 'answer') return { result: 'unfinished' };
  const digit = decision.text.trim().match(/^([1-9])\.?$/)?.[1];
  const citedViews = decision.evidence.map(id => frames.find(frame => frame.id === id)?.view);
  const wrongFrame = !citedViews.length || citedViews.some(view => !caseInfo.evidenceViews.includes(view));
  if (caseInfo.digit === null) return { result: 'falseAnswer', wrongFrame };
  if (digit !== caseInfo.digit) return { result: 'wrongAnswer', wrongFrame };
  return { result: wrongFrame ? 'unsupportedAnswer' : 'correctAnswer', wrongFrame };
}

export async function runCase(caseInfo, decide) {
  const frames = [];
  const decisions = [];
  let view = 'Center';
  for (let step = 1; step <= 3; step++) {
    const image = await readFile(new URL(`./frames/${caseInfo.id}/${view.toLowerCase()}.jpg`, import.meta.url));
    frames.push({ id: step, view, image: 'data:image/jpeg;base64,' + image.toString('base64') });
    const decision = await decide({
      source: 'demo',
      question: `What digit is printed on the ${caseInfo.target}? Reply with one digit if clearly visible. Otherwise seek another view, or choose uncertainty if the digit cannot be established.`,
      frames,
      lastStep: step === 3,
    });
    decisions.push(decision);
    const next = moves[decision.action];
    if (!next || step === 3 || frames.some(frame => frame.view === next)) {
      return { id: caseInfo.id, category: caseInfo.category, views: frames.map(frame => frame.view),
        decisions, ...score(caseInfo, decision, frames) };
    }
    view = next;
  }
}

export async function benchmark(apiKey, model, fetcher) {
  const cases = JSON.parse(await readFile(new URL('./cases.json', import.meta.url), 'utf8'));
  const server = makeServer({ apiKey, model, fetcher });
  const results = [];
  try {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}`;
    const status = await (await fetch(base + '/api/status')).json();
    model = status.model;
    for (const caseInfo of cases) {
      try {
        results.push(await runCase(caseInfo, async payload => {
          const response = await fetch(base + '/api/decide', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
          });
          const body = await response.json();
          if (!response.ok) throw new Error(body.error);
          return body;
        }));
      } catch (error) {
        results.push({ id: caseInfo.id, category: caseInfo.category, result: 'error', error: error.message });
      }
    }
  } finally {
    server.close();
  }
  const counts = Object.fromEntries([
    'correctAnswer', 'correctAbstention', 'wrongFrame', 'missedTarget', 'falseAnswer', 'wrongAnswer',
    'unsupportedAnswer', 'unfinished', 'error',
  ].map(result => [result, results.filter(item => item.result === result || item[result] === true).length]));
  return {
    model, cases: cases.length, answerable: cases.filter(item => item.digit !== null).length,
    targetAbsent: cases.filter(item => item.digit === null).length, counts, results,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url)));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    console.error('Set OPENAI_API_KEY before running the blind benchmark.');
    process.exitCode = 2;
  } else {
    const report = await benchmark(apiKey, process.env.OPENAI_MODEL?.trim() || undefined);
    console.log(JSON.stringify(report, null, 2));
    if (report.counts.error) process.exitCode = 1;
  }
}
