(() => {
  'use strict';
  const catalog = window.MODEL_CATALOG;
  const $ = id => document.getElementById(id);
  if (!catalog?.items?.length) {
    $('result-count').textContent = '目录暂时无法加载，请刷新页面重试。';
    return;
  }
  const items = catalog.items;
  const byId = new Map(items.map(item => [item.id, item]));
  const pageSize = 32;
  const rigLabels = {controller: '带控制器', rigged: '已绑定', none: '未绑定', unknown: '未标注绑定'};
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char]));
  const safeURL = value => {
    try { const url = new URL(value, location.href); return ['http:', 'https:', 'file:'].includes(url.protocol) ? url.href : ''; }
    catch { return ''; }
  };
  const shortTitle = item => item.display_title.replace(/(?:Blender|Blend)模型$/i, '').trim();
  const params = new URLSearchParams(location.search);
  const state = {q: (params.get('q') || '').slice(0, 180), tag: params.get('tag') || '', renderer: params.get('renderer') || '', rig: params.get('rig') || '', sort: params.get('sort') || 'newest', page: Math.max(1, Number(params.get('page')) || 1)};
  if (!['newest', 'oldest', 'title'].includes(state.sort)) state.sort = 'newest';
  if (state.rig && !Object.hasOwn(rigLabels, state.rig)) state.rig = '';
  let filtered = [], activeItem = null, gallery = [], imageIndex = 0, toastTimer;
  const tagCounts = new Map();
  for (const item of items) {
    item.searchText = [item.title, item.id, ...item.tags.map(tag => tag.name), ...Object.values(item.metadata)].join(' ').toLowerCase();
    for (const tag of item.tags) tagCounts.set(tag.name, (tagCounts.get(tag.name) || 0) + 1);
  }
  const displayedTags = [...tagCounts].filter(([name]) => name !== 'Blender模型').sort((a, b) => b[1] - a[1]);
  if (state.tag && !tagCounts.has(state.tag)) state.tag = '';
  const renderers = [...new Set(items.map(item => item.renderer_group))].sort((a, b) => a.localeCompare(b));
  if (state.renderer && !renderers.includes(state.renderer)) state.renderer = '';
  $('renderer-filter').insertAdjacentHTML('beforeend', renderers.map(value => `<option value="${escape(value)}">${escape(value)}</option>`).join(''));
  $('total-count').textContent = items.length;
  $('collection-date').textContent = `${new Date(catalog.collected_at).toLocaleDateString('zh-CN', {timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit'}).replaceAll('/', '.')} 整理`;
  $('search').value = state.q;
  $('renderer-filter').value = state.renderer;
  $('rig-filter').value = state.rig;
  $('sort').value = state.sort;

  function updateURL() {
    const query = new URLSearchParams();
    for (const key of ['q', 'tag', 'renderer', 'rig']) if (state[key]) query.set(key, state[key]);
    if (state.sort !== 'newest') query.set('sort', state.sort);
    if (state.page > 1) query.set('page', state.page);
    const suffix = query.toString();
    try { history.replaceState(null, '', location.pathname + (suffix ? '?' + suffix : '') + location.hash); } catch {}
  }

  function renderTags() {
    const options = [['', items.length], ...displayedTags];
    $('tag-filters').innerHTML = options.map(([name, count]) => `<button type="button" class="tag-button${state.tag === name ? ' active' : ''}" data-tag="${escape(name)}" aria-pressed="${state.tag === name}"><span>${escape(name || '全部模型')}</span><span class="tag-count">${count}</span></button>`).join('');
  }

  function render() {
    const keywords = state.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    filtered = items.filter(item => keywords.every(word => item.searchText.includes(word)) && (!state.tag || item.tags.some(tag => tag.name === state.tag)) && (!state.renderer || item.renderer_group === state.renderer) && (!state.rig || item.rigging_status === state.rig));
    filtered.sort(state.sort === 'title' ? (a, b) => a.display_title.localeCompare(b.display_title, 'zh-CN') : state.sort === 'oldest' ? (a, b) => a.published_at.localeCompare(b.published_at) : (a, b) => b.published_at.localeCompare(a.published_at));
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    state.page = Math.min(totalPages, state.page);
    const start = (state.page - 1) * pageSize;
    const visible = filtered.slice(start, start + pageSize);
    $('result-count').innerHTML = filtered.length ? `<strong>${filtered.length}</strong> 个模型 <span>· 当前 ${start + 1}–${start + visible.length} 项</span>` : '0 个匹配模型';
    $('model-grid').innerHTML = visible.map(item => `<article class="model-card"><button type="button" class="card-open" data-open="${item.id}" aria-label="查看 ${escape(shortTitle(item))} 的详情"><figure class="card-image">${item.preview_file ? `<img src="${escape(item.preview_file)}" alt="${escape(shortTitle(item))}" loading="lazy" decoding="async" width="660" height="440">` : '<div class="no-preview">暂无预览</div>'}<span class="card-id">NO. ${item.id}</span>${item.rigging_status === 'controller' || item.rigging_status === 'rigged' ? `<span class="card-badge">${rigLabels[item.rigging_status]}</span>` : ''}</figure><h2 class="card-title">${escape(shortTitle(item))}</h2></button><div class="card-meta"><span>${escape(item.renderer || '渲染器未标注')}</span><a href="${escape(safeURL(item.url))}" target="_blank" rel="noopener noreferrer" aria-label="在原站查看 ${escape(shortTitle(item))}">原站 ↗</a></div></article>`).join('');
    $('empty-state').hidden = filtered.length > 0;
    $('previous-page').disabled = state.page <= 1;
    $('next-page').disabled = state.page >= totalPages;
    const pages = new Set([1, totalPages, state.page - 1, state.page, state.page + 1].filter(page => page >= 1 && page <= totalPages));
    let last = 0, pageHTML = '';
    for (const page of [...pages].sort((a, b) => a - b)) {
      if (last && page - last > 1) pageHTML += '<span class="page-ellipsis">…</span>';
      pageHTML += `<button type="button" class="page-button${page === state.page ? ' active' : ''}" data-page="${page}" aria-label="第 ${page} 页"${page === state.page ? ' aria-current="page"' : ''}>${page}</button>`;
      last = page;
    }
    $('page-numbers').innerHTML = pageHTML;
    renderTags();
    updateURL();
  }

  function clearFilters() {
    Object.assign(state, {q: '', tag: '', renderer: '', rig: '', page: 1});
    $('search').value = ''; $('renderer-filter').value = ''; $('rig-filter').value = '';
    render();
  }
  function changePage(page) {
    state.page = page;
    render();
    document.querySelector('.toolbar').scrollIntoView({behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start'});
  }
  function showToast(message) {
    clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false;
    toastTimer = setTimeout(() => { $('toast').hidden = true; }, 2600);
  }
  function cleanItem(item) { const {searchText, ...data} = item; return data; }
  function downloadJSON(data, filename) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], {type: 'application/json;charset=utf-8'}));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename;
    document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function showImage() {
    const selected = gallery[imageIndex];
    $('image-error').hidden = true;
    $('detail-image').src = selected.src;
    $('detail-image').alt = `${shortTitle(activeItem)} · 预览 ${imageIndex + 1}`;
    $('image-count').textContent = `${imageIndex + 1} / ${gallery.length}`;
    $('previous-image').disabled = gallery.length <= 1;
    $('next-image').disabled = gallery.length <= 1;
    $('open-image').href = safeURL(selected.original || activeItem.url);
  }
  function openDetail(id, changeHash = true) {
    const item = byId.get(id); if (!item) return;
    activeItem = item; imageIndex = 0;
    gallery = [{src: item.preview_file || item.cover_source_url, original: item.cover_source_url}, ...item.images.filter(image => image.url !== item.cover_source_url).map(image => ({src: safeURL(image.url), original: image.url}))].filter(image => image.src);
    $('detail-id').textContent = `MODEL NO. ${item.id}`;
    $('detail-title').textContent = item.display_title;
    $('detail-tags').innerHTML = item.tags.map(tag => `<span>${escape(tag.name)}</span>`).join('');
    const fields = {...item.metadata, '发布时间': item.published_at.slice(0, 10)};
    if (!fields['模型格式']) fields['模型格式'] = '原站未单独标注（归于 Blender 分类）';
    if (!fields['骨骼绑定']) fields['骨骼绑定'] = '未标注';
    $('detail-fields').innerHTML = Object.entries(fields).map(([key, value]) => `<div><dt>${escape(key)}</dt><dd>${escape(value || '未标注')}</dd></div>`).join('');
    const description = item.description.trim();
    const onlyMetadata = /^(格式|模型格式)[：:\s]/.test(description) && description.length < 200;
    $('description-section').hidden = !description || onlyMetadata;
    $('detail-description').textContent = description;
    $('detail-source').href = safeURL(item.url);
    if (gallery.length) showImage();
    if (!$('detail-dialog').open) $('detail-dialog').showModal();
    if (changeHash) { try { history.replaceState(null, '', location.pathname + location.search + '#model-' + id); } catch {} }
  }
  function moveImage(delta) { if (!gallery.length) return; imageIndex = (imageIndex + delta + gallery.length) % gallery.length; showImage(); }

  let searchTimer;
  $('search').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { state.q = $('search').value.slice(0, 180); state.page = 1; render(); }, 140); });
  $('tag-filters').addEventListener('click', event => { const button = event.target.closest('[data-tag]'); if (button) { state.tag = button.dataset.tag; state.page = 1; render(); } });
  for (const [id, key] of [['renderer-filter', 'renderer'], ['rig-filter', 'rig'], ['sort', 'sort']]) $(id).addEventListener('change', () => { state[key] = $(id).value; state.page = 1; render(); });
  $('clear-filters').addEventListener('click', clearFilters); $('empty-reset').addEventListener('click', clearFilters);
  $('previous-page').addEventListener('click', () => changePage(state.page - 1));
  $('next-page').addEventListener('click', () => changePage(state.page + 1));
  $('page-numbers').addEventListener('click', event => { const button = event.target.closest('[data-page]'); if (button) changePage(Number(button.dataset.page)); });
  $('model-grid').addEventListener('click', event => { const button = event.target.closest('[data-open]'); if (button) openDetail(Number(button.dataset.open)); });
  $('close-detail').addEventListener('click', () => $('detail-dialog').close());
  $('detail-dialog').addEventListener('click', event => { if (event.target === $('detail-dialog')) { const box = event.target.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) event.target.close(); } });
  $('detail-dialog').addEventListener('close', () => { try { history.replaceState(null, '', location.pathname + location.search); } catch {} });
  $('previous-image').addEventListener('click', () => moveImage(-1)); $('next-image').addEventListener('click', () => moveImage(1));
  $('detail-image').addEventListener('error', () => { $('image-error').hidden = false; if (activeItem?.preview_file && !$('detail-image').src.endsWith(activeItem.preview_file)) $('detail-image').src = activeItem.preview_file; });
  $('export-button').addEventListener('click', () => downloadJSON({...catalog, items: items.map(cleanItem)}, 'wankucg_blender_animals_metadata.json'));
  $('export-item').addEventListener('click', () => { if (activeItem) downloadJSON(cleanItem(activeItem), `wankucg_${activeItem.id}_metadata.json`); });
  $('share-button').addEventListener('click', async () => { try { await navigator.clipboard.writeText(location.href); showToast('链接已复制，可以直接分享'); } catch { showToast('请复制浏览器地址栏中的链接'); } });
  document.addEventListener('keydown', event => {
    const editing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
    if (event.key === '/' && !editing && !$('detail-dialog').open) { event.preventDefault(); $('search').focus(); }
    if ($('detail-dialog').open && !editing && event.key === 'ArrowRight') moveImage(1);
    if ($('detail-dialog').open && !editing && event.key === 'ArrowLeft') moveImage(-1);
  });
  render();
  const initialId = location.hash.match(/^#model-(\d+)$/)?.[1];
  if (initialId) openDetail(Number(initialId), false);
})();
