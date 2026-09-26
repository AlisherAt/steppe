// Анимационный монтаж трёх моделей с проверенными ценами.
import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
const out='marketing/reels-asmr-under30-2026-09-26',tmp='artifacts/reels-asmr-render';
const fps=30,duration=32;
await mkdir(tmp,{recursive:true});
const ffmpeg=process.env.FFMPEG_PATH||execFileSync('python',['-c','import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())'],{encoding:'utf8'}).trim();
const {products}=JSON.parse(await readFile(out+'/references/products.json','utf8'));
if(products.some(p=>p.demo||p.saleKzt>=30000||p.saleKzt<=0))throw Error('Проверка цен не пройдена');
const assets={};
for(const p of products)assets[p.sku]='data:image/jpeg;base64,'+(await readFile(out+'/references/'+p.sku+'.jpg')).toString('base64');
assets.cart='data:image/png;base64,'+(await readFile(out+'/references/cart.png')).toString('base64');
// Мягкий инструментал и синтезированный Foley: бумага, шаги, лёгкое нажатие.
const sr=48000,count=sr*duration,wav=Buffer.alloc(44+count*4);let seed=672159,low=0;
const noise=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/2147483648-1;};
wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(2,22);wav.writeUInt32LE(sr,24);wav.writeUInt32LE(sr*4,28);wav.writeUInt16LE(4,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(count*4,40);
const turns=[3,7.5,9.5,14,16,20.5,22.5,26.5],steps=[.7,1.4,23.4,24.1];
for(let i=0;i<count;i++){
 const t=i/sr,b=t%.75,n=Math.floor(t/.75),root=[130.813,110,146.832,123.471][Math.floor(t/6)%4],r=noise();low=.93*low+.07*r;
 const pad=(Math.sin(2*Math.PI*root*t)+.5*Math.sin(2*Math.PI*root*1.5*t)+.4*Math.sin(2*Math.PI*root*1.25*t))*.02;
 const note=[523.25,659.25,783.99,659.25,440,523.25,587.33,493.88][n%8];
 const bell=(Math.sin(2*Math.PI*note*t)+.15*Math.sin(2*Math.PI*note*2*t))*Math.exp(-5*b)*(1-Math.exp(-85*b))*.035;
 const bass=Math.sin(2*Math.PI*(root/2)*t)*Math.exp(-5*b)*.028;
 let paper=0,foot=0;for(const at of turns){const d=t-(at-.18);if(d>0&&d<.8)paper+=(r-low)*Math.sin(Math.PI*d/.8)**2*(.022+.025*Math.sin(d*43)**2);}
 for(const at of steps){const d=t-at;if(d>0&&d<.33)foot+=(low*.2+Math.sin(2*Math.PI*(74*d-17*d*d))*.09)*Math.exp(-22*d)*(1-Math.exp(-350*d));}
 const click=t>26.5&&t<26.57?Math.sin(2*Math.PI*850*(t-26.5))*Math.exp(-95*(t-26.5))*.035:0;
 const fade=Math.min(1,t/.6,(duration-t)/1.1),v=(pad+bell+bass+paper+foot+click)*fade;
 for(let ch=0;ch<2;ch++)wav.writeInt16LE(Math.round(Math.tanh((v+paper*(ch?-.18:.18))*2)*32767),44+i*4+ch*2);
}
await writeFile(`${out}/instrumental.wav`,wav);
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1080,height:1920},deviceScaleFactor:1});
 await page.setContent('<html><style>*{margin:0}body{overflow:hidden}canvas{display:block}</style><canvas width="1080" height="1920"></canvas></html>');
 await page.evaluate(async ({assets,products})=>{
  const images={},crops={},backs={};
  for(const[k,v]of Object.entries(assets)){
   const im=new Image();im.src=v;await im.decode();images[k]=im;
   // Определяем рамку предмета для видеокадрирования; исходные файлы не меняем.
   const a=document.createElement('canvas');a.width=a.height=200;const ac=a.getContext('2d');ac.drawImage(im,0,0,200,200);const d=ac.getImageData(0,0,200,200).data,bg=[d[0],d[1],d[2]];backs[k]=`rgb(${bg.join(',')})`;
   let x0=200,y0=200,x1=0,y1=0;for(let y=0;y<200;y++)for(let x=0;x<200;x++){const j=(y*200+x)*4;if(Math.max(...bg.map((v,n)=>Math.abs(v-d[j+n])))>38){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}}
   const pad=9;x0=Math.max(0,x0-pad);y0=Math.max(0,y0-pad);x1=Math.min(200,x1+pad);y1=Math.min(200,y1+pad);crops[k]=[x0/200*im.width,y0/200*im.height,(x1-x0)/200*im.width,(y1-y0)/200*im.height];
  }
  const keys=['194331_26','311102_01','311955_03'],c=document.querySelector('canvas').getContext('2d'),ink='#27342c',cream='#f4f1e9',sage='#dce5d5',muted='#677268';
  const names=['Star Vital','Softride Harli','Harli Metallic'],subs=['Женские кроссовки','Hybrid Skins · женские','Женские кроссовки'],prices=products.map(p=>new Intl.NumberFormat('ru-RU').format(p.saleKzt)+' ₸');
  function box(x,y,w,h,col,r=0){c.fillStyle=col;c.beginPath();c.roundRect(x,y,w,h,r);c.fill();}
  function text(s,x,y,size,col=ink,max=924,font='Arial',weight=400){c.textAlign='left';c.textBaseline='top';c.font=`${weight} ${size}px ${font}`;const w=c.measureText(s).width;if(w>max)c.font=`${weight} ${size*max/w}px ${font}`;c.fillStyle=col;c.fillText(s,x,y);}
  function shoe(i,x,y,w,h){const k=keys[i],q=crops[k],s=Math.min(w/q[2],h/q[3]),dw=q[2]*s,dh=q[3]*s;c.drawImage(images[k],...q,x+(w-dw)/2,y+(h-dh)/2,dw,dh);}
  function head(label='ТИХАЯ ПОДБОРКА'){text('STEPPE',76,163,45,ink,450,'Arial',800);text(label,641,177,22,muted,364);box(76,243,928,1,'#c8cebf');}
  function footer(){text('Цены на 26.09.2026 · размеры уточняйте в каталоге',76,1670,26,muted,928);}
  function card(i,x,y,w,h){box(x,y,w,h,backs[keys[i]],24);shoe(i,x+15,y+10,w-30,h-20);}
  function detail(i,x,y,w,h,region){const im=images[keys[i]],q=region.map((v,n)=>v*(n%2?im.height:im.width));c.save();c.beginPath();c.roundRect(x,y,w,h,22);c.clip();const scale=Math.max(w/q[2],h/q[3]);const dw=q[2]*scale,dh=q[3]*scale;c.drawImage(im,...q,x+(w-dw)/2,y+(h-dh)/2,dw,dh);c.restore();}
  function fullProduct(i){head('PUMA / ДО 30 000 ₸');text(names[i],76,329,89,ink,928,'Georgia');text(subs[i],80,443,33,muted);text(prices[i],77,531,82,ink,920,'Arial',700);card(i,65,737,950,670);text('Выбирайте пару и свой размер',80,1500,34,muted);footer();}
  function productDetail(i){head('ДЕТАЛИ');text('Всё в деталях',76,329,90,ink,928,'Georgia');text(names[i]+' · '+prices[i],79,454,38,muted);detail(i,76,634,928,467,[.13,.36,.5,.25]);detail(i,76,1139,928,260,[.42,.57,.46,.13]);text('Фактура, швы и линии подошвы',79,1485,37,muted);footer();}
  function drawScene(t){box(0,0,1080,1920,cream);
   if(t<3){head('ASMR / КАТАЛОГ');text('Хорошая пара.',76,335,95,ink,928,'Georgia');text('До 30 000 ₸',76,464,101,ink,928,'Arial',700);text('Три находки в STEPPE',80,611,39,muted);for(let i=0;i<3;i++)card(i,76,748+i*239,928,213);text('Включите звук и листайте медленно',79,1537,34,muted);footer();}
   else if(t<7.5)fullProduct(0);
   else if(t<9.5)productDetail(0);
   else if(t<14)fullProduct(1);
   else if(t<16)productDetail(1);
   else if(t<20.5)fullProduct(2);
   else if(t<22.5)productDetail(2);
   else if(t<26.5){head('КОРЗИНА');text('Соберите свой выбор',77,322,72,ink,927,'Georgia');const im=images.cart;const w=532,h=w*im.height/im.width;box(255,469,570,h+38,'#25362c',36);c.save();c.beginPath();c.roundRect(274,488,w,h,23);c.clip();c.drawImage(im,274,488,w,h);c.restore();text('Нажмите «Оформить в WhatsApp»',77,1721,35,ink,928);}
   else{head('ЗАКАЗ В WHATSAPP');text('Список уже готов',76,340,88,ink,928,'Georgia');text('Товары, размеры и цены — в сообщении',79,456,31,muted);
    box(76,606,928,629,'#e4eddc',27);text('Здравствуйте! Хочу оформить',110,650,38,ink,850);text('заказ в STEPPE.',110,698,38,ink,850);
    text('Puma Star Vital',110,789,42,ink,850,'Arial',700);text('EU '+products[0].sizes[0].replace('.',',')+' · '+prices[0],110,849,36,ink,850);
    text('Puma Softride Harli Hybrid Skins',110,929,36,ink,850,'Arial',700);text('EU '+products[1].sizes[0].replace('.',',')+' · '+prices[1],110,984,36,ink,850);
    text('Уточним наличие и условия оплаты.',110,1094,32,muted,850);text('Предпросмотр списка заказа',110,1172,24,muted,850);
    box(76,1297,928,103,'#315b43',18);text('Откройте WhatsApp и отправьте заказ',107,1330,38,'#ffffff',866);
    text('steppe-gray.vercel.app',78,1479,53,ink,928,'Arial',700);text('Заказываем выбранную пару после оплаты',79,1572,31,muted,928);footer();}
  }
  const boundaries=[3,7.5,9.5,14,16,20.5,22.5,26.5],old=document.createElement('canvas');old.width=1080;old.height=1920;const oc=old.getContext('2d');let cached=-1;
  window.draw=t=>{const b=boundaries.find(v=>t>=v&&t<v+.6);if(b!==undefined){if(cached!==b){drawScene(b-.001);oc.clearRect(0,0,1080,1920);oc.drawImage(c.canvas,0,0);cached=b;}drawScene(t);const u=(t-b)/.6;c.save();c.globalAlpha=1-u*u*(3-2*u);c.drawImage(old,0,0);c.restore();}else drawScene(t);};
  window.verifyStableCards=()=>{for(const start of [3,9.5,16]){window.draw(start+1);const a=c.canvas.toDataURL();window.draw(start+4);if(a!==c.canvas.toDataURL())throw Error('Изменяется масштаб карточки');}return 'Три карточки статичны, цены ниже 30 000 ₸';};
 },{assets,products});



 console.log(await page.evaluate(()=>window.verifyStableCards()));
 for(const[i,t]of[1,4,8.5,10.5,15,17,21.5,24,29].entries()){await page.evaluate(t=>window.draw(t),t);await page.screenshot({path:`${tmp}/frame-${i}.jpg`,type:'jpeg',quality:94});}
 await page.evaluate(()=>window.draw(1));await page.screenshot({path:`${out}/cover.png`});
 if(!process.argv.includes('--preview')){
  const clean=false,name='steppe-asmr-under30.mp4';
  const enc=spawn(ffmpeg,['-hide_banner','-loglevel','warning','-y','-f','image2pipe','-framerate',String(fps),'-vcodec','mjpeg','-i','pipe:0','-i',`${out}/instrumental.wav`,'-map','0:v:0','-map','1:a:0','-vf','scale=in_range=pc:out_range=tv:in_color_matrix=bt601:out_color_matrix=bt709,format=yuv420p','-c:v','libx264','-preset','fast','-crf','18','-color_range','tv','-colorspace','bt709','-color_primaries','bt709','-color_trc','bt709','-c:a','aac','-b:a','192k','-t',String(duration),'-movflags','+faststart',`${out}/${name}`],{stdio:['pipe','ignore','pipe']});
  let errors='';enc.stderr.on('data',b=>errors+=b);const done=new Promise((resolve,reject)=>{enc.on('error',reject);enc.on('close',code=>code===0?resolve():reject(new Error(errors)));});
  for(let f=0;f<duration*fps;f++){await page.evaluate(({t,clean})=>window.draw(t,clean),{t:f/fps,clean});const b=await page.screenshot({type:'jpeg',quality:95});if(!enc.stdin.write(b))await once(enc.stdin,'drain');if(f%90===0)console.log(`${name}: ${f}/${duration*fps}`);}
  enc.stdin.end();await done;console.log(`${name}: готово`);
 }
}finally{await browser.close();}
