const { chromium } = require('playwright');
(async()=>{const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:430,height:850},deviceScaleFactor:2,isMobile:true});
const p=await ctx.newPage();
// brand-new query string => impossible to be cached
await p.goto('https://minnesotalakehomesforsale.com/pages/public/lake-mortgage-calculator.html?proof='+Date.now(),{waitUntil:'networkidle'});
await p.waitForTimeout(1000);
const d=await p.evaluate(()=>{const r=document.querySelector('.field-row');const cs=getComputedStyle(r);return{twoUp:cs.gridTemplateColumns.split(' ').length===2,inner:window.innerWidth,doc:document.documentElement.scrollWidth,vw:document.documentElement.clientWidth};});
console.log('LIVE now:', JSON.stringify(d));
await p.screenshot({path:'/tmp/LIVE_PROOF.png'});
await b.close();})();
