(function(root){
'use strict';
const C=typeof module!=='undefined'&&module.exports?require('./core.js'):root.HRCore;
const DATA_KEY='hr-feedback.responses.v1';
const BATCH_PREFIX='hr-feedback.batch.v1.';
class LocalRepository{
 constructor(storage,locks=root.window?.navigator?.locks){this.storage=storage;this.locks=locks;}
 read(){
  try{
   const raw=this.storage.getItem(DATA_KEY);
   let rows=raw===null?[]:JSON.parse(raw);
   if(!Array.isArray(rows))throw Error();
   rows.forEach(C.validateRecord);
   // The legacy collection is read-only. Each new atomic write adds an immutable
   // batch under a unique key, so a stale cross-tab snapshot cannot erase data.
   for(let i=0;i<this.storage.length;i++){
    const key=this.storage.key(i);
    if(key?.startsWith(BATCH_PREFIX))rows=C.parseImport(this.storage.getItem(key),rows);
   }
   return rows;
  }catch{throw new Error('Локальное хранилище недоступно, повреждено или содержит конфликтующие ID. Данные не перезаписаны. Проверьте разрешения браузера и сохраните резервную копию хранилища.');}
 }
 async list(){return this.read();}
 async transaction(change){
  const run=()=>{
   const rows=this.read(),merged=change(rows),ids=new Set(rows.map(r=>r.id));
   const added=merged.filter(r=>!ids.has(r.id));
   if(added.length)this.writeBatch(added);
   return added.length;
  };
  // Web Locks also serialize duplicate-ID checks where supported. Immutable
  // batches preserve independent answers even if localStorage caches lag.
  return this.locks?this.locks.request(DATA_KEY,run):run();
 }
 async save(record){C.validateRecord(record);return this.transaction(rows=>C.parseImport(JSON.stringify({version:1,responses:[record]}),rows));}
 writeBatch(rows){
  try{
   const key=BATCH_PREFIX+root.crypto.randomUUID();
   this.storage.setItem(key,JSON.stringify({version:1,responses:rows}));
  }catch{throw new Error('Не удалось сохранить ответы: хранилище браузера недоступно или заполнено. Черновик оставлен на экране.');}
 }
 async import(json){return this.transaction(rows=>C.parseImport(json,rows));}
}
function validateEndpoint(value){
 let url;try{url=new URL(value);}catch{throw new Error('Укажите полный HTTPS-адрес API, например https://survey.company.ru/api.');}
 const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
 if((url.protocol!=='https:'&&!(url.protocol==='http:'&&local))||url.username||url.password||url.search||url.hash)throw new Error('Нужен HTTPS-адрес API без логина, пароля, параметров и фрагмента. HTTP разрешён только для localhost.');
 return url.href.replace(/\/$/,'');
}
class ApiRepository{
 constructor(endpoint,fetcher=root.fetch.bind(root)){this.endpoint=validateEndpoint(endpoint);this.fetcher=fetcher;}
 async request(path,options={}){
  let response;try{response=await this.fetcher(this.endpoint+path,{...options,credentials:'include',signal:AbortSignal.timeout(15000),headers:{Accept:'application/json',...options.headers}});}catch{throw new Error('Не удалось связаться с сервером. Проверьте сеть и адрес API. Черновик сохранён, можно повторить отправку.');}
  if(response.status===401||response.status===403)throw new Error('Требуется действующая серверная сессия администратора или разрешение на эту операцию. Войдите через корпоративный сервис.');
  if(!response.ok)throw new Error('Сервер не выполнил запрос. Попробуйте позже. Ответы не считаются отправленными.');
  try{return await response.json();}catch{throw new Error('Сервер вернул некорректный JSON. Проверьте контракт API.');}
 }
 async list(){const session=await this.request('/session');if(session.role!=='admin')throw new Error('Аналитика доступна только администратору. Войдите через корпоративный сервис.');const data=await this.request('/responses');if(data.version!==1||!Array.isArray(data.responses))throw new Error('Неподдерживаемый формат ответа API.');data.responses.forEach(C.validateRecord);return data.responses;}
 async save(record){C.validateRecord(record);const data=await this.request('/responses',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':record.id},body:JSON.stringify(record)});if(data.id!==record.id)throw new Error('Сервер не подтвердил ID ответа. Повторите отправку с тем же черновиком.');}
}
const api={LocalRepository,ApiRepository,validateEndpoint,DATA_KEY,BATCH_PREFIX};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.HRStorage=api;
})(globalThis);
