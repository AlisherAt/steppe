// Рендер вертикального Reels из фотографий каталога и собственного бита.
// Запуск из корня проекта: node marketing/reels-2026-09/render.mjs
import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';

const out = 'marketing/reels-2026-09';
const scratch = 'artifacts/reels-render';
const seconds = 18;
const fps = 30;
await mkdir(scratch, { recursive: true });
const ffmpeg = process.env.FFMPEG_PATH || execFileSync('python', ['-c', 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())'], { encoding: 'utf8' }).trim();
const sourcePaths = {
  puma: 'marketing/instagram-brands-v2/references/311140_17.jpg',
  reebok: 'marketing/instagram-brands-v2/references/100256877.jpg',
  site: 'marketing/reels-2026-09/references/catalog.png',
};
const assets = {};
for (const [key, file] of Object.entries(sourcePaths)) {
  assets[key] = `data:image/${file.endsWith('.png') ? 'png' : 'jpeg'};base64,${(await readFile(file)).toString('base64')}`;
}

// Оригинальный ритм: синтез ударных и баса, без чужих записей и семплов.
const sr = 48000;
const count = sr * seconds;
const samples = new Float32Array(count);
let randomState = 1977;
const noise = () => { randomState = (1664525 * randomState + 1013904223) >>> 0; return randomState / 2147483648 - 1; };
for (let i = 0; i < count; i++) {
  const t = i / sr;
  const beat = t % 0.5;
  const eighth = t % 0.25;
  const bar = Math.floor(t / 2);
  const kick = Math.sin(2 * Math.PI * (48 * beat + 10 * (1 - Math.exp(-30 * beat)))) * Math.exp(-15 * beat) * 0.65;
  const clapT = (t + 0.5) % 1;
  const clap = clapT < 0.12 ? noise() * Math.exp(-40 * clapT) * 0.19 : 0;
  const hat = eighth < 0.035 ? noise() * Math.exp(-140 * eighth) * 0.1 : 0;
  const freq = [55, 65.406, 73.416, 65.406][bar % 4];
  const bass = (Math.sin(2 * Math.PI * freq * t) + 0.25 * Math.sin(4 * Math.PI * freq * t)) * Math.exp(-6 * beat) * 0.14;
  const fade = Math.min(1, t / 0.012, (seconds - t) / 0.12);
  samples[i] = Math.tanh((kick + clap + hat + bass) * 1.1) * fade * 0.82;
}
const wav = Buffer.alloc(44 + count * 2);
wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(sr, 24); wav.writeUInt32LE(sr * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
wav.write('data', 36); wav.writeUInt32LE(count * 2, 40);
for (let i = 0; i < count; i++) wav.writeInt16LE(Math.round(samples[i] * 32767), 44 + i * 2);
const audioPath = path.join(scratch, 'original-beat.wav');
await writeFile(audioPath, wav);

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  await page.setContent('<html><head><style>*{margin:0}body{overflow:hidden;background:#20261f}canvas{display:block}</style></head><body><canvas width="1080" height="1920"></canvas></body></html>');
  await page.evaluate(async ({ assets }) => {
    const imgs = {};
    for (const [key, src] of Object.entries(assets)) {
      const img = new Image(); img.src = src; await img.decode(); imgs[key] = img;
    }
    await document.fonts.ready;
    const ctx = document.querySelector('canvas').getContext('2d');
    const ink = '#20261f', ivory = '#f7f8f2', lime = '#c3ff55', blue = '#b9d9e8';
    const clamp = x => Math.max(0, Math.min(1, x));
    const ease = x => 1 - Math.pow(1 - clamp(x), 3);
    function box(x, y, w, h, r, color) {
      ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill();
    }
    function text(str, x, y, size, color = ink, weight = 800, max = 920, family = 'Arial') {
      ctx.fillStyle = color; ctx.font = `${weight} ${size}px ${family}`; ctx.textBaseline = 'top';
      const width = ctx.measureText(str).width;
      if (width > max) ctx.font = `${weight} ${size * max / width}px ${family}`;
      ctx.fillText(str, x, y);
    }
    function headline(lines, y, color, size = 126) {
      lines.forEach((line, i) => text(line, 76, y + i * (size * 1.06), size, color, 900, 925, 'Impact'));
    }
    function shoe(key, x, y, w, angle = 0) {
      const image = imgs[key];
      const crop = key === 'puma' ? [0, 540, 2000, 930] : [0, 790, 2000, 810];
      const h = w * crop[3] / crop[2];
      ctx.save(); ctx.translate(x + w / 2, y + h / 2); ctx.rotate(angle);
      ctx.shadowColor = '#0000001c'; ctx.shadowBlur = 34; ctx.shadowOffsetY = 18;
      box(-w / 2 - 12, -h / 2 - 20, w + 24, h + 40, 32, '#fafafa');
      ctx.shadowColor = 'transparent';
      ctx.save(); ctx.beginPath(); ctx.roundRect(-w / 2, -h / 2, w, h, 26); ctx.clip();
      ctx.drawImage(image, ...crop, -w / 2, -h / 2, w, h); ctx.restore(); ctx.restore();
    }
    function chip(label, x, y, w, bg, fg = ink) {
      box(x, y, w, 72, 36, bg); text(label, x + 26, y + 18, 31, fg, 800, w - 45);
    }
    function browserShot(x, y, w, h, time) {
      box(x - 10, y - 10, w + 20, h + 20, 42, '#111810');
      box(x, y, w, h, 34, ivory);
      ctx.save();ctx.beginPath();ctx.roundRect(x, y, w, h, 34);ctx.clip();
      const image = imgs.site;
      const scale = w / image.width;
      ctx.drawImage(image, x, y - Math.min(95, time * 25), w, image.height * scale);
      ctx.restore();
    }
    window.renderFrame = t => {
      const scene = Math.min(5, Math.floor(t / 3));
      const u = t - scene * 3;
      const enter = scene === 0 ? 1 : ease(u / 0.34);
      const dark = scene === 0 || scene === 5;
      ctx.fillStyle = dark ? ink : scene === 2 ? '#e8f0f1' : ivory;ctx.fillRect(0, 0, 1080, 1920);
      // Крупная спокойная фоновая геометрия.
      ctx.save();ctx.translate(920, 930);ctx.rotate(t * 0.04);ctx.strokeStyle = dark ? '#c3ff551c' : '#20261f0b';ctx.lineWidth = 72;
      ctx.beginPath();ctx.ellipse(0, 0, 590, 740, 0, 0, Math.PI * 2);ctx.stroke();ctx.restore();
      text('STEPPE ✳', 76, 164, 55, dark ? ivory : ink, 900);
      text(`${scene + 1} / 6`, 886, 178, 25, dark ? '#c9d0c2' : '#68705e', 600, 120);
      ctx.save();ctx.globalAlpha = enter;ctx.translate(0, 34 * (1 - enter));
      if (scene === 0) {
        headline(['СПОРТ', 'ИЛИ ГОРОД?'], 295, ivory, 145);
        shoe('puma', 100, 698 + Math.sin(t * 2) * 7, 865, -0.055);
        chip('1  PUMA', 104, 648, 244, lime);
        shoe('reebok', 100, 1210 - Math.sin(t * 2) * 7, 865, 0.045);
        chip('2  REEBOK', 714, 1160, 277, blue);
      } else if (scene === 1) {
        headline(['ТВОЙ ТЕМП.', 'ТВОЯ PUMA.'], 310, ink, 135);
        chip('01 / СПОРТ', 78, 634, 296, lime);
        shoe('puma', 67 - u * 4, 806, 934 + u * 8, -0.035 + u * 0.014);
        text('VELOCITY NITRO 4', 80, 1360, 66, ink, 900, 900, 'Impact');
        text('Выбирай пару для движения', 80, 1450, 37, '#56604e', 500);
      } else if (scene === 2) {
        headline(['ГОРОД —', 'ТВОЙ МАРШРУТ.'], 310, ink, 128);
        chip('02 / ГОРОД', 78, 627, 316, blue);
        shoe('reebok', 68 - u * 4, 843, 930 + u * 8, 0.035 - u * 0.014);
        text('CLUB C GROUNDS UK', 80, 1340, 66, ink, 900, 900, 'Impact');
        text('Reebok в твоём ритме', 80, 1440, 38, '#56604e', 500);
      } else if (scene === 3) {
        headline(['ОБЕ —', 'НА STEPPE.'], 310, ink, 124);
        browserShot(244, 656, 592, 842, u);
        chip('КАТАЛОГ', 68, 925, 254, lime);
        chip('ПОИСК', 770, 1240, 236, blue);
        text('steppe-gray.vercel.app', 120, 1550, 57, ink, 800, 860);
      } else if (scene === 4) {
        headline(['ВЫБЕРИ.', 'СОБЕРИ ЗАКАЗ.'], 310, ink, 119);
        const rows = [['01', 'Свой размер EU'], ['02', 'Цена в тенге'], ['03', 'Корзина → WhatsApp']];
        rows.forEach(([n, label], i) => {
          const e = ease((u - i * 0.22) / 0.35);
          ctx.save();ctx.globalAlpha = e;
          box(76 + 45 * (1 - e), 744 + i * 200, 922, 158, 24, i === 2 ? ink : '#e7eddf');
          text(n, 107 + 45 * (1 - e), 795 + i * 200, 37, i === 2 ? lime : '#69765b', 800);
          text(label, 212 + 45 * (1 - e), 794 + i * 200, 47, i === 2 ? ivory : ink, 700, 737);
          ctx.restore();
        });
        text('Условия заказа обсудим в чате', 84, 1410, 38, '#56604e', 500);
        text('steppe-gray.vercel.app', 84, 1530, 56, ink, 800);
      } else {
        headline(['ТЫ ЗА 1', 'ИЛИ ЗА 2?'], 305, ivory, 151);
        shoe('puma', 85, 774, 422, -0.04);shoe('reebok', 573, 785, 422, 0.04);
        chip('1 / PUMA', 86, 1034, 421, lime);chip('2 / REEBOK', 573, 1034, 421, blue);
        text('Напиши свой выбор в комментариях', 79, 1190, 46, ivory, 700, 920);
        box(76, 1310, 923, 142, 30, lime);
        text('НАЙДИ СВОЮ ПАРУ ↗', 120, 1356, 64, ink, 900, 844, 'Impact');
        text('steppe-gray.vercel.app', 100, 1517, 60, ivory, 800, 890);
      }
      ctx.restore();
      for (let i = 0; i < 6; i++) {
        box(76 + i * 155, 1673, 137, 5, 2, dark ? '#526049' : '#d8dfd0');
        const fill = clamp((t - i * 3) / 3);
        if (fill) box(76 + i * 155, 1673, 137 * fill, 5, 2, dark ? lime : ink);
      }
    };
  }, { assets });

  // Контрольные кадры доступны для проверки без повторного рендера ролика.
  for (const [index, t] of [0.75, 3.8, 6.8, 10, 13.7, 16.5].entries()) {
    await page.evaluate(t => window.renderFrame(t), t);
    await page.screenshot({ path: `${scratch}/scene-${index + 1}.jpg`, type: 'jpeg', quality: 92 });
  }
  await page.evaluate(() => window.renderFrame(0.75));
  await page.screenshot({ path: `${out}/cover.png` });
  if (!process.argv.includes('--preview')) {
    const encoder = spawn(ffmpeg, ['-hide_banner', '-loglevel', 'warning', '-y', '-f', 'image2pipe', '-framerate', String(fps), '-vcodec', 'mjpeg', '-i', 'pipe:0', '-i', audioPath, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'libx264', '-preset', 'fast', '-crf', '19', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2', '-t', String(seconds), '-movflags', '+faststart', `${out}/steppe-sport-or-city.mp4`], { stdio: ['pipe', 'ignore', 'pipe'] });
    let error = '';encoder.stderr.on('data', data => { error += data; });
    const finished = new Promise((resolve, reject) => { encoder.on('error', reject);encoder.on('close', code => code === 0 ? resolve() : reject(new Error(error))); });
    for (let frame = 0; frame < seconds * fps; frame++) {
      await page.evaluate(t => window.renderFrame(t), frame / fps);
      const buffer = await page.screenshot({ type: 'jpeg', quality: 92 });
      if (!encoder.stdin.write(buffer)) await once(encoder.stdin, 'drain');
      if (frame % 90 === 0) console.log(`Рендер: ${frame}/${seconds * fps}`);
    }
    encoder.stdin.end(); await finished;
    console.log(`Готово: ${out}/steppe-sport-or-city.mp4`);
  }
} finally { await browser.close(); }
