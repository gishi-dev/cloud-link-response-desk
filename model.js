export const disclaimer = '記録上の管理状況で、安全や漏えいの有無を確かめた結果ではない';
export const fields = {issuer:'発行した担当',storage:'保管先と管理者',operator:'停止・再発行の作業担当',screen:'操作する画面',decider:'判断する人',deputy:'代行者',impact:'止まる業務',alternative:'代替手段'};
export const stages = ['0〜10分：公表の確認','10〜20分：台帳の該当','20〜30分：鍵の分担','30〜45分：判断','45〜60分：対応と引き継ぎ'];
export const clone = v => structuredClone(v);
export const text = v => typeof v === 'string' && v.trim().length > 0;
export const present = v => text(v) && !['未確認','未設定','不明'].includes(v.trim());
export function rejectSecrets(value) {
  const s = JSON.stringify(value);
  if (/(?:sk-|AKIA|Bearer\s|https?:\/\/|www\.)|[A-Za-z0-9_+/=-]{24,}/i.test(s)) throw Error('鍵の値らしい文字列やリンクは保存できません。台帳には管理の分担だけを書いてください。');
}
function keys(o, allowed) {
  if (!o || typeof o !== 'object' || Array.isArray(o) || Object.keys(o).some(k=>!allowed.includes(k))) throw Error('想定外の項目があります。画面のJSONひな形に合わせてください。');
}
function optional(v) { if (v !== null && !text(v)) throw Error('空欄は null にしてください。'); }
export function dateOK(s) { return /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0,10) === s; }
export function validateRow(row, type, services) {
  rejectSecrets(row);
  const common = ['id','purpose'];
  keys(row,type==='service' ? [...common,'name','information','owner','checks'] : [...common,'serviceId','partnerId','route',...Object.keys(fields)]);
  if (!new RegExp(type==='service'?'^C[1-9][0-9]?$':'^L[1-9][0-9]?$').test(row.id) || !text(row.purpose)) throw Error('IDと用途を確認してください。');
  if (type==='service') {
    if (!text(row.name)) throw Error('サービス名が必要です。');
    for (const f of ['information','owner']) optional(row[f]);
    if (!Array.isArray(row.checks) || row.checks.length !== 15) throw Error('15観点をそれぞれ1件ずつ指定してください。');
    const seen = new Set();
    for (const c of row.checks) {
      keys(c,['no','state','evidence','contact','when','who']);
      if (!Number.isInteger(c.no) || c.no<1 || c.no>15 || seen.has(c.no)) throw Error('観点番号が不正です。');
      seen.add(c.no);
      if (![null,'確認済み','未確認','未対応'].includes(c.state)) throw Error('状態は確認済み・未確認・未対応・nullのいずれかです。');
      for (const f of ['evidence','contact','when','who']) optional(c[f]);
      if (c.when !== null && !dateOK(c.when)) throw Error('確認日は実在する日付にしてください。');
      if (c.state==='確認済み' && !['evidence','contact','when','who'].every(f=>present(c[f]))) throw Error('確認済みには根拠・確認先・確認日・記録者が必要です。');
    }
  } else {
    if (![row.serviceId,row.partnerId].every(id=>services.some(s=>s.id===id)) || !['直接利用','委託先経由'].includes(row.route)) throw Error('連携先IDまたは利用経路が不正です。');
    for (const f of Object.keys(fields)) optional(row[f]);
  }
  return row;
}
export function counts(s) {
  return {unknown:s.checks.filter(c=>c.state===null || c.state==='未確認').length, pending:s.checks.filter(c=>c.state==='未対応').length};
}
export function serviceState(s) { const c=counts(s); return [c.unknown?'未確認あり':'',c.pending?'未対応あり':''].filter(Boolean).join('／') || '確認済み'; }
export function missingKeys(l) { return Object.keys(fields).slice(0,6).filter(f=>!present(l[f])); }
export function linkState(l) { return missingKeys(l).length?'分担に未確認あり':'分担がそろっている'; }
export function createState(input, candidates) {
  return {data:clone(input), original:clone(input), saved:candidates, version:'revised', epoch:0, revisions:{}, candidates:Object.fromEntries(Object.entries(candidates.revised).map(([id,v])=>[id,{...v,revision:0,epoch:0,version:'revised'}])), decisions:{}, incidents:[], history:[], noticeId:'N1', finalized:false};
}
export const allRows = s => [...s.data.services,...s.data.links];
export const rowById = (s,id) => allRows(s).find(r=>r.id===id);
export function validCandidate(s,id) { const c=s.candidates[id]; return !!c && c.revision===(s.revisions[id]||0) && c.epoch===s.epoch && c.version===s.version; }
export function history(s,actor,row,action,reason,details=null) { s.history.push({at:new Date().toISOString(),actor,row,action,reason,version:s.version,...(details===null?{}:{details:clone(details)})}); }
export function invalidate(s,why) {
  history(s,'コード（入力・候補の変更）','全体','判断を解除',why,{decisions:s.decisions,incidents:s.incidents,finalized:s.finalized});
  s.decisions={}; s.incidents=[]; s.finalized=false;
}
export function switchVersion(s,v) {
  if (!['initial','revised','teaching'].includes(v) || v===s.version) return;
  s.version=v; s.epoch++; s.candidates={}; invalidate(s,'版の切り替え');
  // 変更のない行だけ保存済みの出力を再生。編集して元へ戻しても候補は復活させない。
  const seed=v==='initial'?s.saved.initial:v==='revised'?s.saved.revised:{};
  for (const row of allRows(s)) if (!s.revisions[row.id] && seed[row.id]) s.candidates[row.id]={...clone(seed[row.id]),revision:0,epoch:s.epoch,version:v};
}
export function saveRows(s,rows,type) {
  if (s.version!=='revised') throw Error('台帳の編集はB 修正版で行ってください。');
  if (!Array.isArray(rows) || !rows.length || rows.length>50) throw Error('1〜50行のJSON配列を指定してください。');
  const ids=new Set();
  for (const row of rows) {validateRow(row,type,s.data.services); if (ids.has(row.id)) throw Error('IDが重複しています。'); ids.add(row.id);}
  const target=type==='service'?s.data.services:s.data.links;
  let changed=false;
  for (const row of rows) {
    const old=target.findIndex(v=>v.id===row.id);
    if (old>=0 && JSON.stringify(target[old])===JSON.stringify(row)) continue;
    if (old>=0) target[old]=clone(row); else target.push(clone(row));
    s.revisions[row.id]=(s.revisions[row.id]||0)+1; delete s.candidates[row.id]; changed=true;
  }
  if (changed) invalidate(s,'台帳の編集・読み込み。変更した行の候補は再取り込みが必要');
  return changed;
}
export function candidateTemplate(s,id) {
  return {version:s.version,epoch:s.epoch,revision:s.revisions[id]||0,rowId:id,input:clone(rowById(s,id)),missing:'',question:''};
}
export function importCandidate(s,c) {
  keys(c,['version','epoch','revision','rowId','input','missing','question']); rejectSecrets(c);
  const row=rowById(s,c.rowId);
  if (s.version!=='revised' || !row || c.version!==s.version || c.epoch!==s.epoch || c.revision!==(s.revisions[c.rowId]||0) || JSON.stringify(c.input)!==JSON.stringify(row)) throw Error('現在の入力・版と一致しない候補は取り込めません。');
  if (![c.missing,c.question].every(text)) throw Error('不足事項と質問が必要です。状態や操作結果を候補で変更することはできません。');
  const next={missing:c.missing,question:c.question,revision:c.revision,epoch:s.epoch,version:s.version};
  if (JSON.stringify(s.candidates[c.rowId])===JSON.stringify(next)) return false;
  s.candidates[c.rowId]=next; invalidate(s,'候補の取り込み'); return true;
}
export function recordDecision(s,id,d) {
  if (s.version!=='revised') throw Error('比較用・教材の版では記録・確定できません。');
  if (!validCandidate(s,id)) throw Error('再整理待ちです。現在の入力に合う候補JSONを取り込んでください。');
  rejectSecrets(d);
  if (!rowById(s,id) || !['actor','evidence','contact','next','owner','due','reason','decider','deputy'].every(f=>present(d[f])) || !dateOK(d.due) || !/^[1-9][0-9]?$/.test(d.rank || '') || d.checked!==true) throw Error('根拠の照合・確認先・次の行動・対応順・担当・期限・理由・判断する人・代行者と確認チェックが必要です。');
  const row=rowById(s,id);
  const next={...d,state:row.checks?serviceState(row):linkState(row)};
  if (JSON.stringify(s.decisions[id])===JSON.stringify(next)) return false;
  history(s,d.actor,id,'管理状況と対応を記録',d.reason,{previous:s.decisions[id]||null,decision:next});
  s.decisions[id]=clone(next); s.finalized=false; return true;
}
export function affected(s) {
  const n=s.data.announcements.find(n=>n.id===s.noticeId);
  const services=s.data.services.filter(r=>n.serviceIds.includes(r.id));
  const links=s.data.links.filter(r=>n.serviceIds.includes(r.serviceId) || n.serviceIds.includes(r.partnerId) || n.indirectLinkIds.includes(r.id));
  const relations=Object.fromEntries(links.map(l=>[l.id,n.serviceIds.includes(l.serviceId)||n.serviceIds.includes(l.partnerId) ? {label:'公表元のサービス（'+n.serviceIds.filter(id=>id===l.serviceId||id===l.partnerId).join('・')+'）の連携',reason:null} : {label:'委託先経由で関係しうる（対応表で指定）',reason:n.indirectLinkReasons[l.id]}]));
  return {notice:n,services,links,relations,unmatched:[...n.serviceIds.filter(id=>!services.some(r=>r.id===id)),...n.indirectLinkIds.filter(id=>!links.some(r=>r.id===id))]};
}
export function incidentState(s) {
  if (!s.incidents.length) return '未記録';
  const last=s.incidents.at(-1);
  if (last.stage===0) return '公表を確認';
  if (last.stage===1) return '台帳の該当を確認中';
  if (last.stage===2) return affected(s).links.some(l=>missingKeys(l).length)?'判断待ち':'分担を確認中';
  if (last.stage===3) return '判断済み（'+last.action+'）';
  return '引き継ぎ済み';
}
export function recordIncident(s,d) {
  if (s.version!=='revised') throw Error('比較用・教材の版では初動を記録できません。');
  rejectSecrets(d);
  if (!Number.isInteger(d.stage) || d.stage!==s.incidents.length || d.stage>4) throw Error('段階を順番に記録してください。同じ段階は二重に記録できません。');
  if (!['actor','evidence','note','reason','owner','due'].every(f=>present(d[f])) || !dateOK(d.due) || !text(d.time) || !/^\d{2}:\d{2}$/.test(d.time) || Number(d.time.slice(0,2))>23 || Number(d.time.slice(3))>59 || !d.checked) throw Error('記録者・根拠・メモ・理由・引継ぎ担当・期限・時刻と確認チェックが必要です。');
  const a=affected(s), l=s.data.links.find(l=>l.id===d.linkId);
  if (/停止済み|停止完了|停止しました/.test([d.note,d.reason,d.execution].join(' ')) && !(d.stage===4 && d.action==='停止' && d.result==='停止済み')) throw Error('停止済みという結果は、分担・判断・実施記録を確認した最後の段階でだけ記録できます。');
  if (/再発行完了|古い鍵は無効/.test([d.note,d.reason].join(' ')) && !(d.stage===4 && d.action==='再発行' && d.result==='再発行完了')) throw Error('再発行の完了は、失効・反映・再開を確認した最後の段階でだけ記録できます。');
  if (d.stage>=3) {
    if (!l || !a.links.includes(l) || !['停止','再発行','追加確認'].includes(d.action)) throw Error('該当連携と判断を選んでください。');
    if (!present(d.decider) || !present(d.deputy)) throw Error('判断する人と代行者を記録してください。');
    if (d.action!=='追加確認' && (missingKeys(l).length || !s.decisions[l.id])) throw Error('分担と人の判断がそろうまで停止・再発行の判断は記録できません。追加確認を選べます。');
  }
  if (d.stage===4) {
    const prior=s.incidents[3];
    if (d.action!==prior.action || d.linkId!==prior.linkId || d.decider!==prior.decider) throw Error('直前に承認した対象・判断・判断者と一致させてください。');
    if (!['停止済み','再発行完了','確認待ち'].includes(d.result)) throw Error('対応結果を選んでください。');
    if ((d.action==='停止' && d.result!=='停止済み') || (d.action==='再発行' && d.result!=='再発行完了') || (d.action==='追加確認' && d.result!=='確認待ち')) throw Error('判断と対応結果が一致していません。');
    if (d.result==='停止済み' && (!present(l.operator) || !present(l.screen) || !present(d.execution))) throw Error('作業担当・画面・実施記録がないため停止済みにできません。');
    if (d.result==='再発行完了' && !['execution','oldInvalid','reflected','restarted'].every(f=>present(d[f]))) throw Error('再発行・古い鍵の失効・連携先への反映・再開の確認を別々に記録してください。');
  }
  s.incidents.push({...clone(d),noticeId:s.noticeId}); s.finalized=false; history(s,d.actor,'初動 '+stages[d.stage],'初動を記録',d.reason,{incident:s.incidents.at(-1)});
}
export function blockers(s) {
  const errors=[];
  if(s.version!=='revised') errors.push('比較用・教材の版は確定できません');
  for(const row of allRows(s)) {
    if(!validCandidate(s,row.id)) errors.push(row.id+' は再整理待ち');
    if(!s.decisions[row.id]) errors.push(row.id+' の人の判断・担当・期限が未記録');
  }
  const ranks=Object.values(s.decisions).map(d=>d.rank);
  if(new Set(ranks).size!==ranks.length) errors.push('対応順が重複しています');
  if(s.incidents.length!==5) errors.push('初動の5段階が未記録');
  return errors;
}
export function exportRecord(s) {
  return {notice:disclaimer,version:s.version,teaching:s.version==='teaching',comparison:s.version==='initial',status:s.finalized?'確定':'照合用・未確定',ledger:s.version==='initial'?s.data.services.map(({id,name,purpose,information,owner})=>({id,name,purpose,information,owner})):s.data,decisions:s.decisions,incidents:s.incidents,history:s.history,candidates:s.version==='teaching'?s.saved.teaching:s.candidates};
}
