// Анимационный монтаж шести реальных фотографий, выбранных пользователем.
import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
const out='marketing/reels-selected-six-remix-2026-09-26',tmp='artifacts/reels-selected-six-remix-render';
const fps=30,duration=15;
await mkdir(tmp,{recursive:true});
const ffmpeg=process.env.FFMPEG_PATH||execFileSync('python',['-c','import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())'],{encoding:'utf8'}).trim();
const assets={};
for(const p of JSON.parse(await readFile(out+'/references/products.json','utf8')).products)assets[p.sku]='data:image/jpeg;base64,'+(await readFile(out+'/references/'+p.sku+'.jpg')).toString('base64');
// 128 BPM: ровно 32 доли на 15 секунд. Оригинальный синтезированный garage-бит.
const beat=60/128,sr=48000,count=sr*duration,wav=Buffer.alloc(44+count*4);let seed=82341;
const noise=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/2147483648-1;};
wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(2,22);wav.writeUInt32LE(sr,24);wav.writeUInt32LE(sr*4,28);wav.writeUInt16LE(4,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(count*4,40);
for(let i=0;i<count;i++){
 const t=i/sr,b=t%beat,n=Math.floor(t/beat),six=t%(beat/4),st=Math.floor(t/(beat/4)),half=t%(beat/2),root=[55,55,65.406,49][Math.floor(n/8)%4];
 const kick=Math.sin(2*Math.PI*(48*b+6.5*(1-Math.exp(-43*b))))*Math.exp(-22*b)*.62;
 const clap=n%2?noise()*Math.exp(-65*b)*.23:0;
 const hat=noise()*Math.exp(-250*six)*(st%4===2?.075:.026);
 const bass=(Math.sin(2*Math.PI*root*t)+.3*Math.sin(2*Math.PI*root*2*t))*Math.exp(-11*half)*.23;
 const note=[440,0,523.25,659.25,0,587.33,523.25,0][st%8];
 const lead=note?Math.sin(2*Math.PI*note*t)*Math.exp(-42*six)*.047:0;
 const chime=(n===16||n===24)?Math.sin(2*Math.PI*1046.5*t)*Math.exp(-9*b)*.045:0;
 const whoosh=[1.875,7.5,11.25].reduce((v,cut)=>{const d=cut-t;return v+(d>0&&d<.18?noise()*(1-d/.18)*.09:0);},0);
 const fade=Math.min(1,t/.008,(duration-t)/.1),v=(kick+clap+hat+bass+lead+chime+whoosh)*fade;
 for(let ch=0;ch<2;ch++)wav.writeInt16LE(Math.round(Math.tanh(v*1.05+lead*Math.sin(t*3)*(ch?.25:-.25))*.8*32767),44+i*4+ch*2);
}
await writeFile(`${out}/instrumental.wav`,wav);
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1080,height:1920},deviceScaleFactor:1});
 await page.setContent('<html><style>*{margin:0}body{overflow:hidden}canvas{display:block}</style><canvas width="1080" height="1920"></canvas></html>');
 await page.evaluate(async assets=>{
  const images={},crops={},backs={};
  for(const[k,v]of Object.entries(assets)){
   const im=new Image();im.src=v;await im.decode();images[k]=im;
   // Определяем рамку предмета для видеокадрирования; исходные файлы не меняем.
   const a=document.createElement('canvas');a.width=a.height=200;const ac=a.getContext('2d');ac.drawImage(im,0,0,200,200);const d=ac.getImageData(0,0,200,200).data,bg=[d[0],d[1],d[2]];backs[k]=`rgb(${bg.join(',')})`;
   let x0=200,y0=200,x1=0,y1=0;for(let y=0;y<200;y++)for(let x=0;x<200;x++){const j=(y*200+x)*4;if(Math.max(...bg.map((v,n)=>Math.abs(v-d[j+n])))>38){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}}
   const pad=9;x0=Math.max(0,x0-pad);y0=Math.max(0,y0-pad);x1=Math.min(200,x1+pad);y1=Math.min(200,y1+pad);crops[k]=[x0/200*im.width,y0/200*im.height,(x1-x0)/200*im.width,(y1-y0)/200*im.height];
  }
  const keys=['377718_03','311947_01','310168_20','310783_02','100272598','100209953'],c=document.querySelector('canvas').getContext('2d'),ink='#151515',cream='#f4f0e6',lime='#d0ff43',violet='#bfa4ff',pink='#ff87b8';
  const names=['STARLA','SOFTRIDE ENZO 5','CELL THRILL','MAGNETIC','VIVA SPEED','ENERGEN RUN 4'];
  const moods=[['МЯГКИЙ','АКЦЕНТ.'],['ЧЁРНЫЙ','РЕЖИМ.'],['СВЕТЛАЯ','СТОРОНА.'],['ДОБАВЬ','КРАСНОГО.'],['СПОКОЙНЫЙ','ТОН.'],['ЯРКИЙ','ФИНИШ.']];
  const tones=[pink,lime,violet,pink,violet,lime],beat=60/128;
  const clamp=x=>Math.max(0,Math.min(1,x)),ease=x=>1-(1-clamp(x))**3;
  function box(x,y,w,h,col,r=0){c.fillStyle=col;c.beginPath();c.roundRect(x,y,w,h,r);c.fill();}
  function text(s,x,y,size,col=cream,max=924,font='Arial',weight=800){c.textAlign='left';c.textBaseline='top';c.font=`${weight} ${size}px ${font}`;const w=c.measureText(s).width;if(w>max)c.font=`${weight} ${size*max/w}px ${font}`;c.fillStyle=col;c.fillText(s,x,y);}
  function shoe(i,x,y,w,h){const k=keys[i],q=crops[k],s=Math.min(w/q[2],h/q[3]),dw=q[2]*s,dh=q[3]*s;c.drawImage(images[k],...q,x+(w-dw)/2,y+(h-dh)/2,dw,dh);}
  function header(){text('STEPPE',73,161,47,cream,440,'Arial',900);box(872,174,126,14,lime);}
  function grain(){c.save();c.globalAlpha=.1;c.fillStyle=cream;for(let y=0;y<1920;y+=32)for(let x=(y%64?15:0);x<1080;x+=32){c.beginPath();c.arc(x,y,1.2,0,7);c.fill();}c.restore();}
  function sticker(s,x,y,w,color,angle=0){c.save();c.translate(x+w/2,y+36);c.rotate(angle);box(-w/2,-36,w,72,color);text(s,-w/2+19,-18,31,ink,w-38);c.restore();}
  function photoCard(i,x,y,w,h,angle=0){c.save();c.translate(x+w/2,y+h/2);c.rotate(angle);c.shadowColor='rgba(0,0,0,.38)';c.shadowBlur=25;c.shadowOffsetY=14;box(-w/2,-h/2,w,h,backs[keys[i]],5);c.shadowBlur=c.shadowOffsetY=0;c.beginPath();c.rect(-w/2,-h/2,w,h);c.clip();shoe(i,-w/2+12,-h/2+22,w-24,h-44);c.restore();}
  function ribbon(t,y){c.save();c.translate(540,y);c.rotate(-.065);c.translate(-540,-y);const sh=(t*65)%340;for(let j=-1;j<5;j++){const i=((j+Math.floor(t*65/340))%6+6)%6;photoCard(i,j*340-sh,y,320,224,0);}c.restore();}
  function drawScene(t){
   box(0,0,1080,1920,ink);grain();header();
   if(t<1.875){
    text('КАКАЯ',72,293,191,cream,920,'Impact');text('ТВОЯ?',72,492,216,lime,915,'Impact');
    // Заставка удерживает один неподвижный план.
    photoCard(3,87,835,901,557,-.055);
    sticker('6 ПАР. ОДИН ВАЙБ.',115,1439,575,violet,.045);
    text('ВЫБИРАЙ ПО СВОЕМУ ВКУСУ',80,1586,36,cream,920);
   }else if(t<7.5){
    const i=Math.min(5,Math.floor((t-1.875)/(beat*2))),color=tones[i];
    text(moods[i][0],74,319,133,cream,920,'Impact');text(moods[i][1],74,462,161,color,920,'Impact');
    // Карточка неподвижна: один масштаб и положение на протяжении всего плана.
    photoCard(i,65,779,950,614,-.03);
    sticker(String(i+1).padStart(2,'0'),70,701,118,color,-.07);
    sticker(i<4?'PUMA':'REEBOK',721,1391,274,color,.06);
    text(names[i],76,1517,68,cream,920,'Impact');
    for(let j=0;j<6;j++)box(76+j*156,1651,133,5,j<=i?color:'#44433f');
   }else if(t<11.25){
    const u=t-7.5;sticker('ПАУЗА — И ВЫБИРАЙ',76,282,609,lime,-.028);
    text('ТВОЙ НОМЕР?',76,415,131,cream,920,'Impact');
    const active=-1;
    for(let i=0;i<6;i++){const x=76+(i%2)*474,y=658+Math.floor(i/2)*275,w=450,h=243;photoCard(i,x,y,w,h,0);box(x+12,y+11,66,56,i===active?lime:ink);text(String(i+1),x+29,y+15,42,i===active?ink:cream,55,'Impact');if(i===active){c.strokeStyle=lime;c.lineWidth=5;c.strokeRect(x-5,y-5,w+10,h+10);}}
    text('НАПИШИ ЕГО В КОММЕНТАРИЯХ',77,1530,42,cream,923);
    text('ИЛИ ОТПРАВЬ ТОМУ, КТО ВЫБИРАЕТ ДОЛГО',77,1604,27,violet,923);
   }else{
    const u=t-11.25;sticker('ВЫБРАЛ?',76,285,280,violet,-.035);
    text('ОТКРОЙ',75,405,181,cream,927,'Impact');text('КАТАЛОГ.',75,601,181,lime,927,'Impact');
    ribbon(u,881);ribbon(u+.7,1168);
    box(74,1480,931,104,lime,12);text('steppe-gray.vercel.app',99,1507,60,ink,881);
    text('Заказываем после оплаты',77,1620,38,cream,924);
   }
  }
  // Мягкое наложение соседних сцен за 0,32 с. Геометрия товара не меняется.
  const previous=document.createElement('canvas');previous.width=1080;previous.height=1920;
  const pc=previous.getContext('2d');let cachedBoundary=-1;
  const boundaries=[1.875,2.8125,3.75,4.6875,5.625,6.5625,7.5,11.25];
  window.draw=t=>{
   const boundary=boundaries.find(b=>t>=b&&t<b+.32);
   if(boundary!==undefined){
    if(cachedBoundary!==boundary){drawScene(boundary-.0001);pc.clearRect(0,0,1080,1920);pc.drawImage(c.canvas,0,0);cachedBoundary=boundary;}
    drawScene(t);const u=clamp((t-boundary)/.32),alpha=u*u*(3-2*u);
    c.save();c.globalAlpha=1-alpha;c.drawImage(previous,0,0);c.restore();
   }else drawScene(t);
  };
  window.verifyStableCards=()=>{
   for(let i=0;i<6;i++){const start=1.875+i*.9375;window.draw(start+.38);const a=c.canvas.toDataURL();window.draw(start+.78);if(a!==c.canvas.toDataURL())throw new Error('Карточка меняет масштаб или положение: '+i);}
   return 'Все 6 отдельных карточек неподвижны после появления';
  };
 },assets);


 console.log(await page.evaluate(()=>window.verifyStableCards()));
 for(const[i,t]of[.3,1.5,2.3,3.2,4.1,5.1,6.1,7.1,8.5,12.7].entries()){await page.evaluate(t=>window.draw(t),t);await page.screenshot({path:`${tmp}/frame-${i}.jpg`,type:'jpeg',quality:94});}
 await page.evaluate(()=>window.draw(8.5));await page.screenshot({path:`${out}/cover.png`});
 if(!process.argv.includes('--preview')){
  const clean=false,name='steppe-your-vibe.mp4';
  const enc=spawn(ffmpeg,['-hide_banner','-loglevel','warning','-y','-f','image2pipe','-framerate',String(fps),'-vcodec','mjpeg','-i','pipe:0','-i',`${out}/instrumental.wav`,'-map','0:v:0','-map','1:a:0','-vf','scale=in_range=pc:out_range=tv:in_color_matrix=bt601:out_color_matrix=bt709,format=yuv420p','-c:v','libx264','-preset','fast','-crf','18','-color_range','tv','-colorspace','bt709','-color_primaries','bt709','-color_trc','bt709','-c:a','aac','-b:a','192k','-t',String(duration),'-movflags','+faststart',`${out}/${name}`],{stdio:['pipe','ignore','pipe']});
  let errors='';enc.stderr.on('data',b=>errors+=b);const done=new Promise((resolve,reject)=>{enc.on('error',reject);enc.on('close',code=>code===0?resolve():reject(new Error(errors)));});
  for(let f=0;f<duration*fps;f++){await page.evaluate(({t,clean})=>window.draw(t,clean),{t:f/fps,clean});const b=await page.screenshot({type:'jpeg',quality:95});if(!enc.stdin.write(b))await once(enc.stdin,'drain');if(f%90===0)console.log(`${name}: ${f}/${duration*fps}`);}
  enc.stdin.end();await done;console.log(`${name}: готово`);
 }
}finally{await browser.close();}
