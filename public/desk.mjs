export const WIDTH = 720;
export const HEIGHT = 432;
export const VIEWS = [-510, 0, 510];

export const TASKS = [
  { id: 'key', label: 'Brass key', question: 'Where is the brass key?', x: -538, y: 262,
    answer: 'The brass key is on the left side of the desk, beside the open notebook.' },
  { id: 'die', label: 'Blue die', question: 'Where is the blue die?', x: 530, y: 223,
    answer: 'The blue die is on the right side of the desk, beside the headphones.' },
  { id: 'clip', label: 'Green clip', question: 'Where is the green clip?', x: 589, y: 326,
    answer: 'The green clip is on the right side of the desk, below the headphones.' },
];

export function visible(pose, task) {
  return Math.abs(task.x - pose) + 40 <= WIDTH / 2;
}

export function offlineDecision(task, frames) {
  const proof = frames.findLast(frame => visible(frame.pose, task));
  if (proof) return { action: 'answer', text: task.answer, evidence: [proof.id] };
  const next = [VIEWS[0], VIEWS[2]].find(pose => !frames.some(frame => frame.pose === pose));
  if (next === undefined) {
    return { action: 'uncertain', text: 'I could not locate the target in the available views.', evidence: [] };
  }
  const direction = next < frames.at(-1).pose ? 'left' : 'right';
  return { action: direction, text: `The ${task.label.toLowerCase()} is outside the current view.`, evidence: [] };
}

export function viewName(pose) {
  return pose < 0 ? 'Left' : pose > 0 ? 'Right' : 'Center';
}

function rounded(ctx, x, y, w, h, r, fill, stroke) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
}

function ellipse(ctx, x, y, rx, ry, fill) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

function place(ctx, x, y, angle, draw) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  draw();
  ctx.restore();
}

function shadow(ctx, draw) {
  ctx.save();
  ctx.shadowColor = '#37291766';
  ctx.shadowBlur = 19;
  ctx.shadowOffsetX = 7;
  ctx.shadowOffsetY = 11;
  draw();
  ctx.restore();
}

function notebook(ctx, x, y, angle, open) {
  place(ctx, x, y, angle, () => {
    const w = open ? 194 : 133;
    shadow(ctx, () => rounded(ctx, -w / 2, -68, w, 136, 6, '#4b594d'));
    if (!open) {
      rounded(ctx, -w / 2 + 8, -66, 116, 130, 4, '#607469');
      rounded(ctx, -22, -34, 61, 30, 2, '#d8d3b7');
      rounded(ctx, -14, -25, 45, 1, 1, '#a49f86');
      rounded(ctx, -14, -18, 27, 1, 1, '#a49f86');
      return;
    }
    rounded(ctx, -92, -65, 91, 126, 4, '#f2e8cc');
    rounded(ctx, 1, -65, 91, 126, 4, '#fff2d1');
    for (let i = -42; i < 52; i += 11) {
      rounded(ctx, -80, i, 65, 1, 1, '#c5bca3');
      rounded(ctx, 15, i, 66, 1, 1, '#cfc4a7');
    }
    rounded(ctx, -3, -63, 6, 124, 2, '#d2c3a1');
  });
}

function headphones(ctx) {
  place(ctx, 666, 200, 0.22, () => {
    ctx.save();
    ctx.lineWidth = 16;
    ctx.strokeStyle = '#292d2b';
    shadow(ctx, () => {
      ctx.beginPath();
      ctx.ellipse(0, 3, 52, 60, 0, Math.PI, Math.PI * 2);
      ctx.stroke();
    });
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#596059';
    ctx.beginPath();
    ctx.ellipse(0, 3, 52, 60, 0, Math.PI * 1.13, Math.PI * 1.87);
    ctx.stroke();
    ctx.restore();
    for (const x of [-50, 50]) {
      shadow(ctx, () => rounded(ctx, x - 15, -6, 31, 62, 13, '#272d2b'));
      rounded(ctx, x - 9, 0, 18, 50, 8, '#414742');
    }
  });
}

