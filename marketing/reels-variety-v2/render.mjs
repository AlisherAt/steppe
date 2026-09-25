// STEPPE: шесть пар, кинетическая типографика и монтаж под оригинальный бит.
import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';

const out = 'marketing/reels-variety-v2';
const scratch = 'artifacts/reels-variety-render';
const fps = 30, duration = 20;
await mkdir(scratch, { recursive: true });
const ffmpeg = process.env.FFMPEG_PATH || execFileSync('python', ['-c', 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())'], { encoding: 'utf8' }).trim();
const scenes = [
  { key: '01-run', title: 'В ДВИЖЕНИИ', sub: '08:00 / УТРО', model: 'PUMA · VELOCITY NITRO 4', color: '#b2f6e5' },
  { key: '02-gym', title: 'В СВОЁМ ТЕМПЕ', sub: '10:00 / ТРЕНИРОВКА', model: 'PUMA · FUSE 4.0', color: '#c9bcff' },
  { key: '03-coffee', title: 'БЕЗ СПЕШКИ', sub: '13:00 / КОФЕ И ГОРОД', model: 'REEBOK · CLUB C GROUNDS UK', color: '#eaca9f' },
  { key: '04-color', title: 'ДОБАВЬ ЦВЕТА', sub: '16:00 / НОВЫЕ ПЛАНЫ', model: 'REEBOK · CLASSIC AZ', color: '#e0a9cd' },
  { key: '05-detail', title: 'С ХАРАКТЕРОМ', sub: '18:00 / В ДЕТАЛЯХ', model: 'REEBOK · CLASSIC LEATHER 1983', color: '#d9dfb7' },
  { key: '06-night', title: 'ПО СВОИМ ПРАВИЛАМ', sub: '22:00 / ВЕЧЕР', model: 'REEBOK · CLUB C LTD', color: '#ffce4c' },
];
const assets = {};
for (const s of scenes) assets[s.key] = 'data:image/png;base64,' + (await readFile(`${out}/scenes/${s.key}.png`)).toString('base64');
assets.site = 'data:image/png;base64,' + (await readFile('marketing/reels-2026-09/references/catalog.png')).toString('base64');

// Самостоятельно синтезированная электронная дорожка, без готовых семплов.
const sr = 48000, count = duration * sr;
let seed = 65421;
const rand = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 2147483648 - 1; };
const wav = Buffer.alloc(44 + count * 2);
wav.write('RIFF');wav.writeUInt32LE(wav.length - 8, 4);wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16);wav.writeUInt16LE(1, 20);wav.writeUInt16LE(1, 22);wav.writeUInt32LE(sr, 24);
wav.writeUInt32LE(sr * 2, 28);wav.writeUInt16LE(2, 32);wav.writeUInt16LE(16, 34);wav.write('data', 36);wav.writeUInt32LE(count * 2, 40);
for (let i = 0; i < count; i++) {
  const t = i / sr, b = t % 0.5, h = t % 0.25;
  const beatIndex = Math.floor(t * 2), eighth = Math.floor(t * 4);
  const root = [55, 55, 65.406, 73.416, 55][Math.floor(t / 4) % 5];
  const kick = Math.sin(2 * Math.PI * (48 * b + 9 * (1 - Math.exp(-33 * b)))) * Math.exp(-16 * b) * 0.61;
  const snare = beatIndex % 2 ? rand() * Math.exp(-35 * b) * 0.22 : 0;
  const hat = rand() * Math.exp(-155 * h) * (eighth % 2 ? 0.08 : 0.045);
  const bassFreq = root * ([1, 1, 1.5, 1, 1, 2, 1.5, 1][beatIndex % 8]);
  const bass = (Math.sin(2 * Math.PI * bassFreq * t) + 0.25 * Math.sin(4 * Math.PI * bassFreq * t)) * Math.exp(-8 * b) * 0.22;
  const note = [0, 7, 12, 3, 7, 10, 12, 7][eighth % 8];
  const freq = 220 * 2 ** (note / 12);
  const pluck = (Math.sin(2 * Math.PI * freq * t) + 0.2 * Math.sin(4 * Math.PI * freq * t)) * Math.exp(-23 * h) * 0.065;
  const transition = (t - 1.5 + 20) % 2;
  const sweep = transition > 1.86 ? rand() * (transition - 1.86) * 0.45 : 0;
  const fade = Math.min(1, t / 0.008, (duration - t) / 0.035);
  const sample = Math.tanh((kick + snare + hat + bass + pluck + sweep) * 1.2) * 0.86 * fade;
  wav.writeInt16LE(Math.round(sample * 32767), 44 + i * 2);
}
await writeFile(`${scratch}/beat.wav`, wav);

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  await page.setContent('<html><style>*{margin:0}body{overflow:hidden;background:#10110f}canvas{display:block}</style><canvas width="1080" height="1920"></canvas></html>');
  await page.evaluate(async ({ assets, scenes }) => {
    const imgs = {};
    for (const [k, src] of Object.entries(assets)) { const im = new Image();im.src = src;await im.decode();imgs[k] = im; }
    const c = document.querySelector('canvas').getContext('2d');
    const white = '#fcfbf5', lime = '#c4ff53', ink = '#121510';
    const clamp = x => Math.min(1, Math.max(0, x));
    const ease = x => 1 - (1 - clamp(x)) ** 3;
    function rect(x, y, w, h, col, r = 0) { c.fillStyle = col;c.beginPath();c.roundRect(x, y, w, h, r);c.fill(); }
    function text(str, x, y, size, col = white, max = 890, family = 'Arial', weight = 800) {
      c.textBaseline = 'top';c.font = `${weight} ${size}px ${family}`;
      const width = c.measureText(str).width;if (width > max) c.font = `${weight} ${size * max / width}px ${family}`;
      c.fillStyle = col;c.fillText(str, x, y);
    }
    function fillPhoto(im, x, y, w, h, zoom = 1, panX = 0, panY = 0) {
      c.save();c.beginPath();c.rect(x, y, w, h);c.clip();
      const scale = Math.max(w / im.width, h / im.height) * zoom;
      c.drawImage(im, x + (w - im.width * scale) / 2 + panX, y + (h - im.height * scale) / 2 + panY, im.width * scale, im.height * scale);c.restore();
    }
    function shade(strength = 1) {
      const g = c.createLinearGradient(0, 0, 0, 1920);
      g.addColorStop(0, `rgba(0,0,0,${0.7 * strength})`);g.addColorStop(0.32, 'rgba(0,0,0,0)');
      g.addColorStop(0.67, 'rgba(0,0,0,0)');g.addColorStop(1, `rgba(0,0,0,${0.85 * strength})`);
      c.fillStyle = g;c.fillRect(0, 0, 1080, 1920);
    }
    function logo() { text('STEPPE', 74, 164, 53, white, 500, 'Arial', 900); }
    function plate(index, u, zoom = 1, offset = 0) {
      fillPhoto(imgs[scenes[index].key], 0, 0, 1080, 1920, zoom + 0.025 * u, offset + Math.sin(u * 0.9) * 10, -18 * u);
    }
    function intro(t) {
      const id = [3, 0, 5][Math.min(2, Math.floor(t / 0.5))];plate(id, t, 1.1);shade();
      logo();text('ОДНА ПАРА', 72, 318, 144, white, 920, 'Impact');
      text('НА ВСЕ ПЛАНЫ?', 72, 470, 136, lime, 920, 'Impact');
      rect(75, 1430, 660, 82, ink, 12);text('А ЕСЛИ ПЛАНЫ МЕНЯЮТСЯ?', 96, 1450, 37, white, 615);
    }
    window.renderFrame = t => {
      c.fillStyle = ink;c.fillRect(0, 0, 1080, 1920);
      if (t < 1.5 || t >= 19.75) { intro(t >= 19.75 ? t - 19.75 : t);return; }
      if (t < 13.5) {
        const index = Math.floor((t - 1.5) / 2), u = (t - 1.5) % 2, s = scenes[index];
        // Общий план меняется на крупный под удар, затем быстрый сдвиг камеры.
        const macro = u >= 1.25;
        const zoom = macro ? 1.3 + 0.06 * (u - 1.25) : 1.065 - 0.035 * ease(u);
        const slide = u < 0.16 ? 120 * (1 - ease(u / 0.16)) : 0;
        plate(index, u, zoom, slide);shade();logo();
        const e = ease(u / 0.2);
        c.save();c.translate(65 * (1 - e), 0);c.globalAlpha = e;
        text(s.sub, 76, 300, 31, s.color, 840, 'Arial', 800);
        text(s.title, 72, 355, 115, white, 924, 'Impact');c.restore();
        text(String(index + 1).padStart(2, '0'), 897, 171, 69, s.color, 105, 'Impact');
        rect(76, 510, 910, 73, '#11150fe8', 10);
        text(s.model, 98, 533, 34, white, 866);
        text(macro ? 'ПРИСМОТРИСЬ К ДЕТАЛЯМ' : 'ШЕСТЬ ПАР. РАЗНЫЕ НАСТРОЕНИЯ.', 78, 1585, 25, '#ecece4', 885, 'Arial', 600);
      } else if (t < 16.5) {
        const u = t - 13.5;
        rect(0, 0, 1080, 1920, ink);logo();
        text('КАКОЙ ТЫ', 73, 290, 122, white, 930, 'Impact');text('СЕГОДНЯ?', 73, 419, 122, lime, 930, 'Impact');
        const highlight = Math.min(5, Math.floor(u / 0.5));
        scenes.forEach((s, i) => {
          const col = i % 2, row = Math.floor(i / 2), x = 74 + col * 475, y = 625 + row * 292;
          fillPhoto(imgs[s.key], x, y, 448, 268, 1, 0, [-105, -90, -155, -75, -95, -85][i]);
          const g = c.createLinearGradient(0, y, 0, y + 268);g.addColorStop(0, '#00000000');g.addColorStop(1, '#000000a0');c.fillStyle = g;c.fillRect(x, y, 448, 268);
          text(String(i + 1), x + 18, y + 182, 63, s.color, 70, 'Impact');
          if (i === highlight) { c.strokeStyle = s.color;c.lineWidth = 7;c.strokeRect(x + 4, y + 4, 440, 260); }
        });
        text('ВЫБЕРИ СВОЙ НОМЕР: 1–6', 78, 1570, 46, white, 920);
      } else {
        const u = t - 16.5;
        plate(5, u * 0.2, 1.05);rect(0, 0, 1080, 1920, '#081019ba');logo();
        text('ТВОЙ СТИЛЬ.', 72, 315, 134, white, 916, 'Impact');text('ТВОЙ STEPPE.', 72, 457, 134, lime, 916, 'Impact');
        const w = 516, h = 642, x = 282 + 20 * (1 - ease(u / 0.4)), y = 692;
        c.save();c.translate(x + w / 2, y + h / 2);c.rotate(-0.025 + 0.012 * u);
        rect(-w / 2 - 8, -h / 2 - 8, w + 16, h + 16, white, 22);
        c.beginPath();c.roundRect(-w / 2, -h / 2, w, h, 16);c.clip();
        c.drawImage(imgs.site, -w / 2, -h / 2 - 20 * u, w, imgs.site.height * w / imgs.site.width);c.restore();
        text('PUMA + REEBOK · РАЗМЕРЫ EU · ЦЕНЫ В ₸', 74, 1390, 34, white, 930);
        rect(74, 1470, 929, 112, lime, 14);text('steppe-gray.vercel.app', 107, 1500, 60, ink, 867);
        text('ТВОЯ ПАРА — НА САЙТЕ ↑', 76, 1632, 29, white, 900);
      }
    };
  }, { assets, scenes });
  for (const [i, t] of [0.2, 1.9, 3.9, 5.9, 7.9, 9.9, 11.9, 14.5, 18].entries()) {
    await page.evaluate(t => window.renderFrame(t), t);
    await page.screenshot({ path: `${scratch}/scene-${i}.jpg`, type: 'jpeg', quality: 90 });
  }
  await page.evaluate(() => window.renderFrame(14.5));await page.screenshot({ path: `${out}/cover.png` });
  if (!process.argv.includes('--preview')) {
    const encoder = spawn(ffmpeg, ['-hide_banner', '-loglevel', 'warning', '-y', '-f', 'image2pipe', '-framerate', String(fps), '-vcodec', 'mjpeg', '-i', 'pipe:0', '-i', `${scratch}/beat.wav`, '-map', '0:v:0', '-map', '1:a:0', '-vf', 'scale=in_range=pc:out_range=tv:in_color_matrix=bt601:out_color_matrix=bt709,format=yuv420p', '-c:v', 'libx264', '-preset', 'fast', '-crf', '19', '-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-c:a', 'aac', '-b:a', '192k', '-ac', '2', '-t', String(duration), '-movflags', '+faststart', `${out}/steppe-six-moods.mp4`], { stdio: ['pipe', 'ignore', 'pipe'] });
    let errors = '';encoder.stderr.on('data', b => { errors += b; });
    const finished = new Promise((res, rej) => { encoder.on('error', rej);encoder.on('close', code => code === 0 ? res() : rej(new Error(errors))); });
    for (let n = 0; n < fps * duration; n++) {
      await page.evaluate(t => window.renderFrame(t), n / fps);
      const b = await page.screenshot({ type: 'jpeg', quality: 94 });
      if (!encoder.stdin.write(b)) await once(encoder.stdin, 'drain');
      if (n % 90 === 0) console.log(`Кадры: ${n}/${fps * duration}`);
    }
    encoder.stdin.end();await finished;console.log('Готово: ' + out + '/steppe-six-moods.mp4');
  }
} finally { await browser.close(); }
