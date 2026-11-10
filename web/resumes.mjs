import * as pdfjs from './vendor/pdfjs/pdf.min.mjs';
pdfjs.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdfjs/pdf.worker.min.mjs',import.meta.url).href;
import {uid,now,clone,resumeCatalogueRows,copyResumeDraft,recordResumeSubmission} from './model.mjs';
const escape = value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let currentId=null, previewUrl=null, previewId=null, exporting=false, previewTimer, previewToken=0, liveRunning=false, previewBlob=null, viewState=null, previewKey=null, previewTemplateData=null, paintToken=0, catalogueQuery='', catalogueFilter='drafts', catalogueJob='', viewContext={}, fileUrl=null, dockObserver=null;
const button=(text,action,extra='')=>`<button type="button" class="btn secondary" data-action="cv-${action}" ${extra}>${text}</button>`;
export function resumeView(state,ctx={}){
 viewState=state;viewContext=ctx;dockObserver?.disconnect();
 const versions=state.resumes||[],templates=state.resumeTemplates||[];
 const fileRow=resumeCatalogueRows(state).find(r=>r.id===currentId&&r.type==='submission');
 if(fileRow?.material)return submittedView(state,fileRow);
 const current=versions.find(v=>v.id===currentId);
 if(!current){currentId=null;return catalogueView(state);}
 const template=templates.find(t=>t.id===current?.templateId);
 const groups=[...new Set((template?.slots||[]).map(s=>s.section))];
 if(current)setTimeout(()=>{setupDock();if(!document.querySelector('#resume-form'))return;if(previewBlob&&previewId===currentId)paintPdf(previewBlob,currentId);updatePreviewStatus();if(!previewMatches())livePreview();},0);
 return `<header class="page-header"><div><div class="eyebrow">RESUME STUDIO</div><h1>简历</h1><p>保留母版排版，修改文字，为每个机会留一个版本。</p></div><div class="header-actions"><label class="btn secondary" for="cv-template-file">导入 DOCX 母版</label><input id="cv-template-file" class="cv-file" type="file" accept=".docx">${current?button('复制为新版本','copy'):''}</div></header>
 <div class="cv-editor-nav">${button('返回简历列表','list')}<strong>${escape(current.name)}</strong></div>
 ${!template?`<section class="panel empty"><h2>从你的母CV开始</h2><p>导入一份 DOCX，保留照片、字体、表格和页面设置。母版保留原文，复制后编辑。</p><p>PDF 导出使用本机 LibreOffice，不上传简历。</p></section>`:`<div class="cv-layout"><section class="panel cv-editor"><div class="section-head"><h2>${current.isMaster?'母版原文':'编辑文字'}</h2><span class="badge">${escape(template.name)}</span></div>
 <p class="hint">${current.isMaster?'母版已锁定。点击“复制为新版本”开始修改。':'仅编辑文字，不改变标题顺序、字体、字号或纸张。停笔后自动更新右侧PDF预览；点击“保存草稿”才保存版本；下载会先保存点击时的内容。内容变长可能增加页数。'}</p>
 <form id="resume-form" data-id="${current.id}" class="form-stack"><label class="field"><span>版本名称</span><input name="cv-name" value="${escape(current.name)}" required ${current.isMaster?'readonly':''}></label>
 <label class="field"><span>关联机会（可选）</span><select name="cv-job" ${current.isMaster?'disabled':''}><option value="">通用版本</option>${state.jobs.map(j=>`<option value="${j.id}" ${current.jobId===j.id?'selected':''}>${escape(j.company)} · ${escape(j.title)}</option>`).join('')}</select></label>
 ${groups.map(group=>`<fieldset class="cv-section"><legend>${escape(group)}</legend>${template.slots.filter(s=>s.section===group&&!s.heading).map((s,i)=>`<label class="field"><span>第 ${i+1} 段</span><textarea name="cv-field-${s.key}" rows="${s.text.length>70?4:2}" maxlength="16000" ${current.isMaster?'readonly':''}>${escape(current.fields[s.key]??s.text)}</textarea></label>`).join('')}</fieldset>`).join('')}
 </form></section>
 <section class="panel cv-preview"><div class="section-head"><h2>PDF 预览</h2><span class="badge">沿用 DOCX 母版</span></div><p class="hint">这是实际导出的PDF。请检查段落、照片、加粗和分页。纸张与字号沿用所选母版，不自动压缩字号。</p><p id="cv-preview-state" class="hint" role="status">预览状态正在核对。</p><div class="cv-preview-content">${previewUrl&&previewId===current.id?`<div class="cv-pdf-pages" aria-label="实际PDF页面"></div><a class="btn secondary" href="${previewUrl}" target="_blank" rel="noopener">新窗口查看 PDF</a>`:`<div class="cv-preview-empty">修改左侧文字，右侧自动更新<small>实际PDF转换需要几秒钟，也可点击“更新预览”。</small></div>`}</div></section></div><section class="cv-dock" aria-label="简历操作栏"><div class="cv-dock-buttons">${current.isMaster?'':`<button class="btn primary" type="submit" form="resume-form">保存草稿</button>`}${button('更新预览','preview')}${button('下载 PDF','download')}${!current.isMaster?button('登记已投递','register'):''}</div><p id="cv-status" role="status">${current.updatedAt?'最近保存：'+escape(new Date(current.updatedAt).toLocaleString('zh-CN')):''}</p></section>`}`;
}
function discard(){return document.querySelector('#resume-form')?.dataset.dirty!=='yes'||confirm('简历有未保存修改，确定放弃这些修改吗？');}
async function save(ctx){
 const form=document.querySelector('#resume-form'),next=clone(ctx.state),version=next.resumes.find(r=>r.id===currentId);
 if(version.isMaster)return;
 const values=JSON.stringify([...new FormData(form)]),data=new FormData(form);
 version.name=String(data.get('cv-name')).trim();if(!version.name)throw Error('请填写版本名称');
 version.jobId=data.get('cv-job')||'';
 for(const [key,value]of data)if(key.startsWith('cv-field-'))version.fields[key.slice(9)]=String(value);
 version.updatedAt=now();await ctx.commit(next,{renderView:false});ctx.state=next;viewState=next;
 if(form===document.querySelector('#resume-form')){
  if(values===JSON.stringify([...new FormData(form)]))delete form.dataset.dirty;
  const status=document.querySelector('#cv-status');
  if(status)status.textContent=form.dataset.dirty==='yes'?'已保存点击时的内容；后续输入尚未保存。':'最近保存：'+new Date(version.updatedAt).toLocaleString('zh-CN');
  const tab=[...document.querySelectorAll('.cv-version-list [data-id]')].find(b=>b.dataset.id===version.id);if(tab)tab.textContent=version.name;const heading=document.querySelector('.cv-editor-nav strong');if(heading)heading.textContent=version.name;
  ctx.updateSaveStatus?.();updatePreviewStatus();
 }
}

