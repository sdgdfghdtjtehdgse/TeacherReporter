// ── Globals set by the view ────────────────────────────────────
let SHEET_ID_INIT = window.SHEET_ID_INIT || 0;
let DATA_JSON_RAW = window.DATA_JSON_RAW || '{}';

let sheetId         = SHEET_ID_INIT;
let table           = null;
let parsedData      = null;
let cellStyles      = {};
let selectedCells   = [];
let unsavedChanges  = false;
let autoSaveHandle  = null;   // debounced autosave timer

// ── Tab state ──────────────────────────────────────────────────
let tabs           = [];
let activeTabIndex = 0;

// ── Formula context state ──────────────────────────────────────
let fcmTargetCell = null;
let fcmRange      = null;

// ── Search state ───────────────────────────────────────────────
let lastSearchQuery = '';

// ── Library loading ────────────────────────────────────────────
function loadScript(src, onload) {
    var s = document.createElement('script');
    s.src = src;
    s.onload = onload;
    s.onerror = function () {
        document.getElementById('loading').textContent =
            'Не удалось загрузить библиотеку. Проверьте подключение к интернету..';
    };
    document.head.appendChild(s);
}

function loadStyle(href) {
    var l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = href;
    document.head.appendChild(l);
}

function startLoading() {
    loadStyle('/lib/jsuites/jsuites.css');
    loadStyle('/lib/jspreadsheet/jspreadsheet.css');
    loadScript('/lib/jsuites/jsuites.js', function () {
        loadScript('/lib/jspreadsheet/index.js', function () {
            initSpreadsheet();
        });
    });
}

// ── Init ───────────────────────────────────────────────────────
function initSpreadsheet() {
    document.getElementById('loading').style.display = 'none';

    parsedData = null;
    try {
        if (DATA_JSON_RAW && DATA_JSON_RAW.length > 2)
            parsedData = JSON.parse(DATA_JSON_RAW);
    } catch (e) { parsedData = null; }

    if (parsedData && parsedData.tabs && parsedData.tabs.length > 0) {
        tabs           = parsedData.tabs;
        activeTabIndex = parsedData.activeTab || 0;
    } else if (parsedData && parsedData.data && parsedData.columns) {
        tabs = [{
            name:    'Лист 1',
            data:    parsedData.data,
            columns: parsedData.columns,
            styles:  parsedData.styles || '{}'
        }];
        activeTabIndex = 0;
    } else {
        tabs           = [{ name: 'Лист 1', data: null, columns: null, styles: '{}' }];
        activeTabIndex = 0;
    }

    renderTabBar();
    loadTab(activeTabIndex);
}

// ── Column helpers ─────────────────────────────────────────────
function colIndexToLetter(idx) {
    var letter = '';
    var n = idx;
    while (n >= 0) {
        letter = String.fromCharCode((n % 26) + 65) + letter;
        n = Math.floor(n / 26) - 1;
    }
    return letter;
}

function generateLetterColumns(count) {
    var cols = [];
    for (var i = 0; i < count; i++)
        cols.push({ title: colIndexToLetter(i), width: 120, type: 'text' });
    return cols;
}

function generateBlankRows(rowCount, colCount) {
    var rows = [];
    for (var r = 0; r < rowCount; r++) {
        var row = [];
        for (var c = 0; c < colCount; c++) row.push('');
        rows.push(row);
    }
    return rows;
}

// ── Tab bar ────────────────────────────────────────────────────
function renderTabBar() {
    var bar = document.getElementById('tab-bar');
    bar.innerHTML = '';

    tabs.forEach(function (tab, i) {
        var wrapper = document.createElement('div');
        wrapper.className = 'tab-item' + (i === activeTabIndex ? ' active' : '');

        var nameSpan = document.createElement('span');
        nameSpan.className = 'tab-name';
        nameSpan.textContent = tab.name;
        nameSpan.ondblclick = function (e) {
            e.stopPropagation();
            startRenameTab(i, nameSpan);
        };
        nameSpan.onclick = function () { switchTab(i); };

        var dupBtn = document.createElement('span');
        dupBtn.className = 'tab-dup';
        dupBtn.textContent = '\u29C9'; // ⧉ duplicate icon
        dupBtn.title = 'Дублируйте эту вкладку';
        dupBtn.onclick = (function(idx) {
            return function (e) {
                e.stopPropagation();
                duplicateTab(idx);
            };
        })(i);

        var closeBtn = document.createElement('span');
        closeBtn.className = 'tab-close';
        closeBtn.textContent = '\u2715';
        closeBtn.title = 'Удалить эту вкладку';
        closeBtn.onclick = (function(idx) {
            return function (e) {
                e.stopPropagation();
                deleteTab(idx);
            };
        })(i);

        wrapper.appendChild(nameSpan);
        wrapper.appendChild(dupBtn);
        if (tabs.length > 1) wrapper.appendChild(closeBtn);
        bar.appendChild(wrapper);
    });

    var addBtn = document.createElement('button');
    addBtn.className = 'tab-add-btn';
    addBtn.textContent = '+ Добавить лист';
    addBtn.onclick = addTab;
    bar.appendChild(addBtn);
}

function startRenameTab(index, span) {
    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'tab-rename-input';
    input.value = tabs[index].name;
    span.replaceWith(input);
    input.focus();
    input.select();

    function finish() {
        var newName = input.value.trim() || tabs[index].name;
        tabs[index].name = newName;
        renderTabBar();
        markUnsaved();
    }

    input.onblur = finish;
    input.onkeydown = function (e) {
        if (e.key === 'Enter') input.blur();
        if (e.key === 'Escape') { input.value = tabs[index].name; input.blur(); }
    };
}

// ── Tab switching ──────────────────────────────────────────────
function switchTab(index) {
    if (index === activeTabIndex) return;
    clearSearch();
    destroyCurrentTab();
    activeTabIndex = index;
    renderTabBar();
    loadTab(index);
}

function snapshotCurrentTab() {
    if (!table) return;
    try {
        var colElements = document.querySelectorAll(
            '#spreadsheet .jexcel > thead > tr > td');
        var colDefs = [];
        colElements.forEach(function (td) {
            var txt = td.innerText.trim();
            if (txt !== '')
                colDefs.push({ title: txt, width: td.offsetWidth || 120, type: 'text' });
        });
        tabs[activeTabIndex].data        = table.getData(false);
        tabs[activeTabIndex].columns     = colDefs;
        tabs[activeTabIndex].styles      = getStylesForSave();
        tabs[activeTabIndex].displayData = getDisplayData();
    } catch (e) {
        console.warn('snapshotCurrentTab error:', e);
    }
}

function destroyCurrentTab() {
    snapshotCurrentTab();
    var container = document.getElementById('spreadsheet');
    try {
        if (typeof jspreadsheet !== 'undefined' && container.jspreadsheet)
            jspreadsheet.destroy(container);
        else
            container.innerHTML = '';
    } catch (e) { container.innerHTML = ''; }
    table = null;
}

