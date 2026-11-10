export const STAGES = ['待判断', '准备中', '已沟通／已申请', '测评／面试中', 'Offer', '已入职', '已结束'];
export const DIRECTIONS = ['产品', 'AI 应用', '业务分析', '解决方案', '财务数字化', '会计财务', '其他'];
export const DECISIONS = ['未决定', '推进', '保留观察', '不考虑'];
export const RECOMMENDATIONS = ['优先核实', '可以尝试', '补信息后再判断', '暂不优先'];
export function recommendation(job) {
  const value = job.analyses.at(-1)?.recommendation;
  return ({'优先评估':'优先核实','优先了解':'优先核实','值得尝试':'可以尝试','先补信息':'补信息后再判断','保留观察':'补信息后再判断'})[value] || (RECOMMENDATIONS.includes(value) ? value : '尚未分析');
}
export function cityGroup(value = '') {
  // Only the leading location is authoritative; company headquarters in a note is not.
  const city = value.match(/^(南京|北京|上海|广州|深圳|杭州|苏州)(?=$|[· /／（])/);
  return city ? city[1] : '地点待确认';
}
export function todayActions(jobs, date) {
  return jobs.filter(j=>!j.archived && !['已结束','已入职'].includes(j.stage) && j.nextAction && j.nextDate && j.nextDate <= date)
    .sort((a,b)=>a.nextDate.localeCompare(b.nextDate));
}
export const ACTIVITY_TYPES = ['沟通', '发送简历', '正式投递', '招聘方回复', '笔试／作业', 'Offer', '备注'];
export const uid = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
export const localDate = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
export const clone = value => structuredClone(value);
export function makeJob(fields = {}) {
  const time = now();
  const jd = fields.jd?.trim();
  return {id: uid(), title: fields.title?.trim() || jd?.slice(0,30) || '待补充岗位',
    company: '', city: '', direction: '其他', salary: '', postedDate: '', hiring: '待核实',
    stage: '待判断', decision: '未决定', reason: '', concerns: '', questions: '',
    userReason: '', userConcerns: '', userQuestions: '', focus: false, keyRequirement: '', jdCompleteness: '未标明',
    nextAction: '', nextDate: '', closeReason: '', offerType: '', offerNotes: '',
    createdAt: time, updatedAt: time, revision: 1, archived: false,
    sources: [], activities: [], interviews: [], analyses: [], materialIds: [], jdVersions: [],
    ...fields, title: fields.title?.trim() || jd?.slice(0,30) || '待补充岗位', jd: undefined,
    jdVersions: jd ? [{id: uid(), text: jd, date: time}] : (fields.jdVersions || [])};
}
export function updateJob(job, fields) {
  const next = {...job, ...fields, revision: job.revision+1, updatedAt: now()};
  if (fields.jd !== undefined) {
    const text = fields.jd.trim();
    if (text !== (job.jdVersions.at(-1)?.text || '')) next.jdVersions = [...job.jdVersions, {id: uid(), text, date: now()}];
    delete next.jd;
  }
  if (fields.stage && fields.stage !== job.stage) {
    next.activities = [...next.activities, {id: uid(), type: '阶段变更', date: now(),
      text: `${job.stage} → ${fields.stage}${fields.closeReason ? `：${fields.closeReason}` : ''}`, materialIds: []}];
  }
  return next;
}
export function addActivity(job, activity) {
  const next = updateJob(job, {activities: [...job.activities, {id: uid(), materialIds: [], ...activity}]});
  if (activity.type === 'Offer' && activity.offerType) { next.offerType = activity.offerType; next.offerNotes = activity.text; }
  const target = ['发送简历', '正式投递', '沟通'].includes(activity.type) ? 2 : activity.type === '笔试／作业' ? 3 : activity.type === 'Offer' && ['口头 offer','书面 offer'].includes(activity.offerType) ? 4 : -1;
  if (target > STAGES.indexOf(next.stage) && next.stage !== '已结束') next.stage = STAGES[target];
  return next;
}
export function saveInterview(job, interview) {
  const previous = job.interviews.find(x => x.id === interview.id);
  const interviews = previous ? job.interviews.map(x => x.id === interview.id ? interview : x) : [...job.interviews, interview];
  const label = previous ? '更新面试' : '安排面试';
  const next = updateJob(job, {interviews, activities: [...job.activities, {id: uid(), type: label, date: now(),
    text: `${interview.round} · ${interview.status}${interview.date ? ` · ${interview.date.replace('T',' ')}` : ''}`, materialIds: []}]});
  if (STAGES.indexOf(next.stage) < 3 && interview.status !== '已取消') next.stage = '测评／面试中';
  return next;
}
export function duplicates(jobs, fields, excludeId) {
  const normal = v => (typeof v==='string'?v:'').trim().toLocaleLowerCase().replace(/\s+/g,'');
  const link = fields.url?.trim();
  return jobs.filter(j => j.id !== excludeId && !j.archived && (
    (link && j.sources.some(s => s.url === link)) ||
    (normal(fields.company) && normal(j.company) === normal(fields.company) && normal(j.title) === normal(fields.title) && normal(j.city) === normal(fields.city))));
}
export function stats(jobs) {
  return {collected: jobs.length,
    applied: jobs.filter(j => j.activities.some(a => ['正式投递','发送简历'].includes(a.type))).length,
    interviewed: jobs.filter(j => j.interviews.some(i => i.status === '已完成')).length,
    offers: jobs.filter(j => j.offerType === '口头 offer' || j.offerType === '书面 offer').length};
}
export function validateState(state) {
  if (!state || state.schemaVersion !== 1 || !state.preferences || typeof state.preferences !== 'object' || Array.isArray(state.preferences)) throw Error('不是 Jobcat v1 工作区备份');
  state.searchRequests ??= [];
  for (const key of ['jobs', 'materials', 'experiences', 'searchRequests']) {
    if (!Array.isArray(state[key])) throw Error(`备份缺少 ${key}`);
    const ids = state[key].map(x => x?.id);
    if (ids.some(x => typeof x !== 'string' || !x) || new Set(ids).size !== ids.length) throw Error('备份含重复或无效 ID');
  }
  for (const r of state.searchRequests) {
    if (['title','directions','cities','salary','channels','notes','status','report','createdAt','updatedAt'].some(k=>typeof r[k]!=='string') || !Array.isArray(r.resultIds) || r.resultIds.some(id=>!state.jobs.some(j=>j.id===id))) throw Error('搜岗需求格式或结果关联无效');
  }
  const materialIds = new Set(state.materials.map(m => m.id));
  const strings = (object, keys) => {if (keys.some(key => object[key] !== undefined && typeof object[key] !== 'string')) throw Error('备份包含无效文字字段');};
  const dates = (object, keys) => {if (keys.some(key => object[key] && (typeof object[key] !== 'string' || Number.isNaN(Date.parse(object[key]))))) throw Error('备份包含无效日期');};
  for (const m of state.materials) {
    if (typeof m.name !== 'string' || typeof m.text !== 'string') throw Error('材料格式不完整');
    if (m.file && (typeof m.file.name !== 'string' || typeof m.file.data !== 'string' || !/^data:[^,]*;base64,[A-Za-z0-9+/=]*$/.test(m.file.data))) throw Error('附件格式无效');
  }
  for (const e of state.experiences) if (typeof e.title !== 'string' || typeof e.text !== 'string') throw Error('经历格式不完整');
  for (const j of state.jobs) {
    if (typeof j.title !== 'string' || !j.title.trim() || !STAGES.includes(j.stage) || !Number.isInteger(j.revision)) throw Error('岗位格式无效');
    if (j.focus !== undefined && typeof j.focus !== 'boolean') throw Error('重点标记格式无效');
    strings(j,['userReason','userConcerns','userQuestions','keyRequirement','jdCompleteness']);
    for (const key of ['sources','activities','interviews','analyses','materialIds','jdVersions']) if (!Array.isArray(j[key])) throw Error(`岗位缺少 ${key}`);
    strings(j,['company','city','direction','salary','hiring','decision','reason','concerns','questions','nextAction','nextDate','closeReason','offerType','offerNotes','createdAt','updatedAt']);
    dates(j,['createdAt','updatedAt','nextDate']);
    if (j.materialIds.some(id => !materialIds.has(id)) || j.activities.some(a => !Array.isArray(a.materialIds) || a.materialIds.some(id => !materialIds.has(id)))) throw Error('备份含丢失的材料关联');
    for (const s of j.sources) if (typeof s.platform !== 'string' || typeof s.url !== 'string') throw Error('来源格式无效');
    for (const v of j.jdVersions) {if (typeof v.id !== 'string' || typeof v.text !== 'string') throw Error('JD 版本无效');dates(v,['date']);}
    for (const a of j.activities) {if (typeof a.type !== 'string' || typeof a.text !== 'string' || typeof a.date !== 'string') throw Error('活动格式无效');dates(a,['date']);}
    for (const i of j.interviews) {if (typeof i.id !== 'string' || typeof i.round !== 'string' || !['待进行','已完成','已取消'].includes(i.status)) throw Error('面试格式无效');dates(i,['date']);}
    for (const a of j.analyses) {if (typeof a.id !== 'string' || typeof a.text !== 'string') throw Error('分析格式无效');dates(a,['date']);}
  }
  return state;
}
export function previewDraft(payload, state) {
  if (payload?.kind !== 'jobcat-ai-draft' || payload.schemaVersion !== 1 || !Array.isArray(payload.items) || !payload.items.length) throw Error('请选择 Jobcat AI 草稿文件，不是工作区备份');
  const seen=[];
  return payload.items.map((item,index) => {
    if (typeof item !== 'object' || !item) throw Error(`第 ${index+1} 项格式无效`);
    if (item.jobId) {
      const job = state.jobs.find(j => j.id === item.jobId);
      const conflict = !job ? '找不到原岗位' : item.baseRevision !== job.revision ? '岗位已更新，请重新分析' : job.archived ? '岗位已归档' : '';
      if (typeof item.analysis !== 'string' || !item.analysis.trim()) throw Error('已有岗位草稿需要 analysis 文字');
      const knownJd = job?.jdVersions.some(v => v.id === item.jdVersionId) || (!job?.jdVersions.length && !item.jdVersionId);
      return {index, item, job, conflict: conflict || (!knownJd ? 'JD 依据不匹配' : ''), title: job?.title || item.jobId, selected: !conflict && knownJd};
    }
    if (typeof item.title !== 'string' || !item.title.trim()) throw Error('新机会草稿需要岗位名称');
    const dup = duplicates([...state.jobs,...seen], item);
    seen.push(makeJob({title:item.title,company:typeof item.company==='string'?item.company:'',city:typeof item.city==='string'?item.city:'',sources:typeof item.url==='string'?[{url:item.url}]:[]}));
    return {index, item, job: null, conflict: dup.length ? '可能与已有机会重复，取消勾选后可手动核对' : '', title: item.title, selected: !dup.length};
  });
}
export function applyDraft(state, rows) {
  const next = clone(state);
  for (const row of rows.filter(r => r.selected)) {
    const {item} = row;
    const request=next.searchRequests?.find(r=>r.id===item.requestId);
    if (item.jobId) {
      const index = next.jobs.findIndex(j => j.id === item.jobId);
      const job = next.jobs[index];
      if (!job || job.revision !== item.baseRevision || job.archived) throw Error('岗位已变化，请重新导入草稿');
      if(request&&!request.resultIds.includes(job.id))request.resultIds.push(job.id);
      next.jobs[index] = updateJob(job, {analyses: [...job.analyses, {id: uid(), text: item.analysis,
        recommendation: item.recommendation || '先补信息', date: now(), source: 'AI 草稿导入',
        jdVersionId: item.jdVersionId || null, baseRevision: item.baseRevision, materialIds: item.materialIds?.filter(id => state.materials.some(m => m.id === id)) || []}]});
    } else {
      const fields = Object.fromEntries(['title','company','city','salary','jd','reason','questions'].map(k => [k, typeof item[k] === 'string' ? item[k] : '']));
      fields.direction = DIRECTIONS.includes(item.direction) ? item.direction : '其他';
      fields.sources = item.url ? [{id: uid(), platform: item.platform || 'AI 搜集', url: item.url, collectedAt: now(), checkedAt: '', postedDate: '', status: '待核实'}] : [];
      const job = makeJob(fields);
      if (item.analysis) job.analyses.push({id: uid(), text: String(item.analysis), recommendation: item.recommendation || '先补信息', date: now(), source: 'AI 草稿导入', jdVersionId: job.jdVersions.at(-1)?.id || null, baseRevision: 1, materialIds: []});
      next.jobs.push(job);
      if(request)request.resultIds.push(job.id);
    }
  }
  return next;
}
export function demoState(preferences) {
  const a = makeJob({title:'AI 应用产品助理', company:'示例 · 云间科技', city:'上海', direction:'AI 应用', salary:'12–16K · 13薪', stage:'测评／面试中', decision:'推进', nextAction:'准备需求分析案例，问清 AI 产品职责', nextDate: localDate(), reason:'希望从财务系统咨询延伸至 AI 应用产品。', questions:'是否参与需求分析和效果验证？固定薪资占比是多少？', jd:'【虚构示例】协助梳理企业用户需求，参与 AI 工作流原型、用户测试和迭代。希望有需求分析与业务沟通经验。'});
  a.interviews = [{id:uid(), round:'业务一面', date:`${localDate()}T15:00`, format:'线上', status:'待进行', notes:'准备一个从需求到上线的真实案例。', questions:'', feedback:'', review:''}];
  a.activities = [{id:uid(),type:'正式投递', date:now(),text:'【虚构示例】通过企业官网提交。',materialIds:[]}];
  const b = makeJob({title:'财务产品经理',company:'示例 · 青禾软件',city:'南京',direction:'产品',salary:'10–15K',decision:'保留观察',reason:'可衔接财务系统经验，需核实是否有产品设计职责。',jd:'【虚构示例】参与预算与合并报表产品的需求研究、功能设计与测试交付。'});
  const c = makeJob({title:'业务分析顾问',company:'示例 · 远山咨询',city:'深圳',direction:'业务分析',salary:'面议',stage:'已沟通／已申请',nextAction:'确认薪资与项目出差安排',nextDate:localDate(),concerns:'薪资未披露；需要确认出差频率。'});
  c.activities = [{id:uid(),type:'沟通',date:now(),text:'【虚构示例】招聘方希望先了解项目经历，尚未投递。',materialIds:[]}];
  return {schemaVersion:1,jobs:[a,b,c],materials:[],experiences:[],searchRequests:[],preferences:clone(preferences)};
}
