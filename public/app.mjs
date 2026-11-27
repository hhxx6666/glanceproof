import { drawDesk, offlineDecision, TASKS, viewName, visible, VIEWS } from './desk.mjs';

const byId = id => document.getElementById(id);
const canvas = byId('desk');
const video = byId('video');
const review = byId('review');
const engine = byId('engine');
const actionButton = byId('run');
const question = byId('question');
const captureCanvas = document.createElement('canvas');
const positionMarkers = [...byId('positions').children];
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const moves = {
  left: 'Look left', right: 'Look right', up: 'Look up', down: 'Look down',
  closer: 'Move closer', farther: 'Move back', reframe: 'Change the angle',
};

let source = 'demo';
let task = TASKS[0];
let session;
let selectedFrame;
let pose = VIEWS[1];
let cameraVersion = 0;
let opening = false;
let stream;
let gptAvailable = false;

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function button(label, handler, className) {
  const node = element('button', label, className);
  node.type = 'button';
  node.addEventListener('click', handler);
  return node;
}

const targetButtons = TASKS.map(target => {
  const node = button(target.label, () => {
    task = target;
    reset();
  });
  node.dataset.task = target.id;
  byId('targets').append(node);
  return node;
});

function showError(message) {
  byId('error').textContent = message;
  byId('error').hidden = !message;
}

function updateView() {
  canvas.hidden = source !== 'demo' || !!selectedFrame;
  video.hidden = source !== 'camera' || !stream || !!selectedFrame;
  byId('camera-empty').hidden = source !== 'camera' || !!stream || !!selectedFrame;
  review.hidden = !selectedFrame;
  if (selectedFrame) {
    review.src = selectedFrame.image;
    review.alt = `Captured frame ${selectedFrame.id} · ${selectedFrame.view}`;
  } else {
    review.removeAttribute('src');
  }
  byId('view-label').textContent = selectedFrame
    ? `Frame ${selectedFrame.id} · ${selectedFrame.view}`
    : source === 'demo' ? `${viewName(pose)} view` : stream ? 'Live preview' : 'Camera off';
  const markedPose = selectedFrame?.pose ?? pose;
  positionMarkers.forEach((node, i) => node.classList.toggle('current', markedPose === VIEWS[i]));
  byId('live').hidden = !selectedFrame;
  document.querySelectorAll('.frame').forEach(node => {
    node.setAttribute('aria-pressed', String(Number(node.dataset.frame) === selectedFrame?.id));
  });
}

function updateControls() {
  const running = session?.status === 'running';
  const working = running && !session.waiting;
  for (const node of targetButtons) {
    node.disabled = running;
    node.setAttribute('aria-pressed', String(node.dataset.task === task.id));
  }
  engine.disabled = running;
  question.disabled = running;
  byId('stop').hidden = !running;
  byId('export').disabled = running || !session?.frames.length;
  byId('camera-power').disabled = opening;
  byId('camera-power').textContent = opening ? 'Opening webcam…' : stream ? 'Turn webcam off' : 'Turn webcam on';
  actionButton.disabled = !!working || (source === 'camera' && (!stream || !gptAvailable || !question.value.trim()));
  const label = source === 'demo' ? running ? 'Searching…' : 'Run search'
    : working ? 'Checking frame…' : session?.waiting ? 'Capture next frame' : 'Capture & ask';
  actionButton.firstChild.textContent = `${label} `;
}

function updateLog() {
  const log = byId('log');
  const count = session?.frames.length ?? 0;
  byId('count').textContent = `${count} ${count === 1 ? 'frame' : 'frames'}`;
  byId('log-empty').hidden = count > 0;
  log.replaceChildren();
  for (const event of session?.events ?? []) {
    const item = element('li');
    if (event.frame) {
      const frame = event.frame;
      const node = button('', () => { selectedFrame = frame; updateView(); }, 'frame');
      node.dataset.frame = frame.id;
      const title = element('strong', `Frame ${frame.id} · ${frame.view}`);
      const photo = element('img');
      photo.src = frame.image;
      photo.alt = '';
      const caption = element('div');
      caption.append(title, element('span', frame.id === 1 ? 'Starting view' : 'After camera move'));
      node.append(photo, caption);
      item.append(node);
    } else {
      item.className = 'move';
      item.append(element('strong', moves[event.action]), document.createTextNode(` · ${event.text}`));
    }
    log.append(item);
  }
  const baseline = byId('baseline');
  baseline.hidden = source !== 'demo' || !count;
  if (!baseline.hidden) {
    baseline.textContent = visible(session.frames[0].pose, session.task)
      ? 'The target is visible in the first frame.' : 'The first frame misses the target.';
  }
  const result = byId('result');
  result.replaceChildren();
  if (session?.decision) {
    const { action, text, evidence } = session.decision;
    const title = moves[action] ?? { answer: 'Answer', uncertain: 'Insufficient evidence', stopped: 'Run stopped' }[action];
    result.append(element('strong', title), element('p', text));
    for (const id of evidence) {
      result.append(button(`View evidence · Frame ${id}`, () => {
        selectedFrame = session.frames.find(frame => frame.id === id);
        updateView();
      }, 'evidence'));
    }
  }
  updateView();
  updateControls();
}

