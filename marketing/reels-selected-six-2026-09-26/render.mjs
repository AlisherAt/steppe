// Анимационный монтаж шести реальных фотографий, выбранных пользователем.
import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
const out='marketing/reels-selected-six-2026-09-26',tmp='artifacts/reels-selected-six-render';
const fps=30,duration=15;
await mkdir(tmp,{recursive:true});
const ffmpeg=process.env.FFMPEG_PATH||execFileSync('python',['-c','import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())'],{encoding:'utf8'}).trim();
const assets={};
for(const p of JSON.parse(await readFile(out+'/references/products.json','utf8')).products)assets[p.sku]='data:image/jpeg;base64,'+(await readFile(out+'/references/'+p.sku+'.jpg')).toString('base64');
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
  const images={},crops={},backs={};
  for(const[k,v]of Object.entries(assets)){
   const im=new Image();im.src=v;await im.decode();images[k]=im;
   // Определяем рамку предмета для видеокадрирования; исходные файлы не меняем.
   const a=document.createElement('canvas');a.width=a.height=200;const ac=a.getContext('2d');ac.drawImage(im,0,0,200,200);const d=ac.getImageData(0,0,200,200).data,bg=[d[0],d[1],d[2]];backs[k]=`rgb(${bg.join(',')})`;
   let x0=200,y0=200,x1=0,y1=0;for(let y=0;y<200;y++)for(let x=0;x<200;x++){const j=(y*200+x)*4;if(Math.max(...bg.map((v,n)=>Math.abs(v-d[j+n])))>38){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}}
   const pad=9;x0=Math.max(0,x0-pad);y0=Math.max(0,y0-pad);x1=Math.min(200,x1+pad);y1=Math.min(200,y1+pad);crops[k]=[x0/200*im.width,y0/200*im.height,(x1-x0)/200*im.width,(y1-y0)/200*im.height];
  }
  const keys=['377718_03','311947_01','310168_20','310783_02','100272598','100209953'],c=document.querySelector('canvas').getContext('2d'),ink='#131b1a',cream='#f6f6ec',lime='#cafa68';
  const clamp=x=>Math.max(0,Math.min(1,x)),ease=x=>1-(1-clamp(x))**3;
  function box(x,y,w,h,col,r=0){c.fillStyle=col;c.beginPath();c.roundRect(x,y,w,h,r);c.fill();}
  function stroke(points,col=cream,w=5){c.strokeStyle=col;c.lineWidth=w;c.lineCap=c.lineJoin='round';c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.stroke();}
  function caption(lines,y,size,col=cream,a=1){c.save();c.globalAlpha=a;c.fillStyle=col;c.textAlign='center';c.textBaseline='top';c.font=`700 ${size}px Arial`;lines.forEach((s,i)=>c.fillText(s,540,y+i*(size+13)));c.restore();}
  function shoe(i,x,y,w,h){const k=keys[i],q=crops[k],s=Math.min(w/q[2],h/q[3]),dw=q[2]*s,dh=q[3]*s;c.drawImage(images[k],...q,x+(w-dw)/2,y+(h-dh)/2,dw,dh);}
  function grid(t,top=620,w=922){const tw=(w-22)/2,th=255,x=(1080-w)/2;for(let i=0;i<6;i++){const xx=x+(i%2)*(tw+22),yy=top+Math.floor(i/2)*280;box(xx,yy,tw,th,backs[keys[i]],18);shoe(i,xx+10,yy+12,tw-20,th-24);}const i=Math.min(5,Math.floor(Math.max(0,t)*1.5)),xx=x+(i%2)*(tw+22),yy=top+Math.floor(i/2)*280;c.strokeStyle=lime;c.lineWidth=5;c.beginPath();c.roundRect(xx-4,yy-4,tw+8,th+8,22);c.stroke();}
  function process(t){const p=ease((t-7)/0.4);c.save();c.globalAlpha=p;box(233,560,614,126,'rgba(19,27,26,.92)',26);
   c.strokeStyle=cream;c.lineWidth=4;c.beginPath();c.roundRect(277,594,101,62,9);c.stroke();stroke([[279,612],[376,612]],cream,6);stroke([[396,623],[409,636],[431,608]],lime,5);
   stroke([[478,622],[580,622]],lime,4);stroke([[562,605],[580,622],[562,639]],lime,4);
   c.beginPath();c.roundRect(650,599,88,64,8);c.strokeStyle=cream;c.stroke();c.beginPath();c.arc(694,599,20,Math.PI,0);c.stroke();if(t>8.1)stroke([[671,630],[687,643],[715,612]],lime,5);c.restore();
  }
  window.draw=(t,clean=false)=>{
   box(0,0,1080,1920,ink);
   if(t<3.2){
    const u=t/3.2;c.save();c.translate(540,1020);c.rotate(-0.055+u*0.035);const scale=0.91+u*0.06;c.scale(scale,scale);c.translate(-540,-1020);
    c.shadowColor='rgba(0,0,0,.5)';c.shadowBlur=55;box(192,460,696,1130,'#080b0b',76);c.shadowBlur=0;box(210,480,660,1090,'#e7e9e3',58);box(440,496,200,26,'#080b0b',16);
    for(let i=0;i<6;i++){const x=235+(i%2)*311,y=555+Math.floor(i/2)*302;box(x,y,294,279,backs[keys[i]],15);shoe(i,x+5,y+12,284,253);}
    if(t>2.1){const p=ease((t-2.1)/0.3);c.strokeStyle=lime;c.lineWidth=8*p;c.beginPath();c.roundRect(235,555,294,279,15);c.stroke();box(477,573,37,37,lime,19);stroke([[485,592],[493,600],[508,582]],ink,4);}
    box(442,1535,196,8,'#505650',4);c.restore();
    if(!clean)caption(['Выбирай','свою пару'],225,81);
   }else if(t<11){
    const i=Math.min(5,Math.floor((t-3.2)/1.3)),u=(t-3.2)%1.3,k=keys[i],bg=backs[k];box(0,0,1080,1920,bg);
    if(t<7&&!clean)caption(['Выбирай свою пару'],294,69,ink);
    if(t>=7){if(!clean)caption(['Заказываем','после оплаты'],287,66,ink);process(t);}
    const macro=u>.84&&u<1.12,entry=1-ease(u/.2);c.save();c.translate(540+entry*500,1050);c.rotate((1-ease(u/.6))*.065);c.translate(-540,-1050);
    shoe(i,macro?-225:12,macro?733:785,macro?1530:1056,macro?950:690);c.restore();
    for(let n=0;n<6;n++)box(128+n*141,1600,118,5,n<=i?ink:'#d5d8d2');
   }else{
    if(!clean)caption(['Открой каталог'],321,81);
    grid(t-11,600);
    // Нижняя зона свободна для последующего логотипа/ссылки магазина.
   }
  };
 },assets);

 for(const[i,t]of[1,2.8,3.6,5.9,7.5,9.2,10.2,13].entries()){await page.evaluate(t=>window.draw(t),t);await page.screenshot({path:`${tmp}/frame-${i}.jpg`,type:'jpeg',quality:94});}
 await page.evaluate(()=>window.draw(13));await page.screenshot({path:`${out}/cover.png`});
 if(!process.argv.includes('--preview')){
  const clean=process.argv.includes('--clean'),name=clean?'selected-six-clean.mp4':'selected-six.mp4';
  const enc=spawn(ffmpeg,['-hide_banner','-loglevel','warning','-y','-f','image2pipe','-framerate',String(fps),'-vcodec','mjpeg','-i','pipe:0','-i',`${out}/instrumental.wav`,'-map','0:v:0','-map','1:a:0','-vf','scale=in_range=pc:out_range=tv:in_color_matrix=bt601:out_color_matrix=bt709,format=yuv420p','-c:v','libx264','-preset','fast','-crf','18','-color_range','tv','-colorspace','bt709','-color_primaries','bt709','-color_trc','bt709','-c:a','aac','-b:a','192k','-t',String(duration),'-movflags','+faststart',`${out}/${name}`],{stdio:['pipe','ignore','pipe']});
  let errors='';enc.stderr.on('data',b=>errors+=b);const done=new Promise((resolve,reject)=>{enc.on('error',reject);enc.on('close',code=>code===0?resolve():reject(new Error(errors)));});
  for(let f=0;f<duration*fps;f++){await page.evaluate(({t,clean})=>window.draw(t,clean),{t:f/fps,clean});const b=await page.screenshot({type:'jpeg',quality:95});if(!enc.stdin.write(b))await once(enc.stdin,'drain');if(f%90===0)console.log(`${name}: ${f}/${duration*fps}`);}
  enc.stdin.end();await done;console.log(`${name}: готово`);
 }
}finally{await browser.close();}