function getDisplayData() {
    var tbody = document.querySelector('#spreadsheet .jexcel tbody');
    if (!tbody) return [];
    var result = [];
    tbody.querySelectorAll('tr').forEach(function (row) {
        var rowData = [];
        row.querySelectorAll('td').forEach(function (td, x) {
            if (x === 0) return;
            var val = td.innerText.trim();
            if (val === '#ERROR' || val.startsWith('#')) val = '';
            rowData.push(val);
        });
        if (rowData.length > 0) result.push(rowData);
    });
    return result;
}

function loadTab(index) {
    var tab = tabs[index];

    cellStyles = {};
    if (tab.styles) {
        try { cellStyles = JSON.parse(tab.styles); }
        catch (e) { cellStyles = {}; }
    }

    var columns, data;

    if (tab.data && tab.columns) {
        data = tab.data;
        columns = tab.columns.map(function (c) {
            return {
                title: typeof c === 'string' ? c : (c.title || 'Column'),
                width: (c && c.width) ? c.width : 120,
                type:  (c && c.type)  ? c.type  : 'text'
            };
        });
    } else {
        columns = generateLetterColumns(10);
        data    = generateBlankRows(20, 10);
    }

    var container = document.getElementById('spreadsheet');
    container.innerHTML = '';

    table = jspreadsheet(container, {
        data:              data,
        columns:           columns,
        defaultColWidth:   120,
        tableOverflow:     true,
        tableWidth:        window.innerWidth + 'px',
        tableHeight:       (window.innerHeight - 260) + 'px',
        allowInsertRow:    true,
        allowInsertColumn: true,
        allowDeleteRow:    true,
        allowDeleteColumn: true,
        allowRenameColumn: true,
        freezeColumns:     1,
        contextMenu: function (obj, x, y) {
            return buildContextMenu(obj, x, y);
        },
        onchange: function () {
            markUnsaved();
            setTimeout(colorCodeAllCells, 50);
        },
        oninsertrow: function () {
            markUnsaved();
            setTimeout(reapplyAllStyles, 80);
            setTimeout(reapplySearch, 90);
        },
        oninsertcolumn: function () {
            markUnsaved();
            setTimeout(reapplyAllStyles, 80);
        },
        ondeleterow: function () {
            markUnsaved();
            setTimeout(reapplyAllStyles, 80);
            setTimeout(reapplySearch, 90);
        },
        ondeletecolumn: function () {
            markUnsaved();
            setTimeout(reapplyAllStyles, 80);
        }
    });

    setTimeout(function () {
        reapplyAllStyles();
        setupFormulaBar();
        setupCellClickTracking();
        updateFormulaBar(0, 0);
        reapplySearch();
        computeStats();

        var legend = document.getElementById('legend');
        var btn    = document.getElementById('btn-color-legend');
        if (typeof colorLegendActive !== 'undefined' &&
            colorLegendActive) {
            if (legend) legend.style.display = 'flex';
            if (btn)    btn.classList.add('active');
            colorCodeAllCells();
        } else {
            if (legend) legend.style.display = 'none';
            if (btn)    btn.classList.remove('active');
        }
    }, 100);

    // Reset status — do NOT mark as unsaved on tab load
    unsavedChanges = false;
    setStatus('Готовый', 'saved');
}

// ── Add / Delete tab ───────────────────────────────────────────
function addTab() {
    destroyCurrentTab();
    tabs.push({ name: 'Таблица ' + (tabs.length + 1), data: null, columns: null, styles: '{}' });
    activeTabIndex = tabs.length - 1;
    renderTabBar();
    loadTab(activeTabIndex);
    markUnsaved();
}

function deleteTab(index) {
    if (tabs.length <= 1) { showToast('Невозможно удалить единственный лист..', true); return; }
    if (!confirm('Удалить вкладку "' + tabs[index].name + '"?')) return;
    destroyCurrentTab();
    tabs.splice(index, 1);
    if (activeTabIndex >= tabs.length) activeTabIndex = tabs.length - 1;
    renderTabBar();
    loadTab(activeTabIndex);
    markUnsaved();
}

function duplicateTab(index) {
    var source = tabs[index];
    // Snapshot current tab first to capture latest data
    snapshotCurrentTab();

    var copy = {
        name:        source.name + ' (Copy)',
        data:        JSON.parse(JSON.stringify(source.data || [])),
        columns:     JSON.parse(JSON.stringify(source.columns || [])),
        styles:      source.styles || '{}',
        displayData: JSON.parse(JSON.stringify(source.displayData || []))
    };

    // Insert the copy right after the source tab
    tabs.splice(index + 1, 0, copy);

    // If duplicating active tab, destroy it first then reload
    if (index === activeTabIndex) {
        destroyCurrentTab();
        activeTabIndex = index + 1;
    } else if (index < activeTabIndex) {
        activeTabIndex++;
    }

    renderTabBar();
    loadTab(activeTabIndex);
    markUnsaved();
    showToast('Вкладка продублирована!');
}

// ── Save ───────────────────────────────────────────────────────
async function saveSheet(isAutosave) {
    if (!table) {
        if (!isAutosave) showToast('Таблица не готова.', true);
        return;
    }

    snapshotCurrentTab();

    var title = (document.getElementById('sheetTitle').value || '').trim()
        || 'Таблица без имени';

    var dataToSave = { tabs: tabs, activeTab: activeTabIndex };

    var token = document.querySelector(
        '#af-form input[name="__RequestVerificationToken"]');

    try {
        var res = await fetch('/Spreadsheet/Save', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'RequestVerificationToken': token ? token.value : ''
            },
            body: JSON.stringify({
                id:       sheetId,
                title:    title,
                dataJson: JSON.stringify(dataToSave)
            })
        });

        if (!res.ok) {
            var txt = await res.text();
            throw new Error('Статус ' + res.status + ': ' + txt);
        }

        var result = await res.json();
        sheetId = result.id;
        window.history.replaceState({}, '', '/Spreadsheet/Editor/' + sheetId);

        unsavedChanges = false;
        setStatus('Все изменения сохранены', 'saved');

        setTimeout(reapplyAllStyles, 80);
        setTimeout(colorCodeAllCells, 120);

        if (isAutosave) {
            showToast('\u2713 Автоматическое сохранение');
        } else {
            showToast('Сохранено успешно!');
        }

    } catch (e) {
        showToast('Сохранение не удалось: ' + e.message, true);
    }
}

// ── Status helper ──────────────────────────────────────────────
function setStatus(text, cls) {
    var el = document.getElementById('statusText');
    if (!el) return;
    el.textContent = text;
    el.className   = 'status ' + (cls || '');
}

// ── Color coding ───────────────────────────────────────────────
function colorCodeCell(cell, value) {
    if (!cell) return;
    var num = parseFloat(value);
    cell.style.removeProperty('color');
    cell.style.removeProperty('font-weight');
    if (isNaN(num) || String(value).trim() === '') return;
    if (num <= 2) {
        cell.style.setProperty('color', '#ff4444', 'important');
        cell.style.setProperty('font-weight', '600', 'important');
    } else if (num === 3) {
        cell.style.setProperty('color', '#ffc857', 'important');
        cell.style.setProperty('font-weight', 'normal', 'important');
    } else if (num === 4) {
        cell.style.setProperty('color', '#57c8ff', 'important');
        cell.style.setProperty('font-weight', 'normal', 'important');
    } else if (num >= 5) {
        cell.style.setProperty('color', '#57ffb0', 'important');
        cell.style.setProperty('font-weight', '600', 'important');
    }
}

