/* Plain scripts intentionally support opening index.html directly (file://). */
(function(){
'use strict';
const S=HRSurveys,C=HRCore,R=HRStorage;
const app=document.getElementById('app');
const icons={
chat:'<path d="M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-7l-6 4v-4H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"/><path d="M8 9h8M8 13h5"/>',
arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>',back:'<path d="M19 12H5m5-5-5 5 5 5"/>',
check:'<path d="m5 12 4 4L19 6"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
team:'<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 4v2"/>',
route:'<rect x="3" y="3" width="6" height="6" rx="1.5"/><rect x="15" y="15" width="6" height="6" rx="1.5"/><path d="M6 9v6a3 3 0 0 0 3 3h6m-2-15h5v6m0-6-6 6"/>',
lock:'<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.1"/>',
settings:'<path d="m10 3-1 3-3 1-3 3 2 3-1 3 3 3 3-1 3 2 3-2 3-1v-4l2-3-2-3-3-1-2-3Z"/><circle cx="12" cy="12" r="3"/>',
close:'<path d="m6 6 12 12M18 6 6 18"/>',download:'<path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/>',upload:'<path d="M12 16V4m-4 4 4-4 4 4M4 16v5h16v-5"/>',
chart:'<path d="M4 3v17h17M9 16v-5m5 5V6m5 10v-8"/>',spark:'<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z"/>',refresh:'<path d="M20 7v5h-5M4 17v-5h5m-4-4a8 8 0 0 1 13-3l2 2M4 17l2 2a8 8 0 0 0 13-3"/>',shield:'<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z"/><path d="m8 12 3 3 5-6"/>'};
const icon=name=>`<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name]||icons.chat}</svg>`;
const e=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const button=(label,action,style='secondary',ico='')=>`<button class="btn btn-${style}" data-action="${action}">${ico?icon(ico):''}${label}</button>`;
const format=n=>n===null?'—':n.toLocaleString('ru-RU',{minimumFractionDigits:1,maximumFractionDigits:1});
let storage;try{storage=window.localStorage;}catch{storage=null;}
let storageWarning='';
function read(key,fallback){try{const value=storage?.getItem(key);return value?JSON.parse(value):fallback;}catch{storageWarning='Сохранённые настройки или черновик не удалось прочитать. Исходные данные не перезаписаны.';return fallback;}}
let config=read('hr-feedback.config.v1',{mode:'local',endpoint:''});
if(!config||!['local','server'].includes(config.mode))config={mode:'local',endpoint:''};
if(config.mode==='server'){try{config.endpoint=R.validateEndpoint(config.endpoint);}catch{config={mode:'local',endpoint:''};storageWarning='Адрес API в настройках некорректен. Включён локальный режим.';}}
const local=new R.LocalRepository(storage);
let view='home',active=null,records=[],loading=false,dashboardError='',problemSurvey='implementer',distSurvey='implementer',filters={initiative:'',department:''},loadId=0,busy=false,invalid=[];
let saved=true,toastTimer,corruptDraft=null;
const draftKey=survey=>`hr-feedback.draft.v1.${config.mode}.${survey}`;
const uuid=()=>rootUUID();
function rootUUID(){return typeof crypto.randomUUID==='function'?crypto.randomUUID():'r-'+Date.now().toString(36)+'-'+Array.from(crypto.getRandomValues(new Uint8Array(12)),v=>v.toString(16).padStart(2,'0')).join('');}
function repo(){return config.mode==='server'?new R.ApiRepository(config.endpoint):local;}
function toast(message){const el=document.getElementById('toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),4500);}
function saveDraft(){
 if(!active)return true;
 if(corruptDraft){saved=false;return false;}
 try{storage.setItem(draftKey(active.survey),JSON.stringify(active));saved=true;}catch{saved=false;}
 const el=document.getElementById('saved-status');if(el){el.classList.toggle('error',!saved);el.innerHTML=icon(saved?'check':'info')+(saved?'Черновик сохранён':'Черновик не сохранён');}
 return saved;
}
function startSurvey(survey){
 corruptDraft=null;
 let d=null,raw=null;
 try{
  raw=storage?.getItem(draftKey(survey));
  if(raw!==null&&raw!==undefined){
   d=JSON.parse(raw);
   if(!d||d.survey!==survey||typeof d.id!=='string'||!/^[\w-]{1,100}$/.test(d.id)||typeof d.initiative!=='string'||d.initiative.length>200||typeof d.department!=='string'||d.department.length>200||!d.answers||typeof d.answers!=='object'||Array.isArray(d.answers)||!Number.isInteger(d.step)||d.step< -1||d.step>4)throw Error();
   if(Object.keys(d.answers).some(id=>{const q=C.questions(survey).find(q=>q.id===id);return !q||!(q.type==='multi'&&Array.isArray(d.answers[id])&&d.answers[id].length===0)&&!C.validAnswer(q,d.answers[id]);}))throw Error();
  }
 }catch{corruptDraft={raw:raw||'',key:draftKey(survey)};d=null;}
 active=d||{id:uuid(),survey,step:-1,initiative:'',department:'',answers:{}};
 saved=!!storage&&!corruptDraft;invalid=[];view='survey';render();
}
function recovery(){return `<button class="breadcrumb" data-action="home">${icon('back')}К выбору опроса</button><section class="intro"><div class="card-icon">${icon('info')}</div><h1>Черновик не удалось прочитать</h1><p>Сохранённые данные повреждены или имеют неподдерживаемый формат. Мы сохранили исходный черновик без изменений. Скачайте его для восстановления или явно начните заново.</p><div class="intro-actions">${button('Скачать исходный черновик','download-draft','secondary','download')}${button('Начать заново','restart','primary','refresh')}</div></section>`;}
function shell(content){
 return `<header class="header"><div class="container header-inner"><button class="brand" data-action="home" aria-label="РТК ИТ — к опросам"><span class="brand-symbol">${icon('chat')}</span><span class="brand-word">РТК ИТ<small>ЛЮДИ И ИЗМЕНЕНИЯ</small></span><span class="brand-divider"></span><span class="brand-caption">Обратная связь<br>по пилоту в HR</span></button><div class="header-right"><nav class="nav" aria-label="Основная навигация"><button data-action="home" class="${view!=='analytics'?'active':''}" ${view!=='analytics'?'aria-current="page"':''}>Опросы</button><button data-action="analytics" class="${view==='analytics'?'active':''}" ${view==='analytics'?'aria-current="page"':''}>Аналитика</button></nav><span class="mode-badge"><span class="dot"></span>${config.mode==='local'?'Локальный режим':'Командный режим'}</span><button class="icon-btn" data-action="settings" aria-label="Настройки" title="Настройки">${icon('settings')}</button></div></div></header>
 <main id="main" tabindex="-1" class="container ${view==='home'?'home':'page'} fade-in">${storageWarning?`<div class="alert" role="alert">${e(storageWarning)}</div>`:''}${content}</main>
 <footer class="footer"><div class="container footer-inner"><span><strong>РТК ИТ</strong> &nbsp;·&nbsp; Пилот фреймворка управления изменениями в HR</span><span class="footer-right">${icon(config.mode==='local'?'lock':'shield')}${config.mode==='local'?'Данные хранятся в вашем браузере':'Ответы отправляются в настроенный API'}</span></div></footer>`;
}
function notice(){
 const text=config.mode==='local'
  ?`<strong>Сейчас включён локальный демонстрационный режим.</strong><br>Ответы сохраняются только в этом браузере.${!navigator.locks?' Не заполняйте один черновик в нескольких вкладках: браузер не поддерживает блокировку записи.':''} Для общего сбора подключите корпоративное хранилище в настройках.`
  :'<strong>Включён командный режим.</strong><br>Ответы отправляются в настроенный серверный API. Доступ к аналитике проверяет сервер; условия обработки данных определяет ваша организация.';
 return `<aside class="storage-notice">${icon('info')}<div>${text}</div><button class="inline-link" data-action="settings">${config.mode==='local'?'О хранении данных':'Настройки подключения'} ${icon('arrow')}</button></aside>`;
}
function home(){return `<section class="hero"><div><div class="eyebrow"><span class="dot"></span> ПИЛОТ В HR · ОБРАТНАЯ СВЯЗЬ</div><h1>Обратная связь<br>по внедрению<br><span>изменений</span></h1><p class="hero-desc">Помогите нам сделать изменения в HR<br class="desktop-break"> более понятными, удобными и эффективными</p><div class="hero-tags"><span>${icon('shield')}Без имени и email</span><span>${icon('clock')}Всего несколько минут</span></div></div><div class="hero-art" aria-hidden="true"><div class="orbit"></div><div class="orbit two"></div><div class="art-core">${icon('chat')}</div><div class="art-note one">${icon('check')}Ваш опыт важен</div><div class="art-note two">${icon('spark')}Улучшаем вместе</div><div class="art-spark"></div><div class="art-spark two"></div></div></section>
 <div class="section-heading"><div><h2>Какова ваша роль в изменениях?</h2><p>Выберите опрос, который подходит вашему опыту</p></div><span class="section-number">ДВА ВЗГЛЯДА · ОДНА ЦЕЛЬ</span></div>
 <section class="survey-cards" aria-label="Выбор опроса">${Object.entries(S).map(([id,s],i)=>{const draft=read(draftKey(id),null);return `<article class="survey-card"><div class="card-top"><span class="card-icon ${i?'alt':''}">${icon(i?'team':'route')}</span><span class="time">${icon('clock')}${s.time}</span></div><h3>${s.title}</h3><p>${s.description}</p><div class="card-footer"><button class="btn btn-${i?'soft':'primary'}" data-start="${id}">${draft?'Продолжить опрос':'Пройти опрос'}${icon('arrow')}</button><span class="card-detail">${C.questions(id).length} вопросов · 5 блоков</span></div></article>`;}).join('')}</section>
 ${notice()}<section class="how-it-works" aria-label="Как это работает"><div class="how-item"><span>01</span><div><strong>Поделитесь опытом</strong><p>Расскажите, как прошли изменения</p></div></div><div class="how-item"><span>02</span><div><strong>Отметьте важное</strong><p>Что помогло, а что можно упростить</p></div></div><div class="how-item"><span>03</span><div><strong>Помогите стать лучше</strong><p>Ваши ответы — основа улучшений</p></div></div></section>`;}
function intro(){const s=S[active.survey];return `<button class="breadcrumb" data-action="home">${icon('back')}К выбору опроса</button><section class="intro"><div class="eyebrow">${icon(active.survey==='implementer'?'route':'team')} ${s.time} · 5 БЛОКОВ</div><h1>${s.title}</h1><p>${s.description}.</p><div class="panel"><div class="form-field"><label class="field-label" for="initiative">Название инициативы <span class="optional">необязательно</span></label><input class="text-input" id="initiative" data-meta="initiative" maxlength="200" value="${e(active.initiative)}" placeholder="Например, новый процесс адаптации"></div><div class="form-field"><label class="field-label" for="department">Подразделение <span class="optional">необязательно</span></label><input class="text-input" id="department" data-meta="department" maxlength="200" value="${e(active.department)}" placeholder="Например, подбор персонала"></div><p class="helper">Эти поля помогут сгруппировать результаты. Можно оставить их пустыми.</p></div><div class="intro-notes"><p>${icon('check')}Оценивайте ваш реальный опыт: здесь нет правильных и неправильных ответов.</p><p>${icon('lock')}Мы не запрашиваем имя, фамилию или email. Не указывайте персональные данные в комментариях.</p><p>${icon('refresh')}Черновик сохраняется в браузере. Можно прерваться и продолжить позже.</p></div>${!storage?'<div class="alert">Браузер не разрешает локальное хранение. Черновик не сохранится после закрытия страницы.</div>':''}${notice()}<div class="intro-actions"><span class="helper">${C.questions(active.survey).length} вопросов · комментарии по желанию</span>${button('Начать опрос','begin','primary','arrow')}</div></section>`;}
function question(q){
 const v=active.answers[q.id],isInvalid=invalid.includes(q.id),number=q.id.slice(1);
 const input=(o,i,type='radio',className='option')=>`<label class="${className}" for="${q.id}-${i}"><input id="${q.id}-${i}" type="${type}" name="${q.id}" value="${e(o.value)}" ${Array.isArray(v)?v.includes(o.value)?'checked':'':v===o.value?'checked':''} ${isInvalid?'aria-invalid="true"':''} aria-describedby="${q.id}-hint${isInvalid?' '+q.id+'-error':''}"><span>${e(o.label)}</span></label>`;
 let content='';
 if(q.type==='scale'){
  content=`<div class="scale ${q.max===10?'nps':''}" role="group" aria-label="Шкала от ${q.min} до ${q.max}">${Array.from({length:q.max-q.min+1},(_,i)=>input({value:q.min+i,label:q.min+i},i,'radio','scale-option')).join('')}</div><div class="scale-labels"><span>${q.min} — ${q.labels[0]}</span><span>${q.max} — ${q.labels[1]}</span></div>${q.extra?input(q.extra,'extra','radio','option extra-option'):''}`;
 }else if(q.type==='text')content=`<textarea id="${q.id}-text" name="${q.id}" maxlength="5000" rows="3" aria-label="${e(q.title)}" placeholder="Поделитесь мыслями или приведите пример…">${e(v||'')}</textarea><div class="character-count" id="${q.id}-count">${(v||'').length} / 5000</div>`;
 else content=`<div class="options">${q.options.map((o,i)=>input(o,i,q.type==='multi'?'checkbox':'radio')).join('')}</div>`;
 return `<fieldset class="question ${isInvalid?'invalid':''}" data-question="${q.id}"><legend><span class="q-number">${number}.</span>${e(q.title)}${q.type==='text'?'<span class="optional">необязательно</span>':''}</legend><div class="question-content"><p class="question-hint" id="${q.id}-hint">${q.type==='multi'?'Можно выбрать несколько вариантов':q.type==='text'?'Ответьте, если хотите поделиться подробностями':q.type==='scale'?`Выберите оценку от ${q.min} до ${q.max}`:'Выберите один вариант'}</p>${content}${isInvalid?`<p class="field-error" id="${q.id}-error">Выберите ${q.type==='multi'?'хотя бы один вариант':'ответ'}, чтобы продолжить.</p>`:''}</div></fieldset>`;
}
function remaining(){return C.questions(active.survey).filter(q=>q.required&&C.isVisible(q,active.answers)&&!C.validAnswer(q,active.answers[q.id])).length;}
function survey(){
 if(corruptDraft)return recovery();
 if(active.step===-1)return intro();
 const s=S[active.survey],block=s.blocks[active.step];
 return `<button class="breadcrumb" data-action="home">${icon('back')}К выбору опроса</button><div class="survey-topline"><h1>${s.title}</h1><span id="saved-status" class="saved-status" role="status">${icon(saved?'check':'info')}${saved?'Черновик сохранён':'Черновик не сохранён'}</span></div><div class="survey-layout"><aside class="survey-sidebar"><div class="progress-label"><span>Блок ${active.step+1} из 5</span><span>${Math.round(active.step/5*100)}%</span></div><div class="progress-track" role="progressbar" aria-label="Прогресс опроса" aria-valuemin="0" aria-valuemax="5" aria-valuenow="${active.step}"><span style="width:${active.step/5*100}%"></span></div><ol class="steps">${s.blocks.map((b,i)=>`<li><button class="step-button ${i===active.step?'active':i<active.step?'done':''}" data-step="${i}" ${i>active.step?'disabled':''} ${i===active.step?'aria-current="step"':''} aria-label="Блок ${i+1}: ${b.title}"><span class="step-bullet">${i<active.step?icon('check'):i+1}</span><span class="step-name">${b.title}</span></button></li>`).join('')}</ol><p class="sidebar-note">Ваши ответы помогут улучшить фреймворк и поддержку команды.</p><button class="btn btn-ghost" data-action="restart">${icon('refresh')}Начать заново</button></aside><section class="survey-main"><div class="panel question-panel"><div class="block-intro"><div class="eyebrow">БЛОК 0${active.step+1} / 05</div><h2>${block.title}</h2><p>${block.description}</p></div><div class="questions">${block.questions.filter(q=>C.isVisible(q,active.answers)).map(question).join('')}</div></div><div id="submit-error" role="alert"></div><div class="survey-actions">${button('Назад','back','secondary','back')}<div><span class="remaining" id="remaining">Осталось обязательных: ${remaining()}</span>${button(active.step===4?'Отправить ответы':'Далее',active.step===4?'submit':'next','primary','arrow')}</div></div><p class="subtle-bottom">${config.mode==='local'?'Ответы будут сохранены только в этом браузере.':'Ответы будут отправлены в API вашей организации.'} Открытые комментарии необязательны.</p></section></div>`;
}
function thanks(){return `<section class="thank-you"><div class="success-art">${icon('check')}</div><div class="eyebrow" style="justify-content:center;margin-bottom:16px">ВАШ ОПЫТ ВАЖЕН</div><h1>Спасибо за обратную связь!</h1><p>Каждый ответ помогает сделать изменения в HR<br>более понятными, удобными и эффективными.</p><div class="panel">${icon(config.mode==='local'?'lock':'shield')}<div><strong>${config.mode==='local'?'Ответ сохранён в этом браузере':'Сервер подтвердил получение ответа'}</strong><p>${config.mode==='local'?'Для передачи результатов используйте экспорт в аналитике. Автоматического общего сбора в локальном режиме нет.':'Доступ к результатам предоставляется администратору через корпоративную авторизацию.'}</p></div></div>${button('К опросам','home','primary','arrow')}${config.mode==='local'?button('Посмотреть аналитику','analytics','secondary','chart'):''}</section>`;}
function selectedRecords(){return records.filter(r=>(!filters.initiative||r.initiative===filters.initiative)&&(!filters.department||r.department===filters.department));}
function bars(rows){return rows.map(row=>`<div class="bar-row"><div class="bar-meta"><span>${e(row.label)}</span><strong>${row.count} · ${row.total?Math.round(row.count/row.total*100):0}%</strong></div><div class="bar-track"><div class="bar-fill" style="width:${row.total?row.count/row.total*100:0}%"></div></div></div>`).join('');}
function analytics(){
 const rows=selectedRecords(),a=C.aggregate(rows);
 const exportActions=`<div class="export-actions">${config.mode==='local'?button('Импорт JSON','import','secondary','upload'):''}${button('Экспорт CSV','csv','secondary','download')}${button('Экспорт JSON','json','secondary','download')}</div>`;
 let content=`<div class="dashboard-top"><div><div class="eyebrow"><span class="dot"></span> АНАЛИТИКА ПИЛОТА</div><h1>Обратная связь в цифрах</h1><p>Опыт команды и участников — основа следующего шага</p></div>${!loading&&!dashboardError?exportActions:''}</div>${notice()}<input class="import-control" type="file" id="import-file" accept=".json,application/json" aria-label="Импорт результатов из JSON">`;
 if(loading)return content+'<div class="empty-state" role="status"><p>Загружаем результаты…</p></div>';
 if(dashboardError)return content+`<div class="alert" role="alert">${e(dashboardError)}</div><div class="empty-state"><div class="card-icon">${icon('lock')}</div><h2>Результаты пока недоступны</h2><p>${config.mode==='server'?'Проверьте корпоративную авторизацию и подключение к API. Пароль в этом приложении не хранится.':'Приложение не будет перезаписывать повреждённые или недоступные данные.'}</p>${button('Повторить загрузку','analytics','primary','refresh')}${button('Настройки','settings')}</div>`;
 const options=(key,label)=>`<label>${label}<select data-filter="${key}" aria-label="${label}"><option value="">Все ${key==='initiative'?'инициативы':'подразделения'}</option>${[...new Set(records.map(r=>r[key]).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ru')).map(v=>`<option value="${e(v)}" ${filters[key]===v?'selected':''}>${e(v)}</option>`).join('')}</select></label>`;
 content+=`<div class="filters">${options('initiative','Инициатива')}${options('department','Подразделение')}<span class="dashboard-count">Ответов в выборке: <strong>${rows.length}</strong></span>${filters.initiative||filters.department?button('Сбросить','reset-filters','ghost'):''}</div>`;
 const metric=(title,value,sub,key='',max)=>`<div class="metric ${key==='usefulness'?'primary':''}"><div class="metric-title">${title}</div><div class="metric-value"><span ${key?`data-metric="${key}"`:''}>${e(value)}</span>${max?`<small> / ${max}</small>`:''}</div><div class="metric-sub">${sub}</div></div>`;
 content+=`<div class="metrics">${metric('Команда внедрения',a.counts.implementer,'завершённых ответов')}${metric('Участники изменений',a.counts.participant,'завершённых ответов')}${metric('Полезность фреймворка',format(a.usefulness),'команда · вопросы 4–8','usefulness',5)}${metric('Понимание изменений',format(a.understanding),'участники · вопросы 1–3','understanding',5)}${metric('Коммуникации',format(a.communication),'участники · вопросы 4–5','communication',5)}${metric('Поддержка',format(a.support),'участники · вопросы 7–9','support',5)}${metric('Готовность к изменениям',format(a.readiness),'участники · вопрос 10','readiness',5)}${metric('Рекомендация коллегам',format(a.recommendation),'команда · вопрос 19','recommendation',10)}</div>`;
 if(!rows.length)return content+`<div class="panel full-panel empty-state"><div class="card-icon">${icon('chart')}</div><h2>${records.length?'По этим фильтрам ответов нет':'Здесь появится ваш опыт'}</h2><p>${records.length?'Попробуйте выбрать другую инициативу или подразделение.':'Пройдите один из опросов'+(config.mode==='local'?' или импортируйте JSON с ответами. Здесь отображаются только реальные данные текущего браузера.':'. В аналитике появятся ответы, доступные вашей серверной сессии.')}</p>${button(records.length?'Сбросить фильтры':'К опросам',records.length?'reset-filters':'home','primary','arrow')}</div>`;
 const problemId=problemSurvey==='implementer'?'i13':'p12',pq=C.questions(problemSurvey).find(q=>q.id===problemId);
 const problems=C.distribution(rows,problemSurvey,pq).sort((a,b)=>b.count-a.count);
 const maxRec=Math.max(...a.recommendations,1);
 const tabs=(key,current)=>`<div class="tab-row" role="group" aria-label="Аудитория">${Object.entries(S).map(([id,s])=>`<button data-${key}="${id}" class="${current===id?'active':''}" aria-pressed="${current===id}">${s.short}</button>`).join('')}</div>`;
 content+=`<div class="dashboard-grid"><section class="panel chart-panel"><h2>Что было сложным</h2><p class="helper">Доля респондентов, выбравших вариант. Можно было выбрать несколько.</p>${tabs('problem',problemSurvey)}${problems.some(p=>p.total)?bars(problems):'<p class="mini-empty">У этой аудитории пока нет ответов.</p>'}</section><section class="panel chart-panel"><h2>Готовы ли рекомендовать?</h2><p class="helper">Оценки команды внедрения по шкале от 0 до 10</p><div class="recommendation-chart" aria-label="Распределение рекомендаций">${a.recommendations.map((count,i)=>`<div class="rec-col" aria-label="${i}: ${count} ответов"><span class="rec-total">${count||''}</span><div class="rec-bar" style="height:${count/maxRec*80}px"></div><span>${i}</span></div>`).join('')}</div><div class="recommendation-foot"><div>Средняя оценка<strong>${format(a.recommendation)} <small>/ 10</small></strong></div><div>Индекс NPS<strong>${a.nps===null?'—':Math.round(a.nps)}</strong></div><div>Ответов<strong>${a.counts.implementer}</strong></div></div><p class="helper" style="margin-top:20px">NPS = % оценок 9–10 минус % оценок 0–6. Оценки 7–8 учитываются в общем числе ответов.</p><div class="alert info" style="margin-top:25px">Специальные ответы («Не применимо», «Не обращался(ась)», «Изменение ещё не запущено») не входят в средние оценки.</div></section></div>`;
 const initiatives=[...new Set(rows.map(r=>r.initiative))].sort((x,y)=>x.localeCompare(y,'ru'));
 content+=`<section class="panel full-panel"><h2>Сравнение по инициативам</h2><p class="helper">Средние оценки по шкале 1–5. Прочерк — нет числовых ответов.</p><div class="table-wrap"><table><thead><tr><th>Инициатива</th><th>Внедрение / участие</th><th>Полезность</th><th>Понимание</th><th>Коммуникации</th><th>Поддержка</th><th>Готовность</th></tr></thead><tbody>${initiatives.map(name=>{const stat=C.aggregate(rows.filter(r=>r.initiative===name));return `<tr><td>${e(name||'Без инициативы')}</td><td>${stat.counts.implementer} / ${stat.counts.participant}</td>${['usefulness','understanding','communication','support','readiness'].map(k=>`<td>${format(stat[k])}</td>`).join('')}</tr>`;}).join('')}</tbody></table></div></section>`;
 content+=`<section class="panel full-panel"><h2>Распределения ответов</h2><p class="helper" style="margin-bottom:20px">Откройте вопрос, чтобы посмотреть все варианты и количество ответов.</p>${tabs('distribution',distSurvey)}${C.questions(distSurvey).filter(q=>q.type!=='text').map(q=>`<details class="distribution-detail"><summary>${q.id.slice(1)}. ${e(q.title)}</summary>${bars(C.distribution(rows,distSurvey,q))}</details>`).join('')}</section>`;
 const comments=rows.flatMap(r=>C.questions(r.survey).filter(q=>q.type==='text'&&r.answers[q.id]?.trim()).map(q=>({r,q,text:r.answers[q.id]}))).reverse();
 content+=`<section class="panel full-panel"><h2>Голос участников <span class="optional">${comments.length} комментариев</span></h2><p class="helper">Открытые ответы без редактирования</p>${comments.length?`<div class="comment-list">${comments.map(({r,q,text})=>`<article class="comment"><div class="comment-meta"><span>${S[r.survey].short}</span><span>${e(r.initiative||'Без инициативы')}</span><span>${e(r.department)}</span></div><h3>${e(q.title)}</h3><p>${e(text)}</p></article>`).join('')}</div>`:'<p class="mini-empty">Открытых комментариев пока нет.</p>'}</section>`;
 return content;
}
function render(scroll=true){app.innerHTML=shell(view==='home'?home():view==='survey'?survey():view==='thanks'?thanks():analytics());if(scroll){window.scrollTo(0,0);document.getElementById('main').focus({preventScroll:true});}}
async function openAnalytics(){view='analytics';loading=true;dashboardError='';records=[];const id=++loadId;render();try{const result=await repo().list();if(id!==loadId)return;records=result;}catch(error){if(id!==loadId)return;dashboardError=error.message;}finally{if(id===loadId){loading=false;if(view==='analytics')render(false);}}}
function advance(){invalid=C.validateStep(active.survey,active.step,active.answers);if(invalid.length){render(false);const target=document.querySelector('.question.invalid input');target?.focus();target?.closest('.question').scrollIntoView({block:'center',behavior:'smooth'});return;}active.step++;saveDraft();render();}
async function submit(){
 if(busy)return;invalid=S[active.survey].blocks.flatMap((b,i)=>C.validateStep(active.survey,i,active.answers));
 if(invalid.length){active.step=S[active.survey].blocks.findIndex(b=>b.questions.some(q=>invalid.includes(q.id)));render();document.querySelector('.question.invalid input')?.focus();return;}
 busy=true;document.querySelectorAll('.survey-main input,.survey-main textarea').forEach(el=>el.disabled=true);const submitBtn=document.querySelector('[data-action="submit"]');submitBtn.disabled=true;submitBtn.textContent='Сохраняем…';
 const submission=active;submission.createdAt=submission.createdAt||new Date().toISOString();saveDraft();
 const answers=Object.fromEntries(C.questions(submission.survey).filter(q=>C.isVisible(q,submission.answers)&&submission.answers[q.id]!==undefined).map(q=>[q.id,submission.answers[q.id]]));
 const record={id:submission.id,survey:submission.survey,createdAt:submission.createdAt,initiative:submission.initiative.trim(),department:submission.department.trim(),answers};
 try{await repo().save(record);try{storage.removeItem(draftKey(submission.survey));}catch{}active=null;view='thanks';render();}catch(error){const el=document.getElementById('submit-error');if(el){el.className='alert';el.textContent=error.message;el.scrollIntoView({block:'center'});}else toast(error.message);}finally{busy=false;document.querySelectorAll('.survey-main input,.survey-main textarea').forEach(el=>el.disabled=false);if(submitBtn.isConnected){submitBtn.disabled=false;submitBtn.innerHTML='Отправить ответы'+icon('arrow');}}
}
function settings(){
 const dialog=document.getElementById('settings-dialog');
 dialog.innerHTML=`<div class="dialog-top"><h2 id="settings-title">Хранение ответов</h2><button class="icon-btn" data-action="close-settings" aria-label="Закрыть настройки">${icon('close')}</button></div><p>Выберите, где приложение будет сохранять завершённые ответы.</p><form id="settings-form"><label class="mode-option"><input type="radio" name="storage-mode" value="local" ${config.mode==='local'?'checked':''} aria-label="Локальный демонстрационный режим"><span><strong>Локальный демонстрационный</strong><small>Только этот браузер. Без сервера и регистрации. Доступны экспорт, импорт и локальная аналитика.</small></span></label><label class="mode-option"><input type="radio" name="storage-mode" value="server" ${config.mode==='server'?'checked':''} aria-label="Командный режим"><span><strong>Командный режим</strong><small>Подключение к корпоративному API. Сервер хранит ответы и проверяет права администратора. Готовый сервер в проект не входит.</small></span></label><div class="settings-api" id="settings-api" ${config.mode==='local'?'hidden':''}><label class="field-label" for="api-url">Адрес API</label><input class="text-input" id="api-url" placeholder="https://survey.company.ru/api" value="${e(config.endpoint||'')}" type="url"><p class="helper">Нужны HTTPS, серверная авторизация и методы /session, /responses. Инструкция подключения — в README проекта. Токены в браузер вводить не нужно.</p></div><div class="alert info">Смена режима не переносит ответы. Локальные данные и черновики остаются в браузере. Приложение не гарантирует анонимность.</div><div id="settings-error" role="alert"></div><div class="dialog-actions">${button('Отмена','close-settings')}<button type="submit" class="btn btn-primary">Сохранить настройки</button></div></form>`;
 dialog.showModal();
}
function confirmRestart(){const dialog=document.getElementById('confirm-dialog');dialog.innerHTML=`<div class="dialog-top"><h2 id="confirm-title">Начать опрос заново?</h2></div><p>Ответы в текущем черновике будут удалены. Ранее завершённые опросы сохранятся.</p><div class="dialog-actions">${button('Продолжить заполнение','cancel-restart')}${button('Начать заново','confirm-restart','primary')}</div>`;dialog.showModal();}
function download(kind){const rows=selectedRecords();const blob=new Blob([kind==='csv'?C.toCSV(rows):JSON.stringify({version:1,exportedAt:new Date().toISOString(),responses:rows},null,2)],{type:kind==='csv'?'text/csv;charset=utf-8':'application/json;charset=utf-8'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`hr-feedback-${new Date().toISOString().slice(0,10)}.${kind}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast(`Экспортировано ответов: ${rows.length}`);}
document.addEventListener('click',event=>{
 const target=event.target.closest('button');if(!target||target.disabled)return;
 if(busy){toast('Дождитесь завершения отправки.');return;}
 if(target.dataset.start){startSurvey(target.dataset.start);return;}
 if(target.dataset.step!==undefined){active.step=Number(target.dataset.step);saveDraft();invalid=[];render();return;}
 if(target.dataset.problem){problemSurvey=target.dataset.problem;render(false);return;}
 if(target.dataset.distribution){distSurvey=target.dataset.distribution;render(false);return;}
 switch(target.dataset.action){
 case 'home':view='home';++loadId;render();break;
 case 'analytics':openAnalytics();break;
 case 'settings':settings();break;
 case 'close-settings':event.preventDefault();document.getElementById('settings-dialog').close();break;
 case 'begin':active.step=0;saveDraft();render();break;
 case 'back':active.step--;invalid=[];saveDraft();render();break;
 case 'next':advance();break;
 case 'submit':submit();break;
 case 'restart':confirmRestart();break;
 case 'cancel-restart':document.getElementById('confirm-dialog').close();break;
 case 'confirm-restart':{const survey=active.survey;try{storage.removeItem(draftKey(survey));}catch{}active=null;document.getElementById('confirm-dialog').close();startSurvey(survey);saveDraft();break;}
 case 'download-draft':{const url=URL.createObjectURL(new Blob([corruptDraft.raw],{type:'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='hr-feedback-draft-recovery.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);break;}
 case 'csv':download('csv');break;
 case 'json':download('json');break;
 case 'import':document.getElementById('import-file')?.click();break;
 case 'reset-filters':filters={initiative:'',department:''};render(false);break;
 }
});
document.addEventListener('input',event=>{
 const el=event.target;
 if(el.dataset.meta&&active){active[el.dataset.meta]=el.value;saveDraft();}
 if(el.tagName==='TEXTAREA'&&active&&C.questions(active.survey).some(q=>q.id===el.name)){
  active.answers[el.name]=el.value;saveDraft();document.getElementById(el.name+'-count').textContent=`${el.value.length} / 5000`;
 }
});
document.addEventListener('change',async event=>{
 const el=event.target;
 if(el.name==='storage-mode'){document.getElementById('settings-api').hidden=el.value!=='server';return;}
 if(el.dataset.filter){filters[el.dataset.filter]=el.value;render(false);return;}
 if(el.id==='import-file'){
  const file=el.files[0];if(!file)return;
  try{if(config.mode!=='local')throw new Error('Импорт доступен только в локальном режиме.');if(file.size>5*1024*1024)throw new Error('Файл слишком большой. Максимальный размер — 5 МБ.');const count=await local.import(await file.text());await openAnalytics();toast(`Импортировано новых ответов: ${count}`);}catch(error){toast(error.message);el.value='';}return;
 }
 if(!active||!el.name||!['radio','checkbox'].includes(el.type))return;
 const q=C.questions(active.survey).find(q=>q.id===el.name);if(!q)return;
 const value=q.type==='scale'&&el.value!==q.extra?.value?Number(el.value):q.options?.find(o=>String(o.value)===el.value)?.value??el.value;
 if(q.type==='multi'){
  let values=Array.isArray(active.answers[q.id])?[...active.answers[q.id]]:[];
  values=el.checked?[...new Set([...values,value])]:values.filter(v=>v!==value);
  if(el.checked&&q.exclusive)values=value===q.exclusive?[value]:values.filter(v=>v!==q.exclusive);
  active.answers[q.id]=values;
  if(q.id==='i13'&&values.includes('none'))delete active.answers.i14;
 }else active.answers[q.id]=value;
 invalid=invalid.filter(id=>id!==q.id);saveDraft();
 if(q.type==='multi'){
  const y=window.scrollY,id=el.id;render(false);window.scrollTo(0,y);document.getElementById(id)?.focus({preventScroll:true});
 }else{
  const field=el.closest('.question');field.classList.remove('invalid');field.querySelector('.field-error')?.remove();field.querySelectorAll('[aria-invalid]').forEach(x=>x.removeAttribute('aria-invalid'));const remainingEl=document.getElementById('remaining');if(remainingEl)remainingEl.textContent=`Осталось обязательных: ${remaining()}`;
 }
});
document.addEventListener('submit',event=>{
 if(event.target.id!=='settings-form')return;event.preventDefault();
 try{
  const mode=event.target.elements['storage-mode'].value;
  const endpoint=mode==='server'?R.validateEndpoint(document.getElementById('api-url').value.trim()):config.endpoint;
  const next={mode,endpoint};storage.setItem('hr-feedback.config.v1',JSON.stringify(next));config=next;
  ++loadId;active=null;view='home';filters={initiative:'',department:''};document.getElementById('settings-dialog').close();render();toast('Настройки сохранены. Режим хранения изменён.');
 }catch(error){const el=document.getElementById('settings-error');el.className='alert';el.textContent=error.message||'Не удалось сохранить настройки.';}
});
window.addEventListener('storage',event=>{if((event.key===R.DATA_KEY||event.key?.startsWith(R.BATCH_PREFIX))&&view==='analytics'&&config.mode==='local')openAnalytics();});
render(false);
})();
