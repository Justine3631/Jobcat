import {resumeView,resumeAction,importResume,saveResume,openResume,showResumeList,submitResumeSubmission} from './resumes.mjs';
import {STAGES,DIRECTIONS,DECISIONS,RECOMMENDATIONS,recommendation,submittedMaterialIds,resumeCatalogueRows,copyResumeDraft,cityGroup,todayActions,needsFollowUp,awaitingDecision,setDeferred,ACTIVITY_TYPES,uid,now,localDate,clone,makeJob,updateJob,addActivity,saveInterview,duplicates,stats,validateState,previewDraft,applyDraft,demoState} from './model.mjs';

const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icons = {
 home:'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"/>',
 grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
 file:'<path d="M14 2H5v20h14V7Z M14 2v6h5M8 12h8m-8 4h6"/>',
 chart:'<path d="M4 3v17h17M8 16v-5m5 5V7m5 9V4"/>',
 settings:'<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="9" cy="18" r="2"/>',
 plus:'<path d="M12 5v14M5 12h14"/>',
 search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
 arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>',
 link:'<path d="m10 13 4-4m-7 6-2 2a3 3 0 0 0 4 4l5-5m-4-8 5-5a3 3 0 1 1 4 4l-2 2"/>',
 check:'<path d="m5 12 4 4L19 6"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
 down:'<path d="m6 9 6 6 6-6"/>',
 upload:'<path d="M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6"/>',
 download:'<path d="M12 3v13m-5-5 5 5 5-5M4 16v5h16v-5"/>',
 close:'<path d="m6 6 12 12M6 18 18 6"/>',
 calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 2v6m10-6v6M3 11h18"/>',
 archive:'<path d="M4 8v13h16V8M2 3h20v5H2ZM9 12h6"/>',
 external:'<path d="M14 3h7v7m0-7L10 14M10 4H4v16h16v-6"/>',
 leaf:'<path d="M20 3C9 2 2 10 6 17c7 4 15-3 14-14ZM4 21l11-11"/>',
 list:'<path d="M8 6h13M8 12h13M8 18h13M3 6h1M3 12h1M3 18h1"/>'
};
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.file}</svg>`;
const btn = (label, action, kind='secondary', extra='') => `<button type="button" class="btn ${kind}" data-action="${action}" ${extra}>${label}</button>`;
const options = (values, selected) => values.map(v => `<option ${v === selected ? 'selected' : ''}>${esc(v)}</option>`).join('');
const input = (label,name,value='',type='text',extra='') => `<label class="field"><span>${label}</span><input type="${type}" name="${name}" value="${esc(value)}" ${extra}></label>`;
const textarea = (label,name,value='',extra='') => `<label class="field"><span>${label}</span><textarea name="${name}" ${extra}>${esc(value)}</textarea></label>`;
const select = (label,name,values,value) => `<label class="field"><span>${label}</span><select name="${name}">${options(values,value)}</select></label>`;
const badge = (text,cls='') => `<span class="badge ${cls}">${esc(text)}</span>`;
const formatDate = v => v ? new Intl.DateTimeFormat('zh-CN',{month:'short',day:'numeric',hour: v.includes('T')?'2-digit':undefined,minute:v.includes('T')?'2-digit':undefined}).format(new Date(v.includes('T')?v:`${v}T00:00:00`)) : '未设日期';
const fullDate = v => v ? new Intl.DateTimeFormat('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Asia/Shanghai'}).format(new Date(v)).replaceAll('/','-') : '未记录';
const safeUrl = value => {try {const u = new URL(value); return ['http:','https:'].includes(u.protocol) ? u.href : null;}catch{return null;}};
let state, revision, savedState, demo=false, busy=false, view='today', mode='list', search='', filterDirection='', filterCity='', filterStage='', filterDecision='', filterRecommendation='', focusOnly=false, pendingOnly=false, archived=false;
let selectedJob=null, detailTab='overview', dialog=null, importRows=[], restoreData=null, focusBefore;
const selected = new Set();
let toastTimer;
async function checkForUpdates(){
  if(!state||demo||busy||document.hidden)return;
  try{const res=await fetch('/api/revision');if(!res.ok)return;const fresh=await res.json();if(fresh.revision!==revision){if(!$('#update-notice'))$('#app').insertAdjacentHTML('beforeend',`<div id="update-notice" role="status">有新记录可更新。当前输入会保留，保存或取消后再更新。${btn('更新记录','refresh-state','primary')}</div>`);}}catch{}
}
window.addEventListener('focus',checkForUpdates);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkForUpdates();});
setInterval(checkForUpdates,45000);
function updateSaveStatus(){const target=$('footer .footer-right');if(target&&!demo)target.textContent=$('#overlay form[data-dirty="yes"], #preferences-form[data-dirty="yes"], #resume-form[data-dirty="yes"]')?'本机工作区 · 有未保存修改':'本机工作区 · 已保存';}
function toast(message,error=false) { $('#toast').textContent=message; $('#toast').className=`visible ${error?'error':''}`; clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('#toast').className='',4500); }
async function commit(next,{renderView=true,restore=false}={}) {
  if(busy) throw Error('正在保存，请稍候');
  busy=true; document.body.classList.add('saving');
  try {
    validateState(next);
    if(!demo) {
      const response=await fetch('/api/state',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision,state:next,...(restore?{restore:true}:{})})});
      const result=await response.json(); if(!response.ok) throw Error(result.error || '保存失败');
      revision=result.revision;
    }
    state=next;
    toast(demo?'已更新示例，未写入正式记录':'已保存到本机');
    if(renderView)render();
  } finally {busy=false; document.body.classList.remove('saving');}
}
async function changeJob(id, transform) {
  const next=clone(state), i=next.jobs.findIndex(j=>j.id===id);
  if(i<0) throw Error('找不到这个机会');
  next.jobs[i]=transform(next.jobs[i]); await commit(next);
}
const activeJobs = () => state.jobs.filter(j=>!j.archived&&j.decision!=='暂缓');
const getJob = () => state.jobs.find(j=>j.id===selectedJob);
function stageClass(stage) {return stage==='Offer'?'gold':stage==='已结束'?'muted':stage==='测评／面试中'?'green':stage==='已入职'?'green':'neutral';}
function visibleJobs() {
  const deferredView=view==='deferred';
  return state.jobs.filter(j=>Boolean(j.archived)===archived&&(deferredView?j.decision==='暂缓':j.decision!=='暂缓')&&(!pendingOnly||awaitingDecision(j))&&(!search||[j.title,j.company,j.city,j.salary,j.reason].join(' ').toLowerCase().includes(search.toLowerCase()))&&(!filterDirection||j.direction===filterDirection)&&(!filterCity||cityGroup(j.city)===filterCity)&&(!filterStage||j.stage===filterStage)&&(!filterDecision||j.decision===filterDecision)&&(!filterRecommendation||recommendation(j)===filterRecommendation)&&(!focusOnly||j.focus)).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
}
function header(eyebrow,title,subtitle,actions='') {
  return `<header class="page-header"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p>${subtitle}</p></div><div class="header-actions">${actions}${btn('更新记录','refresh-state','text')}${btn(icon('settings'),'settings','mobile-settings','aria-label="偏好与数据"')}</div></header>`;
}
function empty(title,text,action='add',label='添加机会') {
  return `<div class="empty"><div class="empty-symbol">${icon('leaf')}</div><h3>${title}</h3><p>${text}</p>${action?btn(`${icon('plus')}${label}`,action,'primary'):''}</div>`;
}
function render() {
  const count=activeJobs().length,deferredCount=state.jobs.filter(j=>!j.archived&&j.decision==='暂缓').length;
  $('#app').innerHTML=`<aside class="sidebar"><a class="brand" href="#today" data-action="nav" data-view="today"><img src="./cat.svg" alt=""><span>Jobcat<small>我的求职工作台</small></span></a>
    <div class="workspace-label">个人空间 <span>01</span></div>
    <nav aria-label="主导航">${[['today','home','今天'],['jobs','grid','机会库'],['deferred','clock','暂缓跟进'],['search','search','找机会'],['resumes','file','简历'],['materials','file','材料与经历'],['review','chart','回顾']].map(([key,i,label])=>`<button class="nav-item ${view===key?'active':''}" data-action="nav" data-view="${key}">${icon(i)}<span>${label}</span>${key==='jobs'?`<em>${count}</em>`:key==='deferred'?`<em>${deferredCount}</em>`:''}</button>`).join('')}</nav>
    <div class="sidebar-note"><span class="small-label">当前方向</span><strong>你的求职偏好</strong><p>${esc(state.preferences.directions)}</p><span class="location-dot"></span>${esc(state.preferences.city||'本地')} · 城市不限</div>
    <div class="sidebar-bottom"><button class="nav-item ${view==='settings'?'active':''}" data-action="nav" data-view="settings">${icon('settings')}<span>偏好与数据</span></button><div class="user"><span class="avatar">佳</span><div>我的工作区<small><span class="status-dot"></span>${demo?'示例体验中':'数据保存在本机'}</small></div></div></div></aside>
    <main>${demo?`<div class="demo-banner"><span>示例模式 · 公司与机会均为虚构，修改不写入正式记录。</span>${btn('退出示例','exit-demo','plain')}</div>`:''}<div class="content">${view==='today'?todayView():view==='jobs'||view==='deferred'?jobsView():view==='search'?searchView():view==='resumes'?resumeView(state,{render}):view==='materials'?materialsView():view==='review'?reviewView():settingsView()}</div><footer>Jobcat <span>·</span> 每个机会，都有下一步。<span class="footer-right">${demo?'示例数据':`本机工作区 · 已保存`}</span></footer></main>`;
  if(selectedJob) renderDetail();
  updateSaveStatus();
}
function todayView() {
  const jobs=activeJobs(), live=jobs.filter(j=>!['已结束','已入职'].includes(j.stage));
  const today=localDate();
  const events=live.flatMap(j=>j.interviews.filter(i=>i.status==='待进行').map(i=>({job:j,interview:i}))).sort((a,b)=>(a.interview.date||'9999').localeCompare(b.interview.date||'9999'));
  const due=todayActions(jobs,today), focused=live.filter(j=>j.focus&&needsFollowUp(j));
  const statsData=stats(jobs);
  const date=new Intl.DateTimeFormat('zh-CN',{month:'long',day:'numeric',weekday:'long'}).format(new Date());
  return header('YOUR NEXT CHAPTER','今天，先从这里开始。',`${date} <span class="sub-sep">/</span> 把精力留给真正值得推进的机会。`,btn(`${icon('plus')}收下一个机会`,'add','primary'))+
  `<section class="overview-grid" aria-label="工作区概览">${[
    ['机会收藏',statsData.collected,'等待你判断的可能性','grid','jobs'],
    ['正在推进',live.filter(j=>needsFollowUp(j)&&(j.decision==='推进'||!['待判断','已结束','已入职'].includes(j.stage))).length,'保持自己的节奏','arrow','jobs'],
    ['待进行面试',events.length,'准备好每一次对话','calendar','events'],
    ['待我决定',jobs.filter(awaitingDecision).length,'先了解，再作决定','leaf','pending']
  ].map(([label,num,sub,i,action])=>`<button class="metric" data-action="${action}"><div class="metric-label">${label}${icon(i)}</div><strong>${String(num).padStart(2,'0')}</strong><small>${sub}</small></button>`).join('')}</section>
  <div class="today-columns"><div><section class="panel"><div class="section-head"><div><span class="small-label">NEXT ACTION</span><h2>今天到期的行动</h2></div>${badge(`${due.length} 项`)}</div>${due.length?`<div class="action-list">${due.slice(0,6).map(j=>`<button class="action-row" data-action="open" data-id="${j.id}"><span class="action-mark">${icon('arrow')}</span><div><strong>${esc(j.nextAction)}</strong><small>${esc(j.company||'公司待补充')} · ${esc(j.title)}</small></div><span class="date-label ${j.nextDate&&j.nextDate<today?'overdue':''}">${j.nextDate===today?'今天':formatDate(j.nextDate)}</span></button>`).join('')}</div>`:empty('今天没有到期行动','在机会详情写下一件具体的事，并选择行动日期。','jobs','查看机会')}</section>
    <section class="panel recent"><div class="section-head"><h2>本周重点</h2>${badge(`${focused.length} 个`)}</div>${focused.length?focused.map(j=>compactJob(j)).join(''):`<p class="quiet-empty">还没有选定重点。在机会详情点“设为本周重点”，建议先选 3—5 个；这不会替你决定是否投递。</p>`}</section>
    <section class="panel recent"><div class="section-head"><h2>待我决定</h2>${btn('全部机会','jobs','text')}</div>${jobs.filter(awaitingDecision).sort((a,b)=>(RECOMMENDATIONS.indexOf(recommendation(a))<0?9:RECOMMENDATIONS.indexOf(recommendation(a)))-(RECOMMENDATIONS.indexOf(recommendation(b))<0?9:RECOMMENDATIONS.indexOf(recommendation(b)))).slice(0,3).map(j=>compactJob(j)).join('')||'<p class="quiet-empty">暂时没有未决定的机会。</p>'}</section></div>
    <div><section class="panel calendar-panel" id="events"><div class="section-head"><div><span class="small-label">UPCOMING</span><h2>面试与测评</h2></div>${icon('calendar')}</div>${events.length?events.slice(0,4).map(({job,interview})=>`<button class="event-card" data-action="open-interviews" data-id="${job.id}"><div class="event-date">${interview.date?formatDate(interview.date):'时间待定'}</div><h3>${esc(job.company||'公司待补充')}</h3><p>${esc(job.title)}</p><div>${badge(interview.round,'green')}<span>${esc(interview.format||'形式待确认')}</span></div></button>`).join(''):`<div class="quiet-empty calendar-empty">${icon('calendar')}<strong>下一次对话，留个位置。</strong><p>面试安排会出现在这里。<br>也可以记录笔试和作业截止时间。</p></div>`}<p class="panel-footnote">日程仅在工作台展示，暂不发送系统通知。</p></section>
    <section class="direction-card"><span class="small-label">YOUR COMPASS</span><h2>方向开放，判断具体。</h2><p>看实际做什么、能学到什么，<br>也看收入和生活是否合适。</p><div class="direction-tags">${['产品','AI 应用','业务分析'].map(t=>badge(t)).join('')}</div>${btn('查看我的求职偏好 '+icon('arrow'),'settings','text')}</section>
    ${!jobs.length&&!demo?`<button class="demo-link" data-action="demo">先用虚构示例逛一圈 ${icon('arrow')}</button>`:''}</div></div>`;
}
function compactJob(j) {
  return `<button class="compact-job" data-action="open" data-id="${j.id}"><span class="company-avatar">${esc((j.company||'?').replace('示例 · ','').slice(0,1))}</span><div><strong>${esc(j.title)}</strong><small>${esc(j.company||'公司待补充')} <span>·</span> ${esc(j.city||'城市待补充')}</small></div><span class="compact-salary">${esc(j.salary||'薪资待确认')}</span>${badge(j.stage,stageClass(j.stage))}${icon('arrow')}</button>`;
}
function adviceBadge(j) { const label=recommendation(j); return badge(label,label==='优先核实'?'green':label==='暂不优先'?'muted':'gold'); }
function jobLink(j) {const url=j.sources.map(s=>safeUrl(s.url)).find(Boolean);return url?`<a class="btn secondary" href="${esc(url)}" target="_blank" rel="noopener noreferrer">原岗位 ${icon('external')}</a>`:'';}
function mobileJob(j) {return `<article class="mobile-job"><div class="section-head">${adviceBadge(j)}${j.focus?badge('本周重点','green'):''}</div><button class="table-title" data-action="open" data-id="${j.id}">${esc(j.title)}<small>${esc(j.company||'公司待补充')}</small></button><p>${esc(j.city||'地点待确认')} · ${esc(j.salary||'薪资待确认')}</p><p class="key-gap">关键缺口：${esc(j.keyRequirement||j.concerns||'待判断')}</p><small>${esc(j.nextAction||'尚未安排下一步')}${j.nextDate?' · '+formatDate(j.nextDate):''}</small><div class="card-actions">${btn('查看与判断','open','primary',`data-id="${j.id}"`)}${jobLink(j)}</div></article>`;}
function jobsView() {
  const deferredView=view==='deferred',jobs=visibleJobs(),pool=state.jobs.filter(j=>deferredView?j.decision==='暂缓':j.decision!=='暂缓'),cities=[...new Set(pool.map(j=>cityGroup(j.city)))].sort(),decisionOptions=deferredView?['暂缓']:DECISIONS.filter(d=>d!=='暂缓');
  const pageTitle=deferredView?'暂缓跟进':archived?'归档的机会':'机会库',pageSubtitle=deferredView?'暂时不推进的岗位集中放在这里；恢复跟进后会回到机会库。':'先收集，再判断。每个选择都留下理由。',pageActions=deferredView?'':`${btn(icon('upload')+'导入 AI 草稿','import-ai')}${btn(icon('plus')+'添加机会','add','primary')}`;
  return header(deferredView?'ON HOLD FOLLOW-UP':'OPPORTUNITY LIBRARY',pageTitle,pageSubtitle,pageActions)+
    `<div class="filterbar"><label class="search-box">${icon('search')}<input id="search" placeholder="搜索岗位、公司、城市…" value="${esc(search)}" aria-label="搜索机会"></label><select id="direction-filter" aria-label="方向筛选"><option value="">全部方向</option>${options(DIRECTIONS,filterDirection)}</select><select id="city-filter" aria-label="城市筛选"><option value="">全部城市</option>${options(cities,filterCity)}</select><select id="stage-filter" aria-label="阶段筛选"><option value="">全部阶段</option>${options(STAGES,filterStage)}</select><select id="decision-filter" aria-label="我的决定筛选"><option value="">${deferredView?'暂缓跟进':'全部决定'}</option>${options(decisionOptions,filterDecision)}</select><select id="recommendation-filter" aria-label="AI建议筛选"><option value="">全部AI建议</option>${options([...RECOMMENDATIONS,'尚未分析'],filterRecommendation)}</select>${btn(focusOnly?'本周重点 ✓':'只看本周重点','focus-filter',focusOnly?'primary':'secondary')}<div class="view-switch">${btn(icon('list'),'list',mode==='list'?'selected':'plain','aria-label="列表视图"')}${btn(icon('grid'),'board',mode==='board'?'selected':'plain','aria-label="看板视图"')}</div></div>
    <div class="list-meta"><span>共 ${jobs.length} 个机会${deferredView?' · 暂缓跟进':pendingOnly?' · 待我决定':''} ${search||filterCity||filterDirection||filterStage||filterDecision||filterRecommendation||focusOnly||pendingOnly?btn('清除筛选','reset-filters','text'):''}</span><div>${selected.size?btn(`导出选中 ${selected.size} 项给 AI`,'export-selected','text'):''}${deferredView?btn('返回机会库','nav','text','data-view="jobs"'):btn(archived?'返回机会库':'查看归档',archived?'show-active':'show-archive','text')}</div></div>
    ${!jobs.length?(state.jobs.some(j=>Boolean(j.archived)===archived)?empty(deferredView?'暂时没有暂缓跟进的机会':'没有符合条件的机会','换个关键词，或清除筛选。','reset-filters','清除筛选'):empty(archived?'归档里还没有机会':'给新的可能性留个位置','粘贴一段 JD，或先记下岗位名称。',archived?'':'add')):mode==='list'?`<div class="table-wrap"><table><thead><tr><th class="check-cell"><input type="checkbox" id="select-all" aria-label="选择当前全部机会" ${jobs.every(j=>selected.has(j.id))?'checked':''}></th><th>岗位 / 公司</th><th>城市与薪资</th><th>AI建议 / 关键缺口</th><th>当前进展</th><th>下一步</th><th></th></tr></thead><tbody>${jobs.map(j=>`<tr><td><input type="checkbox" class="select-job" data-id="${j.id}" aria-label="选择 ${esc(j.title)}" ${selected.has(j.id)?'checked':''}></td><td><button class="table-title" data-action="open" data-id="${j.id}">${j.focus?'★ ':''}${esc(j.title)}<small>${esc(j.company||'公司待补充')}</small></button>${j.decision!=='未决定'?`<span class="decision-small">${esc(j.decision)}</span>`:''}</td><td>${esc(j.city||'待补充')}<small class="salary">${esc(j.salary||'薪资待确认')}</small></td><td>${adviceBadge(j)}<small class="key-gap">${esc(j.keyRequirement||j.concerns||'尚未记录关键缺口')}</small></td><td>${badge(j.stage,stageClass(j.stage))}<small>${esc(j.hiring)}</small></td><td class="next-cell">${esc(j.nextAction||'还没有下一步')}<small>${j.nextDate?formatDate(j.nextDate):'未设日期'}</small></td><td>${btn(icon('arrow'),'open','icon-button',`data-id="${j.id}" aria-label="打开 ${esc(j.title)}"`)}${jobLink(j)}</td></tr>`).join('')}</tbody></table></div><div class="mobile-jobs">${jobs.map(mobileJob).join('')}</div>`:
    `<div class="kanban">${STAGES.map(stage=>{const group=jobs.filter(j=>j.stage===stage);return `<section class="kanban-column"><h3><span class="stage-dot ${stageClass(stage)}"></span>${stage}<em>${group.length}</em></h3>${group.length?group.map(j=>`<button class="kanban-card" data-action="open" data-id="${j.id}"><span class="company-line">${esc(j.company||'公司待补充')}</span><h3>${esc(j.title)}</h3><p>${esc(j.city||'城市待确认')} · ${esc(j.salary||'薪资待确认')}</p>${badge(j.direction)}${j.nextAction?`<div class="kanban-next">${icon('arrow')}${esc(j.nextAction)}</div>`:''}</button>`).join(''):'<div class="kanban-empty">暂时没有机会</div>'}</section>`;}).join('')}</div>`}`;
}
function materialsView() {
  const locked=submittedMaterialIds(state);
  return header('YOUR EVIDENCE','材料与经历','把真实做过的事，整理成下一次机会的证据。',`${btn(icon('plus')+'记录经历','add-experience')}${btn(icon('plus')+'添加材料','add-material','primary')}`)+
    `<section><div class="section-head"><h2>简历与作品</h2><span class="hint">保留版本，关联实际提交记录</span></div>${state.materials.length?`<div class="materials-grid">${state.materials.map(m=>{const linked=state.jobs.filter(j=>j.materialIds.includes(m.id)||j.activities.some(a=>a.materialIds.includes(m.id)));return `<article class="material-card"><div class="material-top">${icon('file')}${badge(m.kind)}</div><h3>${esc(m.name)}</h3><p>${esc(m.version||'未标版本')}</p><div class="material-preview">${esc(m.text||m.file?.name||'暂无说明')}</div><small>关联 ${linked.length} 个机会 · ${formatDate(m.createdAt)}</small><div class="card-actions">${btn(locked.has(m.id)&&m.file?'查看原件':'查看 / 编辑','edit-material','text',`data-id="${m.id}"`)}${m.file?btn(icon('download')+'下载附件','download-material','text',`data-id="${m.id}"`):''}</div></article>`;}).join('')}</div>`:empty('你的材料，可以慢慢完善','先添加一份现有简历，或一个能展示的作品。','add-material','添加材料')}</section>
    <section class="experiences"><div class="section-head"><h2>经历底稿</h2><span class="hint">工作、学习、个人项目都可以</span></div>${state.experiences.length?state.experiences.map(e=>`<article class="experience-card"><div>${badge(e.kind)}<h3>${esc(e.title)}</h3><p class="prewrap">${esc(e.text)}</p><small>${esc(e.evidence||'证据与待确认事项尚未填写')}</small></div>${btn('编辑','edit-experience','text',`data-id="${e.id}"`)}</article>`).join(''):`<div class="blank-note">${icon('leaf')}<div><strong>工具使用只是起点，解决的问题才是经历。</strong><p>记录背景、自己的决定与行动、做到哪一步，以及可以展示的证据。</p></div>${btn('记录一段经历','add-experience')}</div>`}</section>`;
}
function reviewView() {
  const jobs=state.jobs, counts=stats(jobs);
  const directions=DIRECTIONS.filter(d=>jobs.some(j=>j.direction===d));
  return header('LOOK BACK, MOVE FORWARD','回顾','看真实反馈，再调整方向。数字只描述记录，不评价你。',btn(icon('download')+'导出备份','backup'))+
    `<section class="overview-grid">${[['收集机会',counts.collected],['实际申请',counts.applied],['完成过面试',counts.interviewed],['收到 Offer',counts.offers]].map(([label,n])=>`<div class="metric"><div class="metric-label">${label}</div><strong>${String(n).padStart(2,'0')}</strong></div>`).join('')}</section><section class="panel"><div class="section-head"><h2>各方向的反馈</h2><span class="hint">含归档记录 · 按机会去重，非提交次数</span></div>${directions.length?`<div class="table-wrap"><table><thead><tr><th>方向</th><th>收集</th><th>实际申请</th><th>完成过面试</th><th>Offer</th><th></th></tr></thead><tbody>${directions.map(d=>{const s=stats(jobs.filter(j=>j.direction===d));return `<tr><td>${d}</td><td>${s.collected}</td><td>${s.applied}</td><td>${s.interviewed}</td><td>${s.offers}</td><td>${btn('查看历史记录','review-direction','text',`data-direction="${d}"`)}</td></tr>`;}).join('')}</tbody></table></div>`:empty('还没有足够的记录','先收下机会，反馈会随着你的行动积累。')}</section><div class="review-note">${icon('chart')}<div><strong>暂时没收到回复，不等于不适合。</strong><p>“实际申请”包含正式投递或发送简历，不包含咨询。“完成过面试”只计算已完成的轮次。口头意向不计入 Offer。记录少时，不推断成功率和因果。</p></div></div>`;
}
function searchView() {
  const requests=state.searchRequests.slice().sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
  return header('FIND YOUR NEXT OPPORTUNITY','找机会','你定方向，我在当前聊天里搜索，结果回到这里。',btn(icon('plus')+'填写搜岗需求','new-search','primary'))+
    `<div class="search-workflow"><div><span>01</span><strong>写下这次需求</strong><p>岗位、城市、薪资与想尝试的内容。</p></div><div><span>02</span><strong>在这里发起搜索</strong><p>复制指令到当前聊天，由我读取需求并搜索。</p></div><div><span>03</span><strong>回看真实机会</strong><p>保存原始岗位链接、推荐理由和未确认条件。</p></div></div>
    <p class="search-boundary">${icon('clock')}网页保存需求不会自动启动 AI。招聘平台需要登录或验证时，由你在官方页面处理。</p>
    ${requests.length?requests.map(r=>`<section class="panel search-request"><div class="section-head"><div>${badge(r.status,r.status==='已完成'?'green':'')}<h2>${esc(r.title)}</h2></div><small>${formatDate(r.updatedAt)}</small></div><div class="request-grid"><div><small>岗位与内容</small><p class="prewrap">${esc(r.directions)}</p></div><div><small>城市与薪资</small><p>${esc(r.cities)}</p><p>${esc(r.salary)}</p></div></div><p class="hint">渠道：${esc(r.channels)}</p>${r.notes?`<p class="request-notes">${esc(r.notes)}</p>`:''}${r.report?`<details class="request-report"><summary>搜索结果与覆盖说明</summary><p class="prewrap">${esc(r.report)}</p></details>`:''}<div class="request-actions">${btn('复制给当前聊天','request-copy','primary',`data-id="${r.id}"`)}${btn('调整需求','edit-search','secondary',`data-id="${r.id}"`)}${r.resultIds.length?btn(`查看 ${r.resultIds.length} 个结果`,'search-results','text',`data-id="${r.id}"`):'<span class="hint">等待搜索与回填</span>'}</div></section>`).join(''):empty('先写下想找的机会','可以很具体，也可以保留探索空间。已有的求职偏好会自动带入。','new-search','填写搜岗需求')}`;
}
function settingsView() {
  const p=state.preferences;
  return header('MAKE IT YOURS','偏好与数据','规则可以调整，原来的记录会保留。')+
    `<div class="settings-grid"><section class="panel"><div class="section-head"><h2>我的求职偏好</h2>${badge('转行优先','green')}</div><form id="preferences-form" class="form-stack">${textarea('优先探索的方向','directions',p.directions)}${textarea('可考虑的城市','cities',p.cities)}<div class="form-grid">${input('本地城市','city',p.city)}${input('本地最低月薪（元）','localFloor',p.localFloor,'number','min="0"')}${input('外地最低月薪（元）','awayFloor',p.awayFloor,'number','min="0"')}</div>${textarea('薪资目标与取舍','salaryTarget',p.salaryTarget)}${textarea('其他偏好 / 待确认条件','notes',p.notes)}<p class="hint">底线不代表目标；暂不根据偏好自动排除机会。</p><button class="btn primary" type="submit">保存偏好</button></form></section><div><section class="panel"><div class="section-head"><h2>数据与备份</h2>${icon('archive')}</div><p>数据保存在这台电脑的 Jobcat 数据库中。同一台电脑打开同一地址，可继续使用。</p><div class="settings-actions">${btn(icon('download')+'导出完整备份','backup')}${btn(icon('upload')+'恢复备份','restore')}</div><p class="hint">备份包含已上传材料和附件。恢复前会预览并下载当前备份；本机另外保留最近 10 个写入前快照。</p></section><section class="panel"><div class="section-head"><h2>与 AI 协作</h2>${icon('leaf')}</div><p>在机会库勾选岗位，导出给这里的 AI。分析后导入草稿，核对后再保存。</p><div class="settings-actions">${btn('查看草稿格式','draft-help')}${btn('导入 AI 草稿','import-ai')}</div><p class="hint">第一版不内置 AI，不会自动发送你的资料或联系招聘方。</p></section><section class="panel"><div class="section-head"><h2>体验与说明</h2></div>${btn(demo?'退出示例':'用虚构示例体验',demo?'exit-demo':'demo')}<p class="hint">示例与正式记录隔离。日程仅在网页内展示；暂不自动搜岗或投递。</p></section></div></div>`;
}
function openDialog(kind, data={}) {
  focusBefore=document.activeElement; dialog={kind,...data}; renderDialog();
  requestAnimationFrame(()=>$('#overlay input:not([type=hidden]), #overlay textarea, #overlay button')?.focus());
}
function modal(title,sub,body,wide=false) {
  return `<div class="backdrop"><section role="dialog" aria-modal="true" aria-labelledby="dialog-title" class="modal ${wide?'wide':''}"><div class="modal-head"><div><h2 id="dialog-title">${title}</h2><p>${sub}</p></div>${btn(icon('close'),'close-modal','icon-button','aria-label="关闭"')}</div><div class="modal-body">${body}</div></section></div>`;
}
function formFooter(label='保存') {return `<div class="form-error" role="alert"></div><div class="form-footer">${btn('取消','close-modal')}<button type="submit" class="btn primary">${icon('check')}${label}</button></div>`;}
function renderDialog() {
  let body='', title='', sub='', wide=false;
  const d=dialog;
  if(d.kind==='job') {
    const j=d.id?state.jobs.find(j=>j.id===d.id):makeJob(); title=d.id?'编辑机会':'收下一个新机会'; sub='先记下来，其他信息可以慢慢补充。';
    body=`<form id="job-form" class="form-stack" data-id="${d.id||''}"><div class="form-grid">${input('岗位名称','title',j.title==='待补充岗位'?'':j.title,'text','placeholder="例如：AI 应用产品助理"')}${input('公司','company',d.prefill?.company||j.company,'text','placeholder="暂不清楚可以留空"')}${input('城市 / 办公方式','city',j.city,'text','placeholder="例如：上海 / 混合办公"')}${input('薪资原文','salary',j.salary,'text','placeholder="例如：12–16K · 13薪 / 面议"')}</div>${select('岗位内容完整度','jdCompleteness',['未标明','摘要','部分原文','完整原文'],j.jdCompleteness||'未标明')}${textarea('岗位内容（保留原文或摘要）','jd',j.jdVersions.at(-1)?.text||'','placeholder="粘贴招聘信息；也可以只先记下岗位名称。" rows="5"')}<div class="form-grid">${select('方向','direction',DIRECTIONS,j.direction)}${select('我的决定','decision',DECISIONS,j.decision)}</div><details ${d.id?'open':''}><summary>更多信息与跟进</summary><div class="form-stack"><div class="form-grid">${select('当前阶段','stage',STAGES,j.stage)}${select('是否仍在招聘','hiring',['待核实','在招','已下架'],j.hiring)}${input('下一步','nextAction',j.nextAction)}${input('回看 / 行动日期','nextDate',j.nextDate,'date')}</div>${textarea('我的关注理由','userReason',j.userReason||'')}${textarea('我的顾虑','userConcerns',j.userConcerns||'')}${textarea('我想问的问题','userQuestions',j.userQuestions||'')}${input('最关键的门槛 / 缺口','keyRequirement',j.keyRequirement||'')}${textarea('结束原因（已结束时填写）','closeReason',j.closeReason)}<div class="form-grid">${select('Offer 情况','offerType',['未收到','口头意向','口头 offer','书面 offer'],j.offerType||'未收到')}${textarea('Offer 条件 / 答复期限','offerNotes',j.offerNotes)}</div></div></details>${!d.id?`<details><summary>添加来源</summary><div class="form-grid">${input('来源平台','platform','','text','placeholder="BOSS / 猎聘 / 企业官网"')}${input('原链接','url','','url')}${input('岗位发布日期（若已知）','postedDate','','date')}</div></details>`:''}${formFooter(d.id?'保存修改':'保存机会')}</form>`;
  } else if(d.kind==='next') {
    title='更新下一步'; sub='写一件具体的事，日期不确定可以留空。';
    body=`<form id="next-form" class="form-stack">${input('下一步','nextAction',getJob().nextAction,'text','placeholder="例如：询问招聘方是否要求独立编程"')}${input('回看 / 行动日期','nextDate',getJob().nextDate,'date')}${formFooter('保存下一步')}</form>`;
  } else if(d.kind==='search-request') {
    const r=state.searchRequests.find(r=>r.id===d.id)||{}; const p=state.preferences;
    title=d.id?'调整搜岗需求':'这次想找什么机会'; sub='保存后，在当前聊天说“按网站最新需求找工作”。网页不会自动启动搜索。';
    body=`<form id="search-request-form" class="form-stack" data-id="${d.id||''}">${input('需求名称','title',r.title||'本轮求职机会','text','required')}${textarea('目标岗位与希望做的内容','directions',r.directions||p.directions,'required rows="3"')}${textarea('城市 / 远程偏好','cities',r.cities||p.cities)}${textarea('薪资目标与可接受的取舍','salary',r.salary||p.salaryTarget+(p.localFloor?'；本地最低 '+p.localFloor+' 元/月':'')+(p.awayFloor?'；外地最低 '+p.awayFloor+' 元/月':''))}${input('优先搜索的渠道','channels',r.channels||'BOSS 直聘、猎聘、企业官网；其他可靠渠道也可')}${textarea('本次重点 / 不考虑的条件','notes',r.notes||'先看实际职责与转行价值。薪资面议可保留，但需注明。')}${formFooter('保存搜岗需求')}</form>`;
  } else if(d.kind==='search-results') {
    const r=state.searchRequests.find(r=>r.id===d.id);const jobs=state.jobs.filter(j=>r.resultIds.includes(j.id));
    title='搜岗结果';sub=r.title;wide=true;
    body=`<p class="prewrap">${esc(r.report||'结果尚未回填。')}</p>${jobs.length?jobs.map(j=>compactJob(j)).join(''):'<p>还没有关联机会。</p>'}`;
  } else if(d.kind==='create-resume') {
    const job=state.jobs.find(j=>j.id===d.jobId),sources=(state.resumes||[]).filter(r=>!r.archived);
    title='创建简历草稿';sub='复制底稿内容，后续修改不会影响原版本。';
    body=`<form id="create-resume-form" class="form-stack"><label class="field"><span>选择底稿</span><select name="sourceId" required>${sources.map(r=>`<option value="${r.id}">${esc(r.name)}${r.isMaster?' · 母版':''}</option>`).join('')}</select></label>${input('草稿名称','name',job?job.title+' · 针对版草稿':'新的方向简历','text','required')}<label class="field"><span>关联岗位</span><select name="jobId"><option value="">通用底稿</option>${state.jobs.map(j=>`<option value="${j.id}" ${j.id===d.jobId?'selected':''}>${esc(j.company)} · ${esc(j.title)}</option>`).join('')}</select></label>${formFooter('创建并编辑')}</form>`;
  } else if(d.kind==='resume-submission') {
    const resume=state.resumes?.find(r=>r.id===d.resumeId),jobId=d.jobId||resume?.jobId||'',source=d.activityId||!resume?'upload':'generated';
    title=d.activityId?'补充已投递原件':'登记已投递';sub='只登记你已经完成的提交，不会向招聘方发送材料。';
    body=`<form id="resume-submission-form" data-activity-id="${d.activityId||''}" class="form-stack"><label class="field"><span>投递岗位</span><select name="jobId" required ${d.activityId?'disabled':''}><option value="">请选择岗位</option>${state.jobs.map(j=>`<option value="${j.id}" ${j.id===jobId?'selected':''}>${esc(j.company)} · ${esc(j.title)}</option>`).join('')}</select></label>${d.activityId?`<input type="hidden" name="jobId" value="${jobId}">`:''}
    <label class="field"><span>实际发送的PDF来自哪里</span><select name="pdfSource"><option value="generated" ${source==='generated'?'selected':''}>由网页草稿生成，确认就是实际提交内容</option><option value="upload" ${source==='upload'?'selected':''}>上传实际发送的PDF文件</option></select></label>
    <div id="submission-generated" ${source!=='generated'?'hidden':''}><label class="field"><span>选择当时使用的草稿</span><select name="resumeId">${(state.resumes||[]).filter(r=>!r.isMaster).map(r=>`<option value="${r.id}" ${r.id===d.resumeId?'selected':''}>${esc(r.name)}</option>`).join('')}</select></label></div>
    <div id="submission-upload" ${source!=='upload'?'hidden':''}><label class="field"><span>实际投递PDF（不超过10MB）</span><input type="file" name="submittedFile" accept=".pdf,application/pdf"></label></div>
    <p class="hint">如果在外部修改过文件，请上传实际发送的原件。留档后只读保存。</p>${d.activityId?'':input('实际投递时间（不清楚可留空）','occurredAt','','datetime-local')}${input('渠道（可选）','channel','','text','placeholder="官网 / 猎聘 / 邮箱等"')}${textarea('备注（可选）','note','')}<label class="checkbox-list"><span><input type="checkbox" name="confirmed" value="yes" required> 我确认已实际投递，以上PDF对应实际发送内容</span></label>${formFooter(d.activityId?'保存原件':'确认登记并留档')}</form>`;
  } else if(d.kind==='review-direction') {
    title=d.direction+' · 历史机会';sub='包含已归档记录，保留真实申请与面试历史。';wide=true;
    body=state.jobs.filter(j=>j.direction===d.direction).map(j=>`<div>${j.archived?badge('已归档','muted'):''}${compactJob(j)}</div>`).join('');
  } else if(d.kind==='source') {
    title='补充招聘来源'; sub='同一个机会可以保留多个平台来源。';
    body=`<form id="source-form" class="form-stack">${input('平台','platform','','text','required placeholder="例如：猎聘"')}${input('原链接','url','','url','placeholder="https://…"')}<div class="form-grid">${input('发布日期（若已知）','postedDate','','date')}${input('最近核验日期（若已核实）','checkedAt','','date')}${select('招聘状态','status',['待核实','在招','已下架'],'待核实')}</div>${formFooter('添加来源')}</form>`;
  } else if(d.kind==='activity') {
    title='记一笔进展'; sub='记录实际发生的事情，方便下次接着聊。';
    body=`<form id="activity-form" class="form-stack"><div class="form-grid">${select('发生了什么','type',ACTIVITY_TYPES,'沟通')}${input('日期与时间','date',localDate()+'T'+new Date().toTimeString().slice(0,5),'datetime-local','required')}${input('联系人','contact','','text','placeholder="姓名 / 称呼，可不填"')}${input('沟通渠道','channel','','text','placeholder="电话 / BOSS / 邮箱"')}</div>${textarea('沟通内容 / 结果','text','','required placeholder="上次聊到了哪里？对方说了什么？" rows="4"')}<div id="activity-offer" hidden>${select('Offer 情况','offerType',['请选择','口头意向','口头 offer','书面 offer'],'请选择')}</div><div class="field"><span>本次实际发送的材料</span>${materialChecks([])}</div>${formFooter('保存进展')}</form>`;
  } else if(d.kind==='interview') {
    const i=getJob().interviews.find(i=>i.id===d.id)||{};
    title=d.id?'更新面试记录':'安排面试或测评'; sub='每一轮分别记录；事实、反馈和自己的复盘分开。'; wide=true;
    body=`<form id="interview-form" class="form-stack" data-id="${d.id||''}"><div class="form-grid">${input('轮次 / 测评名称','round',i.round||'','text','required placeholder="例如：业务一面 / 产品作业"')}${input('时间 / 截止时间','date',i.date||'','datetime-local')}${input('形式 / 地点 / 会议链接','format',i.format||'')}${select('状态','status',['待进行','已完成','已取消'],i.status||'待进行')}</div>${textarea('准备事项','notes',i.notes||'')}<details ${d.id?'open':''}><summary>问题、反馈与复盘</summary><div class="form-stack">${textarea('实际问题与回答摘要','questions',i.questions||'','placeholder="记录实际问答；不确定的转写请注明。"')}${textarea('招聘方明确反馈','feedback',i.feedback||'','placeholder="只填写对方明确说过的话。"')}${textarea('我的复盘 / 推测 / 下次怎么练','review',i.review||'','placeholder="推测请标明；现场没说出来，不等于自己不会。"')}</div></details>${formFooter('保存面试记录')}</form>`;
  } else if(d.kind==='material') {
    const m=state.materials.find(x=>x.id===d.id)||{};
    title=d.id?'编辑材料说明':'添加一份材料'; sub=d.id?'附件版本不会被替换；新版本请另建材料。':'选择文件或填写作品链接、说明，只保存到本机。';
    if(d.id&&submittedMaterialIds(state).has(d.id)&&m.file){title='已投递原件';sub='原件已固定留档，不能覆盖修改。';body=`<p class="prewrap">${esc(m.name)}\n${esc(m.version||'')}\n${esc(m.file.name)}</p>${btn('下载原件','download-material','primary',`data-id="${m.id}"`)}`;}else {
    body=`<form id="material-form" class="form-stack" data-id="${d.id||''}">${input('材料名称','name',m.name||'','text','required placeholder="例如：产品方向简历"')}<div class="form-grid">${select('类型','kind',['简历','作品','项目说明','其他'],m.kind||'简历')}${input('版本','version',m.version||'','text','placeholder="例如：v1 · 2026-11-09"')}</div>${textarea('内容摘要 / 作品链接','text',m.text||'','rows="5"')}<p class="hint">AI 导出可包含你选中的文字摘要，不自动发送附件。</p>${d.id?m.file?`<div class="file-note">${icon('file')}${esc(m.file.name)}</div>`:'':`<label class="field"><span>附件（可选，最大 10 MB）</span><input type="file" name="attachment"></label>`}${formFooter(d.id?'保存说明':'保存材料')}</form>`;
    }
  } else if(d.kind==='experience') {
    const e=state.experiences.find(x=>x.id===d.id)||{};
    title=d.id?'编辑经历':'记录一段经历'; sub='描述自己做过的事，结果暂未验证也可以如实记录。';
    body=`<form id="experience-form" class="form-stack" data-id="${d.id||''}">${input('经历 / 项目名称','title',e.title||'','text','required')}${select('类型','kind',['工作经历','个人项目','学习实践'],e.kind||'个人项目')}${textarea('问题、我的行动、结果与当前进度','text',e.text||'','required rows="7" placeholder="你解决了什么问题？自己作了哪些决定？AI 帮了什么？做到哪一步？"')}${textarea('证据链接与待确认事项','evidence',e.evidence||'')}${formFooter('保存经历')}</form>`;
  } else if(d.kind==='analysis') {
    title='保存机会分析'; sub='保存这里的 AI 分析或自己的研究，个人决定仍由你填写。';
    body=`<form id="analysis-form" class="form-stack">${select('建议','recommendation',RECOMMENDATIONS,'补信息后再判断')}${textarea('分析与证据','text','','required rows="9" placeholder="工作内容、转行价值、进入可能性、收入与城市、待核实事项…"')}<div class="field"><span>本次分析依据的材料</span>${materialChecks([])}</div>${formFooter('保存分析')}</form>`;
  } else if(d.kind==='link-materials') {
    title='关联准备材料'; sub='正式发送时，请在进展记录里另外选择实际提交的版本。';
    body=`<form id="link-materials-form" class="form-stack">${materialChecks(getJob().materialIds)}${formFooter('保存关联')}</form>`;
  } else if(d.kind==='import-ai') {
    title='导入 AI 草稿'; sub='先预览，再保存。草稿不会更改阶段、个人决定或原始岗位事实。'; wide=true;
    body=`<div class="form-stack"><label class="upload-box">${icon('upload')}<strong>选择 AI 返回的 JSON 草稿</strong><span>jobcat-ai-draft · 不会替换整个工作区</span><input type="file" id="ai-file" accept=".json,application/json"></label><div id="draft-preview"></div><div class="form-footer">${btn('查看格式','draft-help')}${btn('取消','close-modal')}${btn('保存勾选的草稿','apply-import','primary','disabled id="apply-import"')}</div></div>`;
  } else if(d.kind==='restore') {
    title='恢复工作区备份'; sub='恢复将替换当前工作区。先核对备份内容，并下载当前记录。';
    body=`<div class="form-stack"><label class="upload-box">${icon('archive')}<strong>选择 Jobcat 完整备份</strong><span>包含机会、活动、材料和偏好</span><input type="file" id="restore-file" accept=".json,application/json"></label><div id="restore-preview"></div><div class="form-footer">${btn('取消','close-modal')}${btn('下载当前备份并恢复','apply-restore','primary','disabled id="apply-restore"')}</div></div>`;
  } else if(d.kind==='export-context') {
    title='导出给 AI'; sub=`将导出 ${d.ids.length} 个机会的岗位信息、问题和已有分析。不会导出联系人、沟通记录、面试记录或附件。`;
    body=`<form id="export-context-form" class="form-stack"><div class="field"><span>附带材料摘要（可选）</span>${materialChecks([])}</div><p class="hint">把导出文件发到这里，可请 AI 分析或搜集机会。返回草稿按岗位 ID 和版本核对。</p>${formFooter('下载 AI 协作文件')}</form>`;
  } else if(d.kind==='draft-help') {
    title='AI 草稿如何回填'; sub='把导出的协作文件交给这里的 AI，并要求返回此格式。';
    body=`<p>已有机会只追加分析，不修改你的阶段和决定。<code>jobId</code>、<code>baseRevision</code> 和 <code>jdVersionId</code> 从导出文件原样复制。</p><pre>${esc(JSON.stringify({kind:'jobcat-ai-draft',schemaVersion:1,items:[{jobId:'原岗位 ID',baseRevision:1,jdVersionId:'原 JD 版本 ID 或 null',recommendation:'值得尝试',analysis:'有依据的分析、差距和待核实事项',materialIds:[]}]},null,2))}</pre><p>搜集新机会可省略 jobId，提供 title、company、city、salary、direction、jd、platform、url；新机会一律从“待判断”开始。</p><div class="form-footer">${btn('导入草稿','import-ai','primary')}</div>`;
  }
  $('#overlay').innerHTML=modal(title,sub,body,wide); document.body.classList.add('modal-open');
}
function materialChecks(ids) {return state.materials.length?`<div class="checkbox-list">${state.materials.map(m=>`<label><input type="checkbox" name="materialIds" value="${m.id}" ${ids.includes(m.id)?'checked':''}><span>${esc(m.name)} <small>${esc(m.version)}</small></span></label>`).join('')}</div>`:`<p class="hint">还没有材料，可先到“材料与经历”添加。</p>`;}
function closeModal(force=false) {
  if(!force && $('#overlay form')?.dataset.dirty==='yes' && !confirm('这次输入尚未保存，确定关闭吗？')) return;
  dialog=null; importRows=[]; restoreData=null;
  if(selectedJob) renderDetail(); else {$('#overlay').innerHTML=''; document.body.classList.remove('modal-open');}
  focusBefore?.focus();
}
function renderDetail() {
  const j=getJob(); if(!j) {selectedJob=null; $('#overlay').innerHTML=''; return;}
  if(dialog) return;
  $('#overlay').innerHTML=`<div class="backdrop drawer-backdrop"><section class="drawer" role="dialog" aria-modal="true" aria-labelledby="detail-title"><div class="drawer-top"><span>机会档案 <span class="slash">/</span> ${esc(j.company||'公司待补充')}</span><div>${btn(icon('download'),'export-job','icon-button','aria-label="导出此机会给 AI"')}${btn(icon('close'),'close-detail','icon-button','aria-label="关闭机会详情"')}</div></div><div class="drawer-title"><div class="detail-company">${esc(j.company||'公司待补充')} ${j.archived?badge('已归档','muted'):''}</div><h2 id="detail-title">${esc(j.title)}</h2><p>${esc(j.city||'城市待补充')} <span>·</span> ${esc(j.salary||'薪资待确认')} <span>·</span> ${esc(j.direction)}</p><div class="detail-badges">${badge(j.stage,stageClass(j.stage))}${badge(`我的决定：${j.decision}`)}${badge(j.hiring,j.hiring==='已下架'?'gold':'')}${adviceBadge(j)}${btn(j.focus?'取消本周重点':'设为本周重点','toggle-focus',j.focus?'primary':'secondary')}${jobLink(j)}${btn(j.decision==='暂缓'?'恢复跟进':'暂缓跟进','defer-job','secondary')}${btn('简历与投递','job-resumes','secondary')}${btn('编辑机会','edit-job','text')}${btn(j.archived?'恢复机会':'归档','archive-job','text')}</div></div>
    <div class="next-banner"><span class="next-icon">${icon('arrow')}</span><div><small>下一步</small><strong>${esc(j.nextAction||'还没有安排，可以先补充信息或记录一次沟通。')}</strong></div><span>${j.nextDate?formatDate(j.nextDate):'未设日期'}</span>${btn('修改','edit-next','text')}${j.nextAction?btn('完成','complete-next','text'):''}</div>
    <nav class="detail-tabs" aria-label="机会详情">${[['overview','岗位与判断'],['timeline','沟通进展'],['interviews','面试与复盘'],['materials','关联材料']].map(([key,label])=>`<button class="${detailTab===key?'active':''}" data-action="detail-tab" data-tab="${key}">${label}${key==='timeline'?`<span>${j.activities.length}</span>`:key==='interviews'?`<span>${j.interviews.length}</span>`:''}</button>`).join('')}</nav><div class="drawer-body">${detailTab==='overview'?overviewDetail(j):detailTab==='timeline'?timelineDetail(j):detailTab==='interviews'?interviewsDetail(j):materialsDetail(j)}</div></section></div>`;
  document.body.classList.add('modal-open');
}
function overviewDetail(j) {
  const currentJd=j.jdVersions.at(-1);
  return `<section class="detail-section"><div class="section-head"><h3>我的判断</h3>${btn('编辑','edit-job','text')}</div><div class="judgement-grid">${[['为什么关注',j.userReason],['我的顾虑',j.userConcerns],['待问清的问题',j.userQuestions]].map(([label,text])=>`<div><small>${label}</small><p class="prewrap">${esc(text||'暂未填写')}</p></div>`).join('')}</div>${j.stage==='已结束'?`<p class="closed-reason">结束原因：${esc(j.closeReason||'未填写')}</p>`:''}</section>
    <section class="detail-section"><div class="section-head"><h3>AI 初筛与研究记录</h3>${btn(icon('plus')+'保存分析','add-analysis','text')}</div>${j.analyses.length?j.analyses.slice().reverse().map(a=>`<article class="analysis-card"><div>${adviceBadge({...j,analyses:[a]})}<small>${formatDate(a.date)} · ${esc(a.source||'手动记录')}</small></div>${a.jdVersionId!==currentJd?.id?`<p class="warning">依据旧 JD，岗位描述已更新，建议复核。</p>`:''}<p class="prewrap">${esc(a.text)}</p><small>依据 JD：${esc(j.jdVersions.findIndex(v=>v.id===a.jdVersionId)+1||'未提供')} · 材料 ${a.materialIds?.length||0} 份</small></article>`).join(''):`<p class="quiet-empty">可以把岗位导出给这里的 AI，再保存分析。建议和你的决定分别保留。</p>`}</section>
    ${j.questions?`<section class="detail-section"><h3>AI 建议核实的问题</h3><p class="prewrap">${esc(j.questions)}</p></section>`:''}
    ${!j.analyses.length&&(j.reason||j.concerns)?`<section class="detail-section"><h3>既有记录（来源未区分）</h3><p class="prewrap">${esc(j.reason)}\n${esc(j.concerns)}</p></section>`:''}
    <section class="detail-section"><div class="section-head"><h3>岗位内容 · ${esc(j.jdCompleteness||'未标明完整度')}</h3>${currentJd?badge(`版本 ${j.jdVersions.length}`):''}</div><div class="jd-text prewrap">${esc(currentJd?.text||'还没有完整 JD，先保存也没关系。')}</div>${j.jdVersions.length>1?`<details class="history"><summary>查看之前的 JD</summary>${j.jdVersions.slice(0,-1).reverse().map((v,i)=>`<details><summary>版本 ${j.jdVersions.length-1-i} · ${formatDate(v.date)}</summary><p class="prewrap">${esc(v.text)}</p></details>`).join('')}</details>`:''}</section>
    <section class="detail-section"><div class="section-head"><h3>招聘来源</h3>${btn(icon('plus')+'补充来源','add-source','text')}</div>${j.sources.length?j.sources.map(s=>`<div class="source-row"><div>${icon('link')}<strong>${esc(s.platform||'来源')}</strong>${badge(s.status||'待核实')}${badge('内容：'+(j.jdCompleteness||'未标明完整度'))}</div><p>${safeUrl(s.url)?`<a href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener noreferrer">打开原岗位 ${icon('external')}</a>`:'未提供可打开的链接'}</p><small>收集 ${formatDate(s.collectedAt)} · 发布 ${s.postedDate||'未知'} · 最近核验 ${s.checkedAt?esc(fullDate(s.checkedAt)):'未核验'}</small></div>`).join(''):'<p class="quiet-empty">暂无来源，手动添加的信息也可以保留。</p>'}</section>${j.offerType&&j.offerType!=='未收到'?`<section class="detail-section"><h3>Offer 记录</h3>${badge(j.offerType,'gold')}<p class="prewrap">${esc(j.offerNotes||'条件待补充')}</p></section>`:''}`;
}
function timelineDetail(j) {return `<div class="section-head"><h3>每一次沟通，都能接着往下走。</h3>${btn(icon('plus')+'记一笔进展','add-activity','primary')}</div>${j.activities.length?`<div class="timeline">${j.activities.slice().sort((a,b)=>new Date(b.date)-new Date(a.date)).map(a=>`<article><div class="timeline-dot"></div><div class="timeline-meta">${badge(a.type)}<small>${fullDate(a.date)}</small></div><p class="prewrap">${esc(a.text)}</p>${a.contact||a.channel?`<small>${esc(a.contact||'')} ${a.channel?'· '+esc(a.channel):''}</small>`:''}${a.materialIds?.length?`<div class="attached-materials">实际提交：${a.materialIds.map(id=>{const m=state.materials.find(m=>m.id===id);return badge(m?`${m.name} ${m.version}`:'材料不可用');}).join('')}</div>`:''}</article>`).join('')}</div>`:empty('从第一笔进展开始','电话、招聘软件里的聊天、邮件回复，都可以简单记下来。','add-activity','记一笔进展')}`;}
function interviewsDetail(j) {return `<div class="section-head"><h3>面试与测评</h3>${btn(icon('plus')+'添加安排','add-interview','primary')}</div>${j.interviews.length?j.interviews.slice().sort((a,b)=>(b.date||'').localeCompare(a.date||'')).map(i=>`<article class="interview-card"><div class="section-head"><div><h3>${esc(i.round)}</h3><p>${i.date?formatDate(i.date):'时间待定'} · ${esc(i.format||'形式待确认')}</p></div>${badge(i.status,i.status==='已完成'?'green':'')}</div>${i.notes?`<div class="interview-block"><small>准备事项</small><p class="prewrap">${esc(i.notes)}</p></div>`:''}${[['实际问答',i.questions],['明确反馈',i.feedback],['个人复盘 / 推测',i.review]].filter(([,v])=>v).map(([label,text])=>`<div class="interview-block"><small>${label}</small><p class="prewrap">${esc(text)}</p></div>`).join('')}${btn('更新 / 记录复盘','edit-interview','text',`data-id="${i.id}"`)}</article>`).join(''):empty('给下一次对话留个位置','每轮面试独立记录；已发生的面试也可以直接补录。','add-interview','添加安排')}`;}
function materialsDetail(j) {
 const drafts=(state.resumes||[]).filter(r=>r.jobId===j.id&&!r.archived),submissions=resumeCatalogueRows(state).filter(r=>r.type==='submission'&&r.jobId===j.id),locked=submittedMaterialIds(state);
 const materials=state.materials.filter(m=>j.materialIds.includes(m.id)&&!locked.has(m.id));
 return `<div class="section-head"><h3>岗位简历草稿</h3>${btn('从底稿创建','create-job-resume','primary')}</div>${drafts.length?drafts.map(r=>`<article class="linked-material"><div><strong>${esc(r.name)}</strong><small>可编辑草稿</small></div>${btn('打开编辑','open-resume','secondary',`data-id="${r.id}"`)}</article>`).join(''):'<p class="hint">尚未创建针对版简历，可直接从底稿开始。</p>'}
 <section class="detail-section"><h3>实际投递原件</h3>${submissions.length?submissions.map(r=>`<article class="linked-material"><div><strong>${esc(r.name)}</strong><small>${esc(r.status)} · ${formatDate(r.date)}</small></div>${r.material?btn('查看原件','open-resume','secondary',`data-id="${r.id}"`):btn('补充实际PDF','fill-submission','secondary',`data-activity-id="${r.activityId}"`)}</article>`).join(''):'<p class="hint">确认实际提交后，在简历编辑页登记并留存PDF。</p>'}</section>
 <div class="section-head"><h3>其他准备材料</h3>${btn('选择关联材料','link-materials','secondary')}</div>${materials.map(m=>`<article class="linked-material"><div><strong>${esc(m.name)}</strong><small>${esc(m.version||'未标版本')}</small></div>${m.file?btn('下载','download-material','text',`data-id="${m.id}"`):''}</article>`).join('')||'<p class="hint">暂无其他准备材料。</p>'}`;
}
function goToResume({id='',jobId=''}={}){
 if(!(id?openResume(id):showResumeList(jobId)))return;
 view='resumes';selectedJob=null;dialog=null;$('#overlay').innerHTML='';document.body.classList.remove('modal-open');render();window.scrollTo(0,0);
}

function download(name, data, type='application/json') {
  const blob=data instanceof Blob?data:new Blob([typeof data==='string'?data:JSON.stringify(data,null,2)],{type});
  const url=URL.createObjectURL(blob), a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function backup() {download(`Jobcat-${demo?'示例-':''}备份-${localDate()}.json`,{kind:'jobcat-backup',schemaVersion:1,exportedAt:now(),state});}
function exportContext(ids, materialIds) {
  const jobs=state.jobs.filter(j=>ids.includes(j.id));
  const items=jobs.map(j=>({jobId:j.id,baseRevision:j.revision,jdVersionId:j.jdVersions.at(-1)?.id||null,title:j.title,company:j.company,city:j.city,salary:j.salary,direction:j.direction,jd:j.jdVersions.at(-1)?.text||'',sources:j.sources,reason:j.reason,concerns:j.concerns,questions:j.questions,userReason:j.userReason||'',userConcerns:j.userConcerns||'',userQuestions:j.userQuestions||'',analyses:j.analyses.map(a=>({text:a.text,date:a.date}))}));
  download(`Jobcat-${demo?'示例-':''}AI协作-${localDate()}.json`,{kind:'jobcat-context',schemaVersion:1,exportedAt:now(),demo,preferences:state.preferences,items,
    materials:state.materials.filter(m=>materialIds.includes(m.id)).map(({id,name,version,text})=>({id,name,version,text})),
    instructions:'请根据已提供的事实分析工作内容、转行价值、进入可能性、收入与城市、待核实事项。不要编造经历或判断录用概率。返回 kind=jobcat-ai-draft, schemaVersion=1, items=[{jobId,baseRevision,jdVersionId,recommendation,analysis,materialIds}]。ID 与版本原样保留。搜集新岗位时提供 title,company,city,salary,direction,jd,platform,url，不设置个人决定或申请阶段。'});
}
async function readJson(file) {if(!file) return null;if(file.size>64*1024*1024) throw Error('文件超过 64 MB');try{return JSON.parse(await file.text());}catch{throw Error('无法读取 JSON 文件，请检查文件内容');}}
function readFile(file) {return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('附件读取失败'));reader.readAsDataURL(file);});}

