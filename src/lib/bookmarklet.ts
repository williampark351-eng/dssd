import type { ParsedResume } from '@/lib/types';

export type FillDetails = {
  first: string; last: string; full: string; email: string; phone: string;
  location: string; linkedin: string; github: string; website: string;
  company: string; title: string; school: string; degree: string; years: string;
};

export function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return { first: parts[0] ?? '', last: '' };
  return { first: parts.slice(0, -1).join(' '), last: parts[parts.length - 1] };
}

export function fillDetailsFromProfile(
  p: {
    full_name?: string | null; email?: string | null; phone?: string | null; location?: string | null;
    linkedin_url?: string | null; portfolio_url?: string | null; years_experience?: number | null;
  },
  resume?: Partial<ParsedResume> | null,
): FillDetails {
  const full = (p.full_name ?? '').trim();
  const site = p.portfolio_url ?? '';
  const job = resume?.experience?.[0];
  const edu = resume?.education?.[0];
  return {
    ...splitName(full), full,
    email: p.email ?? '', phone: p.phone ?? '', location: p.location ?? '',
    linkedin: p.linkedin_url ?? '',
    github: /github\.com/i.test(site) ? site : '',
    website: site,
    company: job?.company ?? '', title: job?.title ?? '',
    school: edu?.school ?? '', degree: edu?.degree ?? '',
    years: p.years_experience ? String(p.years_experience) : '',
  };
}

export const FIELD_RULES: [keyof FillDetails, RegExp][] = [
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

// Fills the page and every same-origin frame; cross-origin application frames are listed so the user can open them directly.
const FILL_SOURCE = `(function(D,R){
var n=0,blocked=[],ATS=/greenhouse|lever\\.co|ashbyhq|myworkdayjobs|workday|smartrecruiters|icims|jobvite|bamboohr|recruitee|workable/i;
function label(doc,el){var t=[el.name,el.id,el.getAttribute('autocomplete'),el.getAttribute('aria-label'),el.placeholder];
if(el.id){var l=doc.querySelector('label[for="'+CSS.escape(el.id)+'"]');if(l)t.push(l.textContent);}
var p=el.closest('label');if(p)t.push(p.textContent);
var by=el.getAttribute('aria-labelledby');if(by){by.split(' ').forEach(function(i){var x=doc.getElementById(i);if(x)t.push(x.textContent);});}
if(t.filter(Boolean).length<2){var w=el.closest('.field,.form-group,.application-question,[class*="field"],[class*="question"]');if(w){var q=w.querySelector('label,legend,.label,[class*="label"]');if(q)t.push(q.textContent);}}
return t.filter(Boolean).join(' ').toLowerCase();}
function key(d){for(var j=0;j<R.length;j++){if(D[R[j][0]]&&new RegExp(R[j][1]).test(d))return R[j][0];}return null;}
function mark(el){el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));el.dispatchEvent(new Event('blur',{bubbles:true}));el.style.outline='2px solid #0d9488';n++;}
function fill(doc){var W=doc.defaultView,els=doc.querySelectorAll('input,textarea,select');
for(var i=0;i<els.length;i++){var el=els[i],ty=(el.type||'').toLowerCase();
if(['hidden','file','submit','button','checkbox','radio','password','search'].indexOf(ty)>-1||el.disabled||el.readOnly)continue;
var k=key(label(doc,el));if(!k||!D[k])continue;
if(el.tagName==='SELECT'){if(el.selectedIndex>0)continue;var v=String(D[k]).toLowerCase(),hit=-1;
for(var o=0;o<el.options.length;o++){var tx=el.options[o].text.toLowerCase().trim();if(tx&&(tx===v||(v.length>3&&tx.indexOf(v)>-1))){hit=o;break;}}
if(hit>0){el.selectedIndex=hit;mark(el);}continue;}
if(el.value)continue;var proto=el.tagName==='TEXTAREA'?W.HTMLTextAreaElement.prototype:W.HTMLInputElement.prototype;
Object.getOwnPropertyDescriptor(proto,'value').set.call(el,D[k]);mark(el);}
var fr=doc.querySelectorAll('iframe');for(var f=0;f<fr.length;f++){var sub=null;try{sub=fr[f].contentDocument;}catch(e){}
if(sub&&sub.body)fill(sub);else if(fr[f].src&&ATS.test(fr[f].src))blocked.push(fr[f].src);}}
fill(document);
var b=document.createElement('div');b.style.cssText='position:fixed;z-index:2147483647;bottom:16px;right:16px;max-width:340px;padding:12px 16px;background:#0f172a;color:#fff;font:14px/1.5 system-ui,sans-serif;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.25)';
var m=document.createElement('div');m.textContent='Applyline filled '+n+' field'+(n===1?'':'s')+'. Check every answer, attach your resume, and submit it yourself.';b.appendChild(m);
if(blocked.length){var h=document.createElement('div');h.style.marginTop='8px';h.textContent='The application form on this page is embedded from another site. Open it on its own, then click Fill application again:';b.appendChild(h);
var a=document.createElement('a');a.href=blocked[0];a.target='_blank';a.rel='noopener';a.textContent='Open the application form';a.style.cssText='display:inline-block;margin-top:8px;padding:6px 12px;background:#0d9488;color:#fff;border-radius:8px;font-weight:600;text-decoration:none';b.appendChild(a);}
var x=document.createElement('button');x.textContent='Close';x.style.cssText='display:block;margin-top:8px;background:none;border:0;color:#94a3b8;cursor:pointer;font:12px system-ui;padding:0';x.onclick=function(){b.remove();};b.appendChild(x);
document.body.appendChild(b);if(!blocked.length)setTimeout(function(){b.remove();},8000);})`;

export function buildFillBookmarklet(details: FillDetails): string {
  const rules = FIELD_RULES.map(([k, re]) => [k, re.source]);
  return 'javascript:' + encodeURIComponent(`${FILL_SOURCE}(${JSON.stringify(details)},${JSON.stringify(rules)});void 0`);
}
