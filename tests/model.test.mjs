import test from 'node:test';
import assert from 'node:assert/strict';
import {makeJob,updateJob,addActivity,saveInterview,duplicates,stats,previewDraft,applyDraft,validateState,setDeferred,todayActions,needsFollowUp,awaitingDecision,resumeCatalogueRows,submittedMaterialIds,copyResumeDraft,recordResumeSubmission} from '../web/model.mjs';

test('declined and deferred jobs do not prompt follow-up; real interview records stay intact',()=>{
  for(const decision of ['不考虑','暂缓']){
    const job=makeJob({title:'运营',decision,stage:'已沟通／已申请',nextAction:'联系',nextDate:'2026-11-01',interviews:[{id:'one',status:'待进行'}]});
    assert.equal(needsFollowUp(job),false);
    assert.deepEqual(todayActions([job],'2026-11-10'),[]);
    assert.equal(job.interviews.length,1);
  }
  assert.equal(awaitingDecision(makeJob({title:'已沟通但未决定',stage:'已沟通／已申请'})),true);
  assert.equal(awaitingDecision(makeJob({title:'已结束',stage:'已结束'})),false);
});

test('archived matches prevent a new duplicate draft without affecting different roles',()=>{
  const job=makeJob({title:'运营',company:'同一公司',city:'深圳',archived:true,sources:[{url:'https://example.com/job/1'}],activities:[{type:'正式投递',materialIds:[]}]});
  assert.equal(duplicates([job],{url:'https://example.com/job/1'}).length,1);
  assert.equal(duplicates([job],{title:'运营',company:'同一公司',city:'深圳'}).length,1);
  assert.equal(duplicates([job],{title:'产品',company:'同一公司',city:'深圳'}).length,0);
  const rows=previewDraft({kind:'jobcat-ai-draft',schemaVersion:1,items:[{title:'运营',url:'https://example.com/job/1'}]},workspace([job]));
  assert.equal(rows[0].selected,false);
  assert.match(rows[0].conflict,/已归档/);
  assert.equal(stats([job]).applied,1);
});

test('deferring suppresses actions, preserves progress and restores the previous decision',()=>{
  const job=makeJob({title:'运营助理',decision:'推进',stage:'已沟通／已申请',nextAction:'准备材料',nextDate:'2026-11-10',materialIds:['cv'],activities:[{id:'sent',type:'正式投递',materialIds:['cv']}],interviews:[{id:'one',status:'待进行'}]});
  const paused=setDeferred(job,true);
  assert.equal(paused.decision,'暂缓');
  assert.equal(paused.stage,job.stage);
  assert.deepEqual(paused.materialIds,job.materialIds);
  assert.deepEqual(paused.interviews,job.interviews);
  assert.deepEqual(todayActions([paused],'2026-11-10'),[]);
  assert.equal(stats([paused]).applied,1);
  assert.equal(setDeferred(paused,true),paused);
  const resumed=setDeferred(paused,false);
  assert.equal(resumed.decision,'推进');
  assert.equal(resumed.stage,job.stage);
  assert.equal(todayActions([resumed],'2026-11-10').length,1);
  assert.equal(resumed.activities.length,3);
});

