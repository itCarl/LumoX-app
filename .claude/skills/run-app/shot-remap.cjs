const path=require('node:path'),fs=require('node:fs'),{app,BrowserWindow}=require('electron');
const APP_DIR=path.resolve(__dirname,'..','..','..');require(path.join(APP_DIR,'dist','main','index.cjs'));
app.disableHardwareAcceleration();
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));const js=(wc,c)=>wc.executeJavaScript(c,true);
app.whenReady().then(async()=>{
  let win;for(let i=0;i<160;i++){win=BrowserWindow.getAllWindows()[0];if(win&&!win.webContents.isLoading())break;await sleep(250);}
  const wc=win.webContents;await sleep(1200);
  const r=await js(wc,`(async()=>{
    const fx=(await window.lumox.patch.list()).find(f=>f.channels.some(c=>c.typeId==='pan'));
    const panI=fx.channels.find(c=>c.typeId==='pan').index, abs=fx.startAddress+panI-1;
    await window.lumox.fixtures.setLimits([fx.id],{pan:{min:64,max:192,invert:false}});
    const read=async(v)=>{await window.lumox.fixtures.setChannel(fx.id,panI,v);await new Promise(r=>setTimeout(r,100));return (await window.lumox.universes.read(fx.universeId))[abs-1];};
    return {at0:await read(0),at128:await read(128),at255:await read(255)};
  })()`);
  console.log('[remap]',JSON.stringify(r));
  console.log('[remap] expect ~64 / ~128 / ~192 →', (Math.abs(r.at0-64)<=2&&Math.abs(r.at128-128)<=3&&Math.abs(r.at255-192)<=2)?'PASS':'FAIL');
  app.quit();
}).catch(e=>{console.log('FAIL',e.message);app.quit();});