export async function resumeAction(action,element,ctx){
 if(exporting)throw Error('正在生成 PDF，请稍候');
 if(action==='cv-select'){if(!openResume(element.dataset.id))return;ctx.render();}
 if(action==='cv-copy'){
  if(!discard())return;const next=clone(ctx.state),source=next.resumes.find(r=>r.id===currentId);
  const copy=copyResumeDraft(source);
  next.resumes.push(copy);currentId=copy.id;await ctx.commit(next);
 }
 if(action==='cv-list'){if(!showResumeList())return;ctx.render();}
 if(action==='cv-create'){ctx.openCreate?.({jobId:catalogueJob});return;}
 if(action==='cv-register'){if(document.querySelector('#resume-form')?.dataset.dirty==='yes')await save(ctx);if(document.querySelector('#resume-form')?.dataset.dirty==='yes')throw Error('还有新输入未保存，请先保存草稿');ctx.openSubmission?.({resumeId:currentId});return;}
 if(action==='cv-fill-submission'){ctx.openSubmission?.({jobId:element.dataset.jobId,activityId:element.dataset.activityId});return;}
 if(action==='cv-archive'||action==='cv-restore'){const next=clone(ctx.state),r=next.resumes.find(r=>r.id===element.dataset.id);r.archived=action==='cv-archive';r.updatedAt=now();await ctx.commit(next);return;}
 if(action==='cv-copy-row'){const source=ctx.state.resumes.find(r=>r.id===element.dataset.id),next=clone(ctx.state),copy=copyResumeDraft(source);next.resumes.push(copy);currentId=copy.id;await ctx.commit(next);return;}
 if(action==='cv-copy-submission'){
  const row=resumeCatalogueRows(ctx.state).find(r=>r.id===currentId),m=row.material;
  const source=m.resumeSnapshot||ctx.state.resumes.find(r=>r.sourceMaterialId===m.id||r.id===m.sourceResumeId)||ctx.state.resumes.find(r=>r.jobId===row.jobId&&!r.isMaster);
  if(!source)throw Error('此原件没有可编辑来源，请从母版创建新的草稿');
  const next=clone(ctx.state),copy=copyResumeDraft(source,{jobId:row.jobId,name:source.name+' · 后续草稿',materialId:m.id});next.resumes.push(copy);currentId=copy.id;await ctx.commit(next);return;
 }
 if(action==='cv-download-file'){const row=resumeCatalogueRows(ctx.state).find(r=>r.id===currentId),a=document.createElement('a');a.href=fileUrl;a.download=row.material.file.name;a.click();return;}
 if(action==='cv-preview'){await livePreview();return;}
 if(action==='cv-download'){
  if(ctx.demo)throw Error('请退出虚构示例后生成简历');
  const form=document.querySelector('#resume-form'),id=currentId,fields=currentFields(),template=currentTemplate();
  const key=contentKey(id,fields,template),templateData=template.data;
  const name=String(new FormData(form).get('cv-name')||'简历').trim();
  exporting=true;clearTimeout(previewTimer);previewToken++;
  document.querySelectorAll('[data-action^="cv-"]').forEach(b=>b.disabled=true);
  const status=document.querySelector('#cv-status');
  try{
   if(form.dataset.dirty==='yes')await save(ctx);
   if(status)status.textContent='正在导出点击时的内容；后续输入会保留。';
   const latest=await(await fetch('/api/revision')).json();
   const response=await fetch('/api/resume-pdf',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,revision:latest.revision,fields})});
   if(!response.ok)throw Error((await response.json()).error||'PDF导出失败');
   const blob=await response.blob(),url=URL.createObjectURL(blob),a=document.createElement('a');
   a.href=url;a.download=name+'.pdf';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
   if(id===currentId&&form===document.querySelector('#resume-form')){
    await showPreview(blob,id,key,templateData);
    if(status)status.textContent=form.dataset.dirty==='yes'?'PDF已生成；后续输入仍保留，尚未保存。':'PDF已生成，文字已保存。';
   }
   ctx.toast('PDF已生成，对应点击下载时的内容');
  }catch(error){if(status?.isConnected)status.textContent='导出失败：'+error.message;throw error;}
  finally{
   exporting=false;document.querySelectorAll('[data-action^="cv-"]').forEach(b=>b.disabled=false);
   if(document.querySelector('#resume-form')&&!previewMatches()){clearTimeout(previewTimer);previewTimer=setTimeout(livePreview,1200);}
  }
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
function currentTemplate(){const version=viewState?.resumes?.find(r=>r.id===currentId);return viewState?.resumeTemplates?.find(t=>t.id===version?.templateId);}
function contentKey(id,fields,template){return JSON.stringify([id,fields,template?.id,template?.paragraphStyles||{}]);}
function previewMatches(){const template=currentTemplate();return previewId===currentId&&previewKey===contentKey(currentId,currentFields(),template)&&previewTemplateData===template?.data;}
function updatePreviewStatus(){const status=document.querySelector('#cv-preview-state');if(status)status.textContent=!previewBlob||previewId!==currentId?'尚未生成当前版本预览。':previewMatches()?'预览对应当前文字。':'预览已过期，正在等待更新；当前编辑内容已保留。';}
async function showPreview(blob,id,key,templateData){
 if(previewUrl)URL.revokeObjectURL(previewUrl);previewBlob=blob;previewUrl=URL.createObjectURL(blob);previewId=id;previewKey=key;previewTemplateData=templateData;
 const target=document.querySelector('.cv-preview-content');
 if(target)target.innerHTML=`<div class="cv-pdf-pages" aria-label="实际PDF页面"></div><a class="btn secondary" href="${previewUrl}" target="_blank" rel="noopener">新窗口查看 PDF</a>`;
 updatePreviewStatus();return paintPdf(blob,id);
}
async function livePreview(){
 if(liveRunning||exporting){clearTimeout(previewTimer);previewTimer=setTimeout(livePreview,900);return;}
 const form=document.querySelector('#resume-form');if(!form||!currentId)return;
 const fields=currentFields(),id=currentId,token=previewToken,template=currentTemplate();
 const key=contentKey(id,fields,template),templateData=template?.data;liveRunning=true;
 const status=document.querySelector('#cv-status');if(status)status.textContent='正在更新预览… 未保存的修改仍保留在编辑区。';
 try{
  const latest=await(await fetch('/api/revision')).json();
  const response=await fetch('/api/resume-pdf',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,revision:latest.revision,fields})});
  if(!response.ok)throw Error((await response.json()).error||'预览失败');
  const blob=await response.blob();
  if(token!==previewToken||id!==currentId||document.querySelector('#resume-form')!==form)return;
  const painted=await showPreview(blob,id,key,templateData);
  if(status)status.textContent=!painted?'PDF已生成，但页面预览未完成，可在新窗口查看。':form.dataset.dirty==='yes'?'预览已更新，文字尚未保存。':'预览已更新。';
 }catch(error){if(status&&token===previewToken)status.textContent=error.message;}finally{liveRunning=false;}
}
document.addEventListener('input',event=>{if(event.target.closest('#resume-form')&&event.target.name?.startsWith('cv-field-')){previewToken++;updatePreviewStatus();clearTimeout(previewTimer);previewTimer=setTimeout(livePreview,1200);}});

