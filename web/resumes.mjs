import * as pdfjs from './vendor/pdfjs/pdf.min.mjs';
pdfjs.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdfjs/pdf.worker.min.mjs',import.meta.url).href;
import {uid,now,clone} from './model.mjs';
const escape = value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let currentId=null, previewUrl=null, previewId=null, exporting=false, previewTimer, previewToken=0, liveRunning=false, previewBlob=null;
const button=(text,action,extra='')=>`<button type="button" class="btn secondary" data-action="cv-${action}" ${extra}>${text}</button>`;
export function resumeView(state){
 const versions=state.resumes||[],templates=state.resumeTemplates||[];
 const current=versions.find(v=>v.id===currentId)||versions[0];currentId=current?.id||null;
 const template=templates.find(t=>t.id===current?.templateId);
 const groups=[...new Set((template?.slots||[]).map(s=>s.section))];
 if(previewBlob&&previewId===currentId)setTimeout(()=>paintPdf(previewBlob,currentId),0);
 return `<header class="page-header"><div><div class="eyebrow">RESUME STUDIO</div><h1>简历</h1><p>保留母版排版，修改文字，为每个机会留一个版本。</p></div><div class="header-actions">${current?button('预览 PDF','preview')+button('下载 PDF','download'):''}<label class="btn secondary" for="cv-template-file">导入 DOCX 母版</label><input id="cv-template-file" class="cv-file" type="file" accept=".docx">${current?button('复制为新版本','copy'):''}</div></header>
 <div class="cv-version-list" aria-label="简历版本">${versions.map(v=>button(`${v.isMaster?'母版 · ':''}${escape(v.name)}`,'select',`data-id="${v.id}" aria-pressed="${v.id===currentId}"`)).join('')}</div>
 ${!template?`<section class="panel empty"><h2>从你的母CV开始</h2><p>导入一份 DOCX，保留照片、字体、表格和页面设置。母版保留原文，复制后编辑。</p><p>PDF 导出使用本机 LibreOffice，不上传简历。</p></section>`:`<div class="cv-layout"><section class="panel cv-editor"><div class="section-head"><h2>${current.isMaster?'母版原文':'编辑文字'}</h2><span class="badge">${escape(template.name)}</span></div>
 <p class="hint">${current.isMaster?'母版已锁定。点击“复制为新版本”开始修改。':'仅编辑文字，不改变标题顺序、字体、字号或纸张。停笔后自动更新右侧PDF预览；点击“保存文字”才保存版本。内容变长可能增加页数。'}</p>
 <form id="resume-form" data-id="${current.id}" class="form-stack"><label class="field"><span>版本名称</span><input name="cv-name" value="${escape(current.name)}" required ${current.isMaster?'readonly':''}></label>
 <label class="field"><span>关联机会（可选）</span><select name="cv-job" ${current.isMaster?'disabled':''}><option value="">通用版本</option>${state.jobs.map(j=>`<option value="${j.id}" ${current.jobId===j.id?'selected':''}>${escape(j.company)} · ${escape(j.title)}</option>`).join('')}</select></label>
 ${groups.map(group=>`<fieldset class="cv-section"><legend>${escape(group)}</legend>${template.slots.filter(s=>s.section===group&&!s.heading).map((s,i)=>`<label class="field"><span>第 ${i+1} 段</span><textarea name="cv-field-${s.key}" rows="${s.text.length>70?4:2}" maxlength="16000" ${current.isMaster?'readonly':''}>${escape(current.fields[s.key]??s.text)}</textarea></label>`).join('')}</fieldset>`).join('')}
 <div class="cv-actions">${current.isMaster?'':`<button class="btn primary" type="submit">保存文字</button>`}${button('生成 PDF 预览','preview')}${button('下载 PDF','download')}</div><p id="cv-status" role="status" class="hint">${current.updatedAt?'最近保存：'+escape(new Date(current.updatedAt).toLocaleString('zh-CN')):''}</p></form></section>
 <section class="panel cv-preview"><div class="section-head"><h2>PDF 预览</h2><span class="badge">沿用 DOCX 母版</span></div><p class="hint">这是实际导出的PDF。请检查段落、照片、加粗和分页。纸张与字号沿用所选母版，不自动压缩字号。</p><div class="cv-preview-content">${previewUrl&&previewId===current.id?`<div class="cv-pdf-pages" aria-label="实际PDF页面"></div><a class="btn secondary" href="${previewUrl}" target="_blank" rel="noopener">新窗口查看 PDF</a>`:`<div class="cv-preview-empty">修改左侧文字，右侧自动更新<small>实际PDF转换需要几秒钟，也可点击“生成 PDF 预览”。</small></div>`}</div></section></div>`}`;
}
function discard(){return document.querySelector('#resume-form')?.dataset.dirty!=='yes'||confirm('简历有未保存修改，确定放弃这些修改吗？');}
async function save(ctx){
 const form=document.querySelector('#resume-form'),next=clone(ctx.state),version=next.resumes.find(r=>r.id===currentId);
 if(version.isMaster)return;
 const data=new FormData(form);version.name=String(data.get('cv-name')).trim();if(!version.name)throw Error('请填写版本名称');
 version.jobId=data.get('cv-job')||'';
 for(const [key,value]of data)if(key.startsWith('cv-field-'))version.fields[key.slice(9)]=String(value);
 version.updatedAt=now();await ctx.commit(next);ctx.state=next;
}
export async function resumeAction(action,element,ctx){
 if(exporting)throw Error('正在生成 PDF，请稍候');
 if(action==='cv-select'){if(!discard())return;previewToken++;clearTimeout(previewTimer);currentId=element.dataset.id;ctx.render();}
 if(action==='cv-copy'){
  if(!discard())return;const next=clone(ctx.state),source=next.resumes.find(r=>r.id===currentId);
  const copy={...clone(source),id:uid(),name:source.name+' 副本',isMaster:false,createdAt:now(),updatedAt:now()};
  next.resumes.push(copy);currentId=copy.id;await ctx.commit(next);
 }
 if(action==='cv-preview'){await livePreview();return;}
 if(action==='cv-download'){
  if(ctx.demo)throw Error('请退出虚构示例后生成简历');
  if(document.querySelector('#resume-form')?.dataset.dirty==='yes')await save(ctx);
  exporting=true;document.querySelectorAll('[data-action^="cv-"]').forEach(b=>b.disabled=true);
  const status=document.querySelector('#cv-status');if(status)status.textContent='正在生成PDF，文字已保存，请稍候…';
  try{
   const latest=await(await fetch('/api/state')).json();
   const response=await fetch('/api/resume-pdf',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:currentId,revision:latest.revision})});
   if(!response.ok)throw Error((await response.json()).error||'PDF导出失败');
   if(previewUrl)URL.revokeObjectURL(previewUrl);previewBlob=await response.blob();previewUrl=URL.createObjectURL(previewBlob);previewId=currentId;
   if(action==='cv-download'){const a=document.createElement('a');a.href=previewUrl;a.download=(ctx.state.resumes.find(r=>r.id===currentId)?.name||'简历')+'.pdf';a.click();}
   ctx.render();ctx.toast('PDF已生成，请检查分页及文字');
  }finally{exporting=false;document.querySelectorAll('[data-action^="cv-"]').forEach(b=>b.disabled=false);}
 }
}
export async function importResume(file,ctx){
 if(!file)return;if(!discard())return;
 if(!file.name.toLowerCase().endsWith('.docx')||file.size>10*1024*1024)throw Error('请选择不超过10MB的DOCX');
 const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(Error('读取文件失败'));r.readAsDataURL(file);});
 const response=await fetch('/api/resume-template',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({data})});
 const result=await response.json();if(!response.ok)throw Error(result.error);
 const next=clone(ctx.state);next.resumeTemplates??=[];next.resumes??=[];
 const template={id:uid(),name:file.name,data,slots:result.slots,createdAt:now()};next.resumeTemplates.push(template);
 const version={id:uid(),name:file.name.replace(/\.docx$/i,''),templateId:template.id,fields:Object.fromEntries(result.slots.filter(s=>!s.heading).map(s=>[s.key,s.text])),isMaster:true,jobId:'',createdAt:now(),updatedAt:now()};
 next.resumes.push(version);currentId=version.id;await ctx.commit(next);
}
export async function saveResume(ctx){await save(ctx);}

