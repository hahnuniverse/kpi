/* 화면·DB에 의존하지 않는 계산과 입력 규칙. node 테스트에서도 같은 코드를 사용합니다. */
(function(root){
'use strict';
const SAMPLE=[
 {month:'2026-09',team:'영업A',target:10000000,actual:9000000},
 {month:'2026-09',team:'영업B',target:8000000,actual:8800000},
 {month:'2026-09',team:'영업C',target:12000000,actual:10800000},
 {month:'2026-10',team:'영업A',target:10000000,actual:11000000},
 {month:'2026-10',team:'영업B',target:8000000,actual:7200000},
 {month:'2026-10',team:'영업C',target:12000000,actual:12600000}
];
function amount(value){
 if(value && typeof value==='object')throw Error('수식·객체 셀은 사용할 수 없습니다.');
 let str=String(value??'').trim();
 if(/^\d{1,3}(,\d{3})+$/.test(str))str=str.replaceAll(',','');
 const number=Number(str);
 if(!/^\d+$/.test(str)||!Number.isSafeInteger(number)||number<0)throw Error('금액은 0 이상의 안전한 정수여야 합니다.');
 return number;
}
function validateRecord(row){
 const month=String(row.month??'').trim(), team=String(row.team??'').trim();
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw Error('월은 YYYY-MM 형식이어야 합니다.');
 if(!team||[...team].length>80)throw Error('부서는 1~80자여야 합니다.');
 return {month,team,target:amount(row.target),actual:amount(row.actual)};
}
function summarize(rows){
 const target=rows.reduce((s,r)=>s+BigInt(amount(r.target)),0n),actual=rows.reduce((s,r)=>s+BigInt(amount(r.actual)),0n);
 const percent=target===0n?null:(actual*10000n+target/2n)/target;
 return {target:String(target),actual:String(actual),count:rows.length,rate:percent===null?'목표 미설정':String(percent/100n)+(percent%100n?'.'+String(percent%100n).padStart(2,'0').replace(/0$/,''):'')+'%'};
}
function parseCSV(text){
 text=text.replace(/^\ufeff/,'');const rows=[];let row=[],cell='',quoted=false,closed=false;
 const pushRow=()=>{row.push(cell);if(row.some(v=>v.trim()!==''))rows.push(row);row=[];cell='';closed=false;};
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=c;continue;}
  if(c==='"'){if(cell!==''||closed)throw Error('CSV 인용부호 위치를 확인하세요.');quoted=true;}
  else if(c===','){row.push(cell);cell='';closed=false;}
  else if(c==='\n'||c==='\r'){pushRow();if(c==='\r'&&text[i+1]==='\n')i++;}
  else{if(closed)throw Error('CSV 인용부호 뒤 구분자를 확인하세요.');cell+=c;}
 }
 if(quoted)throw Error('CSV 인용부호가 닫히지 않았습니다.');
 if(cell!==''||row.length||closed)pushRow();return rows;
}
const key=r=>JSON.stringify([r.month,r.team]);
function prepareImport(matrix,mapping,existing=[]){
 if(matrix.length<2)throw Error('헤더와 데이터 행이 필요합니다.');
 if(matrix.length>1001)throw Error('데이터는 최대 1,000행입니다.');
 const indices=['month','team','target','actual'].map(k=>mapping[k]);
 if(new Set(indices).size!==4||indices.some(n=>!Number.isInteger(n)||n<0||n>=matrix[0].length))throw Error('서로 다른 필수 열 4개를 연결하세요.');
 const seen=new Set(),stored=new Set(existing.map(key)),valid=[],issues=[];
 matrix.slice(1).forEach((cells,i)=>{
  try{
   if(cells.some(c=>c&&typeof c==='object'))throw Error('수식·오류 셀은 가져올 수 없습니다.');
   const raw={};for(const k of ['month','team','target','actual'])raw[k]=cells[mapping[k]];
   const record=validateRecord(raw),id=key(record);
   if(seen.has(id))throw Error('파일 내부 월·부서 중복');seen.add(id);
   if(stored.has(id))throw Error('기존 월·부서 중복: 건너뜀');
   valid.push({row:i+2,record});
  }catch(e){issues.push({row:i+2,message:e.message});}
 });return {valid,issues};
}
function readSheetMatrix(book,name,X){
 const ws=book.Sheets[name];if(!ws)throw Error('시트를 선택하세요.');
 const range=X.utils.decode_range(ws['!ref']||'A1');
 if(range.e.r-range.s.r>1000||range.e.c-range.s.c>99)throw Error('시트 한도는 데이터 1,000행·100열입니다.');
 const out=[];
 for(let r=range.s.r;r<=range.e.r;r++){const values=[];for(let c=range.s.c;c<=range.e.c;c++){
  const cell=ws[X.utils.encode_cell({r,c})];values.push(cell?.f?{formula:true}:cell?.t==='e'?{error:true}:cell?.v??'');
 }out.push(values);}return out;
}
const api={SAMPLE,amount,validateRecord,summarize,parseCSV,prepareImport,key,readSheetMatrix};
root.KPICore=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