function colorCodeAllCells() {
    // Check page-level toggle if it exists
    if (typeof colorLegendActive !== 'undefined' &&
        !colorLegendActive) return;
    if (!table) return;
    try {
        var tbody = document.querySelector(
            '#spreadsheet .jexcel tbody');
        if (!tbody) { setTimeout(colorCodeAllCells, 200); return; }
        tbody.querySelectorAll('tr').forEach(function (row) {
            row.querySelectorAll('td').forEach(function (cell, x) {
                if (x === 0 || x === 1) return;
                colorCodeCell(cell, cell.innerText.trim());
            });
        });
    } catch (e) { console.warn('colorCodeAllCells:', e); }
}

// ── Formula bar ────────────────────────────────────────────────
function updateFormulaBar(x, y) {
    if (!table) return;
    try {
        document.getElementById('cell-address').textContent =
            colIndexToLetter(x) + (y + 1);
        var v = table.getValueFromCoords(x, y);
        document.getElementById('formula-input').value =
            v !== null && v !== undefined ? v : '';
    } catch (e) { }
}

function setupFormulaBar() {
    var container = document.getElementById('spreadsheet');
    if (!container) return;

    container.addEventListener('click', function (e) {
        var td = e.target.closest('td');
        if (!td) return;
        var tbody = container.querySelector('.jexcel tbody');
        if (!tbody) return;
        var rows  = Array.from(tbody.querySelectorAll('tr'));
        var row   = td.closest('tr');
        var y     = rows.indexOf(row);
        if (y < 0) return;
        var cells = Array.from(row.querySelectorAll('td'));
        var x     = cells.indexOf(td) - 1;
        if (x < 0) return;
        updateFormulaBar(x, y);
    });

    var input = document.getElementById('formula-input');
    input.removeAttribute('readonly');
    input.addEventListener('focus', function () { input.style.borderBottom = '1px solid #e94560'; });
    input.addEventListener('blur',  function () { input.style.borderBottom = ''; });
    input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { input.blur(); applyFormulaBarValue(); }
        if (e.key === 'Escape') input.blur();
    });
}

function applyFormulaBarValue() {
    if (!table) return;
    var addr  = document.getElementById('cell-address').textContent.trim();
    if (!addr) return;
    var match = addr.match(/^([A-Z]+)(\d+)$/);
    if (!match) return;
    var colIdx = 0;
    for (var i = 0; i < match[1].length; i++)
        colIdx = colIdx * 26 + (match[1].charCodeAt(i) - 64);
    colIdx -= 1;
    table.setValueFromCoords(
        colIdx, parseInt(match[2]) - 1,
        document.getElementById('formula-input').value, true);
    setTimeout(colorCodeAllCells, 50);
    markUnsaved();
}

// ── Toolbar ────────────────────────────────────────────────────
function getCellKey(x, y)  { return x + ',' + y; }
function getCellStyle(x, y) { return cellStyles[getCellKey(x, y)] || {}; }
function setCellStyle(x, y, props) {
    cellStyles[getCellKey(x, y)] =
        Object.assign(getCellStyle(x, y), props);
}

function getSelectedCells() {
    if (!table) return [];
    var result = [];
    var tbody  = document.querySelector('#spreadsheet .jexcel tbody');
    if (!tbody) return result;
    tbody.querySelectorAll('tr').forEach(function (row, y) {
        row.querySelectorAll('td').forEach(function (td, rawX) {
            if (td.classList.contains('selected') ||
                td.classList.contains('highlight')) {
                var x = rawX - 1;
                if (x >= 0) result.push({ x: x, y: y, td: td });
            }
        });
    });
    if (result.length === 0 && selectedCells.length > 0)
        return selectedCells;
    return result;
}

function applyStylesWithImportant(td, style) {
    if (!td) return;
    if (style.bold         !== undefined) td.style.setProperty('font-weight',      style.bold ? 'bold' : 'normal',        'important');
    if (style.italic       !== undefined) td.style.setProperty('font-style',       style.italic ? 'italic' : 'normal',    'important');
    if (style.underline    !== undefined) td.style.setProperty('text-decoration',  style.underline ? 'underline' : 'none','important');
    if (style.fontSize     !== undefined) td.style.setProperty('font-size',        style.fontSize,                        'important');
    if (style.textAlign    !== undefined) td.style.setProperty('text-align',       style.textAlign,                       'important');
    if (style.color        !== undefined) td.style.setProperty('color',            style.color,                           'important');
    if (style.backgroundColor !== undefined) td.style.setProperty('background-color', style.backgroundColor,             'important');
}

function applyStylesToCell(td, style) { applyStylesWithImportant(td, style); }

function reapplyAllStyles() {
    if (!table) return;
    var tbody = document.querySelector('#spreadsheet .jexcel tbody');
    if (!tbody) return;
    tbody.querySelectorAll('tr').forEach(function (row, y) {
        row.querySelectorAll('td').forEach(function (td, rawX) {
            var x = rawX - 1;
            if (x < 0) return;
            var style = getCellStyle(x, y);
            if (Object.keys(style).length > 0)
                applyStylesWithImportant(td, style);
        });
    });
    colorCodeAllCells();
}

function setupCellClickTracking() {
    var container = document.getElementById('spreadsheet');
    if (!container) return;
    container.addEventListener('click', function (e) {
        var td = e.target.closest('td');
        if (!td) return;
        var tbody = container.querySelector('.jexcel tbody');
        if (!tbody) return;
        var rows  = Array.from(tbody.querySelectorAll('tr'));
        var row   = td.closest('tr');
        var y     = rows.indexOf(row);
        if (y < 0) return;
        var cells = Array.from(row.querySelectorAll('td'));
        var x     = cells.indexOf(td) - 1;
        if (x < 0) return;
        selectedCells = [{ x: x, y: y, td: td }];
        updateToolbarState(x, y);
    });
}

function updateToolbarState(x, y) {
    var s = getCellStyle(x, y);
    document.getElementById('btn-bold')     .classList.toggle('active', !!s.bold);
    document.getElementById('btn-italic')   .classList.toggle('active', !!s.italic);
    document.getElementById('btn-underline').classList.toggle('active', !!s.underline);
    if (s.color)           document.getElementById('textColor').value = rgbToHex(s.color)           || s.color;
    if (s.backgroundColor) document.getElementById('bgColor')  .value = rgbToHex(s.backgroundColor) || s.backgroundColor;
    if (s.fontSize)        document.getElementById('fontSize')  .value = s.fontSize;
}

function resetToolbarUI() {
    document.getElementById('btn-bold')     .classList.remove('active');
    document.getElementById('btn-italic')   .classList.remove('active');
    document.getElementById('btn-underline').classList.remove('active');
    document.getElementById('fontSize').value = '';
    document.getElementById('textColor').value = '#e0e0e0';
    document.getElementById('bgColor')  .value = '#1a1a2e';
}

function applyBold() {
    var cells  = getSelectedCells(); if (!cells.length) return;
    var newVal = !getCellStyle(cells[0].x, cells[0].y).bold;
    cells.forEach(function (c) { setCellStyle(c.x, c.y, { bold: newVal }); applyStylesToCell(c.td, { bold: newVal }); });
    document.getElementById('btn-bold').classList.toggle('active', newVal);
    markUnsaved();
}