document.addEventListener('click',async event=>{
  const el=event.target.closest('[data-action]');if(!el)return;
  const action=el.dataset.action;if(busy)return;
  try {
    if(action.startsWith('cv-')){await resumeAction(action,el,{state,commit,render,toast,demo,updateSaveStatus,openCreate:data=>openDialog('create-resume',data),openSubmission:data=>openDialog('resume-submission',data)});return;}
    if(action==='refresh-state'){if(demo){toast('请先退出示例，再更新正式记录');return;}if($('#overlay form')?.dataset.dirty==='yes'||$('#preferences-form')?.dataset.dirty==='yes'||$('#resume-form')?.dataset.dirty==='yes'){toast('请先保存或取消当前输入，再更新记录');return;}const res=await fetch('/api/state');if(!res.ok)throw Error('读取记录失败');const fresh=await res.json();state=validateState(fresh.state);revision=fresh.revision;$('#update-notice')?.remove();render();toast('已读取最新记录');}
    else if(action==='nav'||['jobs','settings','pending','filter-direction'].includes(action)) {
      if($('#resume-form')?.dataset.dirty==='yes'&&!confirm('简历有未保存修改，确定离开吗？'))return;
      view=action==='nav'?el.dataset.view:action==='settings'?'settings':'jobs';
      if(action==='pending'){pendingOnly=true;archived=false;search='';filterCity='';filterDirection='';filterStage='';filterDecision='';filterRecommendation='';focusOnly=false;}else pendingOnly=false; if(action==='nav'&&view==='deferred')archived=false; if(action==='filter-direction')filterDirection=el.dataset.direction;
      if(view==='resumes')showResumeList('',true);
      selectedJob=null;dialog=null;$('#overlay').innerHTML='';document.body.classList.remove('modal-open');render();window.scrollTo(0,0);
    } else if(action==='events') $('#events')?.scrollIntoView({behavior:'smooth'});
    else if(action==='add')openDialog('job');
    else if(action==='new-search'||action==='edit-search')openDialog('search-request',{id:el.dataset.id});
    else if(action==='open-resume')goToResume({id:el.dataset.id});
    else if(action==='job-resumes')goToResume({jobId:selectedJob});
    else if(action==='create-job-resume')openDialog('create-resume',{jobId:selectedJob});
    else if(action==='fill-submission')openDialog('resume-submission',{jobId:selectedJob,activityId:el.dataset.activityId});
    else if(action==='review-direction')openDialog('review-direction',{direction:el.dataset.direction});
    else if(action==='request-copy') {
      const r=state.searchRequests.find(r=>r.id===el.dataset.id);
      const text=`请按 Jobcat 网站中的搜岗需求“${r.title}”（ID：${r.id}）找工作。读取本机工作区最新需求，按 ${r.channels} 搜索，核实原始岗位链接，说明推荐理由、能力差距、薪资与待核实项，并将结果回填到此需求。若渠道受限，请记录范围，不假称已覆盖。`;
      try{await navigator.clipboard.writeText(text);toast('已复制，粘贴到当前聊天即可开始');}catch{download('Jobcat-搜岗需求.txt',text,'text/plain');toast('已下载需求文字，可发到当前聊天');}
    }
    else if(action==='search-results') {const r=state.searchRequests.find(r=>r.id===el.dataset.id);openDialog('search-results',{id:r.id});}

    else if(action==='open'||action==='open-interviews') {dialog=null;focusBefore=el;selectedJob=el.dataset.id;detailTab=action==='open-interviews'?'interviews':'overview';renderDetail();requestAnimationFrame(()=>$('#overlay [data-action="close-detail"]')?.focus());}
    else if(action==='close-detail') {selectedJob=null;$('#overlay').innerHTML='';document.body.classList.remove('modal-open');focusBefore?.focus();}
    else if(action==='detail-tab'){detailTab=el.dataset.tab;renderDetail();}
    else if(action==='toggle-focus')await changeJob(selectedJob,j=>updateJob(j,{focus:!j.focus}));
    else if(action==='focus-filter'){focusOnly=!focusOnly;render();}
    else if(action==='edit-job')openDialog('job',{id:selectedJob});
    else if(action==='edit-next')openDialog('next');
    else if(action==='complete-next')await changeJob(selectedJob,j=>updateJob(j,{nextAction:'',nextDate:'',activities:[...j.activities,{id:uid(),type:'完成下一步',text:j.nextAction,date:now(),materialIds:[]}]}));
    else if(action==='close-modal')closeModal();
    else if(action==='add-source')openDialog('source');
    else if(action==='add-activity')openDialog('activity');
    else if(action==='add-interview'||action==='edit-interview')openDialog('interview',{id:el.dataset.id});
    else if(action==='add-material'||action==='edit-material')openDialog('material',{id:el.dataset.id});
    else if(action==='add-experience'||action==='edit-experience')openDialog('experience',{id:el.dataset.id});
    else if(action==='add-analysis')openDialog('analysis');
    else if(action==='link-materials')openDialog('link-materials');
    else if(action==='list'||action==='board'){mode=action;render();}
    else if(action==='reset-filters'){search='';filterCity='';filterDirection='';filterStage='';filterDecision='';filterRecommendation='';focusOnly=false;pendingOnly=false;render();}
    else if(action==='show-archive'||action==='show-active'){archived=action==='show-archive';pendingOnly=false;selected.clear();render();}
    else if(action==='defer-job'){await changeJob(selectedJob,j=>setDeferred(j,j.decision!=='暂缓'));}
    else if(action==='archive-job'){await changeJob(selectedJob,j=>updateJob(j,{archived:!j.archived}));}
    else if(action==='backup')backup();
    else if(action==='restore'){if(demo)throw Error('请退出示例后恢复正式备份');openDialog('restore');}
    else if(action==='import-ai'){importRows=[];openDialog('import-ai');}
    else if(action==='draft-help')openDialog('draft-help');
    else if(action==='export-job'||action==='export-selected')openDialog('export-context',{ids:action==='export-job'?[selectedJob]:[...selected]});
    else if(action==='demo'){if(demo)return;savedState=clone(state);demo=true;state=demoState(state.preferences);selected.clear();render();toast('已进入独立示例，正式记录未改变');}
    else if(action==='exit-demo'){state=savedState;demo=false;selected.clear();selectedJob=null;dialog=null;$('#overlay').innerHTML='';document.body.classList.remove('modal-open');render();}
    else if(action==='download-material') {const m=state.materials.find(m=>m.id===el.dataset.id);if(m?.file){const raw=atob(m.file.data.split(',')[1]),bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));download(m.file.name,new Blob([bytes],{type:'application/octet-stream'}));}}
    else if(action==='apply-import') {
      const rows=importRows.map((r,i)=>({...r,selected:Boolean($(`#draft-${i}`)?.checked)&&!r.conflict}));
      if(!rows.some(r=>r.selected))throw Error('请至少选择一项无冲突草稿');
      await commit(applyDraft(state,rows));closeModal(true);
    } else if(action==='apply-restore') {
      if(!restoreData)throw Error('请先选择有效备份');
      if(!confirm('恢复会替换当前全部记录。即将先下载当前备份，确定继续吗？'))return;
      backup();await commit(restoreData,{restore:true});selectedJob=null;selected.clear();closeModal(true);render();
    }
  } catch(error){toast(error.message,true);}
});
document.addEventListener('input',event=>{
  event.target.closest('#overlay form, #preferences-form, #resume-form')?.setAttribute('data-dirty','yes');updateSaveStatus();
  if(event.target.id==='search'){const start=event.target.selectionStart;search=event.target.value;render();const field=$('#search');field.focus();field.setSelectionRange(start,start);}
});
document.addEventListener('change',async event=>{
  const el=event.target;
  el.closest('#overlay form, #preferences-form, #resume-form')?.setAttribute('data-dirty','yes');updateSaveStatus();
  try {
    if(el.id==='cv-template-file'){await importResume(el.files[0],{state,commit});}
    else if(el.name==='pdfSource'){if($('#submission-upload'))$('#submission-upload').hidden=el.value!=='upload';if($('#submission-generated'))$('#submission-generated').hidden=el.value!=='generated';}
    else if(el.name==='type'&&el.closest('#activity-form')){$('#activity-offer').hidden=el.value!=='Offer';}
    else if(el.id==='direction-filter'){filterDirection=el.value;render();}
    else if(el.id==='city-filter'){filterCity=el.value;render();}
    else if(el.id==='recommendation-filter'){filterRecommendation=el.value;render();}
    else if(el.id==='stage-filter'){filterStage=el.value;render();}
    else if(el.id==='decision-filter'){filterDecision=el.value;render();}
    else if(el.classList.contains('select-job')) {el.checked?selected.add(el.dataset.id):selected.delete(el.dataset.id);render();}
    else if(el.id==='select-all'){visibleJobs().forEach(j=>el.checked?selected.add(j.id):selected.delete(j.id));render();}
    else if(el.id==='ai-file') {
      importRows=[];$('#apply-import').disabled=true;$('#draft-preview').innerHTML='';
      const payload=await readJson(el.files[0]);if(!payload)return;importRows=previewDraft(payload,state);
      $('#draft-preview').innerHTML=`<p class="hint">${importRows.length} 项草稿。已有岗位仅追加分析；新机会进入待判断。</p>${importRows.map((r,i)=>`<label class="draft-row"><input type="checkbox" id="draft-${i}" ${r.selected?'checked':''} ${r.conflict?'disabled':''}><span><strong>${esc(r.title)}</strong><small>${r.item.jobId?'追加分析':'新增机会'}${r.conflict?' · '+esc(r.conflict):''}</small><p>${esc((r.item.analysis||r.item.jd||r.item.reason||'').slice(0,500))}</p></span></label>`).join('')}`;
      $('#apply-import').disabled=!importRows.some(r=>r.selected);
    } else if(el.id==='restore-file') {
      restoreData=null;$('#apply-restore').disabled=true;$('#restore-preview').innerHTML='';
      const payload=await readJson(el.files[0]);if(!payload)return;
      if(payload.kind!=='jobcat-backup')throw Error('这不是完整工作区备份');
      restoreData=validateState(payload.state);$('#restore-preview').innerHTML=`<div class="restore-summary"><strong>将恢复 ${restoreData.jobs.length} 个机会</strong><p>${restoreData.materials.length} 份材料 · ${restoreData.experiences.length} 段经历</p><small>备份时间：${esc(fullDate(payload.exportedAt))}</small></div>`;$('#apply-restore').disabled=false;
    }
  } catch(error){toast(error.message,true);}
});
document.addEventListener('submit',async event=>{
  const form=event.target;event.preventDefault();if(busy)return;
  const data=new FormData(form), values=Object.fromEntries(data.entries()), ids=data.getAll('materialIds');
  const submit=form.querySelector('[type="submit"]')||(form.id==='resume-form'?document.querySelector('[type="submit"][form="resume-form"]'):null);if(submit)submit.disabled=true;
  try {
    if(form.id==='resume-form'){await saveResume({state,commit,updateSaveStatus});return;}
    if(form.id==='create-resume-form'){
      const source=state.resumes.find(r=>r.id===values.sourceId);if(!source)throw Error('请选择底稿');
      const next=clone(state),copy=copyResumeDraft(source,{jobId:values.jobId||'',name:values.name.trim()});if(!copy.name)throw Error('请填写草稿名称');
      next.resumes.push(copy);await commit(next,{renderView:false});closeModal(true);goToResume({id:copy.id});return;
    }
    if(form.id==='resume-submission-form'){if(demo)throw Error('请退出示例后登记正式投递');await submitResumeSubmission(form,{state,commit,render});closeModal(true);return;}

    if(form.id==='job-form') {
      const {platform,url,postedDate,...fields}=values;
      if(!fields.title.trim()&&!fields.jd.trim())throw Error('请填写岗位名称或粘贴一段 JD');
      if(fields.stage==='已结束'&&!fields.closeReason.trim())throw Error('请写下结束原因，方便以后回看');
      if(form.dataset.id)await changeJob(form.dataset.id,j=>updateJob(j,{...fields,title:fields.title.trim()||j.title}));
      else {
        const dup=duplicates(state.jobs,{...fields,url});
        if(dup.length&&!confirm(`发现可能重复的机会：${dup.map(j=>`${j.company} · ${j.title}${j.archived?'（已归档）':''}`).join('、')}。如果只是补充平台来源，请取消后打开原机会添加来源。仍要作为新机会保存吗？`))return;
        const j=makeJob(fields);if(platform||url)j.sources.push({id:uid(),platform:platform||'手动来源',url,collectedAt:now(),postedDate,checkedAt:'',status:'待核实'});
        const next=clone(state);next.jobs.push(j);await commit(next);selectedJob=j.id;detailTab='overview';
      }
    } else if(form.id==='next-form') {await changeJob(selectedJob,j=>updateJob(j,values));}
    else if(form.id==='source-form') {await changeJob(selectedJob,j=>updateJob(j,{sources:[...j.sources,{id:uid(),...values,collectedAt:now()}]}));}
    else if(form.id==='activity-form') {if(values.type==='Offer'&&values.offerType==='请选择')throw Error('请明确是口头意向、口头 offer 还是书面 offer'); if(values.type!=='Offer')delete values.offerType;await changeJob(selectedJob,j=>addActivity(j,{...values,date:values.date,materialIds:ids}));detailTab='timeline';}
    else if(form.id==='interview-form') {await changeJob(selectedJob,j=>saveInterview(j,{...values,id:form.dataset.id||uid()}));detailTab='interviews';}
    else if(form.id==='material-form') {
      const next=clone(state);
      if(form.dataset.id){const m=next.materials.find(m=>m.id===form.dataset.id);Object.assign(m,{name:values.name,kind:values.kind,version:values.version,text:values.text});}
      else {const material={id:uid(),name:values.name,kind:values.kind,version:values.version,text:values.text,createdAt:now()};const file=data.get('attachment');if(file?.size){if(file.size>10*1024*1024)throw Error('单个附件不能超过 10 MB');material.file={name:file.name,data:await readFile(file)};}next.materials.push(material);}
      await commit(next);
    } else if(form.id==='experience-form') {const next=clone(state);if(form.dataset.id)Object.assign(next.experiences.find(x=>x.id===form.dataset.id),values);else next.experiences.push({id:uid(),...values,createdAt:now()});await commit(next);}
    else if(form.id==='analysis-form') {const j=getJob();await changeJob(selectedJob,j=>updateJob(j,{analyses:[...j.analyses,{id:uid(),...values,date:now(),source:'手动保存',jdVersionId:j.jdVersions.at(-1)?.id||null,baseRevision:j.revision,materialIds:ids}]}));}
    else if(form.id==='link-materials-form') {await changeJob(selectedJob,j=>updateJob(j,{materialIds:ids}));detailTab='materials';}
    else if(form.id==='search-request-form') {
      const next=clone(state); const existing=next.searchRequests.find(r=>r.id===form.dataset.id);
      if(existing)Object.assign(existing,{...values,status:'待搜索',updatedAt:now()});
      else next.searchRequests.unshift({id:uid(),...values,status:'待搜索',createdAt:now(),updatedAt:now(),resultIds:[],report:''});
      await commit(next);view='search';render();
    }
    else if(form.id==='preferences-form') {const next=clone(state);next.preferences={...values,localFloor:Number(values.localFloor),awayFloor:Number(values.awayFloor)};await commit(next);return;}
    else if(form.id==='export-context-form') {exportContext(dialog.ids,ids);toast('已导出选定内容，可发到这里继续分析');}
    closeModal(true);
  } catch(error){const area=form.querySelector('.form-error');if(area)area.textContent=error.message;toast(error.message,true);}
  finally{if(submit)submit.disabled=false;}
});
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'){if(dialog)closeModal();else if(selectedJob){selectedJob=null;$('#overlay').innerHTML='';document.body.classList.remove('modal-open');focusBefore?.focus();}}
  if(event.key==='Tab'&&$('#overlay').children.length){const items=[...$('#overlay').querySelectorAll('button:not([disabled]), input:not([disabled]), select, textarea, a[href], summary')].filter(e=>e.getClientRects().length);const first=items[0],last=items.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}
});
async function init() {
  try {const response=await fetch('/api/state');if(!response.ok)throw Error('无法读取本机工作区');const result=await response.json();state=validateState(result.state);revision=result.revision;render();}
  catch(error){$('#app').innerHTML=`<div class="startup-error"><img src="./cat.svg" alt="Jobcat"><h1>暂时无法打开工作区</h1><p>${esc(error.message)}</p><p>请确认本机 Jobcat 服务仍在运行，再刷新页面。你的数据库不会被重置。</p><button class="btn primary" id="retry">重新连接</button></div>`;$('#retry').addEventListener('click',init);}
}
init();

window.addEventListener('beforeunload',event=>{if(document.querySelector('#resume-form')?.dataset.dirty==='yes'){event.preventDefault();event.returnValue='';}});
