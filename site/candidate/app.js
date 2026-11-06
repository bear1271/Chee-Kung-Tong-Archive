/* CKT archive search. Catalogue text is rendered as text, never HTML. */
(async()=>{'use strict';
const $=id=>document.getElementById(id), D=window.CKT_DATA,G=window.CKT_GAZETTEER,V=window.CKT_COMPAT;
const chineseForms=__CKT_CHINESE_FORMS__;
const storageKey='ckt-interface-script';
let script='hans';
try{if(localStorage.getItem(storageKey)==='hant')script='hant';}catch{}
const literal=s=>String(s??'').normalize('NFKC').toLowerCase();
const mapCharacters=(value,table)=>value.replace(/\p{Script=Han}/gu,c=>table[c]??c);
const norm=value=>mapCharacters(literal(value),chineseForms.simplified);

// Only application labels use this converter. Source values enter as separate arguments.
const ui=value=>script==='hant'?mapCharacters(value,chineseForms.traditional)
 .replaceAll('日歷','日曆').replaceAll('鏈接','連結'):value;
function uiText(parts,...values){
 return parts.reduce((text,part,index)=>text+(index?values[index-1]:'')+ui(part),'');
}
const staticCopy=[];
const labels=document.createTreeWalker(document.documentElement,NodeFilter.SHOW_TEXT);
for(let node=labels.nextNode();node;node=labels.nextNode()){
 if(/\p{Script=Han}/u.test(node.data)&&!node.parentElement.closest('script,style,[data-source-text]')){
  const text=node.data;
  staticCopy.push(()=>{node.data=ui(text);});
 }
}
for(const node of document.querySelectorAll('[aria-label],[placeholder],[title]')){
 for(const attribute of ['aria-label','placeholder','title']){
  const text=node.getAttribute(attribute);
  if(text&&/\p{Script=Han}/u.test(text))staticCopy.push(()=>node.setAttribute(attribute,ui(text)));
 }
}
function applyScript(){
 document.documentElement.lang=script==='hant'?'zh-Hant':'zh-Hans';
 staticCopy.forEach(update=>update());
 $('interface-script').value=script;
}
applyScript();
const expectedCatalogue='__CKT_CATALOGUE_SHA__',expectedGazetteer='__CKT_GAZETTEER_SHA__';
function warn(message){const e=document.createElement('p');e.className='empty';e.id='compatibility-error';e.textContent=message;document.querySelector('main').before(e)}
function disableAll(message){warn(message);document.querySelectorAll('main button, main input, main select').forEach(e=>e.disabled=true)}
async function fingerprint(x){if(!globalThis.crypto?.subtle||!globalThis.TextEncoder)throw Error(ui('浏览器不支持离线内容校验'));const bytes=new TextEncoder().encode(JSON.stringify(x));return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('')}
$('name-tab').disabled=true;let catalogueOK=false,gazetteerOK=false,reason='';
try{if(!V||V.contract!=='ckt-content-v1'||!V.catalogue||!V.gazetteer)throw Error(ui('版本校验信息缺失或不受支持'));if(V.catalogue!==expectedCatalogue||V.gazetteer!==expectedGazetteer)throw Error(ui('数据与前端版本不一致'));if(!D||!Array.isArray(D.records)||!Array.isArray(D.cities))throw Error(ui('档案目录缺失或结构损坏'));if(await fingerprint(D)!==V.catalogue)throw Error(ui('档案目录内容与版本不一致'));catalogueOK=true;if(!G||!Array.isArray(G.names)||!Array.isArray(G.evidence)||!Array.isArray(G.records)||!Array.isArray(G.cities)||G.schema_version!=='1.0.0')throw Error(ui('地名数据缺失、损坏或契约不受支持'));if(await fingerprint(G)!==V.gazetteer)throw Error(ui('地名数据内容与版本不一致'));gazetteerOK=true}catch(e){reason=e.message||ui('数据校验失败')}
if(!catalogueOK){disableAll(reason+ui('；目录和地名检索已停用。'));return}
const cityMap=new Map(D.cities.map(c=>[c.city_id,c]));
const S={mode:'city',city:null,person:null,personVariants:false,name:null,evidencePage:0,q:'',directory:'',from:null,to:null,scope:'all',category:null,pending:true,undated:true,page:0,limit:40,sort:'source'};
function el(tag,text,cls){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;}
function badge(text){return el('span',text,'badge');}
const gOK=gazetteerOK;const nameMap=new Map(),evidenceByName=new Map(),recordMap=new Map(D.records.map(r=>[r.id,r]));
if(gOK){$('name-tab').disabled=false;for(const n of G.names)nameMap.set(n.id,n);for(const e of G.evidence){if(!evidenceByName.has(e.name_id))evidenceByName.set(e.name_id,[]);evidenceByName.get(e.name_id).push(e)}}else{warn(reason+ui('；地名写法查找已停用，目录仍可使用。'));$('name-tab').disabled=true;}
const cityNames=new Map();if(gOK)for(const n of G.names){if(!n.city_id||!['中文','拉丁字母'].includes(n.script)||/[?？]/.test(n.text)||['本埠','都城','大埠','正埠','該埠','该埠','此埠','原埠','埠'].includes(n.text))continue;const ev=evidenceByName.get(n.id)||[];if(!ev.some(e=>e.status==='catalogue_only'))continue;if(!cityNames.has(n.city_id))cityNames.set(n.city_id,[]);cityNames.get(n.city_id).push(n)}
function visibleLinks(r){return r.cities.filter(x=>S.pending||!x.pending);}
const catalogueFields = [
 ['order','档号'], ['id','内部编号'], ['title','题名／内容'], ['date','日期'],
 ['people_raw','人物'], ['organizations','团体'], ['place','地点'],
 ['note','备注'], ['category','类别'], ['copies','份数'], ['extra','补充栏'],
];
function searchableFields(r){
 const catalogue = catalogueFields.flatMap(([key,label]) =>
  [r[key]].flat().filter(Boolean).map(text => ({source:'catalogue',key,label,text,locator:'Sheet1 第 '+r.row+' 行'})));
 const library = r.links.flatMap(link => (link.text_fields||[]).map(field => ({
  source:'library',label:field.label,text:field.text,locator:link.id+' · MARC '+field.field,
  url:'https://digicoll.lib.berkeley.edu/record/'+encodeURIComponent(link.id),
 })));
 const images = r.image_excerpts.map(e => ({
  source:'image',label:'摘录',text:e.text,locator:e.image+' · '+e.location,url:e.url,
 }));
 return [...catalogue,...library,...images].map(field => ({...field,original:literal(field.text),normalized:norm(field.text)}));
}
const searchIndex=new Map(D.records.map(r=>[r.id,searchableFields(r)]));
const sourceLabel={catalogue:'工作簿目录',library:'馆方著录',image:'已核查原件片段'};
let matches=new Map();
const overlaps=([a,b],from,to)=>a<=(to??Infinity)&&b>=(from??-Infinity);
const expressionYears=e=>[Number(e.start.slice(0,4)),Number(e.end.slice(0,4))];
const timeline={year:null,mode:'year',anchor:null,doubt:false,timer:null};
const timelineDates=new Map(D.records.map(r=>[r.id,r.time.expressions.flatMap(expression=>{
 const years=expressionYears(expression);
 // An unknown century-wide digit mask is too broad for the annual axis.
 if(expression.kind==='unspecified_digits'&&years[1]-years[0]>=99)return [];
 const doubtful=!['date','range'].includes(expression.kind);
 return [{expression,years,doubtful}];
})]));
const datedYears=[...timelineDates.values()].flatMap(dates=>dates.flatMap(d=>d.years));
const firstYear=Math.min(...datedYears),lastYear=Math.max(...datedYears);
function configuredYears(){
 return [S.from??Math.min(firstYear,S.to??firstYear),S.to??Math.max(lastYear,S.from??lastYear)];
}
function playbackBounds(){
 const [start,end]=configuredYears();
 return [timeline.mode==='cumulative'&&timeline.anchor!==null?Math.max(start,Math.min(end,timeline.anchor)):start,end];
}
function dateBounds(){
 if(timeline.year===null)return [S.from,S.to];
 const start=timeline.mode==='cumulative'?playbackBounds()[0]:timeline.year;
 return [start,timeline.year];
}
function frameDate(r,bounds,firmOnly=false){
 return timelineDates.get(r.id).find(d=>
  (!d.doubtful||(!firmOnly&&timeline.doubt))&&overlaps(d.years,...bounds));
}
function renderTimeline(bounds){
 const [start,end]=playbackBounds(),active=timeline.year!==null;
 const slider=$('timeline-slider'),year=$('timeline-year');
 for(const input of [slider,year]){input.min=start;input.max=end;input.value=timeline.year??start;}
 slider.setAttribute('aria-valuetext',active?timeline.year+ui(' 年'):ui('区间总览，可选择年份'));
 const cumulative=timeline.mode==='cumulative';
 const [rangeStart,rangeEnd]=configuredYears(),anchor=$('timeline-anchor');
 anchor.min=rangeStart;anchor.max=rangeEnd;anchor.value=timeline.anchor===null?'':start;
 $('timeline-origin-label').hidden=!cumulative;
 $('timeline-anchor-label').hidden=!cumulative||timeline.anchor===null;
 $('timeline-origin').value=timeline.anchor===null?'range':'custom';
 $('timeline-settings-range').textContent=ui('设定区间 ')+rangeStart+'–'+rangeEnd+ui(' 年')+(cumulative?ui(' · 累计起点 ')+start+ui(' 年'):'');
 $('timeline-play').textContent=timeline.timer===null?ui('播放'):ui('暂停');
 $('timeline-overview').disabled=!active;
 $('timeline-prev').disabled=!active||timeline.year===start;
 $('timeline-next').disabled=active&&timeline.year===end;
 $('undated').disabled=active;
 $('pending-label').textContent=active?ui('显示待核查地点'):ui('显示待核查地点与日期');
 const frame=active?(timeline.mode==='cumulative'?bounds[0]+'–'+bounds[1]+ui(' 年累计'):timeline.year+ui(' 年')):ui('区间总览');
 const doubt=timeline.doubt?ui('已加入有疑问的日期'):ui('有疑问的日期已隐藏');
 $('timeline-status').textContent=frame+ui(' · 播放范围 ')+start+'–'+end+ui(' 年')+(active?' · '+doubt:'');
}
function matchingDate(r,bounds){
 if(timeline.year!==null)return frameDate(r,bounds)?.expression;
 return r.time.expressions.find(e=>overlaps(expressionYears(e),...bounds));
}
function dateFilter(r,bounds){
 if(timeline.year!==null)return Boolean(frameDate(r,bounds));
 if(!S.pending&&r.time.pending&&r.time.status!=='unknown')return false;
 return r.time.intervals.length ? r.time.intervals.some(range=>overlaps(range,...bounds)) : S.undated;
}
function baseFilter(r,query,bounds){
 if(!dateFilter(r,bounds))return false;
 if(!query.raw)return true;
 const hits=[];
 for(const field of searchIndex.get(r.id)){
  if(S.scope==='identifier'){
   if(['order','id'].includes(field.key)&&field.original===query.raw)hits.push(field);
   continue;
  }
  if(S.scope!=='all'&&field.source!==S.scope)continue;
  if(field.original.includes(query.raw))hits.push(field);
  else if(field.normalized.includes(query.folded))hits.push({...field,formMatch:true});
 }
 if(hits.length)matches.set(r.id,hits.sort((a,b)=>Number(Boolean(a.formMatch))-Number(Boolean(b.formMatch))));
 return hits.length>0;
}
function hitLabel(hit,translate=ui){
 const form=hit.formMatch?translate(' · 简繁字形匹配'):'';
 return translate(sourceLabel[hit.source])+' · '+translate(hit.label)+' · '+hit.locator+form;
}
function hitPreview(hit){
 if(hit.text.length<=180)return hit.text;
 const index=hit.formMatch?hit.normalized.indexOf(norm(S.q.trim())):hit.original.indexOf(literal(S.q.trim()));
 const start=Math.max(0,index-45);
 return (start?'…':'')+hit.text.slice(start,start+180)+(start+180<hit.text.length?'…':'');
}
function hitDetail(hit){
 const text=hitLabel(hit)+' — '+hit.text;
 if(!hit.url)return el('div',text);
 const row=el('div',text+' '),link=el('a',ui('查看出处 ↗'));
 link.href=hit.url;link.target='_blank';link.rel='noopener';row.append(link);
 return row;
}
function personMatches(r){
 if(!S.person)return true;
 return S.personVariants?norm(r.people_raw).includes(norm(S.person)):r.people_raw.includes(S.person);
}
function selectedFilter(r,nameSet){return (!S.name||nameSet.has(r.id))&& (!S.city||visibleLinks(r).some(x=>x.id===S.city))&&personMatches(r);}
let filtered=[],mapReady=false,mapGroup,mapSvg,projection,zoom;
function nameRecords(){const out=new Set();for(const e of evidenceByName.get(S.name)||[])if(S.pending||e.status==='catalogue_only')out.add(e.record_id);return out;}
function chooseCity(id){S.name=null;S.city=id;S.page=0;render();}
function choosePerson(name,variants=false){S.person=name;S.personVariants=variants;S.page=0;render();}
// Browse labels group equivalent catalogue spellings; the source category stays on each record.
const categoryAliases=new Map([
 ['通信',['correspondence','信']],
 ['账单与收据',['bills & receipts']],
 ['其他组织类资料',['others']],
 ['照片',['photographs','photographs (print)','phhotographs']],
 ['出版物与印刷品',['publications and printed materials']],
 ['账簿与会计记录',['ledgers & account books']],
 ['会务通知与会议记录',['tong notices, conference/minutes','tong notices, conference/meetings','tong notices, conference.minutes']],
 ['捐赠记录与致谢',['donor records, acknowledgement, etc.']],
 ['会员资料',['membership documents']],
 ['电报',['telegrams','telegram']],
 ['注册文件与章程',['articles of incorporation, registration, regulations,etc.',
  'article of incorporation, registration, regulations, etc.','article of incorporation, registration, regulationss, etc.']],
 ['名录',['directories','directory']],
 ['图像与书法等',['graphics, calligraphy, etc.']],
 ['书法',['calligraphy']],
 ['杂项',['miscellaneous']],
].flatMap(([label,values])=>values.map(value=>[value,label])));
function browseCategory(raw){
 const key=raw.trim().toLowerCase().replace(/^o-\s*/, '');
 return key?(categoryAliases.get(key)||'类别待核对'):'类别未注明';
}
function render(){
 const query={raw:literal(S.q.trim()),folded:norm(S.q.trim())},bounds=dateBounds();
 matches=new Map();
 const base=D.records.filter(r=>baseFilter(r,query,bounds)),nameSet=S.name?nameRecords():null;
 filtered=base.filter(r=>(S.category===null||S.category===browseCategory(r.category))&&selectedFilter(r,nameSet));
 if(S.sort==='date'){
  const dates=new Map(filtered.map(r=>[r.id,matchingDate(r,bounds)?.start||'']));
  filtered.sort((a,b)=>{
   const x=dates.get(a.id),y=dates.get(b.id);
   return (x===y?0:!x?1:!y?-1:x<y?-1:1)||a.row-b.row;
  });
 }
 const maxPage=Math.max(0,Math.ceil(filtered.length/40)-1);S.page=Math.min(S.page,maxPage);
 $('city-tab').setAttribute('aria-pressed',S.mode==='city');$('name-tab').setAttribute('aria-pressed',S.mode==='name');$('person-tab').setAttribute('aria-pressed',S.mode==='person');$('all-tab').setAttribute('aria-pressed',S.mode==='all');
 $('directory-title').textContent=S.mode==='person'?ui('人物姓名'):S.mode==='all'?ui('目录类别'):S.mode==='name'?ui('地名写法'):ui('城市');
 $('directory-search').placeholder=S.mode==='person'?ui('输入姓名或原目录中的写法'):S.mode==='name'?ui('查找目录写法'):ui('查找城市名称');
 $('directory-search').disabled=S.mode==='all';
 $('directory-search').hidden=S.mode==='all';
 $('directory-note').textContent=S.mode==='person'?ui('点选姓名按该写法筛选；输入可查简繁字形。相近写法不表示同一人物。'):S.mode==='all'?ui('按目录类别浏览。详情与导出保留类别原文。'):S.mode==='name'?ui('右侧数字是全部来源的去重档案数；选中后显示当前筛选结果。'):ui('数量为相关目录记录数，包含所选待核查资料。');
 $('heading').textContent=S.person?ui('与所选姓名相关档案中的地点'):S.city?cityMap.get(S.city).name_zh:ui('档案涉及的城市');
 const facets=[S.city?ui('城市：')+cityMap.get(S.city).name_zh:'',S.person?(S.personVariants?ui('姓名字形检索：'):ui('姓名写法：'))+S.person:'',S.name?ui('地名写法：')+nameMap.get(S.name)?.text:'',S.category!==null?ui('类别：')+ui(S.category):''].filter(Boolean);
 $('selection').textContent=facets.join(' · ')||ui('点击城市查看相关档案。');
 $('clear-selection').hidden=!facets.length;
 const dateLabel=timeline.year!==null?(timeline.mode==='cumulative'?bounds.join('–')+ui(' 年累计'):timeline.year+ui(' 年')):
  S.from!==null||S.to!==null?(S.from??ui('不限'))+'–'+(S.to??ui('不限'))+ui(' 年'):'';
 const filters=[S.q.trim()?ui('关键词「')+S.q.trim()+'」':'',S.scope!=='all'?$('search-scope').selectedOptions[0].textContent:'',dateLabel,...facets].filter(Boolean);
 $('active-filter-text').textContent=filters.length?filters.join(' · '):ui('全部目录');
 $('show-records').textContent=ui('目录 · ')+filtered.length.toLocaleString();
 renderTimeline(bounds);renderDirectory(base,nameSet);renderRecords(bounds);renderNameEvidence();if(mapReady)drawMap();
 $('result-count').textContent='· '+filtered.length.toLocaleString()+ui(' 条');
 const pendingCount=filtered.filter(r=>(timeline.year===null?r.time.pending:!frameDate(r,bounds,true))||visibleLinks(r).some(x=>x.pending)).length;
 const mappedCount=filtered.filter(r=>visibleLinks(r).length).length;
 const datedCount=filtered.filter(r=>matchingDate(r,bounds)).length;
 $('result-note').textContent=uiText`当前 ${filtered.length.toLocaleString()} 条目录记录，其中 ${pendingCount.toLocaleString()} 条含待核查地点或日期。可按年定位 ${datedCount.toLocaleString()} 条，当前有地图点 ${mappedCount.toLocaleString()} 条。${S.person?ui('当前按原文查找姓名写法，结果不表示同一人物。'):''}`;
 $('page').textContent=filtered.length?`${S.page+1} / ${maxPage+1}`:'0 / 0';$('prev').disabled=S.page===0;$('next').disabled=S.page===maxPage;
}
function renderDirectory(base,nameSet){const box=$('directory-list');box.replaceChildren();let entries=[];
 if(S.mode==='name'){
  const q=norm(S.directory); if(q) entries=[...nameMap.values()].filter(n=>norm(n.text).includes(q)).map(n=>({name:n.text,sub:(n.city_id?(cityMap.get(n.city_id)?.name_zh||n.city_id):ui('尚无城市对应'))+' · '+ui(n.script)+' · '+(n.status==='verified'?ui('名称已核实'):n.status==='disputed'?ui('名称存在争议'):ui('名称尚未历史核实')),count:new Set((evidenceByName.get(n.id)||[]).map(e=>e.record_id)).size,active:S.name===n.id,select:()=>{S.name=n.id;S.city=null;S.page=0;S.evidencePage=0;render();}}));
 }else if(S.mode==='person'){
  const counts=new Map();for(const r of base.filter(r=>!S.city||visibleLinks(r).some(x=>x.id===S.city)))for(const n of r.names)counts.set(n,(counts.get(n)||0)+1);
  entries=[...counts].filter(([n])=>norm(n).includes(norm(S.directory))).sort((a,b)=>b[1]-a[1]).map(([name,count])=>({name,count,select:()=>choosePerson(name),active:S.person===name&&!S.personVariants}));
  if(S.directory.trim()){const b=el('button',ui('按人物原文检索“')+S.directory+'”','directory-item');b.onclick=()=>choosePerson(S.directory.trim(),true);box.append(b);}
 }else if(S.mode==='city'){
  const counts=new Map();for(const r of base.filter(personMatches))for(const x of visibleLinks(r))counts.set(x.id,(counts.get(x.id)||0)+1);
  entries=[...counts].map(([id,count])=>({city:cityMap.get(id),count,id})).filter(x=>norm(x.city.name_zh+' '+x.city.name_local).includes(norm(S.directory))||(S.directory&& (cityNames.get(x.id)||[]).some(n=>norm(n.text).includes(norm(S.directory))))).sort((a,b)=>b.count-a.count).map(x=>({name:x.city.name_zh,sub:x.city.name_local+' · '+x.city.country+(S.directory?((cityNames.get(x.id)||[]).filter(n=>norm(n.text).includes(norm(S.directory))).slice(0,3).map(n=>ui(' · 目录写法：')+n.text+ui('（据目录对应，待历史核实）')).join('')):''),count:x.count,select:()=>chooseCity(x.id),active:S.city===x.id}));
 }else{
  const counts=new Map();for(const r of base.filter(r=>selectedFilter(r,nameSet))){
   const label=browseCategory(r.category);
   counts.set(label,(counts.get(label)||0)+1);
  }
  entries=[...counts].sort((a,b)=>b[1]-a[1]).map(([name,count])=>({name:ui(name),count,active:S.category===name,select:()=>{S.category=S.category===name?null:name;S.page=0;render();}}));
 }
 for(const x of entries.slice(0,S.limit)){if(S.mode==='person')x.count=base.filter(r=>(!S.city||visibleLinks(r).some(x=>x.id===S.city))&&r.people_raw.includes(x.name)).length;const b=el('button',undefined,'directory-item'+(x.active?' active':''));const label=el('span',x.name);if(x.sub)label.append(el('small',x.sub));b.append(label,el('span',x.count.toLocaleString(),'number'));b.onclick=x.select;box.append(b);}
 $('more-directory').hidden=entries.length<=S.limit;
}
function renderNameEvidence(){const box=$('name-evidence');box.replaceChildren();box.hidden=!S.name;if(!S.name)return;const n=nameMap.get(S.name),visible=new Set(filtered.map(r=>r.id));const ev=(evidenceByName.get(S.name)||[]).filter(e=>visible.has(e.record_id)&&(S.pending||e.status==='catalogue_only'));box.append(el('h2',ui('目录写法：')+n.text),el('p',ui('此写法的实际出处：')+visible.size+ui(' 条档案，')+ev.length+ui(' 条出处。')+(n.status==='verified'?ui('该名称已记录核查判断。'):n.status==='disputed'?ui('该名称存在争议。'):ui('目录写法尚未独立核实为历史名称。'))+ui('目录日期不代表名称使用时期。'),'muted'));if(!n.city_id||n.script==='中文名称片段'||n.script==='括注外文整段'||['本埠','都城','大埠','正埠','該埠','该埠','此埠','原埠','埠'].includes(n.text))box.append(el('p',ui('此项可能是片段、相对指称、括注整段或未对应城市，仅按原记录语境查看，不作为通用城市别名。'),'muted'));if(n.city_id){const city=el('button',ui('查看该城市全部关联档案'));city.onclick=()=>chooseCity(n.city_id);box.append(city)}S.evidencePage=Math.min(S.evidencePage,Math.max(0,Math.ceil(ev.length/40)-1));for(const e of ev.slice(S.evidencePage*40,S.evidencePage*40+40)){const r=recordMap.get(e.record_id),item=el('article',undefined,'record');item.append(el('p',ui('名称原文：')+n.text+ui('；档号：')+e.archive_number+ui('；目录第 ')+e.source_row+ui(' 行；日期原文：')+(e.date_raw||ui('不详'))),el('p',ui('地点整格原文：')+e.place_raw),el('p',ui('对应依据：')+e.basis),el('p',ui('目录证据：')+e.source_status+(e.disagreement?ui('；原件差异：')+e.disagreement:'')));if(r){const b=el('button',ui('查看档案详情'));b.onclick=()=>detail(r);item.append(b)}box.append(item)}if(ev.length>40){const prev=el('button',ui('上一组出处')),next=el('button',ui('下一组出处'));prev.disabled=S.evidencePage===0;next.disabled=(S.evidencePage+1)*40>=ev.length;prev.onclick=()=>{S.evidencePage--;renderNameEvidence()};next.onclick=()=>{S.evidencePage++;renderNameEvidence()};box.append(prev,el('span',ui(' 第 ')+(S.evidencePage+1)+' / '+Math.ceil(ev.length/40)+ui(' 组 ')),next)}}
function renderRecords(bounds){const box=$('results');box.replaceChildren();if(!filtered.length){box.append(el('p',ui('当前条件下没有目录记录。可调整筛选条件，或返回区间总览。'),'empty'));return;}
 let group;
 for(const r of filtered.slice(S.page*40,S.page*40+40)){
  if(S.sort==='date'){
   const year=matchingDate(r,bounds)?.start.slice(0,4)||'';
   if(year!==group){
    group=year;
    box.append(el('h3',year?year+ui(' · 按相交日期起点分组'):ui('未能定位到年份'),'muted'));
   }
  }
  const item=el('article',undefined,'record'),top=el('div',undefined,'record-top'),button=el('button',r.title||ui('（原目录未注明题名）'),'record-title');
  button.onclick=()=>detail(r);
  top.append(button,el('span',r.order,'code'),el('span',r.date||ui('日期不详'),'code'));
  if(r.time.pending)top.append(badge(ui(r.time.label)));
  item.append(top);
  item.dataset.recordId=r.id;
  const hits=matches.get(r.id)||[];
  if(hits.length){
   const hit=hits[0],summary=el('div',undefined,'fields hit-summary');
   summary.append(el('strong',hitLabel(hit)),el('div',hitPreview(hit)));
   if(hits.length>1)summary.append(el('div',ui('另有 ')+(hits.length-1)+ui(' 项命中，见档案详情。'),'record-more'));
   item.append(summary);
  }
  const places=el('div',undefined,'fields');places.append(el('span',r.place||ui('地点未注明'),'value'));if(r.cities.some(x=>x.pending))places.append(badge(ui('地点待核查')));if(!r.cities.length)places.append(badge(ui('尚未落点')));item.append(places);
  if(r.people_raw){const text=r.people_raw.length>100?r.people_raw.slice(0,100)+'…':r.people_raw;item.append(el('div',text,'fields'));}
  box.append(item);
 }
}
function detail(r){stopPlayback();renderTimeline(dateBounds());$('detail-title').textContent=r.title||ui('档案详情');
 $('detail-id').textContent=r.order+' · '+r.id;
 const box=$('detail-body');box.replaceChildren();
 let section=box;
 const group=title=>{section=el('section',undefined,'detail-section');section.append(el('h3',title));box.append(section);};
 const field=(name,content)=>{const row=el('div',undefined,'detail-field'),value=el('div');if(typeof content==='string')value.textContent=content||ui('未注明');else value.append(content);row.append(el('strong',name),value);section.append(row);};
 const hits=matches.get(r.id)||[];
 if(hits.length){const panel=el('div');hits.forEach(hit=>panel.append(hitDetail(hit)));field(ui('检索命中'),panel);}
 if(r.original_review_note)field(ui('原件核查提示'),r.original_review_note);
 group(ui('工作簿目录'));
 field(ui('日期原文'),r.date);
 if(r.time.expressions.length){
  const list=el('div');
  const kinds={date:ui('目录日期'),range:ui('目录范围'),uncertain:ui('原文存疑'),unspecified_digits:ui('年份数字未定'),unspecified_components:ui('部分日期未定'),uncertain_range:ui('范围待核查')};
  for(const part of r.time.expressions){
   const bounds=part.start===part.end?part.start:part.start+ui(' 至 ')+part.end;
   list.append(el('div',part.raw+' · '+kinds[part.kind]+' · '+bounds));
  }
  field(ui('日期检索范围'),list);
 }
 if(r.time.unresolved.length)field(ui('未解析日期片段'),r.time.unresolved.join('／'));if(r.time.pending)field(ui('日期说明'),ui(r.time.label)+ui('。原文保留；年份范围仅用于检索，不代表连续活动。'));field(ui('地点原文'),r.place);
 const locations=el('div');for(const x of r.cities){const c=cityMap.get(x.id);const b=el('button',c.name_zh+(x.pending?ui(' · 待核查'):''),'city-link');b.onclick=()=>{$('detail').close();chooseCity(x.id);};locations.append(b,el('div',x.pending?ui('暂作地点候选，原目录中的疑问保留。'):ui('据目录地点对应，使用城市级代表点。'),'muted'));}if(!r.cities.length)locations.textContent=ui('尚未对应到城市；原地点信息仍可检索。');field(ui('城市对应'),locations);

 if((r.place_mentions||[]).length){const parts=el('details');parts.append(el('summary',ui('查看逐项地点对应依据')));for(const m of r.place_mentions){const ids=m.city_id?[m.city_id]:m.candidate_ids;const names=ids.map(id=>cityMap.get(id)?.name_zh||id).join('／');const p=el('p');p.textContent=ui('规范化识别片段：')+m.fragment+' → '+(names||ui('尚未对应'))+'；'+(m.source_uncertain?ui('原文有疑问；'):'')+(m.city_id?ui('据目录对应'):ui('候选之一，未确认'))+'。'+m.reason;parts.append(p);}parts.append(el('p',ui('识别片段经过文字规范化，完整原文见地点字段。同一片段的多个候选互为备选；不据排列顺序推断方向，不把目录日期逐一配给地点。')));field(ui('逐项地点'),parts);}
 if(new Set((r.cities||[]).map(x=>x.id)).size>1)field(ui('地点关系'),ui('本档案关联多个地点；各地在事件中的角色、先后和方向尚未核实，不表示人物行程。'));
 field(ui('人物原文'),r.people_raw);if(/[?？]/.test(r.people_raw))field(ui('人物说明'),ui('原目录含疑问字或疑问标记，保留待核查。'));const people=el('div');for(const n of r.names.slice(0,100)){const b=el('button',n,'person-link');b.onclick=()=>{$('detail').close();S.mode='person';choosePerson(n);};people.append(b);}if(r.names.length>100)people.append(el('p',ui('更多姓名请在人物原文中检索。')));if(r.names.length)field(ui('姓名写法'),people);
 field(ui('团体名称'),r.organizations);field(ui('题名／内容'),r.title);field(ui('类别原文'),r.category);field(ui('份数原文'),r.copies);field(ui('备注'),r.note);if(r.extra.length)field(ui('补充备注'),r.extra.join('\n'));
 field(ui('目录来源'),D.source.catalogue+ui(' · Sheet1 第 ')+r.row+ui(' 行'));
 group(ui('馆方记录与原件核查'));
 const originals=el('div');for(const link of r.links){const a=el('a',uiText`查看馆方原件 · ${link.id}（文件清单 ${link.files} 项）`);a.href='https://digicoll.lib.berkeley.edu/record/'+encodeURIComponent(link.id);a.target='_blank';a.rel='noopener';originals.append(a,el('br'));if(link.status!=='identifier_candidate')originals.append(badge(ui('档号对应待核查')));}if(!r.links.length){const a=el('a',ui('在馆方检索此档号'));a.href='https://digicoll.lib.berkeley.edu/search?p='+encodeURIComponent(r.order);a.target='_blank';a.rel='noopener';originals.append(el('p',ui('尚未找到唯一的线上对应。')),a);}field(ui('原件访问'),originals);
 const indexed=searchIndex.get(r.id);
 for(const [label,source] of [[ui('馆方著录（按档号候选对应）'),'library'],[ui('已核查原件片段'),'image']]){
  const fields=indexed.filter(f=>f.source===source);
  if(!fields.length)continue;
  const list=el('details');list.append(el('summary',ui('查看 ')+fields.length+ui(' 个字段或片段')));
  fields.forEach(hit=>list.append(hitDetail(hit)));field(label,list);
 }
 $('detail').showModal();$('detail').scrollTop=0;
}
function drawMap(){const svg=$('map'),w=svg.clientWidth,h=svg.clientHeight;if(!w||!h)return;mapSvg.attr('viewBox',[0,0,w,h]);projection.fitExtent([[18,20],[w-18,h-15]],{type:'Sphere'});mapGroup.selectAll('.land').attr('d',d3.geoPath(projection));
 const groups=new Map(),bounds=dateBounds();
 for(const r of filtered){
  const doubtful=timeline.year!==null&&!frameDate(r,bounds,true);
  for(const x of visibleLinks(r)){
   if(!groups.has(x.id))groups.set(x.id,{id:x.id,normal:new Set(),pending:new Set()});
   groups.get(x.id)[x.pending||doubtful?'pending':'normal'].add(r.id);
  }
 }
 const data=[...groups.values()].map(g=>({...g,city:cityMap.get(g.id)}));
 const points=mapGroup.selectAll('g.city').data(data,d=>d.id).join(enter=>{const g=enter.append('g').attr('class','city');g.append('circle');g.append('title');g.append('text');return g;});
 points.attr('transform',d=>'translate('+projection([d.city.lon,d.city.lat])+')');
 points.select('circle').attr('r',d=>S.city===d.id?10:Math.min(9,3+Math.log2(d.normal.size+d.pending.size+1)*.55)).attr('fill',d=>d.normal.size?'#216858':'#faf9f5').attr('fill-opacity',d=>d.normal.size?.82:1).attr('stroke',d=>d.pending.size?'#a76a16':'#faf9f5').attr('stroke-width',d=>S.city===d.id?3:1.5).attr('stroke-dasharray',d=>d.normal.size?null:'3 2').attr('role','button').attr('tabindex',0).attr('aria-label',d=>d.city.name_zh+'，'+d.normal.size+ui('条据目录对应，')+d.pending.size+ui('条待核查')).on('click',(e,d)=>chooseCity(d.id)).on('keydown',(e,d)=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();chooseCity(d.id);}});
 points.select('title').text(d=>d.city.name_zh+' / '+d.city.name_local+ui('\n据目录对应 ')+d.normal.size+ui(' 条；待核查 ')+d.pending.size+ui(' 条'));
 points.select('text').attr('x',12).attr('y',4).text(d=>S.city===d.id?d.city.name_zh:'');
}
function exportCSV(){const rows=[['内部记录编号','档号','题名／内容','日期原文','日期状态','地点原文','人物原文','团体名称','类别','备注','线上记录','命中来源']];for(const r of filtered)rows.push([r.id,r.order,r.title,r.date,r.time.label,r.place,r.people_raw,r.organizations,r.category,r.note,r.links.map(x=>'https://digicoll.lib.berkeley.edu/record/'+x.id).join(' '),(matches.get(r.id)||[]).map(hit=>hitLabel(hit,text=>text)).join('｜')]);const safe=v=>{let s=String(v??'');if(/^[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};const blob=new Blob(['\ufeff'+rows.map(r=>r.map(safe).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});const a=el('a');a.href=URL.createObjectURL(blob);const [from,to]=dateBounds();
 const suffix=timeline.year===null?'当前目录':from===to?to+'年':from+'–'+to+'年累计';
 a.download='致公堂档案_'+suffix+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),60000);}
for(const [id,mode] of [['city-tab','city'],['name-tab','name'],['person-tab','person'],['all-tab','all']])$(id).onclick=()=>{S.mode=mode;S.directory='';S.limit=40;$('directory-search').value='';render();};
$('coverage-note').textContent=ui('索引覆盖 ')+D.source.coverage.records.toLocaleString()+ui(' 条目录记录，其中 ')+D.source.coverage.library_records.toLocaleString()+ui(' 条含馆方著录，')+D.source.coverage.image_excerpt_records.toLocaleString()+ui(' 条含已核查原件片段。');
$('search-scope').onchange=()=>{S.scope=$('search-scope').value;S.page=0;render();};
$('query').oninput=()=>{S.q=$('query').value;S.page=0;render();};$('directory-search').oninput=()=>{S.directory=$('directory-search').value;S.limit=40;render();};
for(const id of ['from','to'])$(id).onchange=()=>{const inputs=[$('from'),$('to')];
 inputs.forEach(input=>input.setCustomValidity(''));
 const invalid=inputs.find(input=>!input.validity.valid);
 if(invalid){invalid.reportValidity();return;}
 const [a,b]=inputs.map(input=>input.value===''?null:Number(input.value));
 if(a!==null&&b!==null&&a>b){$(id).setCustomValidity(ui('起始年不能晚于结束年'));$(id).reportValidity();return;}stopPlayback();S.from=a;S.to=b;
 if(timeline.anchor!==null){
  const [start,end]=configuredYears();
  timeline.anchor=Math.max(start,Math.min(end,timeline.anchor));
 }
 if(timeline.year!==null)timeline.year=clampTimelineYear(timeline.year);
 S.page=0;render();};
function setView(view){
 $('archive-grid').dataset.view=view;
 $('show-records').setAttribute('aria-pressed',view==='records');
 $('show-map').setAttribute('aria-pressed',view==='map');
 if(view==='records'){stopPlayback();renderTimeline(dateBounds());}
}
$('show-records').onclick=()=>setView('records');
$('show-map').onclick=()=>setView('map');
$('edit-range').onclick=()=>{
 $('filter-options').open=true;
 $('from').focus();
};
function stopPlayback(){
 if(timeline.timer!==null){clearInterval(timeline.timer);timeline.timer=null;}
}
function clampTimelineYear(year){
 const [start,end]=playbackBounds();
 return Math.max(start,Math.min(end,year));
}
function goToTimelineYear(year){
 stopPlayback();timeline.year=clampTimelineYear(year);S.page=0;render();
}
function timelineOverview(){
 stopPlayback();timeline.year=null;S.page=0;
}
$('timeline-slider').oninput=e=>goToTimelineYear(e.target.valueAsNumber);
$('timeline-year').onchange=e=>goToTimelineYear(Number.isInteger(e.target.valueAsNumber)?e.target.valueAsNumber:timeline.year??playbackBounds()[0]);
$('timeline-prev').onclick=()=>goToTimelineYear(timeline.year-1);
$('timeline-next').onclick=()=>goToTimelineYear(timeline.year===null?playbackBounds()[0]:timeline.year+1);
$('timeline-overview').onclick=()=>{timelineOverview();render();};
$('timeline-doubt').onchange=e=>{timeline.doubt=e.target.checked;S.page=0;render();};
$('timeline-mode').onchange=e=>{
 stopPlayback();timeline.mode=e.target.value;
 if(timeline.year!==null)timeline.year=clampTimelineYear(timeline.year);
 if(timeline.mode==='cumulative')$('playback-settings').open=true;
 S.page=0;render();
};
for(const id of ['from','to','timeline-year','timeline-anchor'])$(id).onfocus=()=>{
 if(timeline.timer!==null){stopPlayback();renderTimeline(dateBounds());}
};
function setCumulativeAnchor(year){
 stopPlayback();
 const [start,end]=configuredYears();
 timeline.anchor=year===null?null:Math.max(start,Math.min(end,year));
 if(timeline.year!==null)timeline.year=clampTimelineYear(timeline.year);
 S.page=0;render();
}
$('timeline-origin').onchange=e=>{
 setCumulativeAnchor(e.target.value==='custom'?timeline.year??configuredYears()[0]:null);
 if(timeline.anchor!==null)$('timeline-anchor').focus();
};
$('timeline-anchor').onchange=e=>{
 const year=e.target.valueAsNumber;
 setCumulativeAnchor(Number.isInteger(year)?year:timeline.anchor);
};
$('timeline-play').onclick=()=>{
 if(timeline.timer!==null){stopPlayback();renderTimeline(dateBounds());return;}
 const [start,end]=playbackBounds();
 if(timeline.year===null||timeline.year===end)timeline.year=start;
 if(start<end)timeline.timer=setInterval(()=>{
  timeline.year++;
  if(timeline.year>=end)stopPlayback();
  S.page=0;render();
 },850);
 S.page=0;render();
};
$('pending').onchange=()=>{S.pending=$('pending').checked;S.page=0;render();};$('undated').onchange=()=>{S.undated=$('undated').checked;S.page=0;render();};$('sort').onchange=()=>{S.sort=$('sort').value;S.page=0;render();};
$('clear-selection').onclick=()=>{S.city=null;S.person=null;S.personVariants=false;S.name=null;S.category=null;S.page=0;render();};$('reset').onclick=()=>{timelineOverview();timeline.mode='year';timeline.anchor=null;timeline.doubt=false;$('timeline-mode').value='year';$('timeline-doubt').checked=false;Object.assign(S,{city:null,person:null,personVariants:false,name:null,q:'',directory:'',from:null,to:null,scope:'all',category:null,pending:true,undated:true,page:0,limit:40});$('query').value='';$('directory-search').value='';$('from').value='';$('to').value='';$('search-scope').value='all';[$('from'),$('to')].forEach(input=>input.setCustomValidity(''));$('pending').checked=true;$('undated').checked=true;render();};
$('more-directory').onclick=()=>{S.limit+=40;render();};$('prev').onclick=()=>{S.page--;render();};$('next').onclick=()=>{S.page++;render();};$('export').onclick=exportCSV;$('close-detail').onclick=()=>$('detail').close();$('about').onclick=()=>$('info').showModal();$('close-info').onclick=()=>$('info').close();
try{const world=window.CKT_WORLD;const features=topojson.feature(world,world.objects.countries);mapSvg=d3.select('#map');mapSvg.append('rect').attr('class','water').attr('width','100%').attr('height','100%');mapGroup=mapSvg.append('g');projection=d3.geoNaturalEarth1();mapGroup.selectAll('path').data(features.features).join('path').attr('class','land');zoom=d3.zoom().scaleExtent([1,18]).on('zoom',event=>mapGroup.attr('transform',event.transform));mapSvg.call(zoom);$('zoom-in').onclick=()=>mapSvg.transition().call(zoom.scaleBy,1.7);$('zoom-out').onclick=()=>mapSvg.transition().call(zoom.scaleBy,1/1.7);$('zoom-reset').onclick=()=>mapSvg.transition().call(zoom.transform,d3.zoomIdentity);mapReady=true;new ResizeObserver(drawMap).observe($('map'));}catch(e){$('map-error').hidden=false;console.error(e);}
const historyMaps=window.CKT_HISTORICAL_MAPS||[];
if(historyMaps.length){
 const launch=$('historical-open');launch.hidden=false;
 const selector=$('historical-select'),mapQuery=$('historical-query');
 const regionLabels={world:'世界','San Francisco Bay Area':'旧金山湾区'};
 function mapOptions(preferred){
  const query=norm(mapQuery.value.trim());
  const available=historyMaps.filter(m=>norm([m.display_title,m.title,m.region,regionLabels[m.region],m.map_date,m.publication_date,m.period_note,m.list_no,...m.authors].join(' ')).includes(query));
  selector.replaceChildren(...available.map(m=>{
   const option=el('option',ui(m.display_title));option.value=m.id;return option;
  }));
  if(available.some(m=>m.id===preferred))selector.value=preferred;
  selector.disabled=!available.length;
  $('historical-layout').style.display=available.length?'':'none';
 }
 let historyCurrent,historyGroup;const hs=d3.select('#historical-image');
 const hz=d3.zoom().scaleExtent([.01,10]).on('zoom',e=>{if(historyGroup)historyGroup.attr('transform',e.transform);});hs.call(hz);
 function fitHistorical(){if(!historyCurrent)return;const w=$('historical-image').clientWidth||700,h=$('historical-image').clientHeight||520;hs.attr('viewBox',[0,0,w,h]);const scale=Math.min(w/historyCurrent.width,h/historyCurrent.height);hs.call(hz.transform,d3.zoomIdentity.translate((w-historyCurrent.width*scale)/2,(h-historyCurrent.height*scale)/2).scale(scale));}
 function showHistorical(){
  const m=historyMaps.find(x=>x.id===selector.value);
  historyCurrent=m;
  if(!m){$('historical-alignment').textContent=ui('没有符合条件的历史参考图。');$('historical-credit').textContent='';return;}
  $('historical-title').textContent=ui(m.display_title);$('historical-metadata').replaceChildren();
  const box=$('historical-metadata');for(const text of [m.title,ui('制图／出版者：')+m.authors.join('；'),ui('图面标年：')+m.map_date+ui('；出版年：')+m.publication_date,ui(m.period_note),ui('比例尺 ')+m.scale+ui('；馆藏编号 ')+m.list_no,m.catalogue_reference?ui('目录参考：')+m.catalogue_reference:''])if(text)box.append(el('p',text));
  const [from,to]=dateBounds();
  const outside=!overlaps([m.comparison_year,m.comparison_year],from,to);
  const dateScope=from===null&&to===null?ui('不限年代'):from===to?from+ui(' 年'):(from??ui('不限'))+'—'+(to??ui('不限'))+ui(' 年');
  const sameYear=filtered.filter(r=>timeline.year===null
   ? r.time.intervals.some(range=>overlaps(range,m.comparison_year,m.comparison_year))
   : Boolean(frameDate(r,[m.comparison_year,m.comparison_year]))).length;
  $('historical-alignment').textContent=outside?uiText`当前目录筛选为 ${dateScope}；本图标年 ${m.map_date}，不在此范围内，仅作异期参考。`:uiText`当前目录筛选为 ${dateScope}；本图标年 ${m.map_date}，只是其中一年的背景。当前结果中 ${sameYear} 条日期可与该年相交（含待核查日期）。`;
  const selectedCity=S.city?cityMap.get(S.city):null;
  $('historical-scope').textContent=m.region==='world'?ui('范围：世界。图上航线与港口距离线不是致公堂档案关系。'):selectedCity&&!m.geonames_ids.includes(selectedCity.geonames_id)?ui('此图范围为旧金山湾区，与当前所选城市不同，仅供查考。'):ui('范围：旧金山湾区。地图不同区域的测绘与修订年代可能不同。');
  const links=$('historical-links');links.replaceChildren();
  for(const [text,url] of [[ui('馆藏记录 ↗'),m.source_url],[ui('查看馆方配准图 ↗'),m.georeferencer_url],[ui('打开本地原图'),m.image],[ui('使用条件 ↗'),m.permissions_url]]){const a=el('a',text);a.href=url;a.target='_blank';a.rel='noopener';links.append(a);}
  $('historical-credit').textContent=ui('来源：')+m.attribution+' · '+m.list_no+' · '+m.width+' × '+m.height+ui(' px。图像未裁切、未改色。许可链接：')+m.license_url;
  hs.selectAll('*').remove();historyGroup=hs.append('g');historyGroup.append('image').attr('href',m.image).attr('width',m.width).attr('height',m.height).on('error',()=>{$('historical-alignment').textContent=ui('本地图像未加载，请使用馆藏记录链接查看。')});fitHistorical();
 }
 launch.onclick=()=>{stopPlayback();renderTimeline(dateBounds());const match=S.city?historyMaps.find(m=>m.geonames_ids.includes(cityMap.get(S.city).geonames_id)):null;mapQuery.value='';mapOptions((match||historyMaps[0]).id);$('historical').showModal();showHistorical();$('historical').scrollTop=0;};
 mapQuery.oninput=()=>{mapOptions(selector.value);showHistorical();};
 selector.onchange=showHistorical;$('close-historical').onclick=()=>$('historical').close();
 $('historical-zoom-in').onclick=()=>hs.transition().call(hz.scaleBy,1.7);$('historical-zoom-out').onclick=()=>hs.transition().call(hz.scaleBy,1/1.7);$('historical-fit').onclick=fitHistorical;
 $('historical-year').onclick=()=>{if(!historyCurrent)return;timelineOverview();[$('from'),$('to')].forEach(input=>input.setCustomValidity(''));S.from=historyCurrent.comparison_year;S.to=historyCurrent.comparison_year;S.page=0;$('from').value=S.from;$('to').value=S.to;$('historical').close();render();};
 new ResizeObserver(()=>{if($('historical').open)fitHistorical();}).observe($('historical-image'));
}
$('interface-script').onchange=e=>{
 script=e.target.value;
 try{localStorage.setItem(storageKey,script);}catch{}
 applyScript();
 render();
};

render();
})();
