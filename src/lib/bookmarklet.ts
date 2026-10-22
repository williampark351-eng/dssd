import type { ParsedResume } from '@/lib/types';

export type FillDetails = {
  first: string; last: string; full: string; email: string; phone: string;
  location: string; linkedin: string; github: string; website: string;
  company: string; title: string; school: string; degree: string; years: string;
  workAuth: string; sponsor: string; relocate: string; salary: string;
};

export type FillAnswer = [question: string, answer: string];

export function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return { first: parts[0] ?? '', last: '' };
  return { first: parts.slice(0, -1).join(' '), last: parts[parts.length - 1] };
}

const AUTHORIZED = ['citizen', 'permanent_resident', 'work_visa', 'student_visa'];

export function fillDetailsFromProfile(
  p: {
    full_name?: string | null; email?: string | null; phone?: string | null; location?: string | null;
    linkedin_url?: string | null; portfolio_url?: string | null; years_experience?: number | null;
    work_authorization?: string | null; requires_sponsorship?: boolean | null; willing_to_relocate?: boolean | null;
  },
  resume?: Partial<ParsedResume> | null,
  prefs?: { min_salary?: number | null } | null,
): FillDetails {
  const full = (p.full_name ?? '').trim();
  const site = p.portfolio_url ?? '';
  const job = resume?.experience?.[0];
  const edu = resume?.education?.[0];
  const auth = p.work_authorization ?? '';
  const known = !!auth;
  return {
    ...splitName(full), full,
    email: p.email ?? '', phone: p.phone ?? '', location: p.location ?? '',
    linkedin: p.linkedin_url ?? '',
    github: /github\.com/i.test(site) ? site : '',
    website: site,
    company: job?.company ?? '', title: job?.title ?? '',
    school: edu?.school ?? '', degree: edu?.degree ?? '',
    years: p.years_experience ? String(p.years_experience) : '',
    workAuth: AUTHORIZED.includes(auth) ? 'Yes' : auth === 'none' ? 'No' : '',
    sponsor: known ? (p.requires_sponsorship ? 'Yes' : 'No') : '',
    relocate: p.willing_to_relocate == null ? '' : p.willing_to_relocate ? 'Yes' : 'No',
    salary: prefs?.min_salary ? String(prefs.min_salary) : '',
  };
}

// Order matters: the first rule whose pattern matches and whose value is known wins.
export const FIELD_RULES: [keyof FillDetails, RegExp][] = [
  ['sponsor', /(will|do|would) you (now or in the future )?(require|need).{0,60}sponsor|sponsorship (is )?(required|needed)/],
  ['workAuth', /authori[sz]ed to work|legally (authori[sz]ed|eligible|able)|eligible to work|right to work|work authori[sz]ation/],
  ['relocate', /relocat/],
  ['salary', /salary|compensation expectation|expected compensation|desired (pay|compensation)|pay expectation/],
  ['linkedin', /linkedin/],
  ['github', /github/],
  ['website', /website|portfolio|personal.?site|\burl\b/],
  ['email', /e-?mail/],
  ['phone', /phone|mobile|\btel\b/],
  ['first', /first.?name|given.?name|fname|preferred.?name/],
  ['last', /last.?name|surname|family.?name|lname/],
  ['full', /full.?name|^name$|your.?name|candidate.?name|legal.?name/],
  ['company', /current.?(company|employer)|company.?name|^employer$|organization/],
  ['title', /current.?(job.?)?title|job.?title|current.?role|position.?title/],
  ['school', /school|university|college|institution/],
  ['degree', /\bdegree\b/],
  ['years', /years.?(of.?)?experience/],
  ['location', /\bcity\b|location|current.?address/],
];

export function fieldFor(descriptor: string): keyof FillDetails | null {
  const d = descriptor.toLowerCase().trim();
  for (const [key, re] of FIELD_RULES) if (re.test(d)) return key;
  return null;
}

