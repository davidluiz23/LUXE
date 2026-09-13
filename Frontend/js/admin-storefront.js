(function () {
    'use strict';
    const byId = id => document.getElementById(id);
    const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
    const number = value => new Intl.NumberFormat('en-NG').format(value);
    const date = value => new Intl.DateTimeFormat('en-NG', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Lagos' }).format(new Date(value));
    const time = value => new Intl.DateTimeFormat('en-NG', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Africa/Lagos' }).format(new Date(value));
    let allowed = false;
    let days = 30;
    let metricsRequest = 0;
    let metricsLoading = false;
    let draft = null;
    let revision = null;
    let dirty = false;
    let editorBusy = false;
    let accessVersion = 0;
    const contentApi = window.LuxeSiteContent;

    function status(id, message, error = false) {
        const element = byId(id);
        element.textContent = message;
        element.classList.toggle('is-error', error);
    }
    function clearMetrics() {
        ['audienceVisitors', 'audienceOnline', 'audienceRegistered', 'audienceBanned'].forEach(id => { byId(id).textContent = '—'; });
        ['audienceChart', 'audienceAccountChart', 'audienceDailyRows'].forEach(id => byId(id).replaceChildren());
    }
    function validMetrics(data) {
        const count = value => Number.isSafeInteger(value) && value >= 0;
        return data && data.days === days && data.timezone === 'Africa/Lagos'
            && ['visitors', 'visitorsToday', 'onlineNow', 'registeredAccounts', 'bannedAccounts'].every(key => count(data[key]))
            && data.bannedAccounts <= data.registeredAccounts
            && Number.isFinite(Date.parse(data.generatedAt)) && Number.isFinite(Date.parse(data.trackingStartedAt))
            && Array.isArray(data.series) && data.series.length === days
            && data.series.every(row => /^\d{4}-\d{2}-\d{2}$/.test(row.date) && (row.visitors === null || count(row.visitors)) && count(row.registrations));
    }
    function renderMetrics(data) {
        byId('audienceVisitors').textContent = number(data.visitors);
        byId('audienceOnline').textContent = number(data.onlineNow);
        byId('audienceRegistered').textContent = number(data.registeredAccounts);
        byId('audienceBanned').textContent = number(data.bannedAccounts);
        byId('audienceVisitorLabel').textContent = `Visitors · last ${days} days`;
        const series = data.series;
        const max = Math.max(4, Math.ceil(Math.max(...series.map(row => Math.max(row.visitors || 0, row.registrations))) / 4) * 4);
        const left = 48, top = 20, width = 680, height = 210, step = width / series.length;
        const x = index => left + (index + .5) * step;
        const y = value => top + height - value / max * height;
        const grid = Array.from({ length: 5 }, (_, index) => {
            const value = index * max / 4;
            return `<line x1="${left}" x2="${left + width}" y1="${y(value)}" y2="${y(value)}" class="chart-grid"/><text x="${left - 8}" y="${y(value) + 4}" text-anchor="end">${number(value)}</text>`;
        }).join('');
        const bars = series.map((row, index) => row.visitors === null
            ? `<rect x="${left + index * step}" y="${top}" width="${step}" height="${height}" class="chart-untracked"><title>${escape(date(row.date + 'T12:00:00Z'))}: visit history unavailable</title></rect>`
            : `<rect x="${x(index) - step * .31}" y="${y(row.visitors)}" width="${Math.max(1, step * .62)}" height="${row.visitors / max * height}" rx="2" class="chart-visitors"><title>${escape(date(row.date + 'T12:00:00Z'))}: ${number(row.visitors)} visitors</title></rect>`).join('');
        const path = series.map((row, index) => `${index ? 'L' : 'M'}${x(index)},${y(row.registrations)}`).join(' ');
        const dots = series.map((row, index) => `<circle cx="${x(index)}" cy="${y(row.registrations)}" r="${days > 30 ? 2 : 3}" class="chart-registration-dot"><title>${escape(date(row.date + 'T12:00:00Z'))}: ${number(row.registrations)} registrations</title></circle>`).join('');
        const labels = [0, Math.floor((days - 1) / 2), days - 1].map(index => `<text x="${x(index)}" y="258" text-anchor="${index === 0 ? 'start' : index === days - 1 ? 'end' : 'middle'}">${escape(new Intl.DateTimeFormat('en-NG', { day: 'numeric', month: 'short', timeZone: 'Africa/Lagos' }).format(new Date(series[index].date + 'T12:00:00Z')))}</text>`).join('');
        byId('audienceChart').innerHTML = `<svg viewBox="0 0 748 275" role="img" aria-labelledby="audienceGraphTitle audienceGraphDescription"><title id="audienceGraphTitle">Visitors and registrations over ${days} days</title><desc id="audienceGraphDescription">Gold bars show daily unique browsers. The green line shows new registrations. Shaded dates have no recorded visit history. Exact values are available in View daily numbers below.</desc>${bars}${grid}<path d="${path}" class="chart-registrations"/>${dots}${labels}</svg>`;
        const start = `${date(data.trackingStartedAt)} at ${time(data.trackingStartedAt)} WAT`;
        byId('audienceTrackingNote').textContent = `Visitor tracking started ${start}. Earlier traffic is unavailable; the first tracking day is partial. Today: ${number(data.visitorsToday)} visitors. Daily counts can include the same returning browser on different days.`;
        const notBanned = data.registeredAccounts - data.bannedAccounts;
        const share = data.registeredAccounts ? notBanned / data.registeredAccounts * 100 : 0;
        byId('audienceAccountChart').innerHTML = data.registeredAccounts
            ? `<div class="admin-account-bar" role="img" aria-label="${number(notBanned)} accounts not banned; ${number(data.bannedAccounts)} banned"><span style="width:${share}%"></span><span style="width:${100 - share}%"></span></div><div class="admin-account-labels"><span>Not banned <strong>${number(notBanned)}</strong></span><span>Banned <strong>${number(data.bannedAccounts)}</strong></span></div>`
            : '<p class="admin-chart-note">No registered accounts yet.</p>';
        byId('audienceDailyRows').innerHTML = [...series].reverse().map(row => `<tr><th scope="row">${escape(date(row.date + 'T12:00:00Z'))}</th><td>${row.visitors === null ? 'Not recorded' : number(row.visitors)}</td><td>${number(row.registrations)}</td></tr>`).join('');
        status('audienceStatus', `Updated ${time(data.generatedAt)} WAT · refreshes every 30 seconds while this overview is open.`);
    }
    async function loadMetrics() {
        if (!allowed) return;
        const request = ++metricsRequest;
        metricsLoading = true;
        byId('refreshAudience').disabled = true;
        byId('audienceChart').setAttribute('aria-busy', 'true');
        status('audienceStatus', 'Loading store metrics…');
        try {
            const { data, error } = await window.LuxeStorefront.getAudience(days);
            if (request !== metricsRequest || !allowed) return;
            if (error || !validMetrics(data)) throw new Error(error?.message || 'The database did not return complete metrics.');
            renderMetrics(data);
        } catch (error) {
            if (request !== metricsRequest || !allowed) return;
            clearMetrics();
            status('audienceStatus', `Metrics unavailable. ${error.message} Use Refresh to try again.`, true);
        } finally {
            if (request === metricsRequest) {
                metricsLoading = false;
                byId('refreshAudience').disabled = false;
                byId('audienceChart').setAttribute('aria-busy', 'false');
            }
        }
    }

    function updateEditorControls() {
        byId('storefrontFields').disabled = !allowed || !draft || editorBusy;
        byId('saveStorefront').disabled = !allowed || !draft || editorBusy || !dirty;
        byId('reloadStorefront').disabled = !allowed || editorBusy;
        byId('addStorefrontSlide').disabled = !draft || draft.slides.length >= 12;
        byId('storefrontDraftNote').textContent = editorBusy ? 'Please wait…' : dirty ? 'Unsaved changes · save to publish.' : 'Changes go live when you save.';
    }
    function markDirty() { dirty = true; updateEditorControls(); }
    function itemAt(path) { return path.split('.').reduce((item, key) => item[key], draft); }
    function field(path, key, label, value, max = 300) {
        const id = 'content-' + path.replaceAll('.', '-') + '-' + key;
        return `<label for="${id}">${label}</label><input type="text" id="${id}" data-content-path="${path}" data-content-field="${key}" value="${escape(value)}" maxlength="${max}" required>`;
    }
    function productSelect(path, item) {
        const id = 'content-' + path.replaceAll('.', '-') + '-productId';
        const products = window.getProducts?.() || [];
        const present = products.some(product => Number(product.id) === item.productId);
        return `<label for="${id}">Button destination</label><select id="${id}" data-content-path="${path}" data-content-field="productId"><option value="">Full collection${contentApi.defaults().slides.some(slide => slide.image === item.image) ? ' / matching original tee' : ''}</option>${item.productId && !present ? `<option value="${item.productId}" selected>Linked product #${item.productId} (unavailable)</option>` : ''}${products.map(product => `<option value="${Number(product.id)}"${Number(product.id) === item.productId ? ' selected' : ''}>${escape(product.name)}</option>`).join('')}</select>`;
    }
    function imageEditor(path, item, { wide = false, title = '' } = {}) {
        const id = 'content-' + path.replaceAll('.', '-');
        const image = contentApi.imageUrl(item.image, 640);
        return `<div class="admin-image-editor${wide ? ' wide-image' : ''}"><div class="admin-storefront-preview" data-preview-path="${path}"><img src="${escape(image || 'assets/brand/product-placeholder.svg')}" alt="${escape(title || item.title || 'Image preview')}" loading="lazy" style="object-position:center ${item.focusY ?? 50}%"><span class="admin-preview-error" hidden>Image could not load. Choose another image.</span></div><div class="admin-image-fields">${title ? `<h4>${escape(title)}</h4>` : ''}${field(path, 'image', 'Image URL', item.image, 2048)}<div class="admin-image-upload"><button type="button" class="btn btn-outline" data-upload-path="${path}">Upload image</button><input type="file" id="${id}-file" data-file-path="${path}" accept="image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif,.heic,.heif" hidden><small>JPG, PNG, WebP, AVIF or HEIC · up to 40 MB</small></div>${'focusY' in item ? `<label for="${id}-focusY">Vertical position <output data-focus-output="${path}">${item.focusY}%</output></label><input type="range" id="${id}-focusY" data-content-path="${path}" data-content-field="focusY" min="0" max="100" step="1" value="${item.focusY}">` : ''}${'title' in item ? field(path, 'title', 'Slide title', item.title, 80) : ''}${'alt' in item ? field(path, 'alt', 'Image description', item.alt) : ''}${'linkLabel' in item ? field(path, 'linkLabel', 'Button label', item.linkLabel, 80) : ''}${'productId' in item ? productSelect(path, item) : ''}</div></div>`;
    }
    function bindPreviews() {
        byId('storefrontFields').querySelectorAll('.admin-storefront-preview img').forEach(image => {
            const update = () => { image.nextElementSibling.hidden = image.complete && image.naturalWidth > 0; };
            image.addEventListener('load', update);
            image.addEventListener('error', update);
            if (image.complete) update();
        });
    }
    function renderEditor() {
        byId('storefrontSlides').innerHTML = draft.slides.map((slide, index) => `<article class="admin-slide-editor"><div class="admin-slide-heading"><h4>Slide ${index + 1}</h4><div><button type="button" data-slide-action="up" data-slide-index="${index}" aria-label="Move slide ${index + 1} up"${index === 0 ? ' disabled' : ''}>↑</button><button type="button" data-slide-action="down" data-slide-index="${index}" aria-label="Move slide ${index + 1} down"${index === draft.slides.length - 1 ? ' disabled' : ''}>↓</button><button type="button" data-slide-action="remove" data-slide-index="${index}" aria-label="Remove slide ${index + 1}"${draft.slides.length === 1 ? ' disabled' : ''}>Remove</button></div></div>${imageEditor(`slides.${index}`, slide)}</article>`).join('');
        byId('storefrontCollections').innerHTML = ['men', 'women'].map(key => imageEditor(`collections.${key}`, draft.collections[key], { wide: true, title: key === 'men' ? "Men’s collection" : "Women’s collection" })).join('');
        byId('storefrontDetail').innerHTML = imageEditor('detail', draft.detail, { wide: true });
        bindPreviews();
        updateEditorControls();
    }
    async function loadEditor() {
        if (!allowed || editorBusy) return;
        const access = accessVersion;
        editorBusy = true;
        updateEditorControls();
        status('storefrontStatus', 'Loading published images…');
        try {
            const { data, error } = await contentApi.load();
            if (!allowed || access !== accessVersion) return;
            if (error) throw new Error(error.message);
            draft = JSON.parse(JSON.stringify(data.content));
            revision = data.revision;
            dirty = false;
            renderEditor();
            status('storefrontStatus', `Published images loaded · version ${revision}. Removing a slide removes it from the slideshow; its uploaded file stays available for reuse.`);
        } catch (error) { if (allowed && access === accessVersion) status('storefrontStatus', `Could not load images. ${error.message}`, true); }
        finally { editorBusy = false; updateEditorControls(); }
    }
    byId('storefrontForm').addEventListener('input', event => {
        const input = event.target;
        const path = input.dataset.contentPath;
        if (!allowed || editorBusy || !path || !draft) return;
        const item = itemAt(path), key = input.dataset.contentField;
        item[key] = key === 'focusY' ? Number(input.value) : key === 'productId' ? Number(input.value) || null : input.value;
        markDirty();
        if (key === 'image' || key === 'focusY') {
            const preview = byId('storefrontFields').querySelector(`[data-preview-path="${path}"] img`);
            if (key === 'image') preview.src = contentApi.imageUrl(item.image, 640) || 'assets/brand/product-placeholder.svg';
            else {
                preview.style.objectPosition = `center ${item.focusY}%`;
                byId('storefrontFields').querySelector(`[data-focus-output="${path}"]`).textContent = item.focusY + '%';
            }
        }
    });
    byId('storefrontForm').addEventListener('click', event => {
        if (!allowed || editorBusy || !draft) return;
        const action = event.target.closest('[data-slide-action]');
        if (action) {
            const index = Number(action.dataset.slideIndex), kind = action.dataset.slideAction;
            if (kind === 'remove' && draft.slides.length > 1) draft.slides.splice(index, 1);
            else if (kind === 'up' && index > 0) [draft.slides[index - 1], draft.slides[index]] = [draft.slides[index], draft.slides[index - 1]];
            else if (kind === 'down' && index < draft.slides.length - 1) [draft.slides[index + 1], draft.slides[index]] = [draft.slides[index], draft.slides[index + 1]];
            else return;
            markDirty(); renderEditor();
            const next = kind === 'up' ? index - 1 : kind === 'down' ? index + 1 : Math.min(index, draft.slides.length - 1);
            byId('storefrontSlides').querySelector(`[data-slide-index="${next}"]:not([disabled])`)?.focus({ preventScroll: true });
        }
        const upload = event.target.closest('[data-upload-path]');
        if (upload) byId('storefrontFields').querySelector(`[data-file-path="${upload.dataset.uploadPath}"]`).click();
    });
    byId('storefrontForm').addEventListener('change', async event => {
        const input = event.target, path = input.dataset.filePath, file = input.files?.[0];
        if (!allowed || editorBusy || !path || !file || !draft) return;
        const access = accessVersion;
        editorBusy = true; updateEditorControls();
        status('storefrontStatus', `Uploading ${file.name}…`);
        try {
            const result = await window.LuxeStorage.uploadProductImage(file);
            if (!allowed || access !== accessVersion) return;
            if (result.error || !contentApi.safeImage(result.url)) throw new Error(result.error?.message || 'The upload did not return an image URL.');
            itemAt(path).image = result.url;
            markDirty(); renderEditor();
            status('storefrontStatus', 'Image uploaded. Save images to publish it to the storefront.');
        } catch (error) { if (allowed && access === accessVersion) status('storefrontStatus', `Upload failed. ${error.message}`, true); }
        finally { input.value = ''; editorBusy = false; updateEditorControls(); }
    });
    byId('addStorefrontSlide').addEventListener('click', () => {
        if (!allowed || editorBusy || !draft || draft.slides.length >= 12) return;
        draft.slides.push({ id: 'slide-' + crypto.randomUUID(), title: '', image: '', alt: '', productId: null });
        markDirty(); renderEditor();
        byId('storefrontSlides').lastElementChild.querySelector('input').focus();
        status('storefrontStatus', 'New slide added. Upload a picture, then add its title and image description.');
    });
    byId('storefrontForm').addEventListener('submit', async event => {
        event.preventDefault();
        if (!allowed || editorBusy || !draft || !dirty) return;
        const message = contentApi.validate(draft);
        if (message) { status('storefrontStatus', message, true); return; }
        const access = accessVersion;
        editorBusy = true; updateEditorControls();
        status('storefrontStatus', 'Saving images…');
        try {
            const { data, error } = await contentApi.save(draft, revision);
            if (!allowed || access !== accessVersion) return;
            if (error) throw new Error(error.message);
            revision = data.revision;
            dirty = false;
            status('storefrontStatus', 'Images saved. The homepage and collection pages will use them on their next load.');
        } catch (error) {
            if (allowed && access === accessVersion) status('storefrontStatus', error.message.includes('CONTENT_CONFLICT')
                ? 'Another administrator saved newer images. Your draft is still here. Copy any changes you need, then use Reload published images before saving again.'
                : `Images were not saved. Your changes are still here. ${error.message}`, true);
        } finally { editorBusy = false; updateEditorControls(); }
    });
    byId('reloadStorefront').addEventListener('click', loadEditor);
    byId('refreshAudience').addEventListener('click', loadMetrics);
    document.querySelectorAll('[data-audience-days]').forEach(button => button.addEventListener('click', () => {
        days = Number(button.dataset.audienceDays);
        document.querySelectorAll('[data-audience-days]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
        loadMetrics();
    }));
    function activate(panel) {
        if (!allowed) return;
        if (panel === 'overviewPanel') loadMetrics();
        if (panel === 'storefrontPanel' && !draft) loadEditor();
    }
    window.LuxeAdminStorefront = {
        activate,
        setAccess(value) {
            if (allowed === value) return;
            allowed = value;
            ++accessVersion;
            if (!allowed) { ++metricsRequest; metricsLoading = false; clearMetrics(); draft = null; revision = null; dirty = false; }
            updateEditorControls();
            if (allowed) activate(document.querySelector('.admin-panel.active')?.id);
        },
    };
    window.addEventListener('beforeunload', event => {
        if (!dirty) return;
        event.preventDefault();
        event.returnValue = '';
    });
    window.setInterval(() => {
        if (allowed && !metricsLoading && !document.hidden && byId('overviewPanel').classList.contains('active')) loadMetrics();
    }, 30000);
    document.addEventListener('visibilitychange', () => {
        if (allowed && !metricsLoading && !document.hidden && byId('overviewPanel').classList.contains('active')) loadMetrics();
    });
})();