function applyItalic() {
    var cells  = getSelectedCells(); if (!cells.length) return;
    var newVal = !getCellStyle(cells[0].x, cells[0].y).italic;
    cells.forEach(function (c) { setCellStyle(c.x, c.y, { italic: newVal }); applyStylesToCell(c.td, { italic: newVal }); });
    document.getElementById('btn-italic').classList.toggle('active', newVal);
    markUnsaved();
}

function applyUnderline() {
    var cells  = getSelectedCells(); if (!cells.length) return;
    var newVal = !getCellStyle(cells[0].x, cells[0].y).underline;
    cells.forEach(function (c) { setCellStyle(c.x, c.y, { underline: newVal }); applyStylesToCell(c.td, { underline: newVal }); });
    document.getElementById('btn-underline').classList.toggle('active', newVal);
    markUnsaved();
}

function applyFontSize(size) {
    if (!size) return;
    var cells = getSelectedCells(); if (!cells.length) return;
    cells.forEach(function (c) { setCellStyle(c.x, c.y, { fontSize: size }); applyStylesToCell(c.td, { fontSize: size }); });
    markUnsaved();
}

function applyAlign(align) {
    var cells = getSelectedCells(); if (!cells.length) return;
    cells.forEach(function (c) {
        setCellStyle(c.x, c.y, { textAlign: align });
        c.td.style.setProperty('text-align', align, 'important');
    });
    markUnsaved();
}

function applyTextColor(color) {
    var cells = getSelectedCells(); if (!cells.length) return;
    cells.forEach(function (c) { setCellStyle(c.x, c.y, { color: color }); applyStylesToCell(c.td, { color: color }); });
    markUnsaved();
}

function applyBgColor(color) {
    var cells = getSelectedCells(); if (!cells.length) return;
    cells.forEach(function (c) { setCellStyle(c.x, c.y, { backgroundColor: color }); applyStylesToCell(c.td, { backgroundColor: color }); });
    markUnsaved();
}

function undoAction() { if (!table) return; table.undo(); setTimeout(reapplyAllStyles, 80); }
function redoAction() { if (!table) return; table.redo(); setTimeout(reapplyAllStyles, 80); }

function clearFormatting() {
    var cells = getSelectedCells(); if (!cells.length) return;
    cells.forEach(function (c) {
        cellStyles[getCellKey(c.x, c.y)] = {};
        ['font-weight','font-style','text-decoration','font-size',
            'text-align','color','background-color'].forEach(function(p) {
            c.td.style.removeProperty(p);
        });
        c.td.style.setProperty('text-align', 'left', 'important');
    });
    colorCodeAllCells();
    resetToolbarUI();
    markUnsaved();
}

function getStylesForSave() { return JSON.stringify(cellStyles); }

function rgbToHex(rgb) {
    if (!rgb) return null;
    if (rgb.startsWith('#')) return rgb;
    var m = rgb.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (!m) return null;
    return '#' + [m[1],m[2],m[3]].map(function(v){
        return parseInt(v).toString(16).padStart(2,'0');
    }).join('');
}

// ── Toolbar button helpers ─────────────────────────────────────
function addRow() { if (!table) { showToast('Не готов.',true); return; } table.insertRow(); }
function addCol() { if (!table) { showToast('Не готов.',true); return; } table.insertColumn(); }

// ── Formula list ───────────────────────────────────────────────
var FORMULAS = [
    { cat:'Математика и статистика', name:'SUM',       desc:'Сумма всех значений',                                       fn:'SUM'       },
    { cat:'Математика и статистика', name:'AVERAGE',   desc:'Среднее значение всех показателей',                         fn:'AVERAGE'   },
    { cat:'Математика и статистика', name:'MIN',        desc:'Минимальное значение',                                     fn:'MIN'       },
    { cat:'Математика и статистика', name:'MAX',        desc:'Максимальное значение',                                    fn:'MAX'       },
    { cat:'Математика и статистика', name:'COUNT',      desc:'Количество числовых ячеек',                                fn:'COUNT'     },
    { cat:'Математика и статистика', name:'COUNTA',     desc:'Количество непустых ячеек',                                fn:'COUNTA'    },
    { cat:'Математика и статистика', name:'COUNTIF',    desc:'Кол-во ячеек, соответствующих заданному условию.',         fn:'COUNTIF'   },
    { cat:'Математика и статистика', name:'SUMIF',      desc:'Сумма ячеек, соответствующих определенному условию.',      fn:'SUMIF'     },
    { cat:'Математика и статистика', name:'MEDIAN',     desc:'Среднее значение в диапазоне',                             fn:'MEDIAN'    },
    { cat:'Математика и статистика', name:'ROUND',      desc:'Округлите до N знаков после запятой.',                     fn:'ROUND'     },
    { cat:'Математика и статистика', name:'ROUNDUP',    desc:'Округлите до N знаков после запятой в большую сторону.',   fn:'ROUNDUP'   },
    { cat:'Математика и статистика', name:'ROUNDDOWN',  desc:'Округлите до N знаков после запятой в меньшую сторону.',   fn:'ROUNDDOWN' },
    { cat:'Математика и статистика', name:'ABS',        desc:'Абсолютное значение',                                      fn:'ABS'       },
    { cat:'Математика и статистика', name:'MOD',        desc:'Остаток после деления',                                    fn:'MOD'       },
    { cat:'Математика и статистика', name:'POWER',      desc:'Возвести число в степень',                                 fn:'POWER'     },
    { cat:'Математика и статистика', name:'SQRT',       desc:'Квадратный корень',                                        fn:'SQRT'      },
    { cat:'Математика и статистика', name:'INT',        desc:'Округлите до ближайшего целого числа в меньшую сторону.',  fn:'INT'       },
    { cat:'Логический',           name:'IF',         desc:'Если выполняется условие, то значение, иначе значение.',      fn:'IF'        },
    { cat:'Логический',           name:'AND',        desc:'Истинно, если все условия верны.',                            fn:'AND'       },
    { cat:'Логический',           name:'OR',         desc:'Истинно, если выполняется хотя бы одно условие.',             fn:'OR'        },
    { cat:'Логический',           name:'NOT',        desc:'Меняет местами истинное и ложное.',                           fn:'NOT'       },
    { cat:'Логический',           name:'IFERROR',    desc:'Укажите значение, если формула возвращает ошибку.',           fn:'IFERROR'   },
    { cat:'Текст',              name:'CONCAT',     desc:'Объединить текстовые значения',                                 fn:'CONCAT'    },
    { cat:'Текст',              name:'LEFT',       desc:'Извлеките N символов слева.',                                   fn:'LEFT'      },
    { cat:'Текст',              name:'RIGHT',      desc:'Извлеките N символов справа.',                                  fn:'RIGHT'     },
    { cat:'Текст',              name:'MID',        desc:'Извлечь символы из середины',                                   fn:'MID'       },
    { cat:'Текст',              name:'LEN',        desc:'Длина текстовой строки',                                        fn:'LEN'       },
    { cat:'Текст',              name:'UPPER',      desc:'Преобразовать текст в верхний регистр',                         fn:'UPPER'     },
    { cat:'Текст',              name:'LOWER',      desc:'Преобразовать текст в нижний регистр',                          fn:'LOWER'     },
    { cat:'Текст',              name:'TRIM',       desc:'Удалите лишние пробелы',                                        fn:'TRIM'      },
    { cat:'Оценки и посещаемость', name:'AVERAGE',  desc:'Средняя оценка студента',                                      fn:'AVERAGE'   },
    { cat:'Оценки и посещаемость', name:'COUNTIF',  desc:'Учитывайте неудовлетворительные оценки (<3)',                  fn:'COUNTIF'   },
    { cat:'Оценки и посещаемость', name:'SUM',      desc:'Общее количество пропущенных часов',                           fn:'SUM'       },
    { cat:'Оценки и посещаемость', name:'MAX',      desc:'Высшая оценка в классе',                                       fn:'MAX'       },
    { cat:'Оценки и посещаемость', name:'MIN',      desc:'Самая низкая оценка в классе.',                                fn:'MIN'       },
    { cat:'Оценки и посещаемость', name:'MEDIAN',   desc:'Median grade in the class',                                    fn:'MEDIAN'    }
];

