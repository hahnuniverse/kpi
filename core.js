/* 계산·값 검사·샘플 데이터와 로컬 저장소. 외부 통신이나 자동 DB 저장 없음. */
(function(root) {
'use strict';
const scope = {};

// 1. 계산과 값 검사
/* Pure business rules. No DOM, network or persistence dependencies. */
(function (root) {
  'use strict';
  const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
  function validateRecord(row) {
    if (!row || typeof row !== 'object') throw new Error('올바른 항목이 아닙니다.');
    if (typeof row.id !== 'string' || !row.id.trim()) throw new Error('항목 ID가 필요합니다.');
    if (!MONTH.test(row.month)) throw new Error('월을 YYYY-MM 형식으로 입력해 주세요.');
    for (const key of ['department', 'metric', 'evidence']) {
      const limit = { department: 30, metric: 60, evidence: 200 }[key];
      if (typeof row[key] !== 'string' || !row[key].trim() || row[key].length > limit) throw new Error('부서·지표·근거의 필수 값과 글자 수를 확인해 주세요.');
    }
    for (const key of ['target', 'actual']) {
      if (typeof row[key] !== 'number' || !Number.isFinite(row[key]) || row[key] < 0 || row[key] > 1e12 || Number(row[key].toFixed(2)) !== row[key]) throw new Error('금액은 0 이상 1조 이하, 소수 둘째 자리까지 입력해 주세요.');
    }
    return row;
  }
  function validateRows(rows) {
    if (!Array.isArray(rows)) throw new Error('데이터 목록 형식이 올바르지 않습니다.');
    const ids = new Set();
    rows.forEach(row => { validateRecord(row); if (ids.has(row.id)) throw new Error('중복된 항목 ID가 있습니다.'); ids.add(row.id); });
    return rows;
  }
  function filterRows(rows, filters = {}) { return rows.filter(r => (!filters.month || r.month === filters.month) && (!filters.department || r.department === filters.department)); }
  function aggregate(rows) {
    const target = rows.reduce((sum, r) => sum + Math.round(r.target * 100), 0) / 100;
    const actual = rows.reduce((sum, r) => sum + Math.round(r.actual * 100), 0) / 100;
    return { target, actual, gap: Math.round((actual - target) * 100) / 100, rate: target === 0 ? null : actual / target * 100, count: rows.length };
  }
  function groupByDepartment(rows) { return [...new Set(rows.map(r => r.department))].sort((a,b)=>a.localeCompare(b,'ko')).map(department => ({ department, ...aggregate(filterRows(rows, {department})) })); }
  const api = { validateRecord, validateRows, filterRows, aggregate, groupByDepartment };
  root.KpiDomain = api;
})(scope);

// 2. 가상 샘플과 읽기·저장 경계
/* Repository boundary: replace createSampleRepository with a real repository later.
   Contract: async list(): Record[], async save(record): Record.
   This file never calls an external service or seeds a database. */
(function (root) {
  'use strict';
  const domain = root.KpiDomain;
  const STORAGE_KEY = 'kpi-dashboard.practice.sample.v1';
  const SAMPLE_ROWS = [
    {id:'s1',month:'2026-10',department:'영업팀',metric:'매출',target:12000,actual:13400,evidence:'가상 자료 · 10월 영업 집계표'},
    {id:'s2',month:'2026-10',department:'마케팅팀',metric:'매출',target:8000,actual:7200,evidence:'가상 자료 · 10월 캠페인 집계표'},
    {id:'s3',month:'2026-10',department:'온라인사업팀',metric:'매출',target:10000,actual:10800,evidence:'가상 자료 · 10월 온라인 매출표'},
    {id:'s4',month:'2026-10',department:'파트너사업팀',metric:'매출',target:6000,actual:5100,evidence:'가상 자료 · 10월 파트너 매출표'},
    {id:'s5',month:'2026-09',department:'영업팀',metric:'매출',target:11000,actual:10300,evidence:'가상 자료 · 9월 영업 집계표'},
    {id:'s6',month:'2026-09',department:'마케팅팀',metric:'매출',target:7500,actual:7900,evidence:'가상 자료 · 9월 캠페인 집계표'},
    {id:'s7',month:'2026-09',department:'온라인사업팀',metric:'매출',target:9000,actual:9600,evidence:'가상 자료 · 9월 온라인 매출표'},
    {id:'s8',month:'2026-09',department:'파트너사업팀',metric:'매출',target:0,actual:900,evidence:'가상 자료 · 목표 미설정 예시'}
  ];
  function createSampleRepository(storage) {
    function read() {
      let raw;
      try { raw = storage.getItem(STORAGE_KEY); } catch { throw new Error('브라우저 저장소를 읽을 수 없습니다. 저장소 권한을 확인해 주세요.'); }
      if (raw === null) return SAMPLE_ROWS.map(row => ({...row}));
      try { const value = JSON.parse(raw); if (value.version !== 1) throw new Error(); return domain.validateRows(value.rows); }
      catch { throw new Error('저장된 샘플 데이터의 형식이 올바르지 않습니다. 자동으로 덮어쓰지 않았습니다.'); }
    }
    return {
      mode:'sample',
      async list() { return read(); },
      async save(record) {
        domain.validateRecord(record);
        const rows = read();
        const index = rows.findIndex(r => r.id === record.id);
        if (index < 0) rows.push({...record}); else rows[index] = {...record};
        domain.validateRows(rows);
        try { storage.setItem(STORAGE_KEY, JSON.stringify({version:1, rows})); }
        catch { throw new Error('브라우저에 저장하지 못했습니다. 저장 공간과 권한을 확인해 주세요. 입력 내용은 그대로 유지됩니다.'); }
        return {...record};
      }
    };
  }
  const api = { createSampleRepository, STORAGE_KEY, SAMPLE_ROWS };
  root.KpiData = api;
})(scope);

const api = Object.freeze({...scope.KpiDomain, ...scope.KpiData});
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else root.KpiCore = api;
})(globalThis);
