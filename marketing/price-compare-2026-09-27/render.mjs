import { chromium } from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {spawn,execFileSync} from 'node:child_process';
import {once} from 'node:events';
// Цены берутся из сохранённой проверки. Для новой публикации сначала проверить источники.
const out='marketing/price-compare-2026-09-27',tmp='artifacts/price-compare-render';
await mkdir(tmp,{recursive:true});
const ff=process.env.FFMPEG_PATH||execFileSync('python',['-c','import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())'],{encoding:'utf8',windowsHide:true}).trim();
const story=JSON.parse(await readFile(out+'/story.json','utf8'));
const products=JSON.parse(await readFile(out+'/references/comparisons.json','utf8'));
for(const p of products){
 if(p.differenceKzt!==Math.round((p.competitorComparedKzt-p.steppeKzt)*100)/100)throw Error('PRICE_MISMATCH');
 if(p.steppeKzt>=p.competitorComparedKzt)throw Error('NO_PRICE_ADVANTAGE');
}
const assets=await Promise.all(products.map(async p=>'data:image/png;base64,'+(await readFile(out+'/'+(p.imageFile?'references/'+p.imageFile:'evidence/'+p.evidence))).toString('base64')));
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
 const t=i/rate,b=t%(60/86),root=[55,65.406,49,58.27][Math.floor(t/(60/86*8))%4];seed=(1664525*seed+1013904223)>>>0;const n=seed/2147483648-1;low=.93*low+.07*n;
 const kick=Math.sin(2*Math.PI*(48*b+3*(1-Math.exp(-35*b))))*Math.exp(-22*b)*.09;
 const hat=(n-low)*Math.exp(-120*(t%(60/86/2)))*.011;
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
 await page.evaluate(async({assets,products,story})=>{
  const images=await Promise.all(assets.map(async src=>{const im=new Image();im.src=src;await im.decode();return im;}));
  const c=document.querySelector('canvas').getContext('2d'),paper='#f5f5ee',ink='#20271f',muted='#646d61',lime='#c2fa59';
  function box(x,y,w,h,color,r=0){c.fillStyle=color;c.beginPath();c.roundRect(x,y,w,h,r);c.fill();}
  function text(s,x,y,size,color=ink,max=940,weight=800,align='left') {c.fillStyle=color;c.font=`${weight} ${size}px Arial`;c.textAlign=align;c.textBaseline='top';const width=c.measureText(s).width;if(width>max)c.font=`${weight} ${size*max/width}px Arial`;c.fillText(s,x,y);}
  function photo(i,x,y,w,h){const im=images[i],k=Math.min(w/im.width,h/im.height);c.save();c.globalCompositeOperation='multiply';if(w/h>1.7){const sh=im.width*h/w,sy=(im.height-sh)*.67;c.drawImage(im,0,sy,im.width,sh,x,y,w,h);}else{c.drawImage(im,x+(w-im.width*k)/2,y+(h-im.height*k)/2,im.width*k,im.height*k);}c.restore();}
  function money(n){return new Intl.NumberFormat('ru-RU',{minimumFractionDigits:Number.isInteger(n)?0:2,maximumFractionDigits:2}).format(n)+' ₸';}
  function centered(s,y,size=35,col=ink,weight=700){text(s,540,y,size,col,930,weight,'center');}
  function footer(){centered('27.09.2026 · Сравнение цен товаров',1640,27,muted,500);centered('Без доставки и персональных промокодов.',1683,26,muted,500);centered('Условия покупки отличаются. Цены могут измениться.',1723,25,muted,500);}
  window.drawFrame=(scene,part)=>{
   const s=story[scene];box(0,0,1080,1920,paper);
   text('STEPPE',72,165,44,ink,350,900);text('СРАВНИВАЕМ ЦЕНЫ',1008,177,23,muted,370,700,'right');box(72,241,936,2,'#daddcf');
   if(scene===0){
    box(72,302,490,58,lime,29);text('4 ПАРЫ / 2 МАГАЗИНА KZ',101,318,27,ink,440,800);
    text('ОДНА ПАРА.',66,404,105,ink,945,900);text('РАЗНЫЕ ЦЕНЫ.',66,514,96,ink,950,900);
    photo(0,64,665,925,670);
    box(72,1310,936,157,ink,32);centered('В ЭТИХ ПРИМЕРАХ',1340,32,lime);centered('STEPPE ДЕШЕВЛЕ',1387,53,'#ffffff',900);
    centered(part===0?'SuperStep.kz + Puma.kz':'Тот же артикул, цвет и размер',1520,36,ink,600);
   }else if(scene<5){
    const p=products[scene-1];const isPuma=scene===4;
    text(`0${scene} / 04`,72,302,27,muted,200,700);text(p.size,1008,302,30,ink,200,800,'right');
    text(p.title,72,372,61,ink,936,900);text('АРТИКУЛ '+p.sku,72,455,27,muted,800,600);
    if(!isPuma){photo(scene-1,55,505,970,500);}
    else{
     // Фотография этой расцветки недоступна на CDN; показываем фактическую страницу цены.
     box(72,527,936,447,'#ffffff',26);
     const im=images[3];c.save();c.beginPath();c.roundRect(72,527,936,447,26);c.clip();
     c.drawImage(im,1015,180,410,355,95,552,458,397);c.restore();
     text('ПРОВЕРЕНО',590,615,34,ink,350,900);text('НА PUMA.KZ',590,661,32,ink,350,900);
     text('189 990 ₸',590,740,50,ink,350,800);text('цена на странице',590,805,23,muted,350,500);
     text('Учли −5% онлайн',590,855,27,ink,350,700);
    }
    box(72,1030,450,220,'#e6e9df',28);box(542,1030,466,220,lime,28);
    text(p.store,98,1061,31,ink,398,800);text('STEPPE',568,1061,31,ink,410,900);
    text(money(p.competitorComparedKzt),98,1132,63,ink,398,800);text(money(p.steppeKzt),568,1132,67,ink,410,900);
    if(isPuma){centered('Puma.kz: расчёт с −5% за оплату картой онлайн',1275,27,muted,500);}
    else{centered('SuperStep: цена со скидкой, остаток в магазинах',1275,27,muted,500);}
    box(72,1347,936,170,ink,28);centered('РАЗНИЦА В ЦЕНЕ',1371,28,lime,700);centered(money(p.differenceKzt),1415,66,'#ffffff',900);
    centered(part===0?'Одинаковые артикул, расцветка и размер':'Ссылки на проверенные страницы — в описании',1560,27,muted,500);
   }else{
    text('ПРОВЕРЬ',68,354,112,ink,940,900);text('СВОЮ ПАРУ.',68,482,106,ink,940,900);
    photo(1,40,658,500,400);photo(2,540,658,500,400);
    centered('Подберём модель и размер.',1095,42,ink,800);centered('Уточним условия заказа в WhatsApp.',1160,34,muted,500);
    box(72,1280,936,120,lime,60);centered('ОТКРОЙ КАТАЛОГ STEPPE',1320,40,ink,900);
    centered('steppe-gray.vercel.app',1462,40,ink,700);centered('WhatsApp  +7 707 922 3074',1530,33,ink,600);
   }
   footer();
  };
  const frames=[];for(let i=0;i<6;i++)for(let j=0;j<2;j++){window.drawFrame(i,j);const f=document.createElement('canvas');f.width=1080;f.height=1920;f.getContext('2d').drawImage(c.canvas,0,0);frames.push(f);}
  window.draw=(k,blend)=>{c.clearRect(0,0,1080,1920);c.drawImage(frames[k],0,0);if(k>0&&blend<1){c.save();c.globalAlpha=1-blend*blend*(3-2*blend);c.drawImage(frames[k-1],0,0);c.restore();}};
 },{assets,products,story});
 const stills=[];
 for(let k=0;k<segments.length;k++){await page.evaluate(k=>window.draw(k,1),k);stills.push(await page.screenshot({type:'jpeg',quality:98}));await page.screenshot({path:`${tmp}/frame-${k}.png`});}
 await page.evaluate(()=>window.draw(0,1));await page.screenshot({path:out+'/cover.png'});
 if(!process.argv.includes('--preview')){
  const target=out+'/steppe-price-comparison.mp4';
  const enc=spawn(ff,['-hide_banner','-loglevel','error','-y','-f','image2pipe','-framerate',String(fps),'-vcodec','mjpeg','-i','pipe:0','-i',tmp+'/mix.wav','-map','0:v:0','-map','1:a:0','-vf','scale=in_range=pc:out_range=tv:in_color_matrix=bt601:out_color_matrix=bt709,format=yuv420p','-c:v','libx264','-preset','fast','-crf','17','-colorspace','bt709','-color_primaries','bt709','-color_trc','bt709','-af','loudnorm=I=-16:TP=-1.5:LRA=9','-c:a','aac','-b:a','192k','-ar','48000','-t',String(duration),'-movflags','+faststart',target],{windowsHide:true,stdio:['pipe','ignore','pipe']});
  let err='';enc.stderr.on('data',b=>err+=b);const done=new Promise((ok,no)=>{enc.on('error',no);enc.on('close',code=>code===0?ok():no(Error(err)));});
  for(let f=0;f<duration*fps;f++){const t=f/fps;let k=segments.findIndex(s=>t<s.end);if(k<0)k=segments.length-1;const blend=Math.min(1,(t-segments[k].start)/.55);let frame=stills[k];if(k>0&&blend<1){await page.evaluate(({k,blend})=>window.draw(k,blend),{k,blend});frame=await page.screenshot({type:'jpeg',quality:98});}if(!enc.stdin.write(frame))await once(enc.stdin,'drain');if(f%300===0)console.log(`render ${f}/${duration*fps}`);}
  enc.stdin.end();await done;
  execFileSync(ff,['-v','error','-y','-i',target,'-i',tmp+'/music.wav','-map','0:v:0','-map','1:a:0','-c:v','copy','-af','loudnorm=I=-19:TP=-2:LRA=9','-c:a','aac','-b:a','192k','-ar','48000','-t',String(duration),'-movflags','+faststart',out+'/steppe-price-comparison-music.mp4'],{windowsHide:true});
  console.log(JSON.stringify({duration,output:target}));
 }
}finally{await browser.close();}