var FORMULA_LIST = (function () {
    var seen = {};
    return FORMULAS.filter(function (f) {
        var k = f.cat+'|'+f.name+'|'+f.desc;
        if (seen[k]) return false;
        seen[k] = true;
        return true;
    });
})();

// ── Safe range builder ─────────────────────────────────────────
function parseCellAddr(addr) {
    if (!addr) return null;
    var m = addr.match(/^([A-Z]+)(\d+)$/);
    if (!m) return null;
    var col = 0;
    for (var i = 0; i < m[1].length; i++) col = col*26 + (m[1].charCodeAt(i)-64);
    return { x: col-1, y: parseInt(m[2])-1 };
}

function getSelectionRange() {
    if (!table) return null;
    var tbody = document.querySelector('#spreadsheet .jexcel tbody');
    if (!tbody) return null;
    var highlighted = [];
    tbody.querySelectorAll('tr').forEach(function (row, y) {
        row.querySelectorAll('td').forEach(function (td, rawX) {
            if (td.classList.contains('selected') || td.classList.contains('highlight')) {
                var x = rawX - 1;
                if (x >= 0) highlighted.push({ x:x, y:y });
            }
        });
    });
    if (highlighted.length === 0) return null;
    if (highlighted.length === 1)
        return colIndexToLetter(highlighted[0].x) + (highlighted[0].y+1);
    var xs = highlighted.map(function(c){return c.x;});
    var ys = highlighted.map(function(c){return c.y;});
    return colIndexToLetter(Math.min.apply(null,xs)) + (Math.min.apply(null,ys)+1) + ':' +
        colIndexToLetter(Math.max.apply(null,xs)) + (Math.max.apply(null,ys)+1);
}

function buildSafeRange(targetX, targetY) {
    var selRange = getSelectionRange();

    if (selRange && selRange.indexOf(':') !== -1) {
        var parts = selRange.split(':');
        var start = parseCellAddr(parts[0]);
        var end   = parseCellAddr(parts[1]);
        if (start && end) {
            var isH = (start.y === end.y);
            var isV = (start.x === end.x);
            if (isH) {
                if (targetX === end.x && targetY === end.y && end.x > start.x)
                    return colIndexToLetter(start.x)+(start.y+1)+':'+colIndexToLetter(end.x-1)+(end.y+1);
                if (targetX === start.x && targetY === start.y && end.x > start.x)
                    return colIndexToLetter(start.x+1)+(start.y+1)+':'+colIndexToLetter(end.x)+(end.y+1);
                return selRange;
            }
            if (isV) {
                if (targetX === end.x && targetY === end.y && end.y > start.y)
                    return colIndexToLetter(start.x)+(start.y+1)+':'+colIndexToLetter(end.x)+(end.y);
                return selRange;
            }
            var inside = targetX>=start.x && targetX<=end.x && targetY>=start.y && targetY<=end.y;
            if (!inside) return selRange;
            if (targetX===end.x && targetY===end.y && end.x>start.x)
                return colIndexToLetter(start.x)+(start.y+1)+':'+colIndexToLetter(end.x-1)+(end.y+1);
            return selRange;
        }
    }

    // No multi-cell selection — look for data to the left in same row
    if (targetX > 0 && table) {
        var leftStart = 0;
        for (var col = 0; col < targetX; col++) {
            try {
                var v = table.getValueFromCoords(col, targetY);
                if (v !== null && v !== undefined && String(v).trim() !== '') {
                    leftStart = col; break;
                }
            } catch(e) {}
        }
        if (leftStart < targetX)
            return colIndexToLetter(leftStart)+(targetY+1)+':'+colIndexToLetter(targetX-1)+(targetY+1);
    }

    if (targetY > 0)
        return colIndexToLetter(targetX)+'1:'+colIndexToLetter(targetX)+targetY;

    return colIndexToLetter(targetX+1)+(targetY+1);
}

// ── Formula applier factory ────────────────────────────────────
function makeFormulaApplier(f) {
    return function () {
        if (!table || !fcmTargetCell) return;
        var tx    = fcmTargetCell.x;
        var ty    = fcmTargetCell.y;
        var range = buildSafeRange(tx, ty);
        var formula = '';
        if      (f.fn==='IF')                             formula='=IF('+range+'>0,1,0)';
        else if (f.fn==='IFERROR')                        formula='=IFERROR('+range+',0)';
        else if (f.fn==='COUNTIF')                        formula='=COUNTIF('+range+',"<3")';
        else if (f.fn==='SUMIF')                          formula='=SUMIF('+range+',"<>0")';
        else if (f.fn==='ROUND'||f.fn==='ROUNDUP'||f.fn==='ROUNDDOWN') formula='='+f.fn+'('+range+',2)';
        else if (f.fn==='MOD')                            formula='=MOD('+range+',2)';
        else if (f.fn==='POWER')                          formula='=POWER('+range+',2)';
        else if (f.fn==='LEFT')                           formula='=LEFT('+range+',3)';
        else if (f.fn==='RIGHT')                          formula='=RIGHT('+range+',3)';
        else if (f.fn==='MID')                            formula='=MID('+range+',1,3)';
        else if (f.fn==='CONCAT')                         formula='=CONCAT('+range+')';
        else                                              formula='='+f.fn+'('+range+')';

        table.setValueFromCoords(tx, ty, formula, true);
        document.getElementById('formula-input').value = formula;
        document.getElementById('cell-address').textContent = colIndexToLetter(tx)+(ty+1);
        setTimeout(colorCodeAllCells, 50);
        markUnsaved();
    };
}