function reset() {
  session?.abort.abort();
  session = undefined;
  selectedFrame = undefined;
  pose = VIEWS[1];
  drawDesk(canvas, pose);
  showError('');
  updateLog();
}

function closeCamera() {
  ++cameraVersion;
  opening = false;
  stream?.getTracks().forEach(track => track.stop());
  stream = undefined;
  video.srcObject = null;
}

function setSource(next) {
  if (source === next) return;
  closeCamera();
  source = next;
  const demo = source === 'demo';
  byId('demo-tab').setAttribute('aria-pressed', String(demo));
  byId('camera-tab').setAttribute('aria-pressed', String(!demo));
  for (const id of ['positions', 'demo-controls', 'engine-wrap']) byId(id).hidden = !demo;
  for (const id of ['camera-controls', 'question-controls']) byId(id).hidden = demo;
  byId('intro-copy').textContent = demo
    ? 'A camera that changes its point of view, then shows you the frame behind its answer.'
    : 'Show GPT a frame. If it needs a better angle, move the camera and capture again.';
  reset();
  if (!demo && !gptAvailable) showError('For GPT analysis, set OPENAI_API_KEY on the server and reload this page.');
}

async function startCamera() {
  if (stream) {
    closeCamera();
    if (session?.status === 'running') stopRun();
    updateView();
    updateControls();
    return;
  }
  const version = ++cameraVersion;
  opening = true;
  showError('');
  updateControls();
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Webcam access requires a supported browser on localhost.');
    const newStream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 } }, audio: false });
    if (version !== cameraVersion) {
      newStream.getTracks().forEach(track => track.stop());
      return;
    }
    stream = newStream;
    for (const track of stream.getVideoTracks()) {
      track.addEventListener('ended', () => {
        if (version !== cameraVersion) return;
        closeCamera();
        if (session?.status === 'running') stopRun();
        showError('The webcam disconnected.');
        updateView();
        updateControls();
      });
    }
    video.srcObject = stream;
    await video.play();
    if (version !== cameraVersion) return;
    selectedFrame = undefined;
    if (!gptAvailable) showError('For GPT analysis, set OPENAI_API_KEY on the server and reload this page.');
  } catch (error) {
    if (version !== cameraVersion) return;
    closeCamera();
    showError(error.name === 'NotAllowedError' ? 'Allow webcam access in the browser to turn it on.' : error.message);
  } finally {
    if (version === cameraVersion) opening = false;
    updateView();
    updateControls();
  }
}

function startRun() {
  reset();
  session = {
    source, task, question: source === 'demo' ? task.question : question.value.trim(),
    engine: source === 'demo' ? engine.value : 'gpt',
    status: 'running', frames: [], events: [], abort: new AbortController(),
  };
  updateControls();
  return session;
}

function capture(run) {
  const desk = run.source === 'demo';
  let image;
  if (desk) {
    image = canvas.toDataURL('image/jpeg', 0.83);
  } else {
    if (!video.videoWidth || video.readyState < 2) throw new Error('Wait for the webcam preview, then capture again.');
    const scale = Math.min(1, 960 / Math.max(video.videoWidth, video.videoHeight));
    captureCanvas.width = Math.round(video.videoWidth * scale);
    captureCanvas.height = Math.round(video.videoHeight * scale);
    captureCanvas.getContext('2d').drawImage(video, 0, 0, captureCanvas.width, captureCanvas.height);
    image = captureCanvas.toDataURL('image/jpeg', 0.8);
  }
  const frame = { id: run.frames.length + 1, image, view: desk ? viewName(pose) : 'Webcam', pose: desk ? pose : null };
  run.frames.push(frame);
  run.events.push({ frame });
  updateLog();
}

async function decide(run, lastStep) {
  if (run.engine === 'offline') return offlineDecision(run.task, run.frames);
  const frames = run.frames.map(({ id, view, image }) => ({ id, view, image }));
  const response = await fetch('/api/decide', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source: run.source, question: run.question, frames, lastStep }),
    signal: run.abort.signal,
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error);
  return body;
}

function finish(run, decision) {
  run.decision = decision;
  run.waiting = false;
  run.status = 'done';
  if (decision.evidence.length) selectedFrame = run.frames.find(frame => frame.id === decision.evidence[0]);
  updateLog();
}

