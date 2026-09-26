// Reels из реальных фотографий Nike: неподвижные карточки, плавные наплывы, оригинальный инструментал.
import {chromium} from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {spawn,execFileSync} from 'node:child_process';
import {once} from 'node:events';
const out='marketing/nike-for-everyone-2026-09-26',tmp='artifacts/nike-for-everyone-render';
await mkdir(tmp,{recursive:true});
const fps=30,duration=32;
const products=JSON.parse(await readFile(`${out}/references/products.json`,'utf8')).products;
const assets=await Promise.all(products.map(async p=>'data:image/png;base64,'+(await readFile(`${out}/references/${p.file}`)).toString('base64')));
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
 await page.evaluate(async ({assets,products})=>{
  const images=await Promise.all(assets.map(async src=>{const im=new Image();im.src=src;await im.decode();return im;}));
  const c=document.querySelector('canvas').getContext('2d'),ink='#151515',lime='#d4ef9b',white='#f7f7f4',muted='#adada9';
  const names=['NIKE AVA X','JORDAN SIXTY PLUS','NIKE BOOK 2','NIKE AIR MAX DN8'];
  const lines=['Мужская пара под ваш ритм.','Женская пара под ваш стиль.','Для тех, кто любит яркую игру.','Детская пара для нового поколения.'];
  function box(x,y,w,h,col,r=0){c.fillStyle=col;c.beginPath();c.roundRect(x,y,w,h,r);c.fill();}
  function txt(s,x,y,size,col=white,max=900,weight=700){c.fillStyle=col;c.font=`${weight} ${size}px Arial`;c.textBaseline='top';c.textAlign='left';const w=c.measureText(s).width;if(w>max)c.font=`${weight} ${size*max/w}px Arial`;c.fillText(s,x,y);}
  function rule(y){box(80,y,880,1,'#3d3d3d');}
  function head(label){txt('STEPPE',80,158,43,white,350,900);txt(label,630,172,23,muted,330,500);rule(234);}
  function footer(){txt('ПОДБЕРЁМ ПОД ВАС',80,1555,28,muted);txt('steppe-gray.vercel.app',80,1620,37,white,860,500);}
  function photo(i,x,y,w,h){const im=images[i],[sx,sy,sw,sh]=products[i].crop;c.save();c.beginPath();c.roundRect(x,y,w,h,25);c.clip();box(x,y,w,h,'#f0f2ec');const scale=Math.min(w/sw,h/sh),dw=sw*scale,dh=sh*scale;c.drawImage(im,sx,sy,sw,sh,x+(w-dw)/2,y+(h-dh)/2,dw,dh);c.restore();}
  function grid(y){for(let i=0;i<4;i++){const x=80+(i%2)*446,yy=y+Math.floor(i/2)*326;photo(i,x,yy,424,246);txt(names[i],x+4,yy+265,25,white,418);}}
  function drawScene(i){
   box(0,0,1080,1920,ink);
   // Тонкая сетка — визуальный мотив цифрового каталога.
   c.strokeStyle='#252525';c.lineWidth=1;for(let x=0;x<1080;x+=135){c.beginPath();c.moveTo(x,0);c.lineTo(x,1920);c.stroke();}
   if(i===0){
    head('ЛИЧНЫЙ ПОДБОР');txt('У КАЖДОГО —',80,324,69,white);txt('СВОИ NIKE.',76,433,135,lime,900,900);
    txt('Подберём вашу пару в STEPPE.',83,651,39,white,875,400);
    grid(790);box(80,1498,876,90,lime,45);txt('ВАШ СТИЛЬ. РАЗМЕР. БЮДЖЕТ.',118,1525,37,ink,810);txt('steppe-gray.vercel.app',80,1642,37,white,870,500);
   }else if(i<=4){
    const k=i-1;head(`NIKE / 0${i}`);txt(['ДЛЯ НЕГО.','ДЛЯ НЕЁ.','ДЛЯ ЯРКОЙ ИГРЫ.','ДЛЯ ДЕТЕЙ.'][k],80,335,66,lime,885);
    txt(names[k],80,449,70,white,895,900);txt(lines[k],80,551,33,muted,880,400);
    photo(k,60,740,920,602);
    box(80,1400,360,64,lime,32);txt('ПОМОЖЕМ ВЫБРАТЬ',103,1418,25,ink,330);footer();
   }else{
    head('ПОДБЕРЁМ ВАШИ NIKE');txt('НУЖНА ПОМОЩЬ',80,326,69,white,890);txt('С ВЫБОРОМ?',80,422,99,lime,890);
    txt('Напишите размер, бюджет',80,582,44,white,880,400);txt('и какие кроссовки вам нравятся.',80,641,41,white,880,400);
    for(let k=0;k<4;k++){const xx=80+(k%2)*446,yy=776+Math.floor(k/2)*237;photo(k,xx,yy,424,215);}
    txt('Предложим варианты лично для вас.',80,1283,37,white,880,400);
    box(80,1370,880,94,lime,47);txt('ПОДБОР В WHATSAPP  ↗',117,1399,39,ink,825);
    txt('+7 707 922 3074',80,1512,58,white,880,700);txt('steppe-gray.vercel.app',80,1614,37,muted,880,500);
   }
  }
  const frames=[];for(let i=0;i<6;i++){drawScene(i);const f=document.createElement('canvas');f.width=1080;f.height=1920;f.getContext('2d').drawImage(c.canvas,0,0);frames.push(f);}
  window.draw=(t)=>{const i=Math.min(5,Math.floor(t/5)),u=t-i*5;c.clearRect(0,0,1080,1920);c.drawImage(frames[i],0,0);if(i>0&&u<.75){const p=u/.75;c.save();c.globalAlpha=1-p*p*(3-2*p);c.drawImage(frames[i-1],0,0);c.restore();}};
 },{assets,products});
 const staticFrames=[];
 for(let i=0;i<6;i++){await page.evaluate(t=>window.draw(t),i*5+1);staticFrames.push(await page.screenshot({type:'jpeg',quality:96}));await page.screenshot({path:`${tmp}/scene-${i}.png`});}
 await page.evaluate(()=>window.draw(1));await page.screenshot({path:`${out}/reels-cover.png`});
 if(!process.argv.includes('--preview')){
  const output=`${out}/steppe-nike-for-everyone.mp4`;
  const enc=spawn(ffmpeg,['-hide_banner','-loglevel','warning','-y','-f','image2pipe','-framerate',String(fps),'-vcodec','mjpeg','-i','pipe:0','-i',`${tmp}/soundtrack.wav`,'-map','0:v:0','-map','1:a:0','-vf','scale=in_range=pc:out_range=tv:in_color_matrix=bt601:out_color_matrix=bt709,format=yuv420p','-c:v','libx264','-preset','fast','-crf','18','-color_range','tv','-colorspace','bt709','-color_primaries','bt709','-color_trc','bt709','-af','loudnorm=I=-18:TP=-3:LRA=11,alimiter=limit=0.84:level=false','-ar','48000','-c:a','aac','-b:a','192k','-t',String(duration),'-movflags','+faststart',output],{windowsHide:true,stdio:['pipe','ignore','pipe']});
  let err='';enc.stderr.on('data',b=>err+=b);const done=new Promise((ok,no)=>{enc.on('error',no);enc.on('close',code=>code===0?ok():no(Error(err)));});
  for(let f=0;f<duration*fps;f++){
   const t=f/fps,i=Math.min(5,Math.floor(t/5)),u=t-i*5;let frame=staticFrames[i];
   if(i>0&&u<.75){await page.evaluate(t=>window.draw(t),t);frame=await page.screenshot({type:'jpeg',quality:96});}
   if(!enc.stdin.write(frame))await once(enc.stdin,'drain');if(f%150===0)console.log(`Reels: ${f}/${duration*fps}`);
  }
  enc.stdin.end();await done;console.log(output);
 }
}finally{await browser.close();}
