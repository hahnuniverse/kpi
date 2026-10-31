const {test} = require('node:test');
const assert = require('node:assert/strict');
const D = require('./core.js');
const {createSampleRepository, STORAGE_KEY, SAMPLE_ROWS} = require('./core.js');
const row = overrides => ({id:'test',month:'2026-10',department:'영업팀',metric:'매출',target:100,actual:70,evidence:'테스트 근거',...overrides});
function storage(initial = null) {let raw=initial;let writes=0;return {getItem:()=>raw,setItem:(key,value)=>{assert.equal(key,STORAGE_KEY);raw=value;writes++;},get raw(){return raw;},get writes(){return writes;}};}
test('월·부서 필터 교집합과 전체 조회',()=>{
  assert.equal(D.filterRows(SAMPLE_ROWS,{month:'2026-10'}).length,4);
  assert.equal(D.filterRows(SAMPLE_ROWS,{department:'영업팀'}).length,2);
  assert.deepEqual(D.filterRows(SAMPLE_ROWS,{month:'2026-09',department:'파트너사업팀'}).map(r=>r.id),['s8']);
  assert.equal(D.filterRows(SAMPLE_ROWS).length,8);
  assert.equal(D.filterRows(SAMPLE_ROWS,{month:'2027-01'}).length,0);
});
test('10월 합계는 목표 36000, 실적 36500, 달성률 101.388…',()=>{
  const total=D.aggregate(D.filterRows(SAMPLE_ROWS,{month:'2026-10'}));
  assert.equal(total.target,36000);assert.equal(total.actual,36500);assert.equal(total.gap,500);
  assert.ok(Math.abs(total.rate-101.38888888888889)<1e-10);
});
test('달성률은 비율 평균이 아닌 합계 비율',()=>{
  assert.equal(D.aggregate([row({target:100,actual:100}),row({target:900,actual:0})]).rate,10);
});
test('목표가 0인 경우 실적과 무관하게 null, 목표 미설정',()=>{
  assert.equal(D.aggregate([row({target:0,actual:100})]).rate,null);
  assert.equal(D.aggregate([row({target:0,actual:0})]).rate,null);
  assert.equal(D.aggregate([]).rate,null);
});
test('소수 금액 합계 및 차이',()=>{
  assert.equal(D.aggregate([row({target:.1,actual:.2}),row({target:.2,actual:.3})]).target,.3);
  assert.equal(D.aggregate([row({target:.1,actual:.3})]).gap,.2);
});
test('부서별 소계가 전체 합계와 일치',()=>{
  const grouped=D.groupByDepartment(SAMPLE_ROWS);
  assert.equal(grouped.length,4);
  assert.equal(grouped.reduce((a,g)=>a+g.actual,0),D.aggregate(SAMPLE_ROWS).actual);
});
test('음수·무한대·숫자 아닌 금액·잘못된 월·누락·소수 셋째 자리 거부',()=>{
  for(const bad of [{target:-1},{actual:Infinity},{actual:'100'},{month:'2026-13'},{month:'26-01'},{department:' '},{metric:''},{evidence:''},{target:.001},{actual:1e13}]) assert.throws(()=>D.validateRecord(row(bad)));
  assert.throws(()=>D.validateRows([row({}),row({})]));
  assert.throws(()=>D.validateRows({}));
  assert.doesNotThrow(()=>D.validateRecord(row({actual:1000000000000,target:0})));
});
test('첫 조회는 가상 샘플만 반환하고 저장하지 않음',async()=>{
  const s=storage();const repo=createSampleRepository(s);
  assert.equal((await repo.list()).length,8);assert.equal(s.writes,0);
  const first=await repo.list();first[0].actual=999;
  assert.equal((await repo.list())[0].actual,13400);
});
test('명시적 저장과 수정은 브라우저 저장소에만 반영, 재조회 유지',async()=>{
  const s=storage();const repo=createSampleRepository(s);
  await repo.save(row({}));assert.equal((await repo.list()).length,9);assert.equal(s.writes,1);
  await repo.save(row({actual:88}));assert.equal((await repo.list()).length,9);
  assert.equal((await createSampleRepository(s).list()).find(r=>r.id==='test').actual,88);
});
test('빈 목록은 샘플로 대체하지 않음',async()=>{
  const s=storage(JSON.stringify({version:1,rows:[]}));
  assert.deepEqual(await createSampleRepository(s).list(),[]);assert.equal(s.writes,0);
});
test('손상·버전 오류·중복 데이터는 오류이며 원본 보존',async()=>{
  for(const raw of ['{bad','null',JSON.stringify({version:2,rows:[]}),JSON.stringify({version:1,rows:[row({}),row({})]})]){
    const s=storage(raw);const repo=createSampleRepository(s);
    await assert.rejects(repo.list(),/형식/);await assert.rejects(repo.save(row({})),/형식/);
    assert.equal(s.raw,raw);assert.equal(s.writes,0);
  }
});
test('읽기 권한 실패·저장 공간 부족 오류를 구분하고 전파',async()=>{
  const blocked=createSampleRepository({getItem(){throw new Error();},setItem(){throw new Error();}});
  await assert.rejects(blocked.list(),/읽을 수 없습니다/);
  const full=createSampleRepository({getItem(){return null;},setItem(){throw new Error();}});
  await assert.rejects(full.save(row({})),/저장하지 못했습니다/);
  assert.equal((await full.list()).length,8);
});

const fs = require('node:fs');
const path = require('node:path');
test('JSON·UTF-8 CSV 사본이 core.js 샘플 8개와 일치',()=>{
 const json=JSON.parse(fs.readFileSync(path.join(__dirname,'data/kpi.json'),'utf8'));
 assert.deepEqual(json,SAMPLE_ROWS);
 const csv=fs.readFileSync(path.join(__dirname,'data/kpi.csv'),'utf8');
 assert.equal(csv.charCodeAt(0),0xFEFF);
 const parsed=csv.replace(/^\uFEFF/,'').trim().split(/\r?\n/).map(line=>line.split(',').map(v=>{assert.ok(v.startsWith('"')&&v.endsWith('"'));return v.slice(1,-1).replace(/""/g,'"');}));
 const [headers,...rows]=parsed;
 const records=rows.map(values=>Object.fromEntries(headers.map((h,i)=>[h,['target','actual'].includes(h)?Number(values[i]):values[i]])));
 assert.deepEqual(records,SAMPLE_ROWS);
});
test('HTML 상대 경로와 읽기 순서, 외부 통신 없음',()=>{
 const html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
 assert.ok(html.includes('href="./style.css"'));
 assert.ok(html.indexOf('src="./core.js"')<html.indexOf('src="./app.js"'));
 for(const name of ['core.js','app.js']){const text=fs.readFileSync(path.join(__dirname,name),'utf8');assert.ok(!/\bfetch\s*\(|XMLHttpRequest|https?:\/\//.test(text));}
 assert.ok(!/<script>|<style>/.test(html));
});