// ── Context menu ───────────────────────────────────────────────
function buildContextMenu(obj, x, y) {
    var items = [];

    if (y !== null) {
        items.push({ title:'Вставьте строку выше',  onclick:function(){obj.insertRow(1,parseInt(y),true);} });
        items.push({ title:'Вставьте строку ниже',  onclick:function(){obj.insertRow(1,parseInt(y));} });
        items.push({ title:'Удалить строку',        onclick:function(){obj.deleteRow(obj.getSelectedRows(true));} });
    }

    if (x !== null) {
        items.push({ type:'divisor' });
        items.push({ title:'Вставьте столбец перед', onclick:function(){obj.insertColumn(1,parseInt(x),true);} });
        items.push({ title:'Вставить столбец после',  onclick:function(){obj.insertColumn(1,parseInt(x));} });
        items.push({
            title: 'Задать ширину столбца',
            onclick: function () {
                var ci = parseInt(x);
                var headers = document.querySelectorAll('#spreadsheet .jexcel > thead > tr > td');
                var cur = String((headers[ci+1] && headers[ci+1].offsetWidth) || 120);
                var nw  = prompt('Задать ширину столбца (в пикселях):', cur);
                if (nw === null) return;
                nw = parseInt(nw);
                if (isNaN(nw) || nw < 20) return;
                obj.setWidth(ci, nw);
                markUnsaved();
            }
        });
        items.push({ title:'Удалить столбец', onclick:function(){obj.deleteColumn(obj.getSelectedColumns(true));} });
    }

    items.push({ type:'divisor' });
    items.push({ title:'Копировать',  onclick:function(){obj.copy();} });
    items.push({
        title: 'Вставить',
        onclick: function () {
            if (navigator.clipboard)
                navigator.clipboard.readText().then(function(t){obj.paste(x,y,t);});
        }
    });

    items.push({ type:'divisor' });

    fcmTargetCell = (x!==null && y!==null) ? {x:parseInt(x),y:parseInt(y)} : null;
    fcmRange = fcmTargetCell ? buildSafeRange(fcmTargetCell.x, fcmTargetCell.y) : 'A1';

    var submenuItems = [];
    var lastCat = null;
    FORMULA_LIST.forEach(function (f) {
        if (f.cat !== lastCat) {
            lastCat = f.cat;
            submenuItems.push({ title:'\u2014 '+f.cat+' \u2014', disabled:true });
        }
        submenuItems.push({
            title:   '='+f.name+'('+fcmRange+')',
            tooltip: f.desc,
            onclick: makeFormulaApplier(f)
        });
    });
    items.push({ title:'Вставить формулу \u25B6', submenu:submenuItems });

    return items;
}

// ── Search / Filter ────────────────────────────────────────────
function filterRows(query) {
    lastSearchQuery = query;
    var clearBtn = document.getElementById('search-clear');
    var infoEl   = document.getElementById('search-info');
    if (clearBtn) clearBtn.style.display = query.length > 0 ? 'block' : 'none';

    var tbody = document.querySelector('#spreadsheet .jexcel tbody');
    if (!tbody) return;

    var rows    = tbody.querySelectorAll('tr');
    var total   = rows.length;
    var visible = 0;
    var q       = query.toLowerCase().trim();

    rows.forEach(function (row) {
        var cells    = row.querySelectorAll('td');
        var nameCell = cells[1];
        if (!nameCell) return;
        var name = nameCell.innerText.trim().toLowerCase();
        if (q === '' || name.includes(q)) {
            row.classList.remove('row-hidden');
            if (q !== '' && name.includes(q)) { row.classList.add('row-highlight'); visible++; }
            else { row.classList.remove('row-highlight'); visible++; }
        } else {
            row.classList.add('row-hidden');
            row.classList.remove('row-highlight');
        }
    });

    if (infoEl) {
        if      (q === '')    { infoEl.textContent = ''; }
        else if (visible===0) { infoEl.textContent='Студентов не найдено.'; infoEl.style.color='#e94560'; }
        else { infoEl.textContent=visible+' из '+total+' показаны студенты'; infoEl.style.color='#555'; }
    }
}

function clearSearch() {
    var input = document.getElementById('search-input');
    if (input) input.value = '';
    filterRows('');
    if (input) input.focus();
}

function reapplySearch() { if (lastSearchQuery) filterRows(lastSearchQuery); }

// ── Print / PDF Export ─────────────────────────────────────────
function openPrintDialog() {
    document.getElementById('pd-date').value =
        new Date().toISOString().split('T')[0];
    var titleEl = document.getElementById('sheetTitle');
    if (titleEl && titleEl.value)
        document.getElementById('pd-doc-title').value = titleEl.value;

    var tabSel = document.getElementById('pd-tabs');
    tabSel.innerHTML = '<option value="current">Current tab only</option>';
    if (tabs.length > 1) {
        var allOpt = document.createElement('option');
        allOpt.value = 'all';
        allOpt.textContent = 'Все листы ('+tabs.length+')';
        tabSel.appendChild(allOpt);
        tabs.forEach(function(tab,i) {
            if (i===activeTabIndex) return;
            var opt = document.createElement('option');
            opt.value = 'tab_'+i;
            opt.textContent = 'Tab: '+tab.name;
            tabSel.appendChild(opt);
        });
    }
    document.getElementById('print-overlay').style.display = 'flex';
}

function closePrintDialog() {
    document.getElementById('print-overlay').style.display = 'none';
}

function resolvePrintTabs(tabSel) {
    snapshotCurrentTab();
    var fresh = getDisplayData();
    function resolve(tab) {
        return {
            name:    tab.name,
            columns: tab.columns || [],
            rows:    (tab===tabs[activeTabIndex]) ? fresh : (tab.displayData||tab.data||[])
        };
    }
    if (tabSel==='current') return [resolve(tabs[activeTabIndex])];
    if (tabSel==='all')     return tabs.map(resolve);
    if (tabSel.startsWith('tab_')) return [resolve(tabs[parseInt(tabSel.replace('tab_',''))])];
    return [resolve(tabs[activeTabIndex])];
}

function getFormattedDate(dateVal) {
    if (!dateVal) return '';
    try { return new Date(dateVal).toLocaleDateString('ru-RU',{day:'2-digit',month:'long',year:'numeric'}); }
    catch(e) { return dateVal; }
}

