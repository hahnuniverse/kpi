/* View/controller. Inject a repository with the same list/save contract here. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const {filterRows, aggregate, groupByDepartment, validateRows, validateRecord} = KpiCore;
  // Do not access storage until list/save, so blocked storage produces a visible error.
  const repository = KpiCore.createSampleRepository({getItem:key=>window.localStorage.getItem(key), setItem:(key,value)=>window.localStorage.setItem(key,value)});
  const fmt = value => new Intl.NumberFormat('ko-KR',{maximumFractionDigits:2}).format(value);
  const rateText = value => value === null ? '목표 미설정' : `${value.toFixed(1)}%`;
  const esc = value => String(value).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let records = [], editingId = null, loading = false;
  function refreshDepartments() {
    const current = $('department').value;
    const departments = [...new Set(records.map(r=>r.department))].sort((a,b)=>a.localeCompare(b,'ko'));
    $('department').replaceChildren(new Option('전체 부서',''), ...departments.map(d=>new Option(d,d)));
    $('department').value = departments.includes(current) ? current : '';
  }
  function render() {
    const rows = filterRows(records,{month:$('month').value,department:$('department').value});
    const sum = aggregate(rows);
    $('scope').textContent = `${$('month').value || '전체 월'} · ${$('department').value || '전체 부서'} · ${rows.length}개 항목`;
    $('total-target').textContent = rows.length ? fmt(sum.target) : '—';
    $('total-actual').textContent = rows.length ? fmt(sum.actual) : '—';
    $('total-rate').textContent = rows.length ? rateText(sum.rate) : '—';
    $('total-gap').textContent = rows.length ? `${sum.gap>0?'+':''}${fmt(sum.gap)}` : '—';
    $('row-count').textContent = rows.length;
    $('empty').hidden = rows.length !== 0;
    $('table-wrap').hidden = rows.length === 0;
    $('rows').innerHTML = rows.map(row=>{
      const rate = aggregate([row]).rate;
      return `<tr><td>${esc(row.month)}</td><td>${esc(row.department)}</td><td>${esc(row.metric)}</td><td class="number">${fmt(row.target)}</td><td class="number">${fmt(row.actual)}</td><td class="number"><span class="pill ${rate===null?'unset':rate<100?'low':''}">${rateText(rate)}</span></td><td>${esc(row.evidence)}</td><td><button class="row-edit" data-id="${esc(row.id)}" aria-label="${esc(row.department)} ${esc(row.metric)} 수정">수정</button></td></tr>`;
    }).join('');
    $('totals').innerHTML = `<tr><td colspan="3">합계 <span class="count">${rows.length}개</span></td><td class="number">${fmt(sum.target)}</td><td class="number">${fmt(sum.actual)}</td><td class="number">${rateText(sum.rate)}</td><td colspan="2">동일 단위 · 만원</td></tr>`;
    const groups = groupByDepartment(rows);
    const max = Math.max(1,...groups.flatMap(g=>[g.target,g.actual]));
    $('chart').innerHTML = groups.length ? groups.map(g=>`<div class="chart-dept"><div class="chart-dept-title"><strong>${esc(g.department)}</strong><span class="chart-rate">${rateText(g.rate)}</span></div>${[['목표',g.target,''],['실적',g.actual,'actual']].map(([label,value,cls])=>`<div class="bar-row" aria-label="${label} ${fmt(value)} 만원"><span>${label}</span><div class="bar-track" aria-hidden="true"><div class="bar ${cls}" style="width:${value/max*100}%"></div></div><b>${fmt(value)}</b></div>`).join('')}</div>`).join('') : '<p>선택한 조건에 비교할 항목이 없습니다.</p>';
  }
  async function load() {
    if (loading) return;
    loading = true;
    $('add').disabled = true;
    $('retry').disabled = true;
    $('load-error').hidden = true;
    $('results').hidden = true;
    $('notice').textContent = '데이터를 불러오는 중입니다…';
    try {
      const next = await repository.list();
      validateRows(next);
      records = next;
      refreshDepartments(); render();
      $('results').hidden = false;
      $('add').disabled = false;
    } catch (error) {
      $('load-error').hidden = false;
      $('load-error-detail').textContent = error.message;
    } finally { loading = false; $('retry').disabled = false; $('notice').textContent = ''; }
  }
  function openEditor(row) {
    editingId = row?.id || null;
    $('record-form').reset();
    $('form-error').textContent = '';
    $('editor-title').textContent = row ? '실적 수정' : '실적 입력';
    const values = row || {month:$('month').value || '2026-10',department:$('department').value,metric:'매출',target:'',actual:'',evidence:''};
    for (const key of ['month','department','metric','target','actual','evidence']) $('record-form').elements[key].value = values[key];
    $('editor').showModal();
  }
  $('month').addEventListener('change',render);
  $('department').addEventListener('change',render);
  $('reset').addEventListener('click',()=>{$('month').value='2026-10';$('department').value='';render();});
  $('add').addEventListener('click',()=>openEditor());
  $('empty-add').addEventListener('click',()=>openEditor());
  $('rows').addEventListener('click',event=>{const button=event.target.closest('[data-id]');if(button)openEditor(records.find(r=>r.id===button.dataset.id));});
  for (const id of ['close-dialog','cancel']) $(id).addEventListener('click',()=>$('editor').close());
  $('retry').addEventListener('click',load);
  $('record-form').addEventListener('submit',async event=>{
    event.preventDefault();
    const data = new FormData(event.target);
    const record = {id:editingId || (globalThis.crypto?.randomUUID?.() || `local-${Date.now()}-${Math.random().toString(36).slice(2)}`)};
    for(const key of ['month','department','metric','evidence']) record[key]=String(data.get(key)).trim();
    record.target=Number(data.get('target'));record.actual=Number(data.get('actual'));
    $('save').disabled=true;
    $('form-error').textContent='';
    try {
      validateRecord(record);
      await repository.save(record);
      const index = records.findIndex(r=>r.id===record.id);
      if(index<0) records.push(record); else records[index]=record;
      refreshDepartments();
      $('month').value=record.month;
      $('department').value=record.department;
      render();
      $('editor').close();
      $('notice').textContent='이 브라우저에 저장했습니다. 저장한 항목의 월·부서로 필터를 맞췄습니다.';
    } catch(error) { $('form-error').textContent=error.message; }
    finally { $('save').disabled=false; }
  });
  load();
})();