const workspace=jobs=>({schemaVersion:1,jobs,materials:[],experiences:[],preferences:{}});
test('capture with only JD creates an identifiable title',()=>{
  const j=makeJob({title:'',jd:'参与企业 AI 应用需求分析'});
  assert.equal(j.title,'参与企业 AI 应用需求分析');
  assert.equal(j.jdVersions.length,1);
  validateState(workspace([j]));
});
test('JD editing retains previous snapshot and invalidates old analysis basis',()=>{
  const j=makeJob({title:'产品',jd:'旧职责'}), oldId=j.jdVersions[0].id;
  const next=updateJob(j,{jd:'新职责'});
  assert.equal(next.jdVersions.length,2);
  assert.equal(next.jdVersions[0].id,oldId);
  assert.equal(j.jdVersions.length,1);
  assert.equal(next.revision,2);
});
test('consultation and an old publication date do not count as application',()=>{
  const j=makeJob({title:'岗位',postedDate:'2025-01-01'});
  const spoken=addActivity(j,{type:'沟通',date:'2026-11-09T12:00',text:'问薪资'});
  assert.equal(stats([spoken]).applied,0);
  const applied=addActivity(spoken,{type:'正式投递',date:'2026-11-10T12:00',text:'提交'});
  assert.equal(stats([applied]).applied,1);
  assert.equal(applied.activities.at(-1).date,'2026-11-10T12:00');
  assert.equal(applied.postedDate,'2025-01-01');
});
test('different roles at same company stay distinct, cross-source duplicates detected',()=>{
  const j=makeJob({title:'产品经理',company:'云间',city:'上海',sources:[{platform:'BOSS',url:'https://example.com/job/1'}]});
  assert.equal(duplicates([j],{title:'业务分析',company:'云间',city:'上海'}).length,0);
  assert.equal(duplicates([j],{title:'产品经理',company:'云间',city:'上海'}).length,1);
  assert.equal(duplicates([j],{url:'https://example.com/job/1'}).length,1);
});
test('completing round one does not remove round two or regress offer stage',()=>{
  let j=makeJob({title:'岗位',stage:'Offer'});
  j=saveInterview(j,{id:'two',round:'二面',date:'2026-11-11T15:00',status:'待进行'});
  j=saveInterview(j,{id:'one',round:'一面',date:'2026-11-09T15:00',status:'已完成'});
  assert.equal(j.stage,'Offer');
  assert.equal(j.interviews.find(i=>i.id==='two').status,'待进行');
  assert.equal(stats([j]).interviewed,1);
});
test('withdrawn posting and archival preserve application and materials',()=>{
  const j=makeJob({title:'岗位',stage:'测评／面试中',materialIds:['resume-v1']});
  const next=updateJob(j,{hiring:'已下架',archived:true});
  assert.equal(next.stage,'测评／面试中');
  assert.deepEqual(next.materialIds,['resume-v1']);
  assert.equal(updateJob(next,{archived:false}).hiring,'已下架');
});
test('AI stale revisions are blocked, matching drafts append analysis only',()=>{
  const job=makeJob({title:'产品',jd:'JD',decision:'保留观察'}), state=workspace([job]);
  const item={jobId:job.id,baseRevision:1,jdVersionId:job.jdVersions[0].id,analysis:'需要核实职责',stage:'Offer',decision:'推进'};
  const draft={kind:'jobcat-ai-draft',schemaVersion:1,items:[item]};
  const preview=previewDraft(draft,state);
  const applied=applyDraft(state,preview);
  assert.equal(applied.jobs[0].analyses.length,1);
  assert.equal(applied.jobs[0].decision,'保留观察');
  assert.equal(applied.jobs[0].stage,'待判断');
  assert.equal(state.jobs[0].analyses.length,0);
  const stale=previewDraft(draft,applied);
  assert.ok(stale[0].conflict);
  assert.equal(stale[0].selected,false);
  assert.throws(()=>applyDraft(applied,[{...stale[0],selected:true}]),/岗位已变化/);
});
test('AI imports cannot inject stage, duplicate new rows are flagged',()=>{
  const job=makeJob({title:'产品',company:'甲',city:'南京'});
  const draft={kind:'jobcat-ai-draft',schemaVersion:1,items:[{title:'产品',company:'甲',city:'南京',stage:'Offer'},{title:'新产品',company:'乙',stage:'Offer'}]};
  const rows=previewDraft(draft,workspace([job]));
  assert.equal(rows[0].selected,false);
  const state=applyDraft(workspace([job]),rows);
  assert.equal(state.jobs.length,2);
  assert.equal(state.jobs[1].stage,'待判断');
});
test('backup restoration rejects duplicate IDs and missing material versions',()=>{
  const job=makeJob({title:'岗位'});
  assert.throws(()=>validateState(workspace([job,job])),/重复/);
  assert.throws(()=>validateState(workspace([{...job,materialIds:['missing']}])) ,/材料关联/);
  const state=workspace([{...job,materialIds:['v1'],activities:[{type:'发送简历',text:'发送 v1',date:'2026-11-09',materialIds:['v1']}]}]);
  state.materials=[{id:'v1',name:'简历',version:'v1',text:'经历'},{id:'v2',name:'简历',version:'v2',text:'新经历'}];
  validateState(JSON.parse(JSON.stringify(state)));
  assert.equal(state.jobs[0].activities[0].materialIds[0],'v1');
});
test('oral intent is not an offer, confirmed offers update facts and stage',()=>{
  const job=makeJob({title:'岗位'});
  const intent=addActivity(job,{type:'Offer',offerType:'口头意向',text:'只是意向',date:'2026-11-09T15:00'});
  assert.equal(stats([intent]).offers,0);
  assert.equal(intent.stage,'待判断');
  const confirmed=addActivity(intent,{type:'Offer',offerType:'书面 offer',text:'有书面条件',date:'2026-11-10T15:00'});
  assert.equal(stats([confirmed]).offers,1);
  assert.equal(confirmed.stage,'Offer');
});
test('search request results link to imported opportunities and reject broken references',()=>{
  const state=workspace([]);
  state.searchRequests=[{id:'req',title:'找产品',directions:'产品',cities:'南京',salary:'面议',channels:'官网',notes:'',status:'待搜索',report:'',createdAt:'2026-11-09',updatedAt:'2026-11-09',resultIds:[]}];
  const draft={kind:'jobcat-ai-draft',schemaVersion:1,items:[{requestId:'req',title:'产品助理',company:'甲',city:'南京'},{requestId:'req',title:'产品助理',company:'甲',city:'南京'}]};
  const rows=previewDraft(draft,state);
  assert.equal(rows[1].selected,false);
  const next=applyDraft(state,rows);
  assert.equal(next.jobs.length,1);
  assert.equal(next.searchRequests[0].resultIds[0],next.jobs[0].id);
  validateState(next);
  next.searchRequests[0].resultIds.push('missing');
  assert.throws(()=>validateState(next),/搜岗需求/);
});

