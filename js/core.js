(function(root){
'use strict';
const S=typeof module!=='undefined'&&module.exports?require('./surveys.js'):root.HRSurveys;
const versionOf=r=>r.survey==='implementer'?(r.questionnaireVersion??1):1;
const schemaFor=(survey,version=2)=>survey==='implementer'&&version===1?S.legacyImplementer:S[survey];
const questions=(survey,version=2)=>schemaFor(survey,version)?.blocks.flatMap(b=>b.questions)||[];
function matches(condition,answers){const value=answers[condition.id];return condition.in?condition.in.includes(value):condition.hasSome?Array.isArray(value)&&condition.hasSome.some(v=>value.includes(v)):false;}
function isVisible(q,answers){
 if(q.hideWhen&&Array.isArray(answers[q.hideWhen.id])&&answers[q.hideWhen.id].includes(q.hideWhen.value))return false;
 if(q.showWhen&&!matches(q.showWhen,answers))return false;
 return !q.allWhen||q.allWhen.every(c=>matches(c,answers));
}
const exclusions=q=>Array.isArray(q.exclusive)?q.exclusive:q.exclusive?[q.exclusive]:[];
const optionsFor=(q,answers={})=>q.dynamicSource?q.options.filter(o=>answers[q.dynamicSource]?.includes(o.value)):q.options;
function validAnswer(q,v,answers={}){
 if(q.type==='text')return v===undefined||(typeof v==='string'&&v.length<=5000);
 if(q.type==='toggle')return v===undefined||typeof v==='boolean';
 if(q.type==='scale')return !!((typeof v==='number'&&Number.isInteger(v)&&v>=q.min&&v<=q.max)||(q.extra&&v===q.extra.value));
 if(q.type==='matrix')return !!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===q.rows.length&&q.rows.every(row=>validAnswer({...q,type:'scale'},v[row.value]));
 if(q.type==='multi')return Array.isArray(v)&&v.length>0&&v.length<=(q.maxSelections??Infinity)&&new Set(v).size===v.length&&v.every(x=>q.options.some(o=>o.value===x))&&!(v.some(x=>exclusions(q).includes(x))&&v.length>1);
 return !!optionsFor(q,answers)?.some(o=>o.value===v);
}
const validateStep=(survey,step,answers,version=2)=>schemaFor(survey,version).blocks[step].questions.filter(q=>isVisible(q,answers)&&!validAnswer(q,answers[q.id],answers)).map(q=>q.id);
function pruneAnswers(survey,answers,version=2){
 const clean={...answers};
 // The schema is ordered with dependencies before their dependent questions.
 for(const q of questions(survey,version)){
  if(!isVisible(q,clean)){delete clean[q.id];if(q.otherField)delete clean[q.otherField];}
  if(q.dynamicSource&&clean[q.id]!==undefined&&!validAnswer(q,clean[q.id],clean))delete clean[q.id];
  if(q.otherField&&!clean[q.id]?.includes('other'))delete clean[q.otherField];
 }
 return clean;
}
function validDraftAnswer(q,value,answers){
 if(q.type==='multi'&&Array.isArray(value)&&!value.length)return true;
 if(q.type==='matrix')return !!value&&typeof value==='object'&&!Array.isArray(value)&&Object.entries(value).every(([key,v])=>q.rows.some(r=>r.value===key)&&validAnswer({...q,type:'scale'},v));
 return validAnswer(q,value,answers);
}
function validateRecord(r){
 const fail=()=>{throw new Error('Некорректная запись ответа. Импорт не выполнен.');};
 if(!r||!['implementer','participant'].includes(r.survey)||![1,2].includes(versionOf(r))||(r.survey==='participant'&&r.questionnaireVersion!==undefined&&r.questionnaireVersion!==1)||typeof r.id!=='string'||!/^[\w-]{1,100}$/.test(r.id)||typeof r.createdAt!=='string'||!Number.isFinite(Date.parse(r.createdAt))||!r.answers||typeof r.answers!=='object'||Array.isArray(r.answers))fail();
 if(!['initiative','department'].every(k=>typeof r[k]==='string'&&r[k].length<=200))fail();
 if(r.initiativeId!==undefined&&(typeof r.initiativeId!=='string'||r.initiativeId.length>100))fail();
 const qs=questions(r.survey,versionOf(r));
 const allowed=qs.flatMap(q=>q.otherField?[q.id,q.otherField]:[q.id]);
 if(Object.keys(r.answers).some(k=>!allowed.includes(k)))fail();
 if(qs.some(q=>isVisible(q,r.answers)&&!validAnswer(q,r.answers[q.id],r.answers)))fail();
 // Hidden answers may exist in older exports but are never used by analytics.
 if(qs.some(q=>!q.dynamicSource&&r.answers[q.id]!==undefined&&!validAnswer(q,r.answers[q.id],r.answers)))fail();
 if(qs.some(q=>q.otherField&&r.answers[q.otherField]!==undefined&&(typeof r.answers[q.otherField]!=='string'||r.answers[q.otherField].length>5000)))fail();
 return true;
}
const isCurrent=r=>r.survey==='implementer'&&versionOf(r)===2;
const mean=values=>{const ns=values.filter(v=>typeof v==='number');return ns.length?ns.reduce((a,b)=>a+b,0)/ns.length:null;};
function aggregate(records){
 const current=records.filter(isCurrent),legacy=records.filter(r=>r.survey==='implementer'&&versionOf(r)===1);
 const avg=(rows,ids)=>mean(rows.flatMap(r=>ids.map(id=>r.answers[id])));
 const participant=records.filter(r=>r.survey==='participant');
 const scores=legacy.map(r=>r.answers.i19).filter(v=>typeof v==='number');
 return {counts:{implementer:current.length+legacy.length,participant:participant.length},currentCount:current.length,legacyCount:legacy.length,
 processClarity:avg(current,['i1','i2']),usefulness:avg(current,['i10']),valueForEffort:avg(current,['i11']),
 roleClarity:Object.fromEntries(S.implementer.blocks[2].questions[0].rows.map(row=>[row.value,mean(current.map(r=>r.answers.i4?.[row.value]))])),
 legacyUsefulness:avg(legacy,['i4','i5','i6','i7','i8']),understanding:avg(participant,['p1','p2','p3']),communication:avg(participant,['p4','p5']),support:avg(participant,['p7','p8','p9']),readiness:avg(participant,['p10']),recommendation:mean(scores),nps:scores.length?100*(scores.filter(v=>v>=9).length-scores.filter(v=>v<=6).length)/scores.length:null,recommendations:Array.from({length:11},(_,score)=>scores.filter(v=>v===score).length)};
}
function distribution(records,survey,q,version=2){
 const options=q.options||Array.from({length:q.max-q.min+1},(_,i)=>({value:q.min+i,label:String(q.min+i)})).concat(q.extra?[q.extra]:[]);
 const rows=records.filter(r=>r.survey===survey&&(survey!=='implementer'||versionOf(r)===version)&&isVisible(q,r.answers)&&r.answers[q.id]!==undefined);
 return options.map(o=>({...o,count:rows.filter(r=>Array.isArray(r.answers[q.id])?r.answers[q.id].includes(o.value):r.answers[q.id]===o.value).length,total:rows.length}));
}
function factualMetrics(records){
 const rows=records.filter(isCurrent),qs=questions('implementer');
 const metric=(id,yes,exclude)=>{
  const q=qs.find(q=>q.id===id);
  const comparable=rows.filter(r=>isVisible(q,r.answers)&&r.answers[id]!==undefined&&!(Array.isArray(r.answers[id])?r.answers[id].some(v=>exclude.includes(v)):exclude.includes(r.answers[id])));
  return {yes:comparable.filter(r=>Array.isArray(r.answers[id])?r.answers[id].some(v=>yes.includes(v)):yes.includes(r.answers[id])).length,total:comparable.length};
 };
 return {unforeseen:metric('i14',['stakeholders','resistance_staff','resistance_leaders','communications','decisions','resources'],['too_early']),emergency:metric('i15',['meetings','escalation','communications','rollback','plan'],['too_early']),delays:metric('i16',['short_delay','long_delay'],['too_early','no_plan']),repeat:metric('i17',['single','often'],['too_early','no_info'])};
}
function initiativeMetrics(records){
 const rows=records.filter(isCurrent),groups=new Map();
 const sorted=[...rows].sort((a,b)=>Date.parse(a.createdAt)-Date.parse(b.createdAt)||a.id.localeCompare(b.id));
 for(const r of sorted)if(r.initiativeId?.trim())groups.set(r.initiativeId.trim(),r);
 const latest=[...groups.values()];
 return {...factualMetrics(latest),identified:groups.size,withoutId:rows.filter(r=>!r.initiativeId?.trim()).length,latest};
}
function labelAnswer(q,value){
 if(value===undefined)return '';
 if(q.type==='toggle')return value?'Да':'Нет';
 if(Array.isArray(value))return value.map(v=>q.options.find(o=>o.value===v)?.label||'').join(' | ');
 return q.options?.find(o=>o.value===value)?.label||(q.extra?.value===value?q.extra.label:String(value));
}
function toCSV(records){
 const schemas=[['implementer',2],['participant',1],['implementer',1]];
 const cols=schemas.flatMap(([survey,version])=>questions(survey,version).flatMap(q=>q.type==='matrix'?q.rows.map(row=>({survey,version,q,row})):q.otherField?[{survey,version,q},{survey,version,q,other:true}]:[{survey,version,q}]));
 const cell=v=>'"'+String(v??'').replace(/^[\s]*[=+\-@\t\r]/,m=>"'"+m).replaceAll('"','""')+'"';
 const header=cols.map(({survey,version,q,row,other})=>`${S[survey].short} v${version} · ${q.number??q.id.slice(1)}. ${q.title}${row?' — '+row.label:other?' — Другое (текст)':''}`);
 const data=records.map(r=>[r.id,r.createdAt,r.survey==='implementer'?'Внедрение':'Участие',versionOf(r),r.initiativeId||'',r.initiative,r.department,...cols.map(({survey,version,q,row,other})=>{
  if(r.survey!==survey||versionOf(r)!==version||!isVisible(q,r.answers))return '';
  if(row)return labelAnswer({...q,type:'scale'},r.answers[q.id]?.[row.value]);
  if(other)return r.answers[q.id]?.includes('other')?r.answers[q.otherField]||'':'';
  return labelAnswer(q,r.answers[q.id]);
 })]);
 return '\uFEFF'+[['ID','Дата UTC','Опрос','Версия анкеты','ID инициативы','Инициатива','Подразделение',...header],...data].map(row=>row.map(cell).join(';')).join('\r\n');
}
const exportRecords=records=>records.map(r=>({...r,answers:pruneAnswers(r.survey,r.answers,versionOf(r))}));
const canonical=value=>JSON.stringify(normalize(value));
function normalize(value){return Array.isArray(value)?value.map(normalize):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,normalize(value[k])])):value;}
function parseImport(json,existing=[]){
 let data;try{data=JSON.parse(json.replace(/^\uFEFF/,''));}catch{throw new Error('Не удалось прочитать JSON. Выберите файл экспорта приложения.');}
 if(data?.version!==1||!Array.isArray(data.responses)||data.responses.length>10000)throw new Error('Неподдерживаемый формат. Нужен JSON версии 1, до 10 000 ответов.');
 const merged=new Map(existing.map(r=>[r.id,r]));
 data.responses.forEach(r=>{
  validateRecord(r);
  if(merged.has(r.id)){
   const old=merged.get(r.id);
   if(versionOf(old)!==versionOf(r)||['survey','createdAt','initiative','department','initiativeId'].some(k=>(old[k]??'')!==(r[k]??''))||canonical(pruneAnswers(old.survey,old.answers,versionOf(old)))!==canonical(pruneAnswers(r.survey,r.answers,versionOf(r))))throw new Error('Найдены разные ответы с одинаковым ID. Операция отменена, исходные данные сохранены.');
  }else merged.set(r.id,{id:r.id,survey:r.survey,createdAt:r.createdAt,initiative:r.initiative,department:r.department,...(r.questionnaireVersion!==undefined?{questionnaireVersion:r.questionnaireVersion}:{}),...(r.initiativeId!==undefined?{initiativeId:r.initiativeId}:{}),answers:r.answers});
 });
 return [...merged.values()];
}
const api={versionOf,schemaFor,questions,isVisible,validAnswer,validDraftAnswer,validateStep,validateRecord,pruneAnswers,optionsFor,exclusions,aggregate,distribution,factualMetrics,initiativeMetrics,labelAnswer,toCSV,parseImport,exportRecords};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.HRCore=api;
})(globalThis);
