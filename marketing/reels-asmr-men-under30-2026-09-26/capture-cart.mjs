// Снимок настоящей корзины в изолированном браузере. Сообщения не отправляются.
import { chromium } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
const out='marketing/reels-asmr-men-under30-2026-09-26';
const {products}=JSON.parse(await readFile(out+'/references/products.json','utf8'));
const items=products.slice(0,2).map(p=>({id:p.id,name:p.name,brand:p.brand,gender:p.gender,sourceName:p.sourceName,productUrl:'',imageUrl:p.imageUrl,saleKzt:p.saleKzt,size:p.sizes[0],demo:false,updatedAt:p.updatedAt}));
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:460,height:1000},deviceScaleFactor:2});
 await page.addInitScript(items=>localStorage.setItem('steppe.cart.v1',JSON.stringify({version:1,items})),items);
 await page.goto('https://steppe-gray.vercel.app/?mode=live',{waitUntil:'domcontentloaded'});
 await page.getByRole('button',{name:/Открыть корзину/}).click();
 const checkout=page.getByRole('button',{name:'Оформить в WhatsApp'});
 await checkout.waitFor();
 await page.waitForFunction(()=>{const b=document.querySelector('.whatsapp-checkout');return b&&!b.disabled;},{},{timeout:30000});
 await page.evaluate(()=>Promise.all([...document.querySelectorAll('dialog[open] img')].map(im=>im.decode().catch(()=>{}))));
 await page.screenshot({path:out+'/references/cart.png'});
 // Этот API только проверяет цены и формирует wa.me URL; в WhatsApp не обращаемся.
 const result=await page.evaluate(async items=>{const r=await fetch('/api/checkout/whatsapp',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items:items.map(({id,size})=>({id,size}))})});const j=await r.json();if(!r.ok)throw Error(j.error||r.status);const u=new URL(j.url);return {host:u.hostname,phone:u.pathname.slice(1),message:u.searchParams.get('text')};},items);
 if(result.host!=='wa.me')throw Error('Неожиданный адрес оформления');
 await writeFile(out+'/references/checkout-preview.json',JSON.stringify({checkedAt:new Date().toISOString(),...result},null,2));
 console.log('Корзина и подготовка WhatsApp проверены. Сообщение не отправлено.');
}finally{await browser.close();}
