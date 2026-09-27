import { chromium } from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {spawn,execFileSync} from 'node:child_process';
import {once} from 'node:events';
const out='marketing/autumn-edit-2026-09-27',tmp='artifacts/autumn-render';
await mkdir(tmp,{recursive:true});
const ff=process.env.FFMPEG_PATH||execFileSync('python',['-c','import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())'],{encoding:'utf8',windowsHide:true}).trim();
const story=JSON.parse(await readFile(out+'/story.json','utf8'));
const products=JSON.parse(await readFile(out+'/references/products.json','utf8'));
const assets=await Promise.all(products.map(p=>Promise.all(p.files.map(async f=>'data:image/png;base64,'+(await readFile(out+'/references/'+f)).toString('base64')))));
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
 await page.evaluate(async({assets,story})=>{
  const images=await Promise.all(assets.map(list=>Promise.all(list.map(async src=>{const im=new Image();im.src=src;await im.decode();return im;}))));
  const c=document.querySelector('canvas').getContext('2d'),paper='#faf9f5',ink='#24221e',muted='#80796f',orange='#9b552e';
  function box(x,y,w,h,color,r=0){c.fillStyle=color;c.beginPath();c.roundRect(x,y,w,h,r);c.fill();}
  function text(s,x,y,size,color=ink,max=940,weight=800,align='left') {c.fillStyle=color;c.font=`${weight} ${size}px Arial`;c.textAlign=align;c.textBaseline='top';const width=c.measureText(s).width;if(width>max)c.font=`${weight} ${size*max/width}px Arial`;c.fillText(s,x,y);}
  function photo(i,v,x,y,w,h){const im=images[i][v%images[i].length],k=Math.min(w/im.width,h/im.height);c.save();c.globalCompositeOperation='multiply';c.drawImage(im,x+(w-im.width*k)/2,y+(h-im.height*k)/2,im.width*k,im.height*k);c.restore();}
  function line(s,y){text(s,540,y,55,ink,925,800,'center');}
  function swatches(){for(const [i,col] of ['#ac794f','#584433','#d2c8b6','#929793'].entries())box(438+i*54,1580,36,36,col,18);}
  window.drawFrame=(scene,part)=>{
   const s=story[scene];box(0,0,1080,1920,paper);
   text('STEPPE',72,165,40,ink,350,900);text('AUTUMN EDIT',1008,177,21,muted,300,600,'right');box(72,240,936,1,'#ded9cf');
   if(scene===0){
    text('СОБЕРИ СВОЙ',72,326,61,ink);text('ОСЕННИЙ ОБРАЗ.',67,406,92,orange,948,900);
    photo(0,part,60,610,470,410);photo(1,part,550,630,470,410);photo(2,part,60,990,470,410);photo(3,part,550,1010,470,410);
    box(72,1430,936,1,'#ded9cf');line(s.lines[part].caption,1480);text('4 ПАРЫ ИЗ НАШЕГО КАТАЛОГА',540,1600,28,muted,900,600,'center');
   }else if(scene<5){
    text(s.tag,72,317,28,orange,900,700);text(s.title,72,389,64,ink,936,900);
    photo(s.product,part,20,525,1040,800);
    line(s.lines[part].caption,1345);
    const styles=[['СИНИЙ ДЕНИМ','ХУДИ'],['ПРЯМЫЕ БРЮКИ','СВИТЕР'],['ШИРОКИЕ ДЖИНСЫ','КУРТКА'],['ДЕНИМ','ТРЕНЧ']][s.product];
    text(styles.join('  /  '),540,1441,27,muted,900,500,'center');
    text('ДЛЯ СУХОЙ ОСЕНИ',72,1585,23,muted,800,600);text(`0${scene} / 04`,1008,1585,25,orange,200,700,'right');
   }else{
    text('КАКАЯ ПАРА',72,315,82,ink);text('ТВОЯ?',68,405,145,orange,900,900);
    for(let i=0;i<4;i++)photo(i,0,60+(i%2)*490,635+Math.floor(i/2)*300,460,305);
    line(part===0?'Для сухой осени в городе':'Подберём модель и размер',1280);
    box(72,1385,936,96,ink,48);text('ОТКРОЙ КАТАЛОГ STEPPE',540,1416,37,paper,870,800,'center');
    text('steppe-gray.vercel.app',540,1527,36,ink,925,600,'center');text('WhatsApp  +7 707 922 3074',540,1594,30,muted,925,500,'center');
   }
   text('ТВОЙ СТИЛЬ. ТВОЯ ПАРА.',72,1735,19,muted,800,500);
  };
  const frames=[];for(let i=0;i<6;i++)for(let j=0;j<2;j++){window.drawFrame(i,j);const f=document.createElement('canvas');f.width=1080;f.height=1920;f.getContext('2d').drawImage(c.canvas,0,0);frames.push(f);}
  window.draw=(k,blend)=>{c.clearRect(0,0,1080,1920);c.drawImage(frames[k],0,0);if(k>0&&blend<1){c.save();c.globalAlpha=1-blend*blend*(3-2*blend);c.drawImage(frames[k-1],0,0);c.restore();}};
 },{assets,story});
 const stills=[];
 for(let k=0;k<segments.length;k++){await page.evaluate(k=>window.draw(k,1),k);stills.push(await page.screenshot({type:'jpeg',quality:98}));await page.screenshot({path:`${tmp}/frame-${k}.png`});}
 await page.evaluate(()=>window.draw(0,1));await page.screenshot({path:out+'/cover.png'});
 if(!process.argv.includes('--preview')){
  const target=out+'/steppe-autumn-voice.mp4';
  const enc=spawn(ff,['-hide_banner','-loglevel','error','-y','-f','image2pipe','-framerate',String(fps),'-vcodec','mjpeg','-i','pipe:0','-i',tmp+'/mix.wav','-map','0:v:0','-map','1:a:0','-vf','scale=in_range=pc:out_range=tv:in_color_matrix=bt601:out_color_matrix=bt709,format=yuv420p','-c:v','libx264','-preset','fast','-crf','17','-colorspace','bt709','-color_primaries','bt709','-color_trc','bt709','-af','loudnorm=I=-16:TP=-1.5:LRA=9','-c:a','aac','-b:a','192k','-ar','48000','-t',String(duration),'-movflags','+faststart',target],{windowsHide:true,stdio:['pipe','ignore','pipe']});
  let err='';enc.stderr.on('data',b=>err+=b);const done=new Promise((ok,no)=>{enc.on('error',no);enc.on('close',code=>code===0?ok():no(Error(err)));});
  for(let f=0;f<duration*fps;f++){const t=f/fps;let k=segments.findIndex(s=>t<s.end);if(k<0)k=segments.length-1;const blend=Math.min(1,(t-segments[k].start)/.55);let frame=stills[k];if(k>0&&blend<1){await page.evaluate(({k,blend})=>window.draw(k,blend),{k,blend});frame=await page.screenshot({type:'jpeg',quality:98});}if(!enc.stdin.write(frame))await once(enc.stdin,'drain');if(f%300===0)console.log(`render ${f}/${duration*fps}`);}
  enc.stdin.end();await done;
  execFileSync(ff,['-v','error','-y','-i',target,'-i',tmp+'/music.wav','-map','0:v:0','-map','1:a:0','-c:v','copy','-af','loudnorm=I=-19:TP=-2:LRA=9','-c:a','aac','-b:a','192k','-ar','48000','-t',String(duration),'-movflags','+faststart',out+'/steppe-autumn-music.mp4'],{windowsHide:true});
  console.log(JSON.stringify({duration,output:target}));
 }
}finally{await browser.close();}
