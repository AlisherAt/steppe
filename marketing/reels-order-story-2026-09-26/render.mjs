// Иллюстративный ролик: плавный монтаж AI-сцен, точные титры и оригинальная музыка.
import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
const out='marketing/reels-order-story-2026-09-26',tmp='artifacts/reels-order-story-render';
const fps=30,duration=15;
await mkdir(tmp,{recursive:true});
const ffmpeg=process.env.FFMPEG_PATH||execFileSync('python',['-c','import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())'],{encoding:'utf8'}).trim();
const assets={};
for(const name of ['browse','selected','macro','hero'])assets[name]='data:image/png;base64,'+(await readFile(`${out}/scenes/${name}.png`)).toString('base64');
// 120 BPM. Без сторонних записей: синтез ударных, баса, аккордов и мягких переходов.
const sr=48000,count=sr*duration,wav=Buffer.alloc(44+count*4);let seed=68042;
const noise=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/2147483648-1;};
wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(2,22);wav.writeUInt32LE(sr,24);wav.writeUInt32LE(sr*4,28);wav.writeUInt16LE(4,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(count*4,40);
for(let i=0;i<count;i++){
 const t=i/sr,b=t%0.5,e=t%0.25,n=Math.floor(t*2),root=[55,65.406,73.416,49][Math.floor(t/2)%4];
 const kick=Math.sin(2*Math.PI*(49*b+8*(1-Math.exp(-35*b))))*Math.exp(-20*b)*0.52;
 const clap=n%2?noise()*Math.exp(-48*b)*0.17:0,hat=noise()*Math.exp(-170*e)*0.042;
 const bass=(Math.sin(2*Math.PI*root*t)+0.18*Math.sin(4*Math.PI*root*t))*Math.exp(-7*b)*0.17;
 const note=[220,261.626,329.628,293.665,261.626,220,196,246.942][Math.floor(t*4)%8];
 const pluck=Math.sin(2*Math.PI*note*t)*Math.exp(-18*e)*0.047;
 const chord=(Math.sin(2*Math.PI*root*4*t)+Math.sin(2*Math.PI*root*6*t)+Math.sin(2*Math.PI*root*7*t))*0.012;
 const fade=Math.min(1,t/0.02,(duration-t)/0.4),v=(kick+clap+hat+bass+pluck+chord)*fade;
 for(let ch=0;ch<2;ch++)wav.writeInt16LE(Math.round(Math.tanh(v+pluck*Math.sin(t*2)*(ch?0.15:-0.15))*0.79*32767),44+i*4+ch*2);
}
await writeFile(`${out}/instrumental.wav`,wav);
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1080,height:1920},deviceScaleFactor:1});
 await page.setContent('<html><style>*{margin:0}body{overflow:hidden}canvas{display:block}</style><canvas width="1080" height="1920"></canvas></html>');
 await page.evaluate(async assets=>{
  const images={};for(const[k,v]of Object.entries(assets)){const im=new Image();im.src=v;await im.decode();images[k]=im;}
  const c=document.querySelector('canvas').getContext('2d'),cream='#fff6e7',sage='#d4ddba';
  const clamp=x=>Math.max(0,Math.min(1,x)),smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
  function photo(key,zoom=1,px=0,py=0,alpha=1){const im=images[key],s=Math.max(1080/im.width,1920/im.height)*zoom,w=im.width*s,h=im.height*s;c.save();c.globalAlpha=alpha;c.drawImage(im,(1080-w)/2+px,(1920-h)/2+py,w,h);c.restore();}
  function line(points,col=cream,width=6){c.strokeStyle=col;c.lineWidth=width;c.lineCap=c.lineJoin='round';c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.stroke();}
  function rounded(x,y,w,h,r,fill,stroke){c.beginPath();c.roundRect(x,y,w,h,r);if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=4;c.stroke();}}
  function caption(lines,y,size,alpha){c.save();c.globalAlpha=alpha;c.textAlign='center';c.textBaseline='top';c.font=`600 ${size}px Arial`;c.fillStyle=cream;c.shadowColor='rgba(0,0,0,0.55)';c.shadowBlur=20;for(let i=0;i<lines.length;i++)c.fillText(lines[i],540,y+i*(size+13));c.restore();}
  function tick(x,y,k){c.save();c.beginPath();c.rect(x-35,y-35,70*clamp(k),70);c.clip();line([[x-23,y],[x-5,y+18],[x+29,y-20]],sage,6);c.restore();}
  function process(t){const p=smooth((t-7.2)/0.55);c.save();c.globalAlpha=p;
   rounded(188,390,704,184,35,'rgba(12,20,23,.6)','rgba(212,221,186,.25)');
   rounded(242,442,133,84,12,null,cream);line([[247,463],[370,463]],cream,8);line([[261,506],[291,506]],cream,5);
   tick(398,498,(t-7.9)/0.45);
   const arrow=smooth((t-8.6)/0.55);c.save();c.globalAlpha*=arrow;line([[468,485],[596,485]],sage,5);line([[578,466],[597,485],[578,504]],sage,5);c.restore();
   const order=smooth((t-9.1)/0.5);c.save();c.globalAlpha*=0.28+order*0.72;
   rounded(665,444,114,100,12,null,cream);c.strokeStyle=cream;c.lineWidth=5;c.beginPath();c.arc(722,447,27,Math.PI,0);c.stroke();tick(723,497,(t-9.5)/0.5);c.restore();c.restore();
  }
  window.draw=(t,clean=false)=>{
   c.fillStyle='#0b1012';c.fillRect(0,0,1080,1920);
   if(t<3){photo('browse',1.025+t*0.013,-7+t*3,9-t*5);}
   else if(t<4.55){photo('selected',1.035+(t-3)*0.018,-3,0);if(t<3.28)photo('browse',1.064,2,-6,1-smooth((t-3)/0.28));
    const u=clamp((t-3.55)/0.7);if(u>0&&u<1){c.save();c.globalAlpha=(1-u)*0.5;c.strokeStyle=sage;c.lineWidth=4;c.beginPath();c.arc(546,1180,28+u*78,0,Math.PI*2);c.stroke();c.restore();}
   }else if(t<7){const u=(t-4.55)/2.45;photo('macro',1.16-u*0.09,24-48*u,20*u);if(t<4.95)photo('selected',1.1+(t-4.55)*0.8,0,0,1-smooth((t-4.55)/0.4));}
   else {const u=clamp((t-7)/8);photo('hero',1.055-u*0.03,8-u*12,8-u*8);if(t<7.45)photo('macro',1.07,-24,20,1-smooth((t-7)/0.45));if(t<11)process(t);}
   // Только три фразы, разрешённые брифом. Чистая версия сохраняет место для титров.
   if(!clean){
    if(t<4.5)caption(['Выбирай свою пару'],232,64,smooth(t/0.45)*(1-smooth((t-4.15)/0.35)));
    if(t>=7&&t<11)caption(['Заказываем','после оплаты'],206,64,smooth((t-7)/0.4)*(1-smooth((t-10.6)/0.4)));
    if(t>=11)caption(['Открой каталог'],1490,68,smooth((t-11)/0.55));
   }
   // Лёгкая виньетка объединяет планы; без мерцаний и резких световых вспышек.
   const g=c.createRadialGradient(540,960,620,540,960,1180);g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(1,'rgba(0,0,0,.18)');c.fillStyle=g;c.fillRect(0,0,1080,1920);
  };
 },assets);
 for(const[i,t]of[1,3.75,5.7,8.2,10,13].entries()){await page.evaluate(t=>window.draw(t),t);await page.screenshot({path:`${tmp}/frame-${i}.jpg`,type:'jpeg',quality:94});}
 await page.evaluate(()=>window.draw(13));await page.screenshot({path:`${out}/cover.png`});
 if(!process.argv.includes('--preview')){
  const clean=process.argv.includes('--clean'),name=clean?'order-story-clean.mp4':'order-story.mp4';
  const enc=spawn(ffmpeg,['-hide_banner','-loglevel','warning','-y','-f','image2pipe','-framerate',String(fps),'-vcodec','mjpeg','-i','pipe:0','-i',`${out}/instrumental.wav`,'-map','0:v:0','-map','1:a:0','-vf','scale=in_range=pc:out_range=tv:in_color_matrix=bt601:out_color_matrix=bt709,format=yuv420p','-c:v','libx264','-preset','fast','-crf','18','-color_range','tv','-colorspace','bt709','-color_primaries','bt709','-color_trc','bt709','-c:a','aac','-b:a','192k','-t',String(duration),'-movflags','+faststart',`${out}/${name}`],{stdio:['pipe','ignore','pipe']});
  let errors='';enc.stderr.on('data',b=>errors+=b);const done=new Promise((resolve,reject)=>{enc.on('error',reject);enc.on('close',code=>code===0?resolve():reject(new Error(errors)));});
  for(let f=0;f<duration*fps;f++){await page.evaluate(({t,clean})=>window.draw(t,clean),{t:f/fps,clean});const b=await page.screenshot({type:'jpeg',quality:95});if(!enc.stdin.write(b))await once(enc.stdin,'drain');if(f%90===0)console.log(`${name}: ${f}/${duration*fps}`);}
  enc.stdin.end();await done;console.log(`${name}: готово`);
 }
}finally{await browser.close();}