function currentFields(){const form=document.querySelector('#resume-form');if(!form)return null;return Object.fromEntries([...new FormData(form)].filter(([key])=>key.startsWith('cv-field-')).map(([key,value])=>[key.slice(9),String(value)]));}
async function livePreview(){
 if(liveRunning){previewTimer=setTimeout(livePreview,900);return;}
 const form=document.querySelector('#resume-form');if(!form||!currentId)return;
 const fields=currentFields(),id=currentId,token=previewToken;liveRunning=true;
 const status=document.querySelector('#cv-status');if(status)status.textContent='正在更新预览… 未保存的修改仍保留在编辑区。';
 try{
  const latest=await(await fetch('/api/state')).json();
  const response=await fetch('/api/resume-pdf',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,revision:latest.revision,fields})});
  if(!response.ok)throw Error((await response.json()).error||'预览失败');
  const blob=await response.blob();
  if(token!==previewToken||id!==currentId||document.querySelector('#resume-form')!==form)return;
  if(previewUrl)URL.revokeObjectURL(previewUrl);previewBlob=blob;previewUrl=URL.createObjectURL(blob);previewId=id;
  const target=document.querySelector('.cv-preview-content');
  if(target)target.innerHTML=`<div class="cv-pdf-pages" aria-label="实际PDF页面"></div><a class="btn secondary" href="${previewUrl}" target="_blank" rel="noopener">新窗口查看 PDF</a>`;
  await paintPdf(blob,id);
  if(status)status.textContent=form.dataset.dirty==='yes'?'预览已更新，文字尚未保存。':'预览已更新。';
 }catch(error){if(status&&token===previewToken)status.textContent=error.message;}finally{liveRunning=false;}
}
document.addEventListener('input',event=>{if(event.target.closest('#resume-form')){previewToken++;clearTimeout(previewTimer);previewTimer=setTimeout(livePreview,1200);}});

async function paintPdf(blob,id){
 const container=document.querySelector('.cv-pdf-pages');if(!container||id!==currentId)return;
 try{
  const pdf=await pdfjs.getDocument({data:new Uint8Array(await blob.arrayBuffer()),isEvalSupported:false}).promise;
  if(id!==currentId||!container.isConnected){pdf.destroy();return;}
  container.innerHTML=`<p class="hint">${pdf.numPages} 页${pdf.numPages>1?' · 请检查新增分页是否合适':''}</p>`;
  for(let number=1;number<=pdf.numPages;number++){
   const page=await pdf.getPage(number),viewport=page.getViewport({scale:1.5}),canvas=document.createElement('canvas');
   canvas.width=viewport.width;canvas.height=viewport.height;canvas.setAttribute('aria-label',`简历第 ${number} 页`);container.append(canvas);
   await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
  }
  pdf.destroy();
 }catch(error){if(container.isConnected)container.textContent='页面预览失败：'+error.message+'。可用新窗口查看PDF。';}
}
