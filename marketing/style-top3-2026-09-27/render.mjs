import { chromium } from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {spawn,execFileSync} from 'node:child_process';
import {once} from 'node:events';
// Монтаж двух редакционных подборок по сохранённым данным живого каталога.
const audience=process.argv.includes('women')?'women':'men';
const out='marketing/style-top3-2026-09-27/'+audience,tmp='artifacts/style-top3-render-'+audience;
await mkdir(tmp,{recursive:true});
const ff=process.env.FFMPEG_PATH||execFileSync('python',['-c','import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())'],{encoding:'utf8',windowsHide:true}).trim();
const story=JSON.parse(await readFile(out+'/story.json','utf8'));
const products=JSON.parse(await readFile(out+'/references/products.json','utf8'));
const assets=await Promise.all(products.map(async p=>'data:image/png;base64,'+(await readFile(out+'/references/'+p.files[0])).toString('base64')));
const rate=48000,fps=30,segments=[];let time=0;
for(let s=0;s<story.length;s++){
 story[s].start=time;
 for(let l=0;l<story[s].lines.length;l++){
  const pcm=execFileSync(ff,['-v','error','-i',`${out}/voice/${s}-${l}.wav`,'-f','f32le','-ar',String(rate),'-ac','1','pipe:1'],{windowsHide:true,maxBuffer:8e6});
  const samples=new Float32Array(pcm.buffer,pcm.byteOffset,pcm.length/4),duration=samples.length/rate;
  segments.push({scene:s,line:l,start:time,end:time+Math.max(3.2,duration+.6),voiceStart:time+.3,samples});
  time=segments.at(-1).end;
 }
 story[s].end=time;
}
const duration=Math.ceil(time+.8);
await writeFile(out+'/timeline.json',JSON.stringify({duration,segments:segments.map(({samples,...s})=>s)},null,2));
const stamp=t=>{const ms=Math.round(t*1000);return `${String(Math.floor(ms/3600000)).padStart(2,'0')}:${String(Math.floor(ms/60000)%60).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')},${String(ms%1000).padStart(3,'0')}`;};
await writeFile(out+'/subtitles-ru.srt',segments.map((s,i)=>`${i+1}\n${stamp(s.start)} --> ${stamp(s.end)}\n${story[s.scene].lines[s.line].text}\n`).join('\n'));
function wavHeader(n){const b=Buffer.alloc(44+n*4);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(2,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*4,28);b.writeUInt16LE(4,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(n*4,40);return b;}
const voice=new Float32Array(duration*rate);
for(const seg of segments){let peak=.01;for(const v of seg.samples)peak=Math.max(peak,Math.abs(v));for(let i=0;i<seg.samples.length;i++)voice[Math.floor(seg.voiceStart*rate)+i]+=seg.samples[i]*(.66/peak);}
const mix=wavHeader(voice.length),music=wavHeader(voice.length);let seed=927,low=0;
for(let i=0;i<voice.length;i++){
 const t=i/rate,b=t%(60/92),root=[55,65.406,49,58.27][Math.floor(t/(60/92*8))%4];seed=(1664525*seed+1013904223)>>>0;const n=seed/2147483648-1;low=.93*low+.07*n;
 const kick=Math.sin(2*Math.PI*(48*b+3*(1-Math.exp(-35*b))))*Math.exp(-22*b)*.09;
 const hat=(n-low)*Math.exp(-120*(t%(60/92/2)))*.011;
 const chord=[4,5,6].reduce((s,m)=>s+Math.sin(2*Math.PI*root*m*t),0)*.008;
 const bass=Math.sin(2*Math.PI*root*t)*Math.exp(-5*b)*.045;
 const fade=Math.max(0,Math.min(1,t/1.2,(duration-t)/1.5));
 const bed=(kick+hat+chord+bass)*fade;
 for(let ch=0;ch<2;ch++){
  music.writeInt16LE(Math.round(Math.tanh(bed*2.1)*32767),44+i*4+ch*2);
  mix.writeInt16LE(Math.round(Math.tanh(voice[i]+bed*.37)*32767),44+i*4+ch*2);
 }
}
await writeFile(tmp+'/mix.wav',mix);await writeFile(tmp+'/music.wav',music);
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1080,height:1920},deviceScaleFactor:1});
 await page.setContent('<style>*{margin:0}body{overflow:hidden}canvas{display:block}</style><canvas width="1080" height="1920"></canvas>');
 await page.evaluate(async({assets,products,audience})=>{
  const images=await Promise.all(assets.map(async src=>{const im=new Image();im.src=src;await im.decode();return im;}));
  const c=document.querySelector('canvas').getContext('2d');const female=audience==='women';
  const paper=female?'#f6f2f0':'#f3f4ee',ink=female?'#302635':'#222c26',muted='#74766b',accent=female?'#d9c4ef':'#c5f45d';
  function box(x,y,w,h,color,r=0){c.fillStyle=color;c.beginPath();c.roundRect(x,y,w,h,r);c.fill();}
  function text(s,x,y,size,color=ink,max=936,weight=800,align='left'){c.fillStyle=color;c.font=weight+' '+size+'px Arial';c.textAlign=align;c.textBaseline='top';const w=c.measureText(s).width;if(w>max)c.font=weight+' '+size*max/w+'px Arial';c.fillText(s,x,y);}
  function center(s,y,size=36,color=ink,weight=700){text(s,540,y,size,color,936,weight,'center');}
  function photo(i,x,y,w,h){const im=images[i];c.save();c.globalCompositeOperation='multiply';if(w/h>1.55){const sh=Math.min(im.height,im.width*h/w),sy=(im.height-sh)*.65;c.drawImage(im,0,sy,im.width,sh,x,y,w,h);}else{const k=Math.min(w/im.width,h/im.height);c.drawImage(im,x+(w-im.width*k)/2,y+(h-im.height*k)/2,im.width*k,im.height*k);}c.restore();}
  function money(n){return new Intl.NumberFormat('ru-RU').format(n)+' ₸';}
  window.drawFrame=(scene,part)=>{
   box(0,0,1080,1920,paper);text('STEPPE',72,163,45,ink,320,900);text(female?'ДЛЯ ДЕВУШЕК':'ДЛЯ ПАРНЕЙ',1008,179,26,muted,400,700,'right');box(72,240,936,2,'#dcdcd4');
   if(scene===0){
    box(72,306,385,55,accent,27);text('ВЫБОР ПО СТИЛЮ',99,320,28,ink,330,800);
    text('ТОП',65,400,130,ink,480,900);text('3',1006,353,275,ink,440,900,'right');
    text(female?'ДЛЯ ДЕВУШЕК':'ДЛЯ ПАРНЕЙ',72,568,79,ink,936,900);
    // Статичные фото: никаких приближений внутри карточки.
    photo(0,85,724,620,340);photo(1,350,992,650,340);photo(2,65,1244,630,340);
    text('03',892,805,64,muted,100,600);text('02',100,1084,64,muted,100,600);text('01',892,1333,64,ink,100,800);
    center(part===0?'Три пары. Три разных образа.':'Сохрани и выбери свою.',1605,37,ink,700);
   }else if(scene<4){
    const p=products[scene-1];
    box(72,300,110,110,accent,55);text('0'+p.rank,127,326,56,ink,100,900,'center');text(p.tag,213,340,34,ink,788,800);
    text(p.title.split(' ')[0],72,462,30,muted,800,700);text(p.title.split(' ').slice(1).join(' '),68,511,74,ink,940,900);
    photo(scene-1,45,665,990,566);
    center(p.detail,1278,43,ink,800);
    text(part===0?'С ЧЕМ НОСИТЬ':'СОХРАНИ ЭТОТ ОБРАЗ',72,1380,25,muted,820,600);
    p.outfit.forEach((label,i)=>{const x=72+i*322;box(x,1433,299,67,'#ffffff',32);box(x+18,1453,26,26,p.palette[i],13);text(label,x+57,1452,27,ink,222,600);});
    text('В КАТАЛОГЕ STEPPE',72,1570,25,muted,430,600);text(money(p.saleKzt),1008,1541,67,ink,470,900,'right');
    text('Артикул '+p.sku,72,1610,22,muted,500,500);
   }else{
    text('КАКАЯ ПАРА',69,341,86,ink,942,900);text('ТВОЯ?',69,447,141,ink,940,900);
    photo(0,70,658,650,345);photo(1,350,927,650,345);photo(2,65,1196,630,340);
    for(let i=0;i<3;i++){const x=i===1?136:906,y=737+i*269;box(x-46,y-4,92,92,accent,46);text(String(3-i),x,y+14,54,ink,85,900,'center');}
    box(72,1538,936,98,ink,49);center('НАПИШИ 3, 2 ИЛИ 1',1568,37,accent,800);
   }
   if(scene===0){center('Редакционная подборка STEPPE',1723,25,muted,500);}
   else if(scene<4){center('Цены на 27.09.2026 · Размеры уточняйте в каталоге',1714,25,muted,500);}
   else{center('steppe-gray.vercel.app',1680,34,ink,700);center('WhatsApp  +7 707 922 3074',1740,28,muted,500);}
  };
  const frames=[];for(let i=0;i<5;i++)for(let j=0;j<2;j++){window.drawFrame(i,j);const f=document.createElement('canvas');f.width=1080;f.height=1920;f.getContext('2d').drawImage(c.canvas,0,0);frames.push(f);}
  window.draw=(k,blend)=>{c.clearRect(0,0,1080,1920);c.drawImage(frames[k],0,0);if(k>0&&blend<1){c.save();c.globalAlpha=1-blend*blend*(3-2*blend);c.drawImage(frames[k-1],0,0);c.restore();}};
 },{assets,products,audience});
 const stills=[];
 for(let k=0;k<segments.length;k++){await page.evaluate(k=>window.draw(k,1),k);stills.push(await page.screenshot({type:'jpeg',quality:98}));await page.screenshot({path:`${tmp}/frame-${k}.png`});}
 await page.evaluate(()=>window.draw(0,1));await page.screenshot({path:out+'/cover.png'});
 if(!process.argv.includes('--preview')){
  const target=out+'/steppe-top3.mp4';
  const enc=spawn(ff,['-hide_banner','-loglevel','error','-y','-f','image2pipe','-framerate',String(fps),'-vcodec','mjpeg','-i','pipe:0','-i',tmp+'/mix.wav','-map','0:v:0','-map','1:a:0','-vf','scale=in_range=pc:out_range=tv:in_color_matrix=bt601:out_color_matrix=bt709,format=yuv420p','-c:v','libx264','-preset','fast','-crf','17','-colorspace','bt709','-color_primaries','bt709','-color_trc','bt709','-af','loudnorm=I=-16:TP=-1.5:LRA=9','-c:a','aac','-b:a','192k','-ar','48000','-t',String(duration),'-movflags','+faststart',target],{windowsHide:true,stdio:['pipe','ignore','pipe']});
  let err='';enc.stderr.on('data',b=>err+=b);const done=new Promise((ok,no)=>{enc.on('error',no);enc.on('close',code=>code===0?ok():no(Error(err)));});
  for(let f=0;f<duration*fps;f++){const t=f/fps;let k=segments.findIndex(s=>t<s.end);if(k<0)k=segments.length-1;const blend=Math.min(1,(t-segments[k].start)/.65);let frame=stills[k];if(k>0&&blend<1){await page.evaluate(({k,blend})=>window.draw(k,blend),{k,blend});frame=await page.screenshot({type:'jpeg',quality:98});}if(!enc.stdin.write(frame))await once(enc.stdin,'drain');if(f%300===0)console.log(`render ${f}/${duration*fps}`);}
  enc.stdin.end();await done;
  execFileSync(ff,['-v','error','-y','-i',target,'-i',tmp+'/music.wav','-map','0:v:0','-map','1:a:0','-c:v','copy','-af','loudnorm=I=-19:TP=-2:LRA=9','-c:a','aac','-b:a','192k','-ar','48000','-t',String(duration),'-movflags','+faststart',out+'/steppe-top3-music.mp4'],{windowsHide:true});
  console.log(JSON.stringify({duration,output:target}));
 }
}finally{await browser.close();}
