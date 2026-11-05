(function(root){
'use strict';
const S=typeof module!=='undefined'&&module.exports?require('./surveys.js'):root.HRSurveys;
const questions=survey=>S[survey]?.blocks.flatMap(b=>b.questions)||[];
const isVisible=(q,answers)=>!q.hideWhen||!Array.isArray(answers[q.hideWhen.id])||!answers[q.hideWhen.id].includes(q.hideWhen.value);
function validAnswer(q,v){
 if(q.type==='text')return v===undefined||(typeof v==='string'&&v.length<=5000);
 if(q.type==='scale')return (typeof v==='number'&&Number.isInteger(v)&&v>=q.min&&v<=q.max)||(q.extra&&v===q.extra.value);
 if(q.type==='multi')return Array.isArray(v)&&v.length>0&&new Set(v).size===v.length&&v.every(x=>q.options.some(o=>o.value===x))&&!(q.exclusive&&v.includes(q.exclusive)&&v.length>1);
 return q.options.some(o=>o.value===v);
}
const validateStep=(survey,step,answers)=>S[survey].blocks[step].questions.filter(q=>isVisible(q,answers)&&!validAnswer(q,answers[q.id])).map(q=>q.id);
function validateRecord(r){
 const fail=()=>{throw new Error('Некорректная запись ответа. Импорт не выполнен.');};
 if(!r||typeof r!=='object'||!S[r.survey]||typeof r.id!=='string'||!/^[\w-]{1,100}$/.test(r.id)||typeof r.createdAt!=='string'||!Number.isFinite(Date.parse(r.createdAt))||!r.answers||typeof r.answers!=='object'||Array.isArray(r.answers))fail();
 if(!['initiative','department'].every(k=>typeof r[k]==='string'&&r[k].length<=200))fail();
 const qs=questions(r.survey);
 if(Object.keys(r.answers).some(k=>!qs.some(q=>q.id===k)))fail();
 if(qs.some(q=>isVisible(q,r.answers)&&!validAnswer(q,r.answers[q.id])))fail();
 if(qs.some(q=>r.answers[q.id]!==undefined&&!validAnswer(q,r.answers[q.id])))fail();
 return true;
}
function aggregate(records){
 const count=survey=>records.filter(r=>r.survey===survey).length;
 const mean=(survey,ids)=>{const values=records.filter(r=>r.survey===survey).flatMap(r=>ids.map(id=>r.answers[id])).filter(v=>typeof v==='number');return values.length?values.reduce((a,b)=>a+b,0)/values.length:null;};
 const scores=records.filter(r=>r.survey==='implementer').map(r=>r.answers.i19).filter(v=>typeof v==='number');
 return {counts:{implementer:count('implementer'),participant:count('participant')},usefulness:mean('implementer',['i4','i5','i6','i7','i8']),understanding:mean('participant',['p1','p2','p3']),communication:mean('participant',['p4','p5']),support:mean('participant',['p7','p8','p9']),readiness:mean('participant',['p10']),recommendation:mean('implementer',['i19']),nps:scores.length?100*(scores.filter(v=>v>=9).length-scores.filter(v=>v<=6).length)/scores.length:null,recommendations:Array.from({length:11},(_,score)=>scores.filter(v=>v===score).length)};
}
function distribution(records,survey,q){
 const options=q.options||(Array.from({length:q.max-q.min+1},(_,i)=>({value:q.min+i,label:String(q.min+i)})).concat(q.extra?[q.extra]:[]));
 const rows=records.filter(r=>r.survey===survey&&isVisible(q,r.answers)&&r.answers[q.id]!==undefined);
 return options.map(o=>({...o,count:rows.filter(r=>Array.isArray(r.answers[q.id])?r.answers[q.id].includes(o.value):r.answers[q.id]===o.value).length,total:rows.length}));
}
function labelAnswer(q,value){
 if(value===undefined)return '';
 if(Array.isArray(value))return value.map(v=>q.options.find(o=>o.value===v)?.label||'').join(' | ');
 return q.options?.find(o=>o.value===value)?.label||(q.extra?.value===value?q.extra.label:String(value));
}
function toCSV(records){
 const cols=Object.entries(S).flatMap(([survey])=>questions(survey).map(q=>({survey,q})));
 const cell=v=>'"'+String(v??'').replace(/^[\s]*[=+\-@\t\r]/,m=>"'"+m).replaceAll('"','""')+'"';
 const rows=[['ID','Дата UTC','Опрос','Инициатива','Подразделение',...cols.map(({survey,q})=>`${S[survey].short} · ${q.id.slice(1)}. ${q.title}`)],...records.map(r=>[r.id,r.createdAt,r.survey==='implementer'?'Внедрение':'Участие',r.initiative,r.department,...cols.map(({survey,q})=>r.survey===survey&&isVisible(q,r.answers)?labelAnswer(q,r.answers[q.id]):'')])];
 return '\uFEFF'+rows.map(row=>row.map(cell).join(';')).join('\r\n');
}
function parseImport(json,existing=[]){
 let data;try{data=JSON.parse(json.replace(/^\uFEFF/,''));}catch{throw new Error('Не удалось прочитать JSON. Выберите файл экспорта приложения.');}
 if(data?.version!==1||!Array.isArray(data.responses)||data.responses.length>10000)throw new Error('Неподдерживаемый формат. Нужен JSON версии 1, до 10 000 ответов.');
 const merged=new Map(existing.map(r=>[r.id,r]));
 data.responses.forEach(r=>{validateRecord(r);if(merged.has(r.id)){const old=merged.get(r.id);if(['survey','createdAt','initiative','department'].some(k=>old[k]!==r[k])||JSON.stringify(Object.entries(old.answers).sort())!==JSON.stringify(Object.entries(r.answers).sort()))throw new Error('Найдены разные ответы с одинаковым ID. Операция отменена, исходные данные сохранены.');}else merged.set(r.id,{id:r.id,survey:r.survey,createdAt:r.createdAt,initiative:r.initiative,department:r.department,answers:r.answers});});
 return [...merged.values()];
}
const api={questions,isVisible,validAnswer,validateStep,validateRecord,aggregate,distribution,labelAnswer,toCSV,parseImport};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.HRCore=api;
})(globalThis);