// Browser print
function executePrint() {
    var docTitle = document.getElementById('pd-doc-title').value.trim();
    var school   = document.getElementById('pd-school').value.trim();
    var teacher  = document.getElementById('pd-teacher').value.trim();
    var subject  = document.getElementById('pd-subject').value.trim();
    var date     = document.getElementById('pd-date').value;
    var orient   = document.getElementById('pd-orientation').value;
    var tabSel   = document.getElementById('pd-tabs').value;
    var fmtDate  = getFormattedDate(date);
    var tabsToPrint = resolvePrintTabs(tabSel);

    var win = window.open('','_blank','width=900,height=700,scrollbars=yes');
    if (!win) { showToast('Всплывающее окно заблокировано.',true); return; }

    win.document.documentElement.lang='ru';
    win.document.head.innerHTML='<meta charset="utf-8"/><title>'+escHtml(docTitle||'Report')+'</title>';
    var styleEl=win.document.createElement('style');
    styleEl.textContent=buildPrintCSS(orient);
    win.document.head.appendChild(styleEl);

    tabsToPrint.forEach(function(tab,tabIdx) {
        var page=win.document.createElement('div'); page.className='page';
        if (tabIdx===0||tabSel==='all') {
            var hdr=win.document.createElement('div'); hdr.className='header';
            var top=win.document.createElement('div'); top.className='header-top';
            var sc=win.document.createElement('div'); sc.className='school-name'; sc.textContent=school||'TeacherReporter'; top.appendChild(sc);
            var dt=win.document.createElement('div'); dt.className='doc-date'; dt.textContent=fmtDate; top.appendChild(dt);
            hdr.appendChild(top);
            if (docTitle){var t2=win.document.createElement('div');t2.className='doc-title';t2.textContent=docTitle;hdr.appendChild(t2);}
            var mt=win.document.createElement('div'); mt.className='doc-meta';
            if (teacher){var s1=win.document.createElement('span');s1.textContent='Teacher: '+teacher;mt.appendChild(s1);}
            if (subject){var s2=win.document.createElement('span');s2.textContent='Subject/Class: '+subject;mt.appendChild(s2);}
            hdr.appendChild(mt); page.appendChild(hdr);
        }
        if (tabsToPrint.length>1){var tn=win.document.createElement('div');tn.className='tab-name';tn.textContent=tab.name;page.appendChild(tn);}

        var cols=tab.columns||[], rows=tab.rows||[];
        if (cols.length>0) {
            var tbl=win.document.createElement('table');
            var cg=win.document.createElement('colgroup');
            var tot=0; cols.forEach(function(c){tot+=(c&&c.width)?c.width:120;});
            cols.forEach(function(c){var ce=win.document.createElement('col');ce.style.width=((((c&&c.width)?c.width:120)/tot)*100).toFixed(2)+'%';cg.appendChild(ce);});
            tbl.appendChild(cg);
            var th2=win.document.createElement('thead'),hr=win.document.createElement('tr');
            cols.forEach(function(c){var th=win.document.createElement('th');th.textContent=typeof c==='string'?c:(c.title||'');hr.appendChild(th);});
            th2.appendChild(hr);tbl.appendChild(th2);
            var tb2=win.document.createElement('tbody');
            rows.forEach(function(row){
                var tr=win.document.createElement('tr');
                row.forEach(function(cell,ci){
                    var td2=win.document.createElement('td');
                    var val=String(cell!==null&&cell!==undefined?cell:'');
                    td2.textContent=val;
                    if(ci>0){var num=parseFloat(val);if(!isNaN(num)){if(num<=2)td2.className='grade-fail';else if(num===3)td2.className='grade-sat';else if(num===4)td2.className='grade-good';else if(num>=5)td2.className='grade-excel';}}
                    tr.appendChild(td2);
                });
                tb2.appendChild(tr);
            });
            tbl.appendChild(tb2);page.appendChild(tbl);
        }
        var ft=win.document.createElement('div');ft.className='footer';
        var fl=win.document.createElement('span');fl.textContent='Сгенерировано программой TeacherReporter.';
        var fr=win.document.createElement('span');fr.textContent=fmtDate;
        ft.appendChild(fl);ft.appendChild(fr);page.appendChild(ft);
        win.document.body.appendChild(page);
    });

    win.focus();
    setTimeout(function(){win.print();},600);
    closePrintDialog();
}

function buildPrintCSS(orient) {
    var pg='size: A4 '+orient+'; margin: 15mm 10mm 12mm 10mm;';
    return ['@page { '+pg+' }',
        '*{box-sizing:border-box;margin:0;padding:0;}',
        'body{font-family:Segoe UI,Arial,sans-serif;font-size:10px;color:#111;background:white;}',
        '.page{page-break-after:always;padding-bottom:10px;}',
        '.page:last-child{page-break-after:avoid;}',
        '.header{border-bottom:2px solid #222;padding-bottom:8px;margin-bottom:12px;}',
        '.header-top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px;}',
        '.school-name{font-size:12px;font-weight:bold;}',
        '.doc-date{font-size:9px;color:#555;text-align:right;}',
        '.doc-title{font-size:14px;font-weight:bold;margin-bottom:3px;}',
        '.doc-meta{font-size:9px;color:#555;display:flex;gap:20px;}',
        '.tab-name{font-size:10px;font-weight:600;margin-bottom:6px;color:#333;padding:2px 0;border-bottom:1px solid #ddd;}',
        'table{width:100%;border-collapse:collapse;font-size:9px;table-layout:fixed;}',
        'thead tr{background:#f0f0f0;}',
        'thead th{border:1px solid #ccc;padding:3px 4px;text-align:left;font-weight:600;font-size:8px;text-transform:uppercase;letter-spacing:.03em;color:#444;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
        'tbody td{border:1px solid #ddd;padding:3px 4px;vertical-align:middle;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
        'tbody tr:nth-child(even){background:#fafafa;}',
        '.grade-fail{color:#cc0000;font-weight:bold;}',
        '.grade-sat{color:#b87000;}',
        '.grade-good{color:#006699;}',
        '.grade-excel{color:#007733;font-weight:bold;}',
        '.footer{margin-top:10px;padding-top:5px;border-top:1px solid #ddd;font-size:8px;color:#999;display:flex;justify-content:space-between;}'
    ].join(' ');
}