// Runs on the employer's page: detects the hiring system, fills the page and same-origin frames, opens the form if
// only an Apply button is showing, and keeps filling new questions or steps while its banner stays open. Never submits.
const FILL_SOURCE = `(function(D,R,A){
if(window.__applylineFill)window.__applylineFill();
var n=0,blocked=[],seen=new WeakSet(),applyLink='',opened=false,timer=0;
var ATS=/greenhouse|lever\\.co|ashbyhq|myworkdayjobs|workday|smartrecruiters|icims|jobvite|bamboohr|recruitee|workable|taleo|successfactors/i;
var NAMES=[['greenhouse','Greenhouse'],['lever.co','Lever'],['ashbyhq','Ashby'],['workday','Workday'],['smartrecruiters','SmartRecruiters'],['icims','iCIMS'],['jobvite','Jobvite'],['bamboohr','BambooHR'],['workable','Workable'],['recruitee','Recruitee'],['taleo','Taleo'],['successfactors','SuccessFactors']];
function txt(x){return x?String(x.textContent||'').replace(/\\s+/g,' ').trim():'';}
function ats(){var h=location.hostname+' '+Array.prototype.map.call(document.querySelectorAll('iframe[src],form[action]'),function(f){return f.src||f.action||'';}).join(' ');
for(var i=0;i<NAMES.length;i++)if(h.indexOf(NAMES[i][0])>-1)return NAMES[i][1];return '';}
function label(doc,el){var t=[el.name,el.id,el.getAttribute('autocomplete'),el.getAttribute('aria-label'),el.placeholder];
if(el.id){var l=doc.querySelector('label[for="'+CSS.escape(el.id)+'"]');if(l)t.push(l.textContent);}
var p=el.closest('label');if(p)t.push(p.textContent);
var by=el.getAttribute('aria-labelledby');if(by){by.split(' ').forEach(function(i){var x=doc.getElementById(i);if(x)t.push(x.textContent);});}
if(t.filter(Boolean).length<2){var w=el.closest('.field,.form-group,.application-question,[class*="field"],[class*="question"],[data-automation-id]');if(w){var q=w.querySelector('label,legend,.label,[class*="label"]');if(q)t.push(q.textContent);}}
return t.filter(Boolean).join(' ').toLowerCase();}
function key(d){for(var j=0;j<R.length;j++){if(D[R[j][0]]&&new RegExp(R[j][1]).test(d))return R[j][0];}return null;}
function words(s){return s.toLowerCase().replace(/[^a-z0-9 ]/g,' ').split(' ').filter(function(w){return w.length>2;});}
function answer(d){var w=words(d);if(w.length<3)return '';var best='',top=0;
for(var i=0;i<A.length;i++){var q=words(A[i][0]),hit=0;for(var j=0;j<q.length;j++)if(w.indexOf(q[j])>-1)hit++;var s=q.length?hit/q.length:0;if(s>top){top=s;best=A[i][1];}}
return top>=0.7?best:'';}
function pick(opts,v){v=String(v).toLowerCase();for(var o=0;o<opts.length;o++){var t=String(opts[o]).toLowerCase().trim();
if(t&&(t===v||t.indexOf(v+' ')===0||t.indexOf(v+',')===0||t.indexOf(v+'.')===0||(v.length>3&&t.indexOf(v)>-1)))return o;}return -1;}
function mark(el){el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));el.dispatchEvent(new Event('blur',{bubbles:true}));el.style.outline='2px solid #0d9488';n++;}
function radios(doc){var g={},rs=doc.querySelectorAll('input[type=radio]');
for(var i=0;i<rs.length;i++){if(rs[i].name&&!rs[i].disabled)(g[rs[i].name]=g[rs[i].name]||[]).push(rs[i]);}
Object.keys(g).forEach(function(name){var list=g[name];if(list.some(function(r){return r.checked||seen.has(r);}))return;
var box=list[0].closest('fieldset,[role=radiogroup],.application-question,.field,[class*="question"],[class*="field"]');
var q=box?(txt(box.querySelector('legend,label,[class*="label"]'))||txt(box)):'';
var k=key((q+' '+name).toLowerCase());if(!k)return;
var opts=list.map(function(r){var l=r.id&&doc.querySelector('label[for="'+CSS.escape(r.id)+'"]');return txt(l||r.closest('label'))||r.value||'';});
var h=pick(opts,D[k]);if(h<0)return;list.forEach(function(r){seen.add(r);});list[h].click();n++;
var lab=list[h].closest('label')||list[h].parentElement;if(lab)lab.style.outline='2px solid #0d9488';});}
function fill(doc){var W=doc.defaultView,els=doc.querySelectorAll('input,textarea,select');
for(var i=0;i<els.length;i++){var el=els[i],ty=(el.type||'').toLowerCase();
if(seen.has(el)||['hidden','file','submit','button','checkbox','radio','password','search','image','reset'].indexOf(ty)>-1||el.disabled||el.readOnly)continue;
var d=label(doc,el),k=key(d),v=k?D[k]:'';
if(!v&&el.tagName!=='SELECT'&&(el.tagName==='TEXTAREA'||ty==='text'||ty===''))v=answer(d);
if(!v)continue;
if(el.tagName==='SELECT'){if(el.selectedIndex>0)continue;var h=pick(Array.prototype.map.call(el.options,function(o){return o.text;}),v);
if(h>0){el.selectedIndex=h;seen.add(el);mark(el);}continue;}
if(el.value)continue;var proto=el.tagName==='TEXTAREA'?W.HTMLTextAreaElement.prototype:W.HTMLInputElement.prototype;
Object.getOwnPropertyDescriptor(proto,'value').set.call(el,v);seen.add(el);mark(el);}
radios(doc);
var fr=doc.querySelectorAll('iframe');for(var f=0;f<fr.length;f++){var sub=null;try{sub=fr[f].contentDocument;}catch(e){}
if(sub&&sub.body)fill(sub);else if(fr[f].src&&ATS.test(fr[f].src)&&blocked.indexOf(fr[f].src)<0)blocked.push(fr[f].src);}}
function openForm(){var c=document.querySelectorAll('a,button,[role=button]');
for(var i=0;i<c.length;i++){var t=txt(c[i]).toLowerCase();
if(!/^(apply|apply now|apply here|apply for this (job|position|role)|start (your )?application|i.m interested)$/.test(t))continue;
var href=c[i].tagName==='A'?c[i].getAttribute('href')||'':'';
if(href&&href.charAt(0)!=='#'&&href.indexOf('javascript:')!==0){applyLink=c[i].href;return;}
c[i].click();opened=true;return;}}
fill(document);
if(!n&&!blocked.length)openForm();
var name=ats();
var b=document.createElement('div');b.style.cssText='position:fixed;z-index:2147483647;bottom:16px;right:16px;width:340px;max-width:calc(100vw - 32px);padding:14px 16px;background:#0f172a;color:#fff;font:14px/1.5 system-ui,sans-serif;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.3)';
var head=document.createElement('div');head.style.cssText='font-weight:700;margin-bottom:4px';
var m=document.createElement('div');var tip=document.createElement('div');tip.style.cssText='margin-top:6px;color:#94a3b8;font-size:12px';
tip.textContent='Keeps filling as new questions or steps appear while this box is open. Attach your resume, check every answer and submit it yourself.';
function update(){head.textContent=name?name+' application detected':'Applyline autofill';
m.textContent=n?'Filled '+n+' field'+(n===1?'':'s')+'.':opened?'Opened the application form. Filling it now…':'No empty fields matched yet.';}
update();b.appendChild(head);b.appendChild(m);b.appendChild(tip);
function link(href,text){var a=document.createElement('a');a.href=href;a.target='_blank';a.rel='noopener';a.textContent=text;a.style.cssText='display:inline-block;margin-top:10px;padding:6px 12px;background:#0d9488;color:#fff;border-radius:8px;font-weight:600;text-decoration:none';b.appendChild(a);}
if(blocked.length){var h=document.createElement('div');h.style.marginTop='8px';h.textContent='This form is embedded from another site. Open it on its own, then click Fill application again:';b.appendChild(h);link(blocked[0],'Open the application form');}
else if(applyLink&&!n){var h2=document.createElement('div');h2.style.marginTop='8px';h2.textContent='The form is on its own page. Open it, then click Fill application again:';b.appendChild(h2);link(applyLink,'Open the application form');}
var x=document.createElement('button');x.textContent='Done';x.style.cssText='display:block;margin-top:10px;background:none;border:0;color:#5eead4;cursor:pointer;font:600 12px system-ui;padding:0';b.appendChild(x);
document.body.appendChild(b);
var mo=new MutationObserver(function(){clearTimeout(timer);timer=setTimeout(function(){var before=n;fill(document);if(n!==before)update();},400);});
mo.observe(document.body,{childList:true,subtree:true});
var stop=setTimeout(close,900000);
function close(){mo.disconnect();clearTimeout(timer);clearTimeout(stop);b.remove();window.__applylineFill=null;}
x.onclick=close;window.__applylineFill=close;})`;

export function buildFillBookmarklet(details: FillDetails, answers: FillAnswer[] = []): string {
  const rules = FIELD_RULES.map(([k, re]) => [k, re.source]);
  const trimmed = answers.slice(0, 40).map(([q, a]) => [q.slice(0, 300), a.slice(0, 2000)]);
  return 'javascript:' + encodeURIComponent(`${FILL_SOURCE}(${JSON.stringify(details)},${JSON.stringify(rules)},${JSON.stringify(trimmed)});void 0`);
}
