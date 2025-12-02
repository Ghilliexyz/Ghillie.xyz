// /assets/js/dbviewer.js
// Generic SQLite DB viewer, wired into #db-viewer on ghillie.xyz

(() => {
  const root = document.getElementById('db-viewer');
  if (!root) return;

  const els = {
    fileInput: document.getElementById('fileInput'),
    dbInfo: document.getElementById('dbInfo'),
    tableList: document.getElementById('tableList'),
    tableMeta: document.getElementById('tableMeta'),
    filterButtons: document.getElementById('filterButtons'),
    graphButtons: document.getElementById('graphButtons'),
    dataTable: document.getElementById('dataTable'),
    chartArea: document.getElementById('chartArea'),
    status: document.getElementById('statusText'),
    clearBtn: document.getElementById('clearBtn'),
    card: root.querySelector('.cardGlow'),

    // new toys
    rowSearchInput: document.getElementById('rowSearchInput'),
    exportCsvBtn: document.getElementById('exportCsvBtn'),
    exportJsonBtn: document.getElementById('exportJsonBtn'),
    columnStats: document.getElementById('columnStats'),
    sqlInput: document.getElementById('sqlInput'),
    runSqlBtn: document.getElementById('runSqlBtn'),
    sqlStatus: document.getElementById('sqlStatus')
  };

  if (!els.fileInput || !els.tableList || !els.dataTable) return;

  let SQL = null;
  let db = null;
  let currentTable = null;
  let chart = null;

  // remember dummy: this is the raw result from the last query (before search/sort)
  let baseResult = null;
  // remember dummy: this is what you're actually showing after search/sort
  let filteredRows = [];
  // remember dummy: keep track of which column is sorted and how
  let currentSort = null; // { index, dir: 'asc' | 'desc' }
  // remember dummy: last search term typed in the quick-search box
  let currentSearchTerm = '';
  // remember dummy: types for the *current table* (for stats + smarter graphs)
  let currentColumnTypes = [];

  function setStatus(msg) {
    if (els.status) {
      els.status.textContent = msg || '';
    }
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[ch]));
  }

  function clearChart() {
    if (chart) {
      chart.destroy();
      chart = null;
    }
    if (els.chartArea) {
      els.chartArea.style.display = 'none';
    }
  }

  function clearUi() {
    els.tableList.innerHTML = '<li class="dbv-table-list-empty">No DB loaded</li>';
    els.tableMeta.innerHTML = '<p class="muted">Upload a SQLite DB to get started.</p>';
    els.filterButtons.innerHTML = '';
    els.graphButtons.innerHTML = '';
    els.dataTable.innerHTML = '';
    if (els.columnStats) els.columnStats.innerHTML = '';
    if (els.rowSearchInput) els.rowSearchInput.value = '';
    if (els.sqlInput) els.sqlInput.value = '';
    if (els.sqlStatus) els.sqlStatus.textContent = '';
    baseResult = null;
    filteredRows = [];
    currentSort = null;
    currentSearchTerm = '';
    currentColumnTypes = [];
    clearChart();
  }

  function initSql() {
    if (!window.initSqlJs) {
      setStatus('sql.js failed to load');
      return;
    }

    window.initSqlJs({
      locateFile: (file) => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.7.0/${file}`
    }).then((SQLLib) => {
      SQL = SQLLib;
      if (els.dbInfo) {
        els.dbInfo.textContent = 'Ready. Upload a SQLite .db file.';
      }
      setStatus('');
    }).catch((err) => {
      console.error(err);
      if (els.dbInfo) {
        els.dbInfo.textContent = 'Failed to initialise sql.js';
      }
      setStatus('Error');
    });
  }

  function openDatabase(file) {
    if (!file) return;
    if (!SQL) {
      setStatus('Still loading engine… try again in a second.');
      return;
    }

    setStatus('Opening database…');

    file.arrayBuffer().then((buf) => {
      try {
        if (db) {
          db.close();
          db = null;
        }
        db = new SQL.Database(new Uint8Array(buf));
        if (els.dbInfo) {
          els.dbInfo.textContent = `Loaded ${file.name}`;
        }
        setStatus('');
        clearChart();
        clearUi();
        loadTables();
      } catch (e) {
        console.error(e);
        if (els.dbInfo) {
          els.dbInfo.textContent = 'Error opening DB – is it a SQLite file?';
        }
        setStatus('Error');
        clearUi();
      }
    }).catch((err) => {
      console.error(err);
      if (els.dbInfo) {
        els.dbInfo.textContent = 'Could not read file.';
      }
      setStatus('Error');
      clearUi();
    });
  }

  function loadTables() {
    if (!db) return;

    let res;
    try {
      res = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;");
    } catch (e) {
      console.error(e);
      els.tableList.innerHTML = '<li class="dbv-table-list-empty">Error reading tables</li>';
      return;
    }

    els.tableList.innerHTML = '';

    if (!res.length || !res[0].values.length) {
      els.tableList.innerHTML = '<li class="dbv-table-list-empty">No user tables found</li>';
      els.tableMeta.innerHTML = '<p class="muted">This database has no user tables.</p>';
      return;
    }

    res[0].values.forEach(([name], index) => {
      const li = document.createElement('li');
      li.textContent = name;
      li.addEventListener('click', () => selectTable(name, li));
      els.tableList.appendChild(li);

      if (index === 0) {
        selectTable(name, li);
      }
    });
  }

  function selectTable(name, liElement) {
    currentTable = name;

    Array.from(els.tableList.children).forEach((li) => {
      li.classList.remove('dbv-active');
    });
    if (liElement) {
      liElement.classList.add('dbv-active');
    }

    renderTableMetaAndSample(name);
    buildSmartDropdowns(name);
    clearChart();
  }

  function renderTableMetaAndSample(table) {
    if (!db) return;

    let rowCount = 0;
    try {
      const countRes = db.exec(`SELECT COUNT(*) AS c FROM "${table}"`);
      rowCount = countRes[0].values[0][0];
    } catch (e) {
      console.warn('COUNT failed', e);
    }

    let schemaRes;
    try {
      schemaRes = db.exec(`PRAGMA table_info("${table}")`);
    } catch (e) {
      console.error(e);
      els.tableMeta.innerHTML = '<p class="muted">Error reading table schema.</p>';
      return;
    }

    const cols = schemaRes[0].values.map(([cid, name, type, notnull, dflt, pk]) => ({
      name,
      type,
      pk
    }));

    // remember dummy: cache column types for stats + numeric/datetime detection
    currentColumnTypes = cols.map((c) => ({
      name: c.name,
      type: (c.type || '').toUpperCase()
    }));

    els.tableMeta.innerHTML = `
      <p class="itemsMeta">${rowCount} rows • ${cols.length} columns</p>
      <ul class="col-list">
        ${cols.map((c) => `
          <li>
            <strong>${escapeHtml(c.name)}</strong>
            <span>${(c.type || 'TEXT')}${c.pk ? ' • PK' : ''}</span>
          </li>
        `).join('')}
      </ul>
    `;

    let sampleRes;
    try {
      sampleRes = db.exec(`SELECT * FROM "${table}" LIMIT 100`);
    } catch (e) {
      console.error(e);
      els.dataTable.innerHTML = '<p class="muted">Error reading table data.</p>';
      baseResult = null;
      filteredRows = [];
      updateNumericStats();
      return;
    }

    if (!sampleRes.length) {
      els.dataTable.innerHTML = '<p class="muted">No rows in this table.</p>';
      baseResult = null;
      filteredRows = [];
      updateNumericStats();
      return;
    }

    renderResultTable(sampleRes[0]);
  }

  function renderResultTable(result) {
    if (!result || !result.columns) {
      els.dataTable.innerHTML = '<p class="muted">No results.</p>';
      baseResult = null;
      filteredRows = [];
      updateNumericStats();
      return;
    }

    // remember dummy: always clone arrays so you don't mutate sql.js internals
    baseResult = {
      columns: result.columns.slice(),
      values: result.values.slice()
    };

    // reset search + sort whenever the underlying result changes
    currentSearchTerm = '';
    currentSort = null;
    if (els.rowSearchInput) els.rowSearchInput.value = '';

    applySearchAndRender();
  }

  function applySearchAndRender() {
    if (!baseResult) {
      els.dataTable.innerHTML = '<p class="muted">No results.</p>';
      updateNumericStats();
      return;
    }

    // remember dummy: don't touch baseResult.values, always work on a copy
    let rows = baseResult.values.slice();

    // quick search across all columns
    if (currentSearchTerm && currentSearchTerm.trim() !== '') {
      const term = currentSearchTerm.toLowerCase();
      rows = rows.filter((row) =>
        row.some((value) =>
          value !== null && String(value).toLowerCase().includes(term)
        )
      );
    }

    // sorting
    if (currentSort && typeof currentSort.index === 'number') {
      const { index, dir } = currentSort;
      const direction = dir === 'desc' ? -1 : 1;

      rows.sort((a, b) => {
        const va = a[index];
        const vb = b[index];

        if (va == null && vb == null) return 0;
        if (va == null) return 1;
        if (vb == null) return -1;

        const na = Number(va);
        const nb = Number(vb);
        const bothNumeric = !Number.isNaN(na) && !Number.isNaN(nb);

        if (bothNumeric) {
          if (na === nb) return 0;
          return na < nb ? -1 * direction : 1 * direction;
        }

        const sa = String(va).toLowerCase();
        const sb = String(vb).toLowerCase();
        if (sa === sb) return 0;
        return sa < sb ? -1 * direction : 1 * direction;
      });
    }

    filteredRows = rows;

    const columns = baseResult.columns;

    const headerHtml = columns.map((c, idx) => {
      let classes = ['dbv-sortable'];
      let icon = '';
      if (currentSort && currentSort.index === idx) {
        classes.push(currentSort.dir === 'desc' ? 'dbv-sort-desc' : 'dbv-sort-asc');
        icon = currentSort.dir === 'desc' ? ' ▼' : ' ▲';
      }
      return `<th data-col-index="${idx}" class="${classes.join(' ')}">${escapeHtml(c)}${icon}</th>`;
    }).join('');

    const rowsHtml = filteredRows.map((row) => `
      <tr>
        ${row.map((v) => `
          <td>${v === null ? '<em>null</em>' : escapeHtml(String(v)).slice(0, 200)}</td>
        `).join('')}
      </tr>
    `).join('');

    els.dataTable.innerHTML = `
      <div class="dbv-table-inner">
        <table>
          <thead>
            <tr>${headerHtml}</tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    `;

    attachHeaderSortHandlers();
    updateNumericStats();
  }

  function attachHeaderSortHandlers() {
    const headers = els.dataTable.querySelectorAll('th.dbv-sortable');
    headers.forEach((th) => {
      const idx = Number(th.dataset.colIndex);
      if (Number.isNaN(idx)) return;

      th.addEventListener('click', () => {
        if (!baseResult) return;
        if (currentSort && currentSort.index === idx) {
          // remember dummy: second click flips ASC <-> DESC
          currentSort.dir = currentSort.dir === 'asc' ? 'desc' : 'asc';
        } else {
          currentSort = { index: idx, dir: 'asc' };
        }
        applySearchAndRender();
      });
    });
  }

  function updateNumericStats() {
    if (!els.columnStats) return;

    if (!baseResult || !currentColumnTypes.length || !baseResult.values.length) {
      els.columnStats.innerHTML = '';
      return;
    }

    const numericCols = currentColumnTypes
      .map((col, idx) => ({ idx, col }))
      .filter(({ col }) => {
        const t = col.type || '';
        return /INT|REAL|FLOA|DOUB|NUMERIC|DEC/.test(t);
      });

    if (!numericCols.length) {
      els.columnStats.innerHTML = '';
      return;
    }

    const rows = baseResult.values;

    const pills = numericCols.map(({ idx, col }) => {
      let count = 0;
      let min = Number.POSITIVE_INFINITY;
      let max = Number.NEGATIVE_INFINITY;
      let sum = 0;

      rows.forEach((row) => {
        const raw = row[idx];
        if (raw === null || raw === undefined) return;
        const n = Number(raw);
        if (Number.isNaN(n)) return;
        count += 1;
        if (n < min) min = n;
        if (n > max) max = n;
        sum += n;
      });

      if (!count) return '';

      const avg = sum / count;

      return `
        <div class="dbv-stat-pill">
          <strong>${escapeHtml(col.name)}</strong>
          <span>min ${min.toFixed(2)} • max ${max.toFixed(2)} • avg ${avg.toFixed(2)} • n ${count}</span>
        </div>
      `;
    }).filter(Boolean);

    els.columnStats.innerHTML = pills.join('');
  }

  // Build a single <select> with all suggestions
  function buildDropdown(container, placeholder, options) {
    container.innerHTML = '';

    if (!options.length) {
      const span = document.createElement('span');
      span.className = 'itemsMeta';
      span.textContent = 'No suggestions';
      container.appendChild(span);
      return;
    }

    const select = document.createElement('select');
    select.className = 'dbv-select';

    const defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.textContent = placeholder;
    defaultOpt.disabled = true;
    defaultOpt.selected = true;
    select.appendChild(defaultOpt);

    options.forEach((opt, index) => {
      const o = document.createElement('option');
      o.value = String(index);
      o.textContent = opt.label;
      select.appendChild(o);
    });

    select.addEventListener('change', () => {
      const idx = parseInt(select.value, 10);
      if (!Number.isNaN(idx) && options[idx] && typeof options[idx].run === 'function') {
        options[idx].run();
      }
    });

    container.appendChild(select);
  }

  function isDateLikeColumn(col) {
    const name = (col.name || '').toLowerCase();
    const type = (col.type || '').toUpperCase();
    if (type.includes('DATE') || type.includes('TIME')) return true;
    if (name.includes('date') || name.includes('time') || name.endsWith('_at')) return true;
    return false;
  }

  function buildSmartDropdowns(table) {
    if (!db) return;

    els.filterButtons.innerHTML = '';
    els.graphButtons.innerHTML = '';

    let schemaRes;
    try {
      schemaRes = db.exec(`PRAGMA table_info("${table}")`);
    } catch (e) {
      console.error(e);
      return;
    }

    const cols = schemaRes[0].values.map(([cid, name, type]) => ({
      name,
      type: (type || '').toUpperCase()
    }));

    const filterOptions = [];
    const graphOptions = [];

    // Global filter
    filterOptions.push({
      label: 'Show first 500 rows',
      run: () => runAndRender(`SELECT * FROM "${table}" LIMIT 500`)
    });

    cols.forEach((col) => {
      const isNumeric = /INT|REAL|FLOA|DOUB|NUMERIC/.test(col.type);

      if (isNumeric) {
        // Top 10 by numeric column
        filterOptions.push({
          label: `Top 10 by ${col.name}`,
          run: () => runAndRender(`SELECT * FROM "${table}" ORDER BY "${col.name}" DESC LIMIT 10`)
        });

        // Histogram graph option
        graphOptions.push({
          label: `Histogram of ${col.name}`,
          run: () => drawHistogram(table, col.name)
        });
      } else {
        // For text-like columns, build top-5 value filters
        try {
          const topRes = db.exec(`
            SELECT "${col.name}" AS v, COUNT(*) AS c
            FROM "${table}"
            GROUP BY "${col.name}"
            ORDER BY c DESC
            LIMIT 5
          `);

          if (topRes.length) {
            const cats = topRes[0].values;
            cats.forEach(([val, count]) => {
              const labelValue = (val === null ? 'NULL' : String(val)).slice(0, 24);
              const label = `${col.name} = "${labelValue}" (${count})`;

              filterOptions.push({
                label,
                run: () => {
                  if (val === null) {
                    runAndRender(
                      `SELECT * FROM "${table}" WHERE "${col.name}" IS NULL LIMIT 200`
                    );
                  } else {
                    const safeVal = String(val).replace(/'/g, "''");
                    runAndRender(
                      `SELECT * FROM "${table}"
                       WHERE "${col.name}" = '${safeVal}'
                       LIMIT 200`
                    );
                  }
                }
              });
            });
          }
        } catch (e) {
          console.warn('Top categories failed for', col.name, e);
        }
      }
    });

    // One generic bar chart (first TEXT vs first NUMERIC)
    const firstText = cols.find((c) => !/INT|REAL|FLOA|DOUB|NUMERIC/.test(c.type));
    const firstNum = cols.find((c) => /INT|REAL|FLOA|DOUB|NUMERIC/.test(c.type));

    if (firstText && firstNum) {
      graphOptions.push({
        label: `Bar: avg ${firstNum.name} by ${firstText.name}`,
        run: () => drawCategoryBar(table, firstText.name, firstNum.name)
      });
    }

    // time-aware graphs for date-ish columns
    const dateCols = cols.filter(isDateLikeColumn);
    dateCols.forEach((col) => {
      graphOptions.push({
        label: `Rows per day (${col.name})`,
        run: () => drawTimeBuckets(table, col.name, 'day')
      });
      graphOptions.push({
        label: `Rows per month (${col.name})`,
        run: () => drawTimeBuckets(table, col.name, 'month')
      });
    });

    buildDropdown(els.filterButtons, 'Select a filter…', filterOptions);
    buildDropdown(els.graphButtons, 'Select a graph…', graphOptions);
  }

  function runAndRender(sql) {
    if (!db) return;

    let res;
    try {
      res = db.exec(sql);
    } catch (e) {
      console.error(e);
      els.dataTable.innerHTML = '<p class="muted">Error running query.</p>';
      baseResult = null;
      filteredRows = [];
      updateNumericStats();
      return;
    }

    if (!res.length || !res[0].values.length) {
      els.dataTable.innerHTML = '<p class="muted">No results.</p>';
      baseResult = null;
      filteredRows = [];
      updateNumericStats();
      return;
    }

    renderResultTable(res[0]);
  }

  function drawHistogram(table, colName) {
    if (!db || !els.chartArea || !window.Chart) return;

    let res;
    try {
      res = db.exec(`
        SELECT "${colName}" AS v
        FROM "${table}"
        WHERE "${colName}" IS NOT NULL
        LIMIT 5000
      `);
    } catch (e) {
      console.error(e);
      return;
    }

    if (!res.length) return;

    const values = res[0].values
      .map(([v]) => Number(v))
      .filter((v) => !Number.isNaN(v));

    if (!values.length) return;

    const min = Math.min(...values);
    const max = Math.max(...values);
    const bins = 12;
    const step = (max - min) / bins || 1;
    const counts = new Array(bins).fill(0);

    values.forEach((v) => {
      let idx = Math.floor((v - min) / step);
      if (idx >= bins) idx = bins - 1;
      if (idx < 0) idx = 0;
      counts[idx]++;
    });

    const labels = counts.map((_, i) => {
      const start = min + i * step;
      const end = start + step;
      return `${start.toFixed(1)}–${end.toFixed(1)}`;
    });

    const ctx = els.chartArea.getContext('2d');
    els.chartArea.style.display = 'block';

    if (chart) chart.destroy();
    chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: `Histogram of ${colName}`,
          data: counts
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { ticks: { maxRotation: 0, minRotation: 0 } },
          y: { beginAtZero: true }
        }
      }
    });
  }

  function drawCategoryBar(table, catCol, numCol) {
    if (!db || !els.chartArea || !window.Chart) return;

    let res;
    try {
      res = db.exec(`
        SELECT "${catCol}" AS cat, AVG("${numCol}") AS v
        FROM "${table}"
        WHERE "${numCol}" IS NOT NULL
        GROUP BY "${catCol}"
        ORDER BY v DESC
        LIMIT 20
      `);
    } catch (e) {
      console.error(e);
      return;
    }

    if (!res.length) return;

    const labels = res[0].values.map(([cat]) =>
      cat === null ? 'NULL' : String(cat)
    );
    const data = res[0].values.map(([_, v]) => Number(v));

    const ctx = els.chartArea.getContext('2d');
    els.chartArea.style.display = 'block';

    if (chart) chart.destroy();
    chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: `Average ${numCol} by ${catCol}`,
          data
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { beginAtZero: true }
        }
      }
    });
  }

  function drawTimeBuckets(table, colName, granularity) {
    if (!db || !els.chartArea || !window.Chart) return;

    // remember dummy: we assume ISO-ish strings, so substr() is enough here
    const len = granularity === 'month' ? 7 : 10; // YYYY-MM vs YYYY-MM-DD

    let res;
    try {
      res = db.exec(`
        SELECT substr("${colName}", 1, ${len}) AS bucket, COUNT(*) AS c
        FROM "${table}"
        WHERE "${colName}" IS NOT NULL
        GROUP BY bucket
        ORDER BY bucket
      `);
    } catch (e) {
      console.error(e);
      return;
    }

    if (!res.length || !res[0].values.length) return;

    const labels = res[0].values.map(([bucket]) =>
      bucket === null ? 'NULL' : String(bucket)
    );
    const data = res[0].values.map(([_, c]) => Number(c));

    const ctx = els.chartArea.getContext('2d');
    els.chartArea.style.display = 'block';

    if (chart) chart.destroy();
    chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: `${granularity === 'month' ? 'Rows per month' : 'Rows per day'} (${colName})`,
          data
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { ticks: { maxRotation: 45, minRotation: 0 } },
          y: { beginAtZero: true }
        }
      }
    });
  }

  // exports ----------------------------------------------------

  function csvEscape(value) {
    if (value === null || value === undefined) return '';
    const s = String(value);
    if (/[",\n\r]/.test(s)) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function exportAsCsv() {
    if (!baseResult || !filteredRows.length) {
      setStatus('Nothing to export, chief.');
      return;
    }

    const columns = baseResult.columns;
    const rows = filteredRows;
    const csvRows = [];

    csvRows.push(columns.map(csvEscape).join(','));
    rows.forEach((row) => {
      const line = row.map((value) => csvEscape(value));
      csvRows.push(line.join(','));
    });

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    triggerDownload(blob, `${currentTable || 'result'}.csv`);
  }

  function exportAsJson() {
    if (!baseResult || !filteredRows.length) {
      setStatus('Nothing to export, chief.');
      return;
    }

    const columns = baseResult.columns;
    const rows = filteredRows;

    const data = rows.map((row) => {
      const obj = {};
      columns.forEach((col, idx) => {
        obj[col] = row[idx];
      });
      return obj;
    });

    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json;charset=utf-8;'
    });
    triggerDownload(blob, `${currentTable || 'result'}.json`);
  }

  // SQL console ------------------------------------------------

  function runSqlConsoleQuery() {
    if (!db) {
      if (els.sqlStatus) els.sqlStatus.textContent = 'No DB loaded.';
      return;
    }
    if (!els.sqlInput) return;

    const sql = els.sqlInput.value.trim();
    if (!sql) {
      if (els.sqlStatus) els.sqlStatus.textContent = 'Type a SELECT query first.';
      return;
    }

    const firstTokenMatch = sql.match(/^\s*([A-Za-z]+)/);
    const firstToken = firstTokenMatch ? firstTokenMatch[1].toUpperCase() : '';

    // remember dummy: only allow read-only stuff so you don’t accidentally brick anything
    if (firstToken !== 'SELECT' && firstToken !== 'WITH' && firstToken !== 'PRAGMA') {
      if (els.sqlStatus) {
        els.sqlStatus.textContent = 'Read-only only. No INSERT/UPDATE/DELETE today, dummy.';
      }
      return;
    }

    try {
      const res = db.exec(sql);
      if (!res.length || !res[0].values.length) {
        if (els.sqlStatus) els.sqlStatus.textContent = 'Query ran, but no rows came back.';
        baseResult = null;
        filteredRows = [];
        els.dataTable.innerHTML = '<p class="muted">No results.</p>';
        currentColumnTypes = [];
        updateNumericStats();
        return;
      }

      if (els.sqlStatus) {
        els.sqlStatus.textContent = `Query ran, showing ${res[0].values.length} rows.`;
      }

      // console queries can point at anything, so drop column types (stats off)
      currentColumnTypes = [];
      renderResultTable(res[0]);
    } catch (e) {
      console.error(e);
      if (els.sqlStatus) els.sqlStatus.textContent = 'SQL error. Check console for details.';
    }
  }

  // Event wiring -----------------------------------------------

  // File input change
  els.fileInput.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    openDatabase(file);
  });

  // Clear button
  if (els.clearBtn) {
    els.clearBtn.addEventListener('click', () => {
      if (db) {
        db.close();
        db = null;
      }
      if (els.fileInput) {
        els.fileInput.value = '';
      }
      if (els.dbInfo) {
        els.dbInfo.textContent = '';
      }
      setStatus('');
      clearUi();
      clearChart();
    });
  }

  // Quick search
  if (els.rowSearchInput) {
    els.rowSearchInput.addEventListener('input', (e) => {
      currentSearchTerm = e.target.value || '';
      applySearchAndRender();
    });
  }

  // Export buttons
  if (els.exportCsvBtn) {
    els.exportCsvBtn.addEventListener('click', exportAsCsv);
  }
  if (els.exportJsonBtn) {
    els.exportJsonBtn.addEventListener('click', exportAsJson);
  }

  // SQL console button
  if (els.runSqlBtn) {
    els.runSqlBtn.addEventListener('click', runSqlConsoleQuery);
  }

  // Drag & drop support on the glow card
  if (els.card) {
    ['dragenter', 'dragover'].forEach((evt) => {
      els.card.addEventListener(evt, (e) => {
        e.preventDefault();
        e.stopPropagation();
        els.card.classList.add('drag-over');
      });
    });

    ['dragleave', 'drop'].forEach((evt) => {
      els.card.addEventListener(evt, (e) => {
        e.preventDefault();
        e.stopPropagation();
        els.card.classList.remove('drag-over');
      });
    });

    els.card.addEventListener('drop', (e) => {
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) {
        openDatabase(file);
      }
    });
  }

  // Kick things off
  initSql();
  clearUi();
})();
