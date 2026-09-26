// Монтаж только из проверенных товарных фото STEPPE: форма и расцветка не меняются.
import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
const out='marketing/reels-casting-2026-09-26', tmp='artifacts/reels-casting-render';
const fps=30, duration=18;
await mkdir(tmp,{recursive:true});
const ffmpeg=process.env.FFMPEG_PATH||execFileSync('python',['-c','import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())'],{encoding:'utf8'}).trim();
const cast=[
 {sku:'100245685',brand:'REEBOK',name:'CLASSIC AZ',tag:'ДОБАВЬ ЦВЕТА',color:'#dbeaa5'},
 {sku:'311140_25',brand:'PUMA',name:'VELOCITY NITRO 4',tag:'ЛОВИ СВОЙ ТЕМП',color:'#a4e6dd'},
 {sku:'100256877',brand:'REEBOK',name:'CLUB C GROUNDS UK',tag:'ВЫБИРАЙ ЗАМШУ',color:'#e7c3a2'},
 {sku:'311744_05',brand:'PUMA',name:'FUSE 4.0',tag:'ВКЛЮЧАЙ ДВИЖЕНИЕ',color:'#c6b6fa'},
 {sku:'100245042',brand:'REEBOK',name:'CLASSIC LEATHER 1983',tag:'ПРИСМОТРИСЬ К ПРИНТУ',color:'#c5d1b5'},
 {sku:'10023264256304',brand:'REEBOK',name:'CLUB C LTD',tag:'ДЕЛАЙ АКЦЕНТ',color:'#ffd34f'},
];
const verification=JSON.parse(await readFile(`${out}/references/catalog-check.json`,'utf8'));
const assets={};
for(const s of cast){
 if(!verification.products.some(p=>p.sku===s.sku&&p.sizes.length))throw new Error('Модель не подтверждена каталогом: '+s.sku);
 assets[s.sku]='data:image/jpeg;base64,'+(await readFile(`${out}/references/${s.sku}.jpg`)).toString('base64');
}
// Оригинальная звуковая дорожка: 120 BPM, бас, ударные и короткие акценты монтажа.
const sr=48000,count=sr*duration,wav=Buffer.alloc(44+count*2);let seed=271828;
const noise=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/2147483648-1;};
wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(sr,24);wav.writeUInt32LE(sr*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(count*2,40);
for(let i=0;i<count;i++){
 const t=i/sr,b=t%0.5,e=t%0.25,n=Math.floor(t*2),root=[55,65.406,73.416,55][Math.floor(t/2)%4];
 const kick=Math.sin(2*Math.PI*(48*b+9*(1-Math.exp(-34*b))))*Math.exp(-18*b)*0.64;
 const clap=n%2?noise()*Math.exp(-40*b)*0.23:0;
 const hat=noise()*Math.exp(-160*e)*0.055;
 const bass=(Math.sin(2*Math.PI*root*t)+0.22*Math.sin(4*Math.PI*root*t))*Math.exp(-7*b)*0.21;
 const tick=Math.sin(2*Math.PI*([440,523.25,659.25,587.33][Math.floor(t*4)%4])*t)*Math.exp(-40*e)*0.055;
 const u=(t+1)%1.5,swish=u>1.36?noise()*(u-1.36)*0.5:0;
 const sample=Math.tanh((kick+clap+hat+bass+tick+swish)*1.18)*0.86*Math.min(1,t/0.006,(duration-t)/0.035);
 wav.writeInt16LE(Math.round(sample*32767),44+i*2);
}
await writeFile(`${tmp}/beat.wav`,wav);
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1080,height:1920},deviceScaleFactor:1});
 await page.setContent('<html><style>*{margin:0}body{overflow:hidden}canvas{display:block}</style><canvas width="1080" height="1920"></canvas></html>');
 await page.evaluate(async({assets,cast})=>{
  const imgs={},backs={};
  for(const[k,src]of Object.entries(assets)){const im=new Image();im.src=src;await im.decode();imgs[k]=im;
   const sample=document.createElement('canvas');sample.width=sample.height=1;const x=sample.getContext('2d');x.drawImage(im,0,0,1,1,0,0,1,1);const p=x.getImageData(0,0,1,1).data;backs[k]=`rgb(${p[0]},${p[1]},${p[2]})`;
  }
  const c=document.querySelector('canvas').getContext('2d'),ink='#141912',white='#f8f8ef',lime='#c4ff52';
  const clamp=x=>Math.max(0,Math.min(1,x)),ease=x=>1-(1-clamp(x))**3;
  function box(x,y,w,h,col,r=0){c.fillStyle=col;c.beginPath();c.roundRect(x,y,w,h,r);c.fill();}
  function text(s,x,y,size,col=ink,max=924,font='Arial',weight=800){c.textBaseline='top';c.font=`${weight} ${size}px ${font}`;const w=c.measureText(s).width;if(w>max)c.font=`${weight} ${size*max/w}px ${font}`;c.fillStyle=col;c.fillText(s,x,y);}
  function crop(s){return s.brand==='PUMA'?[0,500,2000,1000]:[0,770,2000,850];}
  function shoe(index,x,y,w,angle=0){const s=cast[index],cut=crop(s),h=w*cut[3]/cut[2];c.save();c.translate(x+w/2,y+h/2);c.rotate(angle);c.drawImage(imgs[s.sku],...cut,-w/2,-h/2,w,h);c.restore();}
  function header(dark=false){text('STEPPE',74,164,55,dark?white:ink,550,'Arial',900);text('SNEAKER CASTING',706,182,24,dark?lime:ink,300,'Arial',700);}
  function corners(x,y,w,h,col){c.strokeStyle=col;c.lineWidth=4;for(const[px,py,dx,dy]of[[x,y,1,1],[x+w,y,-1,1],[x,y+h,1,-1],[x+w,y+h,-1,-1]]){c.beginPath();c.moveTo(px+38*dx,py);c.lineTo(px,py);c.lineTo(px,py+38*dy);c.stroke();}}
  function reelRow(t,y,offset){
   const shift=((t*620+offset)%2820+2820)%2820;
   for(let j=-1;j<10;j++){const index=(j+6)%6,x=j*470-shift;const bg=backs[cast[index].sku];box(x,y,450,276,bg);shoe(index,x+10,y+22,430);box(x,y+242,450,34,cast[index].color);text(String(index+1).padStart(2,'0'),x+15,y+246,24,ink);}
  }
  function intro(t){box(0,0,1080,1920,ink);header(true);
   text('КАСТИНГ',73,315,189,white,925,'Impact');text('ТВОЕЙ СЛЕДУЮЩЕЙ',76,526,60,lime,920);text('ПАРЫ.',73,604,169,white,900,'Impact');
   c.save();c.translate(540,1055);c.rotate(-0.085);c.translate(-540,-1055);reelRow(t,856,0);reelRow(-t,1170,630);c.restore();
   text('6 КАНДИДАТОВ. ТЫ ВЫБИРАЕШЬ.',76,1592,43,white,930);
  }
  window.draw=t=>{
   if(t<2||t>=17.75){intro(t>=17.75?t-17.75:t);return;}
   if(t<11){
    const i=Math.floor((t-2)/1.5),u=(t-2)%1.5,s=cast[i],bg=backs[s.sku];box(0,0,1080,1920,bg);header();
    box(76,287,242,60,s.color);text('КАНДИДАТ '+String(i+1).padStart(2,'0'),93,304,25,ink,210);
    const e=ease(u/0.22);text(s.tag,76+85*(1-e),407,109,ink,922,'Impact');
    text(s.brand,77,550,36,ink);text(s.name,77,601,58,ink,926,'Impact');
    // Увеличение детали происходит внутри отдельного плана, без перерисовки товара.
    const macro=u>=0.9&&u<1.23,w=macro?1600:1040+15*Math.sin(u*3),x=macro?-260:20+(1-e)*560;
    shoe(i,x,macro?766:827,w,macro?0:-0.03+0.025*ease(u/0.8));
    if(!macro){corners(77,780,926,670,ink);c.strokeStyle=s.color;c.lineWidth=4;c.beginPath();c.moveTo(79,800+590*clamp(u/0.8));c.lineTo(1000,800+590*clamp(u/0.8));c.stroke();}
    box(75,1501,929,113,s.color);text(macro?'ПРИБЛИЗИМ ДЕТАЛИ':'ЕСТЬ В КАТАЛОГЕ STEPPE',103,1540,44,ink,867);
    for(let n=0;n<6;n++)box(76+n*156,1669,133,5,n<=i?ink:'#d9d9d2');
   }else if(t<14){
    box(0,0,1080,1920,ink);header(true);text('КТО ПРОХОДИТ',74,322,117,white,933,'Impact');text('КАСТИНГ?',74,454,139,lime,933,'Impact');
    const active=Math.min(5,Math.floor((t-11)*2));
    cast.forEach((s,i)=>{const x=75+(i%2)*475,y=692+Math.floor(i/2)*272,w=s.brand==='PUMA'?368:435;box(x,y,450,247,backs[s.sku]);shoe(i,x+(450-w)/2,y+3,w);box(x,y+191,450,56,s.color);text(String(i+1),x+18,y+200,36,ink,60,'Impact');text(s.brand,x+67,y+210,24,ink,340);
     if(i===active){c.strokeStyle=lime;c.lineWidth=7;c.strokeRect(x-6,y-6,462,259);}
    });text('ТВОЙ ФАВОРИТ — 1, 2, 3, 4, 5 ИЛИ 6?',76,1581,41,white,934);
   }else{
    const u=t-14;box(0,0,1080,1920,ink);header(true);
    text('ТВОЯ ПАРА',74,319,151,white,931,'Impact');text('ЖДЁТ НА САЙТЕ.',74,479,125,lime,934,'Impact');
    const index=Math.floor(u*2)%6,s=cast[index];box(75,730,930,608,backs[s.sku],16);shoe(index,89,800,901,0);
    box(75,1260,930,78,s.color);text(s.brand+' / '+s.name,100,1285,35,ink,875);
    text('EU · ЦЕНЫ В ₸ · ЗАКАЗ В WHATSAPP',76,1394,35,white,925);
    box(75,1474,930,112,lime,16);text('steppe-gray.vercel.app',105,1506,60,ink,870);
    text('НАПИШИ НОМЕР ФАВОРИТА В КОММЕНТАРИЯХ',77,1640,27,white,925);
   }
  };
 },{assets,cast});
 for(const[i,t]of[0.5,2.35,2.99,5.4,8.3,10.5,12.5,15.5].entries()){await page.evaluate(t=>window.draw(t),t);await page.screenshot({path:`${tmp}/frame-${i}.jpg`,type:'jpeg',quality:92});}
 await page.evaluate(()=>window.draw(12.5));await page.screenshot({path:`${out}/cover.png`});
 if(!process.argv.includes('--preview')){
  const enc=spawn(ffmpeg,['-hide_banner','-loglevel','warning','-y','-f','image2pipe','-framerate',String(fps),'-vcodec','mjpeg','-i','pipe:0','-i',`${tmp}/beat.wav`,'-map','0:v:0','-map','1:a:0','-vf','scale=in_range=pc:out_range=tv:in_color_matrix=bt601:out_color_matrix=bt709,format=yuv420p','-c:v','libx264','-preset','fast','-crf','18','-color_range','tv','-colorspace','bt709','-color_primaries','bt709','-color_trc','bt709','-c:a','aac','-b:a','192k','-ac','2','-t',String(duration),'-movflags','+faststart',`${out}/steppe-sneaker-casting.mp4`],{stdio:['pipe','ignore','pipe']});
  let errors='';enc.stderr.on('data',b=>errors+=b);const done=new Promise((resolve,reject)=>{enc.on('error',reject);enc.on('close',code=>code===0?resolve():reject(new Error(errors)));});
  for(let f=0;f<fps*duration;f++){await page.evaluate(t=>window.draw(t),f/fps);const b=await page.screenshot({type:'jpeg',quality:94});if(!enc.stdin.write(b))await once(enc.stdin,'drain');if(f%90===0)console.log(`Кадры ${f}/${fps*duration}`);}
  enc.stdin.end();await done;console.log('Видео готово');
 }
}finally{await browser.close();}