test('city filter combines districts without inferring headquarters as work location', async()=>{
  const {cityGroup}=await import('../web/model.mjs');
  assert.equal(cityGroup('深圳·南山'),'深圳');
  assert.equal(cityGroup('深圳·南山区'),'深圳');
  assert.equal(cityGroup('上海（具体园区待确认）'),'上海');
  assert.equal(cityGroup('未注明（公司总部上海，不能当作岗位地点）'),'地点待确认');
});
test('AI advice is normalized separately from the user decision', async()=>{
  const {recommendation}=await import('../web/model.mjs');
  const j=makeJob({title:'岗位',decision:'不考虑',analyses:[{recommendation:'优先评估'}]});
  assert.equal(recommendation(j),'优先核实');
  assert.equal(j.decision,'不考虑');
  assert.equal(recommendation(makeJob({title:'新岗位'})),'尚未分析');
});
test('today includes only dated due actions, excluding unplanned inventory and closed jobs', async()=>{
  const {todayActions}=await import('../web/model.mjs');
  const jobs=[makeJob({title:'无日期',nextAction:'确认要求'}),makeJob({title:'明天',nextAction:'准备',nextDate:'2026-11-11'}),makeJob({title:'今天',nextAction:'询问编程要求',nextDate:'2026-11-10'}),makeJob({title:'已关闭',nextAction:'旧任务',nextDate:'2026-11-09',stage:'已结束'}),makeJob({title:'逾期',nextAction:'跟进',nextDate:'2026-11-09'})];
  assert.deepEqual(todayActions(jobs,'2026-11-10').map(j=>j.title),['逾期','今天']);
});


test('resume copies are independent drafts and catalogue separates original submissions',()=>{
  const source={id:'base',name:'底稿',templateId:'template',fields:{'1':'原文'},isMaster:true};
  const draft=copyResumeDraft(source,{jobId:'job',name:'针对版'});draft.fields['1']='修改';
  assert.equal(source.fields['1'],'原文');assert.equal(draft.isMaster,false);assert.equal(draft.jobId,'job');
  const state=workspace([makeJob({id:'job',title:'社区运营'})]);state.resumes=[source,draft];
  const submitted=recordResumeSubmission(state,{jobId:'job',resumeId:draft.id,file:{name:'actual.pdf',data:'data:application/pdf;base64,JVBERi0='},occurredAt:'2026-11-10T10:00',channel:'官网'});
  assert.equal(stats(submitted.jobs).applied,1);assert.equal(submitted.jobs[0].stage,'已沟通／已申请');
  assert.equal(state.materials.length,0);assert.equal(submitted.materials[0].resumeSnapshot.fields['1'],'修改');
  submitted.resumes[1].fields['1']='后续修改';assert.equal(submitted.materials[0].resumeSnapshot.fields['1'],'修改');
  assert.ok(submittedMaterialIds(submitted).has(submitted.materials[0].id));
  const rows=resumeCatalogueRows(submitted);assert.equal(rows.filter(r=>r.type==='submission').length,1);assert.equal(rows.filter(r=>r.type==='resume').length,2);
});

test('attaching an actual PDF to an existing application does not create a second application',()=>{
  const job=makeJob({id:'job',title:'已投岗位',stage:'测评／面试中',activities:[{id:'sent',type:'正式投递',date:'2026-11-10T10:00',text:'已投递',materialIds:[]}]});
  const state=workspace([job]);assert.equal(resumeCatalogueRows(state)[0].status,'待补原件');
  const next=recordResumeSubmission(state,{jobId:'job',activityId:'sent',file:{name:'sent.pdf',data:'data:application/pdf;base64,JVBERi0='}});
  assert.equal(next.jobs[0].activities.filter(a=>a.type==='正式投递').length,1);
  assert.equal(next.jobs[0].stage,'测评／面试中');assert.equal(next.jobs[0].activities[0].date,job.activities[0].date);
  assert.equal(resumeCatalogueRows(next)[0].status,'已投递原件');assert.equal(stats(next.jobs).applied,1);
  assert.throws(()=>recordResumeSubmission(state,{jobId:'job',activityId:'missing',file:{name:'a.pdf',data:'data:application/pdf;base64,JVBERi0='}}));
});