function stopRun() {
  if (session?.status !== 'running') return;
  session.abort.abort();
  finish(session, { action: 'stopped', text: 'Captured frames are still available for review.', evidence: [] });
}

function failRun(run, error) {
  if (run !== session || run.abort.signal.aborted) return;
  run.status = 'error';
  run.waiting = false;
  run.decision = undefined;
  updateLog();
  showError(error.message || 'The run failed. Try again.');
}

function animateTo(run, next) {
  const from = pose;
  const duration = 750;
  if (document.hidden || reducedMotion.matches) {
    pose = next;
    drawDesk(canvas, pose);
    updateView();
    return Promise.resolve();
  }
  return new Promise(resolve => {
    let start;
    let frame;
    const settle = moved => {
      cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', visibilityChanged);
      run.abort.signal.removeEventListener('abort', stopped);
      if (moved) pose = next;
      drawDesk(canvas, pose);
      updateView();
      resolve();
    };
    const visibilityChanged = () => { if (document.hidden) settle(true); };
    const stopped = () => settle(false);
    const step = time => {
      start ??= time;
      const fraction = Math.min(1, (time - start) / duration);
      drawDesk(canvas, from + (next - from) * (1 - (1 - fraction) ** 3));
      if (fraction < 1) frame = requestAnimationFrame(step);
      else settle(true);
    };
    document.addEventListener('visibilitychange', visibilityChanged);
    run.abort.signal.addEventListener('abort', stopped, { once: true });
    frame = requestAnimationFrame(step);
  });
}

function atLimit() {
  return { action: 'uncertain', text: 'The available views did not establish an answer.', evidence: [] };
}

async function runDemo() {
  const run = startRun();
  try {
    for (let count = 1; count <= VIEWS.length; count++) {
      capture(run);
      const decision = await decide(run, count === VIEWS.length);
      if (run !== session || run.abort.signal.aborted) return;
      if (!moves[decision.action]) return finish(run, decision);
      const next = decision.action === 'left' ? VIEWS[0] : VIEWS[2];
      if (count === VIEWS.length || run.frames.some(frame => frame.pose === next)) return finish(run, atLimit());
      run.events.push(decision);
      selectedFrame = undefined;
      updateLog();
      await animateTo(run, next);
      if (run !== session || run.abort.signal.aborted) return;
    }
  } catch (error) {
    failRun(run, error);
  }
}

async function runCamera() {
  const run = session?.waiting ? session : startRun();
  run.waiting = false;
  run.decision = undefined;
  selectedFrame = undefined;
  updateView();
  updateControls();
  try {
    capture(run);
    const lastStep = run.frames.length === 4;
    const decision = await decide(run, lastStep);
    if (run !== session || run.abort.signal.aborted) return;
    if (!moves[decision.action]) return finish(run, decision);
    if (lastStep) return finish(run, atLimit());
    run.events.push(decision);
    run.waiting = true;
    run.decision = decision;
    updateLog();
  } catch (error) {
    failRun(run, error);
  }
}

function exportRun() {
  const { source, engine, question, frames, events, decision, status } = session;
  const file = new Blob([JSON.stringify({
    version: 1, source, engine, question, status, frames,
    events: events.map(event => event.frame ? { frameId: event.frame.id } : event), decision,
  }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(file);
  const download = element('a');
  download.href = url;
  download.download = 'glanceproof-run.json';
  download.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

byId('demo-tab').addEventListener('click', () => setSource('demo'));
byId('camera-tab').addEventListener('click', () => setSource('camera'));
byId('camera-power').addEventListener('click', startCamera);
byId('live').addEventListener('click', () => { selectedFrame = undefined; updateView(); });
byId('stop').addEventListener('click', stopRun);
byId('export').addEventListener('click', exportRun);
engine.addEventListener('change', reset);
question.addEventListener('input', updateControls);
byId('controls').addEventListener('submit', event => {
  event.preventDefault();
  if (actionButton.disabled) return;
  if (source === 'demo') runDemo();
  else runCamera();
});
window.addEventListener('pagehide', () => {
  closeCamera();
  if (session?.status === 'running') stopRun();
  updateView();
  updateControls();
});

reset();
try {
  const response = await fetch('/api/status');
  if (!response.ok) throw new Error('Status unavailable');
  const status = await response.json();
  gptAvailable = status.gpt;
  if (gptAvailable) {
    engine.options[1].disabled = false;
    engine.options[1].textContent = `GPT · ${status.model}`;
    if (source === 'camera') showError('');
  }
  updateControls();
} catch {
  // The tabletop still runs when the status endpoint is unavailable.
}
