import { chromium } from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {spawn,execFileSync} from 'node:child_process';
import {once} from 'node:events';
const mode=process.argv.includes('men')?'men':process.argv.includes('women')?'women':'combined';
const out='marketing/top3-combined-2026-09-27',tmp='artifacts/outfit-render-'+mode;
await mkdir(tmp,{recursive:true});
const ff=process.env.FFMPEG_PATH||execFileSync('python',['-c','import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())'],{encoding:'utf8',windowsHide:true}).trim();
const allStory=JSON.parse(await readFile(out+'/story.json','utf8')).map((s,voiceScene)=>({...s,voiceScene}));
const story=mode==='combined'?allStory:allStory.filter(s=>s.group===mode||s.type==='outro');
const products=JSON.parse(await readFile(out+'/references/products.json','utf8'));
const assets=await Promise.all(products.map(async p=>'data:image/png;base64,'+(await readFile(out+'/references/'+p.files[0])).toString('base64')));
const lookAssets=await Promise.all(products.map(async p=>'data:image/png;base64,'+(await readFile(out+'/looks/'+p.look+'.png')).toString('base64')));
const rate=48000,fps=30,segments=[];let time=0;
for(let s=0;s<story.length;s++){
 story[s].start=time;
 for(let l=0;l<story[s].lines.length;l++){
  const pcm=execFileSync(ff,['-v','error','-i',`${out}/voice/${story[s].voiceScene}-${l}.wav`,'-f','f32le','-ar',String(rate),'-ac','1','pipe:1'],{windowsHide:true,maxBuffer:8e6});
  const samples=new Float32Array(pcm.buffer,pcm.byteOffset,pcm.length/4),duration=samples.length/rate;
  segments.push({scene:s,line:l,start:time,end:time+Math.max(story[s].type==='product'?4.25:3.2,duration+.6),voiceStart:time+.3,samples});
  time=segments.at(-1).end;
 }
 story[s].end=time;
}
const duration=Math.ceil(time+.8);
if(mode==='combined'&&(duration<60||duration>90))throw Error('Combined video must last 60–90 seconds: '+duration);
console.log({mode,duration});
await writeFile(out+'/'+mode+'-timeline.json',JSON.stringify({duration,segments:segments.map(({samples,...s})=>s)},null,2));
const stamp=t=>{const ms=Math.round(t*1000);return `${String(Math.floor(ms/3600000)).padStart(2,'0')}:${String(Math.floor(ms/60000)%60).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')},${String(ms%1000).padStart(3,'0')}`;};
await writeFile(out+'/'+mode+'-subtitles-ru.srt',segments.map((s,i)=>`${i+1}\n${stamp(s.start)} --> ${stamp(s.end)}\n${story[s.scene].lines[s.line].text}\n`).join('\n'));
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
 await page.evaluate(async({assets,lookAssets,products,story,mode})=>{
  const load=async src=>{const im=new Image();im.src=src;await im.decode();return im;};
  const images=await Promise.all(assets.map(load)),looks=await Promise.all(lookAssets.map(load));
  const c=document.querySelector('canvas').getContext('2d');
  const paper='#f5f2eb',ink='#222924',muted='#697066';let accent='#c8ed85';
  function box(x,y,w,h,color,r=0){c.fillStyle=color;c.beginPath();c.roundRect(x,y,w,h,r);c.fill();}
  function text(s,x,y,size,color=ink,max=936,weight=800,align='left'){c.fillStyle=color;c.font=weight+' '+size+'px Arial';c.textAlign=align;c.textBaseline='top';const w=c.measureText(s).width;if(w>max)c.font=weight+' '+size*max/w+'px Arial';c.fillText(s,x,y);}
  function center(s,y,size=36,color=ink,weight=700){text(s,540,y,size,color,936,weight,'center');}
  function wrap(s,x,y,w,size=38,color=ink,weight=600,gap=49){c.font=weight+' '+size+'px Arial';const lines=[];let row='';for(const word of s.split(' ')){if(c.measureText(row+' '+word).width>w&&row){lines.push(row);row=word;}else row+=(row?' ':'')+word;}if(row)lines.push(row);lines.forEach((l,i)=>text(l,x,y+i*gap,size,color,w,weight));return lines.length;}
  function photo(i,x,y,w,h){const im=images[i];c.save();c.globalCompositeOperation='multiply';if(w/h>1.55){const sh=Math.min(im.height,im.width*h/w),sy=(im.height-sh)*.65;c.drawImage(im,0,sy,im.width,sh,x,y,w,h);}else{const k=Math.min(w/im.width,h/im.height);c.drawImage(im,x+(w-im.width*k)/2,y+(h-im.height*k)/2,im.width*k,im.height*k);}c.restore();}
  function outfit(i,x,y,w,h){const im=looks[i],k=Math.min(w/im.width,h/im.height);c.drawImage(im,x+(w-im.width*k)/2,y+(h-im.height*k)/2,im.width*k,im.height*k);}
  function money(n){return new Intl.NumberFormat('ru-RU').format(n)+' ₸';}
  window.drawFrame=(scene,part)=>{
   const s=story[scene],female=s.group==='women';accent=female?'#dfcceb':'#c8ed85';
   box(0,0,1080,1920,paper);text('STEPPE',70,156,44,ink,330,900);text('КРОССОВКИ + ОБРАЗ',1010,174,25,muted,450,700,'right');box(70,234,940,2,'#dadcd2');
   if(s.type==='intro'){
    box(70,294,556,57,accent,29);text('6 ПАР ИЗ НАШЕГО КАТАЛОГА',95,310,27,ink,510,800);
    text('ТОП-3 КРОССОВОК',65,407,83,ink,950,900);text('ДЛЯ ПАРНЕЙ',65,505,91,ink,950,900);text('И ДЕВУШЕК',65,610,91,ink,950,900);
    for(let i=0;i<6;i++)photo(i,50+(i%3)*333,790+Math.floor(i/3)*235,320,212);
    center('ГОТОВЫЕ СОЧЕТАНИЯ ВНУТРИ',1290,34,ink,800);
   }else if(s.type==='section'){
    text('ТОП',67,346,146,ink,600,900);text('3',1010,284,287,ink,380,900,'right');text(female?'ДЛЯ ДЕВУШЕК':'ДЛЯ ПАРНЕЙ',70,547,78,ink,937,900);
    const base=female?3:0;for(let i=0;i<3;i++){photo(base+i,80+(i%2)*290,680+i*180,690,300);box(820-(i%2)*685,755+i*180,90,90,accent,45);text(String(3-i),865-(i%2)*685,772+i*180,52,ink,75,900,'center');}
   }else if(s.type==='product'){
    const p=products[s.product];
    box(70,278,114,80,accent,40);text('0'+p.rank,127,295,48,ink,102,900,'center');text(female?'ЖЕНСКАЯ ПОДБОРКА':'МУЖСКАЯ ПОДБОРКА',211,307,29,muted,790,700);
    text(p.title,67,396,62,ink,948,900);
    outfit(s.product,54,513,552,812);
    box(630,521,377,50,'#ffffff',25);text('ФОТО ИЗ КАТАЛОГА',819,535,24,muted,350,600,'center');
    photo(s.product,595,602,445,333);
    wrap(p.detail,628,992,372,42,ink,800,51);
    p.palette.forEach((col,i)=>box(632+i*59,1130,42,42,col,21));
    text(money(p.saleKzt),1008,1222,62,ink,395,900,'right');
    text('Артикул '+p.sku,1008,1300,23,muted,398,500,'right');
   }else{
    text('КАКОЙ ОБРАЗ',68,323,86,ink,944,900);text('ТВОЙ?',66,423,130,ink,945,900);
    const ids=mode==='men'?[0,1,2]:mode==='women'?[3,4,5]:[0,1,2,3,4,5];
    if(ids.length===6){ids.forEach((i,k)=>{outfit(i,80+(k%3)*316,660+Math.floor(k/3)*332,287,318);});}
    else{ids.forEach((i,k)=>{outfit(i,70+k*316,677,304,576);});}
   }
   // Точный текст озвучки в кадре, максимум три строки.
   box(70,1376,940,176,ink,26);const n=wrap(s.lines[part].text,101,1403,878,38,'#ffffff',600,48);if(n>3)throw Error('SUBTITLE_OVERFLOW '+s.lines[part].text);
   if(s.type==='product'){
    text('steppe-gray.vercel.app/?mode=live&q='+products[s.product].sku,70,1600,23,muted,938,500);
    center('Одежда — иллюстрация образа; кроссовки — из каталога.',1665,24,muted,500);
    center('Цены на 27.09.2026 · Актуальные размеры — на сайте',1710,24,muted,500);
   }else if(s.type==='outro'){
    center('Ссылки на все пары — в описании',1610,34,ink,700);center('steppe-gray.vercel.app',1680,38,ink,800);center('Цены и доступные размеры уточняйте на сайте',1740,25,muted,500);
   }else{center('Выбор по стилю. Категории условны.',1640,29,muted,500);center('Образы одежды созданы для иллюстрации.',1700,25,muted,500);}
  };
  const frames=[];for(let i=0;i<story.length;i++)for(let j=0;j<story[i].lines.length;j++){window.drawFrame(i,j);const f=document.createElement('canvas');f.width=1080;f.height=1920;f.getContext('2d').drawImage(c.canvas,0,0);frames.push(f);}
  window.draw=(k,blend)=>{c.clearRect(0,0,1080,1920);c.drawImage(frames[k],0,0);if(k>0&&blend<1){c.save();c.globalAlpha=1-blend*blend*(3-2*blend);c.drawImage(frames[k-1],0,0);c.restore();}};
 },{assets,lookAssets,products,story,mode});
 const stills=[];
 for(let k=0;k<segments.length;k++){await page.evaluate(k=>window.draw(k,1),k);stills.push(await page.screenshot({type:'jpeg',quality:98}));await page.screenshot({path:`${tmp}/frame-${k}.png`});}
 await page.evaluate(()=>window.draw(0,1));await page.screenshot({path:out+'/'+mode+'-cover.png'});
 if(!process.argv.includes('--preview')){
  const target=out+'/'+mode+'-top3-outfits.mp4';
  const enc=spawn(ff,['-hide_banner','-loglevel','error','-y','-f','image2pipe','-framerate',String(fps),'-vcodec','mjpeg','-i','pipe:0','-i',tmp+'/mix.wav','-map','0:v:0','-map','1:a:0','-vf','scale=in_range=pc:out_range=tv:in_color_matrix=bt601:out_color_matrix=bt709,format=yuv420p','-c:v','libx264','-preset','fast','-crf','17','-colorspace','bt709','-color_primaries','bt709','-color_trc','bt709','-af','loudnorm=I=-16:TP=-1.5:LRA=9','-c:a','aac','-b:a','192k','-ar','48000','-t',String(duration),'-movflags','+faststart',target],{windowsHide:true,stdio:['pipe','ignore','pipe']});
  let err='';enc.stderr.on('data',b=>err+=b);const done=new Promise((ok,no)=>{enc.on('error',no);enc.on('close',code=>code===0?ok():no(Error(err)));});
  for(let f=0;f<duration*fps;f++){const t=f/fps;let k=segments.findIndex(s=>t<s.end);if(k<0)k=segments.length-1;const blend=Math.min(1,(t-segments[k].start)/.65);let frame=stills[k];if(k>0&&blend<1){await page.evaluate(({k,blend})=>window.draw(k,blend),{k,blend});frame=await page.screenshot({type:'jpeg',quality:98});}if(!enc.stdin.write(frame))await once(enc.stdin,'drain');if(f%300===0)console.log(`render ${f}/${duration*fps}`);}
  enc.stdin.end();await done;
  execFileSync(ff,['-v','error','-y','-i',target,'-i',tmp+'/music.wav','-map','0:v:0','-map','1:a:0','-c:v','copy','-af','loudnorm=I=-19:TP=-2:LRA=9','-c:a','aac','-b:a','192k','-ar','48000','-t',String(duration),'-movflags','+faststart',out+'/'+mode+'-top3-outfits-music.mp4'],{windowsHide:true});
  console.log(JSON.stringify({duration,output:target}));
 }
}finally{await browser.close();}