async function paintPdf(blob,id){
 const container=document.querySelector('.cv-pdf-pages'),token=++paintToken;if(!container||id!==currentId)return false;
 try{
  const pdf=await pdfjs.getDocument({data:new Uint8Array(await blob.arrayBuffer()),isEvalSupported:false}).promise;
  if(id!==currentId||token!==paintToken||!container.isConnected){pdf.destroy();return false;}
  container.innerHTML=`<p class="hint">${pdf.numPages} 页${pdf.numPages>1?' · 请检查新增分页是否合适':''}</p>`;
  for(let number=1;number<=pdf.numPages;number++){
   if(token!==paintToken||!container.isConnected){pdf.destroy();return false;}
   const page=await pdf.getPage(number),viewport=page.getViewport({scale:1.5}),canvas=document.createElement('canvas');
   canvas.width=viewport.width;canvas.height=viewport.height;canvas.setAttribute('aria-label',`简历第 ${number} 页`);container.append(canvas);
   await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
  }
  pdf.destroy();return true;
 }catch(error){if(container.isConnected)container.textContent='页面预览失败：'+error.message+'。可用新窗口查看PDF。';return false;}
}

export function openResume(id){if(!discard())return false;previewToken++;clearTimeout(previewTimer);currentId=id;return true;}
export function showResumeList(jobId=catalogueJob,skipConfirm=false){if(!skipConfirm&&!discard())return false;previewToken++;clearTimeout(previewTimer);currentId=null;catalogueJob=jobId;catalogueQuery='';return true;}
function catalogueView(state){
 const rows=resumeCatalogueRows(state).filter(row=>(!catalogueJob||row.jobId===catalogueJob)&&(!catalogueQuery||[row.name,row.status,state.jobs.find(j=>j.id===row.jobId)?.company,state.jobs.find(j=>j.id===row.jobId)?.title].join(' ').toLowerCase().includes(catalogueQuery.toLowerCase()))&&(catalogueFilter==='all'||catalogueFilter==='drafts'&&row.type==='resume'&&!row.resume.isMaster&&!row.archived||catalogueFilter==='submitted'&&row.type==='submission'||catalogueFilter==='masters'&&row.resume?.isMaster||catalogueFilter==='archived'&&row.type==='resume'&&row.archived));
 return `<header class="page-header"><div><div class="eyebrow">RESUME LIBRARY</div><h1>简历与投递原件</h1><p>草稿持续修改，实际提交的文件单独留档。</p></div><div class="header-actions">${button('从底稿创建','create',!(state.resumes||[]).length?'disabled':'')}<label class="btn secondary" for="cv-template-file">导入 DOCX 母版</label><input id="cv-template-file" class="cv-file" type="file" accept=".docx"></div></header>
 <div class="filterbar cv-catalogue-filters"><label class="search-box"><input id="cv-catalogue-search" aria-label="搜索简历、公司或岗位" placeholder="搜索简历、公司或岗位" value="${escape(catalogueQuery)}"></label><select id="cv-catalogue-filter" aria-label="简历状态">${[['drafts','草稿与底稿'],['submitted','已投递与待补原件'],['masters','母版'],['archived','已归档草稿'],['all','全部记录']].map(([v,n])=>`<option value="${v}" ${catalogueFilter===v?'selected':''}>${n}</option>`).join('')}</select><select id="cv-catalogue-job" aria-label="关联岗位筛选"><option value="">全部岗位</option>${state.jobs.map(j=>`<option value="${j.id}" ${catalogueJob===j.id?'selected':''}>${escape(j.company)} · ${escape(j.title)}</option>`).join('')}</select></div>
 <p class="hint cv-catalogue-count">${rows.length} 条记录 · 按最近修改或登记时间排序</p>
 ${!rows.length?'<section class="panel empty"><h2>当前筛选下没有简历</h2><p>可切换状态或岗位，或从底稿创建新的草稿。</p></section>':`<div class="table-wrap cv-catalogue"><table><thead><tr><th>简历名称</th><th>关联岗位</th><th>状态</th><th>最近修改／登记</th><th>操作</th></tr></thead><tbody>${rows.map(row=>{const job=state.jobs.find(j=>j.id===row.jobId);return `<tr><td><strong>${escape(row.name)}</strong></td><td>${job?escape(job.title)+`<small>${escape(job.company)}</small>`:'通用版本'}</td><td><span class="badge">${escape(row.archived?'已归档 · '+row.status:row.status)}</span></td><td>${row.date?escape(new Date(row.date).toLocaleString('zh-CN')):'未记录'}</td><td><div class="cv-row-actions">${row.type==='resume'?button(row.resume.isMaster?'查看母版':'编辑','select',`data-id="${row.id}"`)+button(row.resume.isMaster?'创建草稿':'复制','copy-row',`data-id="${row.id}"`)+(!row.resume.isMaster?button(row.archived?'恢复':'归档',row.archived?'restore':'archive',`data-id="${row.id}"`):''):row.material?button('查看原件','select',`data-id="${row.id}"`):button('补充实际PDF','fill-submission',`data-job-id="${row.jobId}" data-activity-id="${row.activityId}"`)}</div></td></tr>`;}).join('')}</tbody></table></div>`}`;
}
function blobFromFile(file){const raw=atob(file.data.split(',')[1]);return new Blob([Uint8Array.from(raw,c=>c.charCodeAt(0))],{type:'application/pdf'});}
function submittedView(state,row){
 if(fileUrl)URL.revokeObjectURL(fileUrl);const blob=blobFromFile(row.material.file);fileUrl=URL.createObjectURL(blob);
 setTimeout(()=>paintPdf(blob,row.id),0);const job=state.jobs.find(j=>j.id===row.jobId);
 return `<header class="page-header"><div><div class="eyebrow">SUBMITTED ORIGINAL</div><h1>已投递原件</h1><p>${escape(job?.company)} · ${escape(job?.title)}</p></div><div class="header-actions">${button('返回列表','list')}${button('下载原件','download-file')}${button('创建后续草稿','copy-submission')}</div></header><section class="panel cv-submitted"><h2>${escape(row.material.file.name)}</h2><p class="hint">此文件只读留档，后续草稿的修改不会改变原件。记录时间：${escape(new Date(row.date).toLocaleString('zh-CN'))}${row.channel?' · 渠道：'+escape(row.channel):''}</p><div class="cv-pdf-pages" aria-label="实际投递PDF原件"></div></section>`;
}
export async function submitResumeSubmission(form,ctx){
 const data=new FormData(form),source=String(data.get('pdfSource')),resumeId=String(data.get('resumeId')||'');
 if(!data.get('confirmed'))throw Error('请先确认已经实际投递');
 const version=ctx.state.resumes?.find(r=>r.id===resumeId);let file;
 const controls=[...form.elements].map(e=>[e,e.disabled]);controls.forEach(([e])=>{if(e.type!=='button')e.disabled=true;});
 try{
  if(source==='generated'){
   if(!version||version.isMaster)throw Error('请选择可编辑的简历草稿');
   const latest=await(await fetch('/api/revision')).json();
   const response=await fetch('/api/resume-pdf',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:version.id,revision:latest.revision,fields:version.fields})});
   if(!response.ok)throw Error((await response.json()).error||'生成PDF失败');
   const blob=await response.blob();file={name:version.name+'.pdf',data:await readDataUrl(blob)};
  }else{
   const upload=data.get('submittedFile');if(!upload?.size||upload.size>10*1024*1024||!upload.name.toLowerCase().endsWith('.pdf'))throw Error('请选择不超过10MB的实际投递PDF');
   if(!(await upload.slice(0,5).text()).startsWith('%PDF-'))throw Error('文件不是有效的PDF');
   file={name:upload.name,data:await readDataUrl(new Blob([await upload.arrayBuffer()],{type:'application/pdf'}))};
  }
  if(!form.isConnected)throw Error('登记已取消');
  const next=recordResumeSubmission(ctx.state,{jobId:String(data.get('jobId')),resumeId:source==='generated'?resumeId:'',file,occurredAt:String(data.get('occurredAt')||''),channel:String(data.get('channel')||''),note:String(data.get('note')||''),activityId:form.dataset.activityId||''});
  await ctx.commit(next);catalogueFilter='submitted';currentId=null;ctx.render();
 }finally{controls.forEach(([e,disabled])=>e.disabled=disabled);}
}
function readDataUrl(blob){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(Error('读取PDF失败'));r.readAsDataURL(blob);});}
function setupDock(){
 dockObserver?.disconnect();const dock=document.querySelector('.cv-dock'),layout=document.querySelector('.cv-layout');if(!dock||!layout)return;
 const update=()=>{if(!dock.isConnected)return;const editor=layout.querySelector('.cv-editor'),rect=editor.getBoundingClientRect(),top=Math.max(20,layout.getBoundingClientRect().top);dock.style.left=rect.left+'px';dock.style.width=rect.width+'px';const available=Math.max(160,window.innerHeight-top-16);layout.style.setProperty('--cv-preview-height',available+'px');layout.style.setProperty('--cv-panel-height',Math.max(100,available-dock.getBoundingClientRect().height-16)+'px');};
 update();dockObserver=new ResizeObserver(update);dockObserver.observe(dock);const header=document.querySelector('.page-header');if(header)dockObserver.observe(header);
}
window.addEventListener('resize',()=>{if(document.querySelector('.cv-dock'))setupDock();});
window.addEventListener('scroll',()=>{if(document.querySelector('.cv-dock'))setupDock();},{passive:true});
document.addEventListener('change',event=>{if(event.target.id==='cv-catalogue-filter')catalogueFilter=event.target.value;else if(event.target.id==='cv-catalogue-job')catalogueJob=event.target.value;else return;viewContext.render?.();});
document.addEventListener('input',event=>{if(event.target.id!=='cv-catalogue-search'||event.isComposing)return;catalogueQuery=event.target.value;const position=event.target.selectionStart;viewContext.render?.();const field=document.querySelector('#cv-catalogue-search');field?.focus();field?.setSelectionRange(position,position);});
document.addEventListener('compositionend',event=>{if(event.target.id==='cv-catalogue-search'){catalogueQuery=event.target.value;viewContext.render?.();document.querySelector('#cv-catalogue-search')?.focus();}});
