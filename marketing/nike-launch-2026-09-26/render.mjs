// Reels из реальных фотографий Nike: неподвижные карточки, плавные наплывы, оригинальный инструментал.
import {chromium} from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {spawn,execFileSync} from 'node:child_process';
import {once} from 'node:events';
const out='marketing/nike-launch-2026-09-26',tmp='artifacts/nike-launch-render';
await mkdir(tmp,{recursive:true});
const fps=30,duration=30;
const products=JSON.parse(await readFile(`${out}/references/products.json`,'utf8')).products;
const assets=await Promise.all(products.map(async p=>'data:image/png;base64,'+(await readFile(`${out}/references/${p.sku}-large.png`)).toString('base64')));
const ffmpeg=process.env.FFMPEG_PATH||execFileSync('python',['-c','import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())'],{encoding:'utf8',windowsHide:true}).trim();
// 100 BPM: мягкий грув, синтезированные ударные и аккорды. Сторонних аудиозаписей нет.
const sr=48000,n=sr*duration,wav=Buffer.alloc(44+n*4);let seed=270926,low=0;
const noise=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/2147483648-1;};
wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(2,22);wav.writeUInt32LE(sr,24);wav.writeUInt32LE(sr*4,28);wav.writeUInt16LE(4,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(n*4,40);
for(let i=0;i<n;i++){
 const t=i/sr,b=t%.6,e=t%.3,beat=Math.floor(t/.6),root=[55,65.4064,49,58.2705][Math.floor(t/4.8)%4],r=noise();low=.91*low+.09*r;
 const kick=Math.sin(2*Math.PI*(48*b+5*(1-Math.exp(-38*b))))*Math.exp(-23*b)*.34;
 const snare=beat%2?(r-low)*Math.exp(-42*b)*.085:0;
 const hat=(r-low)*Math.exp(-130*e)*.025;
 const bass=(Math.sin(2*Math.PI*root*t)+.13*Math.sin(4*Math.PI*root*t))*Math.exp(-5*b)*.12;
 const chord=[4,5,6,7].reduce((a,m)=>a+Math.sin(2*Math.PI*root*m*t),0)*.009*(.45+.55*(1-Math.exp(-8*b)));
 const note=[4,6,7,5,4,5,6,8][beat%8]*root;
 const bell=(Math.sin(2*Math.PI*note*t)+.15*Math.sin(4*Math.PI*note*t))*Math.exp(-8*b)*(1-Math.exp(-80*b))*.035;
 let swish=0;for(const at of [5,10,15,20,25]){const d=t-at;if(d>=0&&d<.7)swish+=low*Math.sin(Math.PI*d/.7)*.08;}
 const fade=Math.min(1,t/.65,(duration-t)/1.1),v=(kick+snare+hat+bass+chord+bell+swish)*fade;
 for(let ch=0;ch<2;ch++)wav.writeInt16LE(Math.round(Math.tanh(v+(ch?1:-1)*bell*.16)*.86*32767),44+i*4+ch*2);
}
await writeFile(`${tmp}/soundtrack.wav`,wav);
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1080,height:1920},deviceScaleFactor:1});
 await page.setContent('<html><style>*{margin:0}body{overflow:hidden}canvas{display:block}</style><canvas width="1080" height="1920"></canvas></html>');
 await page.evaluate(async assets=>{
  const images=await Promise.all(assets.map(async src=>{const im=new Image();im.src=src;await im.decode();return im;}));
  const c=document.querySelector('canvas').getContext('2d'),ink='#151c19',lime='#c5fa55',white='#f5f5ee',muted='#a7b1a9';
  const names=['DUNK LOW RETRO','AIR MAX 95','AIR FORCE 1','ZOOM VOMERO 5'];
  const lines=['Тёплый тон. Чистый силуэт.','Характер, который заметен.','Знакомая форма. Новый образ.','Ретро-ритм большого города.'];
  function box(x,y,w,h,col,r=0){c.fillStyle=col;c.beginPath();c.roundRect(x,y,w,h,r);c.fill();}
  function txt(s,x,y,size,col=white,max=900,weight=700){c.fillStyle=col;c.font=`${weight} ${size}px Arial`;c.textBaseline='top';c.textAlign='left';const w=c.measureText(s).width;if(w>max)c.font=`${weight} ${size*max/w}px Arial`;c.fillText(s,x,y);}
  function rule(y){box(80,y,880,1,'#3c453e');}
  function head(label){txt('STEPPE',80,158,43,white,350,900);txt(label,630,172,23,muted,330,500);rule(234);}
  function footer(){txt('NIKE ТЕПЕРЬ В КАТАЛОГЕ',80,1555,28,muted);txt('steppe-gray.vercel.app',80,1620,37,white,860,500);}
  function photo(i,x,y,w,h){const im=images[i];c.save();c.beginPath();c.roundRect(x,y,w,h,25);c.clip();box(x,y,w,h,'#f7f7f7');const sy=.28*im.height,sh=.58*im.height,scale=Math.min(w/im.width,h/sh),dw=im.width*scale,dh=sh*scale;c.drawImage(im,0,sy,im.width,sh,x+(w-dw)/2,y+(h-dh)/2,dw,dh);c.restore();}
  function grid(y){for(let i=0;i<4;i++){const x=80+(i%2)*446,yy=y+Math.floor(i/2)*326;photo(i,x,yy,424,246);txt(names[i],x+4,yy+265,25,white,418);}}
  function drawScene(i){
   box(0,0,1080,1920,ink);
   // Тонкая сетка — визуальный мотив цифрового каталога.
   c.strokeStyle='#263129';c.lineWidth=1;for(let x=0;x<1080;x+=135){c.beginPath();c.moveTo(x,0);c.lineTo(x,1920);c.stroke();}
   if(i===0){
    head('НОВОЕ В КАТАЛОГЕ');txt('ДА, ТЕПЕРЬ',80,324,69,white);txt('И NIKE.',70,408,196,lime,900,900);
    txt('Твоя следующая пара уже здесь.',83,651,39,white,875,400);
    grid(790);box(80,1498,876,90,lime,45);txt('ЛИСТАЙ. ВЫБИРАЙ. НОСИ.',118,1525,37,ink,810);txt('steppe-gray.vercel.app',80,1642,37,white,870,500);
   }else if(i<=4){
    const k=i-1;head(`NIKE / 0${i}`);txt(['ТВОЙ СТИЛЬ.','ТВОЙ ХАРАКТЕР.','ТВОЯ КЛАССИКА.','ТВОЙ РИТМ.'][k],80,335,66,lime,885);
    txt(names[k],80,449,70,white,895,900);txt(lines[k],80,551,33,muted,880,400);
    photo(k,60,740,920,602);
    box(80,1400,360,64,lime,32);txt('УЖЕ В STEPPE',113,1418,27,ink,320);footer();
   }else{
    head('ТВОЯ НОВАЯ ПАРА');txt('NIKE',75,330,174,lime,870,900);txt('ВЫБИРАЙ СВОИ.',80,526,69,white,890);
    grid(706);box(80,1400,880,94,lime,47);txt('ОТКРОЙ КАТАЛОГ  ↗',125,1428,40,ink,810);
    txt('Размеры EU · цены в тенге',80,1542,33,white,880,400);txt('steppe-gray.vercel.app',80,1622,42,white,880,700);
   }
  }
  const frames=[];for(let i=0;i<6;i++){drawScene(i);const f=document.createElement('canvas');f.width=1080;f.height=1920;f.getContext('2d').drawImage(c.canvas,0,0);frames.push(f);}
  window.draw=(t)=>{const i=Math.min(5,Math.floor(t/5)),u=t-i*5;c.clearRect(0,0,1080,1920);c.drawImage(frames[i],0,0);if(i>0&&u<.75){const p=u/.75;c.save();c.globalAlpha=1-p*p*(3-2*p);c.drawImage(frames[i-1],0,0);c.restore();}};
 },assets);
 const staticFrames=[];
 for(let i=0;i<6;i++){await page.evaluate(t=>window.draw(t),i*5+1);staticFrames.push(await page.screenshot({type:'jpeg',quality:96}));await page.screenshot({path:`${tmp}/scene-${i}.png`});}
 await page.evaluate(()=>window.draw(1));await page.screenshot({path:`${out}/reels-cover.png`});
 if(!process.argv.includes('--preview')){
  const output=`${out}/steppe-nike-reels.mp4`;
  const enc=spawn(ffmpeg,['-hide_banner','-loglevel','warning','-y','-f','image2pipe','-framerate',String(fps),'-vcodec','mjpeg','-i','pipe:0','-i',`${tmp}/soundtrack.wav`,'-map','0:v:0','-map','1:a:0','-vf','scale=in_range=pc:out_range=tv:in_color_matrix=bt601:out_color_matrix=bt709,format=yuv420p','-c:v','libx264','-preset','fast','-crf','18','-color_range','tv','-colorspace','bt709','-color_primaries','bt709','-color_trc','bt709','-c:a','aac','-b:a','192k','-t',String(duration),'-movflags','+faststart',output],{windowsHide:true,stdio:['pipe','ignore','pipe']});
  let err='';enc.stderr.on('data',b=>err+=b);const done=new Promise((ok,no)=>{enc.on('error',no);enc.on('close',code=>code===0?ok():no(Error(err)));});
  for(let f=0;f<duration*fps;f++){
   const t=f/fps,i=Math.min(5,Math.floor(t/5)),u=t-i*5;let frame=staticFrames[i];
   if(i>0&&u<.75){await page.evaluate(t=>window.draw(t),t);frame=await page.screenshot({type:'jpeg',quality:96});}
   if(!enc.stdin.write(frame))await once(enc.stdin,'drain');if(f%150===0)console.log(`Reels: ${f}/${duration*fps}`);
  }
  enc.stdin.end();await done;console.log(output);
 }
}finally{await browser.close();}