function targets(ctx) {
  const [key, die, clip] = TASKS;
  place(ctx, key.x, key.y, -0.36, () => {
    shadow(ctx, () => {
      ellipse(ctx, -20, 0, 15, 12, '#a97032');
      rounded(ctx, -9, -5, 46, 10, 3, '#a97032');
      rounded(ctx, 19, -4, 7, 15, 2, '#a97032');
      rounded(ctx, 30, -4, 7, 13, 2, '#a97032');
    });
    ellipse(ctx, -20, -2, 14, 10, '#e0b05b');
    ellipse(ctx, -20, -2, 6, 4, '#9b7351');
    rounded(ctx, -7, -5, 43, 6, 2, '#e7b95f');
  });
  place(ctx, die.x, die.y, 0.22, () => {
    shadow(ctx, () => rounded(ctx, -20, -19, 38, 41, 8, '#143254'));
    rounded(ctx, -20, -23, 37, 38, 8, '#345e92');
    for (const [x, y] of [[-10, -13], [7, -13], [-2, -4], [-10, 5], [7, 5]]) {
      ellipse(ctx, x, y, 2.8, 2.8, '#e1e9e3');
    }
  });
  place(ctx, clip.x, clip.y, -0.43, () => {
    ctx.lineWidth = 4;
    shadow(ctx, () => rounded(ctx, -21, -9, 42, 18, 8, null, '#294e38'));
    rounded(ctx, -19, -8, 39, 15, 7, null, '#487d56');
    rounded(ctx, -14, -4, 24, 7, 3, null, '#487d56');
  });
}

const grain = Array.from({ length: 470 }, (_, index) => ({
  y: (index * 193.07) % HEIGHT, x: (index * 129.368) % 1780 - 890,
  length: 8 + (index * 7.31) % 166, alpha: 0.03 + (index % 9) * 0.006,
}));

export function drawDesk(canvas, pose) {
  const ctx = canvas.getContext('2d');
  ctx.setTransform(canvas.width / WIDTH, 0, 0, canvas.height / HEIGHT, 0, 0);
  ctx.translate(WIDTH / 2 - pose, 0);
  const wood = ctx.createLinearGradient(-400, 0, 600, 700);
  wood.addColorStop(0, '#e1b886');
  wood.addColorStop(0.56, '#b78c64');
  wood.addColorStop(1, '#946c4c');
  ctx.fillStyle = wood;
  ctx.fillRect(-900, 0, 1800, HEIGHT);
  for (const { x, y, length, alpha } of grain) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + length / 2, y - 2, x + length, y + 1);
    ctx.strokeStyle = `rgba(70, 38, 16, ${alpha})`;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  const light = ctx.createLinearGradient(-740, 90, 30, 620);
  light.addColorStop(0, '#fff1ca88');
  light.addColorStop(0.65, '#fff1ca00');
  ctx.fillStyle = light;
  ctx.fillRect(-900, 0, 1800, HEIGHT);
  ctx.fillStyle = '#fff2cc19';
  ctx.beginPath();
  ctx.moveTo(-832, 0); ctx.lineTo(-525, 0); ctx.lineTo(354, HEIGHT); ctx.lineTo(88, HEIGHT);
  ctx.closePath(); ctx.fill();

  notebook(ctx, -675, 154, -0.17, true);
  notebook(ctx, 185, 238, 0.12, false);
  place(ctx, 289, 268, 0.22, () => {
    shadow(ctx, () => rounded(ctx, 0, -92, 8, 128, 3, '#342f28'));
    rounded(ctx, 1, -80, 3, 109, 1, '#786345');
    rounded(ctx, 0, -93, 8, 16, 2, '#d1a970');
  });
  place(ctx, -86, 200, -0.57, () => {
    shadow(ctx, () => ellipse(ctx, 0, 0, 72, 72, '#c7aa87'));
    ellipse(ctx, 0, 0, 68, 68, '#d6b796');
    ellipse(ctx, 0, 0, 56, 56, '#dcc2a0');
    shadow(ctx, () => ellipse(ctx, 47, 2, 26, 15, '#832e27'));
    ellipse(ctx, 51, 2, 12, 7, '#ceaf88');
    shadow(ctx, () => ellipse(ctx, 0, 0, 45, 45, '#8c362e'));
    ellipse(ctx, 0, -2, 43, 43, '#f0c6a3');
    ellipse(ctx, 1, -2, 37, 37, '#5c3329');
    ellipse(ctx, -3, -5, 32, 32, '#784b36');
    ellipse(ctx, -6, -8, 18, 16, '#805139');
  });
  place(ctx, -270, 37, -0.21, () => {
    shadow(ctx, () => rounded(ctx, -25, -85, 141, 117, 9, '#353935'));
    rounded(ctx, -22, -84, 135, 111, 7, '#4c514a');
    rounded(ctx, -16, -76, 123, 96, 3, '#595d51');
  });
  headphones(ctx);
  targets(ctx);

  const vignette = ctx.createRadialGradient(pose, HEIGHT / 2, 90, pose, HEIGHT / 2, 412);
  vignette.addColorStop(0, '#32231c00');
  vignette.addColorStop(1, '#32231c4a');
  ctx.fillStyle = vignette;
  ctx.fillRect(pose - WIDTH / 2, 0, WIDTH, HEIGHT);
}
