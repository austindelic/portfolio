async (page) => {
 const origin=page.url().split('/').slice(0,3).join('/'); const errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(()=>{
  window.__compileProbe={programs:new Set(),shaders:new Set(),draws:0,hold:true};
  const probe=window.__compileProbe;
  for(const [kind,set] of [['Program',probe.programs],['Shader',probe.shaders]]) {
   const create=WebGL2RenderingContext.prototype['create'+kind],remove=WebGL2RenderingContext.prototype['delete'+kind];
   WebGL2RenderingContext.prototype['create'+kind]=function(...args){const value=create.apply(this,args);if(value)set.add(value);return value;};
   WebGL2RenderingContext.prototype['delete'+kind]=function(value){set.delete(value);return remove.call(this,value);};
  }
  const parameter=WebGL2RenderingContext.prototype.getProgramParameter;
  WebGL2RenderingContext.prototype.getProgramParameter=function(program,p){
   if(p===0x91B1 && probe.hold)return false;
   return parameter.call(this,program,p);
  };
  const draw=WebGL2RenderingContext.prototype.drawArrays;
  WebGL2RenderingContext.prototype.drawArrays=function(...args){probe.draws++;return draw.apply(this,args);};
 });
 const snapshot=()=>page.evaluate(()=>({programs:window.__compileProbe.programs.size,shaders:window.__compileProbe.shaders.size,draws:window.__compileProbe.draws}));
 const navigate=async(path)=>{await page.evaluate(path=>{const link=document.createElement('a');link.href=path;link.id='test-nav';document.body.append(link);link.click();},path);await page.waitForURL(origin+path);await page.waitForTimeout(350);};
 await page.goto(origin+'/',{waitUntil:'networkidle'});const pending=await snapshot();
 await navigate('/black-hole/');const afterExit=await snapshot();
 await page.evaluate(()=>window.__compileProbe.hold=false);await page.waitForFunction(()=>window.__compileProbe.draws>0);const editorReady=await snapshot();
 await page.evaluate(()=>window.__compileProbe.hold=true);await navigate('/');const beforeLoss=await snapshot();
 await page.evaluate(()=>{const gl=document.querySelector('canvas').getContext('webgl2');window.__restoreExtension=gl.getExtension('WEBGL_lose_context');window.__restoreExtension.loseContext();});
 await page.waitForTimeout(100);const lost=await snapshot();
 await page.evaluate(()=>window.__restoreExtension.restoreContext());await page.waitForTimeout(200);const restoring=await snapshot();
 await page.evaluate(()=>window.__compileProbe.hold=false);await page.waitForTimeout(600);const restored=await snapshot();
 const failures=[];
 if(pending.draws!==0 || pending.programs!==3 || pending.shaders!==6)failures.push('pending ownership');
 if(afterExit.programs!==3 || afterExit.shaders!==6)failures.push('navigation cancellation');
 if(editorReady.shaders!==0 || editorReady.programs!==3)failures.push('editor readiness');
 if(lost.programs!==0 || lost.shaders!==0)failures.push('context loss cancellation');
 if(restoring.programs!==3 || restoring.shaders!==6)failures.push('restoration generation');
 if(restored.programs!==3 || restored.shaders!==0 || restored.draws<=beforeLoss.draws)failures.push('restored readiness');
 return {failures,errors,pending,afterExit,editorReady,beforeLoss,lost,restoring,restored};
}