// Save as PDF using pdfmake
function exportToPDF() {
    if (typeof pdfMake === 'undefined') {
        showToast('Библиотека PDF не загружена. Проверьте файлы в /lib/pdfmake/.', true);
        return;
    }

    var docTitle = document.getElementById('pd-doc-title').value.trim();
    var school   = document.getElementById('pd-school').value.trim();
    var teacher  = document.getElementById('pd-teacher').value.trim();
    var subject  = document.getElementById('pd-subject').value.trim();
    var date     = document.getElementById('pd-date').value;
    var orient   = document.getElementById('pd-orientation').value;
    var tabSel   = document.getElementById('pd-tabs').value;
    var fmtDate  = getFormattedDate(date);
    var tabsToPrint = resolvePrintTabs(tabSel);

    var isLand = orient === 'landscape';

    // A4 in points: portrait 595.28 x 841.89, landscape 841.89 x 595.28
    // margins [left, top, right, bottom] in points
    var marginL  = 28, marginR = 28;  // ~10mm each
    var pageW_pt = isLand ? 841.89 : 595.28;
    var contentW = pageW_pt - marginL - marginR;  // ~539 portrait, ~786 landscape

    var content = [];

    tabsToPrint.forEach(function (tab, tabIdx) {
        if (tabIdx > 0) content.push({ text:'', pageBreak:'before' });

        // Header
        if (tabIdx === 0 || tabSel === 'all') {
            content.push({
                columns: [
                    { text: school || 'TeacherReporter', fontSize:12, bold:true, color:'#111111' },
                    { text: fmtDate, fontSize:9, color:'#555555', alignment:'right' }
                ],
                margin: [0,0,0,3]
            });
            if (docTitle) content.push({ text:docTitle, fontSize:15, bold:true, color:'#111111', margin:[0,0,0,3] });
            var metaParts = [];
            if (teacher) metaParts.push('Учитель: '+teacher);
            if (subject) metaParts.push('Предмет/Класс: '+subject);
            if (metaParts.length>0)
                content.push({ text:metaParts.join('     '), fontSize:9, color:'#555555', margin:[0,0,0,3] });
            content.push({
                canvas:[{ type:'line', x1:0,y1:0, x2:contentW,y2:0, lineWidth:1, lineColor:'#222222' }],
                margin:[0,0,0,8]
            });
        }

        if (tabsToPrint.length > 1)
            content.push({ text:tab.name, fontSize:11, bold:true, color:'#333333', margin:[0,0,0,5] });

        var cols = tab.columns || [];
        var rows = tab.rows    || [];
        if (cols.length === 0 || rows.length === 0) return;

        // Calculate exact proportional column widths in points
        var totalPx = 0;
        cols.forEach(function(c){ totalPx += (c&&c.width)?c.width:120; });

        var colWidths = cols.map(function(c) {
            var w = (c&&c.width)?c.width:120;
            return parseFloat((w/totalPx*contentW).toFixed(2));
        });

        // Adjust last column so total exactly equals contentW
        var sumW = colWidths.reduce(function(a,b){return a+b;},0);
        colWidths[colWidths.length-1] += parseFloat((contentW - sumW).toFixed(2));

        // Auto-reduce font size for wide tables
        var bodyFontSize = cols.length > 10 ? 6 : (cols.length > 7 ? 7 : 8);
        var headFontSize = bodyFontSize - 1;

        var tableBody = [];

        // Header row
        tableBody.push(cols.map(function(c) {
            return {
                text:      typeof c==='string' ? c : (c.title||''),
                fontSize:  headFontSize,
                bold:      true,
                color:     '#444444',
                fillColor: '#F0F0F0',
                margin:    [2,2,2,2]
            };
        }));

        // Data rows
        rows.forEach(function(row, ri) {
            tableBody.push(row.map(function(cell, ci) {
                var val      = cell!==null&&cell!==undefined ? String(cell) : '';
                var txtColor = '#1E1E1E';
                var isBold   = false;
                if (ci > 0) {
                    var num = parseFloat(val);
                    if (!isNaN(num)) {
                        if      (num<=2) { txtColor='#CC0000'; isBold=true; }
                        else if (num===3){ txtColor='#B87000'; }
                        else if (num===4){ txtColor='#006699'; }
                        else if (num>=5) { txtColor='#007733'; isBold=true; }
                    }
                }
                var cellObj = {
                    text:      val,
                    fontSize:  bodyFontSize,
                    color:     txtColor,
                    margin:    [2,2,2,2]
                };
                if (isBold)    cellObj.bold      = true;
                if (ri%2!==0)  cellObj.fillColor = '#FAFAFA';
                return cellObj;
            }));
        });

        content.push({
            table: {
                headerRows: 1,
                widths:     colWidths,
                body:       tableBody
            },
            layout: {
                hLineWidth:    function(){ return 0.4; },
                vLineWidth:    function(){ return 0.4; },
                hLineColor:    function(){ return '#CCCCCC'; },
                vLineColor:    function(){ return '#CCCCCC'; },
                paddingLeft:   function(){ return 2; },
                paddingRight:  function(){ return 2; },
                paddingTop:    function(){ return 2; },
                paddingBottom: function(){ return 2; }
            },
            margin: [0,0,0,8]
        });
    });

    var docDef = {
        pageOrientation: isLand ? 'landscape' : 'portrait',
        pageSize:        'A4',
        pageMargins:     [marginL, 20, marginR, 28],
        content:         content,
        footer: function(currentPage, pageCount) {
            return {
                columns: [
                    { text:'Сгенерировано программой TeacherReporter.', fontSize:7, color:'#999999', margin:[marginL,0,0,0] },
                    { text:fmtDate+'  |  '+currentPage+' / '+pageCount, fontSize:7, color:'#999999', alignment:'right', margin:[0,0,marginR,0] }
                ]
            };
        },
        defaultStyle: { font:'Roboto' }
    };

    var filename = (docTitle||'report')
        .replace(/[^a-zA-Z0-9_\-\s\u0400-\u04FF]/g,'')
        .trim().replace(/\s+/g,'_') || 'report';

    pdfMake.createPdf(docDef).download(filename+'.pdf');
    showToast('PDF сохранен!');
    closePrintDialog();
}

// ── Excel Export ───────────────────────────────────────────────
function exportToExcel() {
    if (!table) { showToast('Таблица не готова.', true); return; }
    if (typeof XLSX === 'undefined') { showToast('Библиотека Excel не загружена.', true); return; }

    snapshotCurrentTab();

    var title = (document.getElementById('sheetTitle').value||'').trim() || 'Таблица без имени';
    var wb    = XLSX.utils.book_new();

    tabs.forEach(function(tab, tabIdx) {
        var cols = tab.columns||[];
        var rows = (tab===tabs[activeTabIndex]) ? getDisplayData() : (tab.displayData||tab.data||[]);

        var sheetData = [];
        rows.forEach(function(row) {
            sheetData.push(row.map(function(cell) {
                var val = cell!==null&&cell!==undefined ? String(cell) : '';
                val = val.trim();
                if (val.startsWith('=')||val.startsWith('#')) return '';
                var num = parseFloat(val);
                if (!isNaN(num)&&isFinite(num)&&val!=='') return num;
                return val;
            }));
        });

        if (!sheetData.length) return;
        var ws = XLSX.utils.aoa_to_sheet(sheetData);
        ws['!cols'] = cols.map(function(c){ return {wch:Math.max(8,Math.round(((c&&c.width)?c.width:120)/7))}; });

        var sheetName = tab.name.replace(/[:\\\/\?\*\[\]]/g,'').substring(0,31)||('Sheet'+(tabIdx+1));
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
    });

    var filename = title.replace(/[^a-zA-Z0-9_\-\s\u0400-\u04FF]/g,'').trim().replace(/\s+/g,'_')||'spreadsheet';
    XLSX.writeFile(wb, filename+'.xlsx');
    showToast('Файл Excel загружен!');
}

function escHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
window.escHtml = escHtml;

// ── Helpers ────────────────────────────────────────────────────
function markUnsaved() {
    unsavedChanges = true;
    setStatus('Есть несохранённые изменения...', 'unsaved');

    // Debounced autosave: save 30s after the LAST change
    if (autoSaveHandle) clearTimeout(autoSaveHandle);
    autoSaveHandle = setTimeout(function () {
        autoSaveHandle = null;
        if (unsavedChanges && table) saveSheet(true);
    }, 30000);
}

// ── Export functions to global scope for HTML onclick handlers ──
window.saveSheet        = saveSheet;
window.openPrintDialog  = openPrintDialog;
window.closePrintDialog = closePrintDialog;
window.executePrint     = executePrint;
window.exportToPDF      = exportToPDF;
window.exportToExcel    = exportToExcel;
window.addRow           = addRow;
window.addCol           = addCol;
window.applyBold        = applyBold;
window.applyItalic      = applyItalic;
window.applyUnderline   = applyUnderline;
window.applyFontSize    = applyFontSize;
window.applyAlign       = applyAlign;
window.applyTextColor   = applyTextColor;
window.applyBgColor     = applyBgColor;
window.undoAction       = undoAction;
window.redoAction       = redoAction;
window.clearFormatting  = clearFormatting;
window.filterRows       = filterRows;
window.clearSearch      = clearSearch;
window.toggleStats      = toggleStats;
window.escHtml          = escHtml;

function showToast(msg, isError) {
    var t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.toggle('error', !!isError);
    t.classList.add('show');
    setTimeout(function(){ t.classList.remove('show'); }, 3500);
}