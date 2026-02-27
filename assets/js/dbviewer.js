// /assets/js/dbviewer.js
// Generic SQLite DB viewer for ghillie.xyz

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
    chartWrapper: root.querySelector('.dbv-chart-wrapper'),
    status: document.getElementById('statusText'),
    clearBtn: document.getElementById('clearBtn'),
    card: root.querySelector('.cardGlow'),
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
  let dbFileName = '';

  // Result state
  let baseResult = null;
  let filteredRows = [];
  let currentSort = null;
  let currentSearchTerm = '';
  let currentColumnTypes = [];

  // ============================================================
  // Utility Functions
  // ============================================================

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

  function formatNumber(n) {
    if (Number.isInteger(n)) return n.toLocaleString();
    return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // ============================================================
  // Chart Management
  // ============================================================

  function clearChart() {
    if (chart) {
      chart.destroy();
      chart = null;
    }
    if (els.chartArea) {
      els.chartArea.style.display = 'none';
    }
    if (els.chartWrapper) {
      els.chartWrapper.style.display = 'none';
    }
  }

  function showChartArea() {
    if (els.chartArea) {
      els.chartArea.style.display = 'block';
    }
    if (els.chartWrapper) {
      els.chartWrapper.style.display = 'block';
    }
  }

  // ============================================================
  // UI Clear/Reset
  // ============================================================

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

  // ============================================================
  // SQL.js Initialization
  // ============================================================

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
        els.dbInfo.textContent = 'Ready. Upload a SQLite .db file or drag & drop.';
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

  // ============================================================
  // Database Loading
  // ============================================================

  function openDatabase(file) {
    if (!file) return;
    if (!SQL) {
      setStatus('Still loading engine… try again in a second.');
      return;
    }

    setStatus('Opening database…');
    dbFileName = file.name.replace(/\.(db|sqlite|sqlite3)$/i, '');

    file.arrayBuffer().then((buf) => {
      try {
        if (db) {
          db.close();
          db = null;
        }
        db = new SQL.Database(new Uint8Array(buf));

        // Get database size info
        const sizeKb = (file.size / 1024).toFixed(1);
        const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
        const sizeStr = file.size > 1024 * 1024 ? `${sizeMb} MB` : `${sizeKb} KB`;

        if (els.dbInfo) {
          els.dbInfo.textContent = `Loaded ${file.name} (${sizeStr})`;
        }
        setStatus('');
        clearChart();
        clearUi();
        loadTables();
      } catch (e) {
        console.error(e);
        if (els.dbInfo) {
          els.dbInfo.textContent = 'Error opening DB – is it a valid SQLite file?';
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

  // ============================================================
  // Table Loading
  // ============================================================

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

    const tableCount = res[0].values.length;

    res[0].values.forEach(([name], index) => {
      // Get row count for each table
      let rowCount = 0;
      try {
        const countRes = db.exec(`SELECT COUNT(*) FROM "${name}"`);
        rowCount = countRes[0].values[0][0];
      } catch (e) {
        // Ignore count errors
      }

      const li = document.createElement('li');
      li.innerHTML = `<span class="dbv-table-name">${escapeHtml(name)}</span><span class="dbv-table-count">${rowCount.toLocaleString()}</span>`;
      li.addEventListener('click', () => selectTable(name, li));
      els.tableList.appendChild(li);

      if (index === 0) {
        selectTable(name, li);
      }
    });

    setStatus(`${tableCount} table${tableCount !== 1 ? 's' : ''} loaded`);
  }

  function selectTable(name, liElement) {
    currentTable = name;

    Array.from(els.tableList.children).forEach((li) => {
      li.classList.remove('dbv-active');
    });
    if (liElement) {
      liElement.classList.add('dbv-active');
    }

    // Reset search when switching tables
    currentSearchTerm = '';
    if (els.rowSearchInput) els.rowSearchInput.value = '';

    renderTableMetaAndSample(name);
    buildSmartDropdowns(name);
    clearChart();
  }

  // ============================================================
  // Table Schema & Data Rendering
  // ============================================================

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
      type: type || 'TEXT',
      pk,
      notnull
    }));

    currentColumnTypes = cols.map((c) => ({
      name: c.name,
      type: (c.type || '').toUpperCase()
    }));

    els.tableMeta.innerHTML = `
      <p class="itemsMeta"><strong>${rowCount.toLocaleString()}</strong> rows • <strong>${cols.length}</strong> columns</p>
      <ul class="col-list">
        ${cols.map((c) => `
          <li>
            <strong>${escapeHtml(c.name)}</strong>
            <span>${c.type}${c.pk ? ' • PK' : ''}${c.notnull ? ' • NOT NULL' : ''}</span>
          </li>
        `).join('')}
      </ul>
    `;

    let sampleRes;
    try {
      sampleRes = db.exec(`SELECT * FROM "${table}" LIMIT 200`);
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

    baseResult = {
      columns: result.columns.slice(),
      values: result.values.slice()
    };

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

    let rows = baseResult.values.slice();
    const totalRows = rows.length;

    // Quick search across all columns
    if (currentSearchTerm && currentSearchTerm.trim() !== '') {
      const term = currentSearchTerm.toLowerCase();
      rows = rows.filter((row) =>
        row.some((value) =>
          value !== null && String(value).toLowerCase().includes(term)
        )
      );
    }

    // Sorting
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

    // Build header with sort indicators
    const headerHtml = columns.map((c, idx) => {
      let classes = ['dbv-sortable'];
      let icon = '<span class="sort-icon">⇅</span>';
      if (currentSort && currentSort.index === idx) {
        classes.push(currentSort.dir === 'desc' ? 'dbv-sort-desc' : 'dbv-sort-asc');
        icon = currentSort.dir === 'desc' ? '<span class="sort-icon active">▼</span>' : '<span class="sort-icon active">▲</span>';
      }
      return `<th data-col-index="${idx}" class="${classes.join(' ')}">${escapeHtml(c)}${icon}</th>`;
    }).join('');

    // Build data rows
    const rowsHtml = filteredRows.map((row, rowIdx) => `
      <tr>
        ${row.map((v, colIdx) => {
          if (v === null) {
            return '<td class="null-value"><em>NULL</em></td>';
          }
          const str = String(v);
          const truncated = str.length > 200 ? str.slice(0, 200) + '…' : str;
          const isNumeric = !Number.isNaN(Number(v)) && str.trim() !== '';
          return `<td class="${isNumeric ? 'numeric-value' : ''}" title="${escapeHtml(str)}">${escapeHtml(truncated)}</td>`;
        }).join('')}
      </tr>
    `).join('');

    // Row count indicator
    const rowCountHtml = currentSearchTerm
      ? `<div class="dbv-row-count">Showing ${filteredRows.length} of ${totalRows} rows</div>`
      : `<div class="dbv-row-count">Showing ${filteredRows.length} rows</div>`;

    els.dataTable.innerHTML = `
      ${rowCountHtml}
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
          currentSort.dir = currentSort.dir === 'asc' ? 'desc' : 'asc';
        } else {
          currentSort = { index: idx, dir: 'asc' };
        }
        applySearchAndRender();
      });
    });
  }

  // ============================================================
  // Numeric Column Statistics
  // ============================================================

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
        return /INT|REAL|FLOA|DOUB|NUMERIC|DEC|NUM/.test(t);
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
          <span>min: ${formatNumber(min)} • max: ${formatNumber(max)} • avg: ${formatNumber(avg)} • n: ${count.toLocaleString()}</span>
        </div>
      `;
    }).filter(Boolean);

    els.columnStats.innerHTML = pills.join('');
  }

  // ============================================================
  // Smart Dropdowns (Filters & Graphs)
  // ============================================================

  function buildDropdown(container, placeholder, options) {
    container.innerHTML = '';

    if (!options.length) {
      const span = document.createElement('span');
      span.className = 'itemsMeta';
      span.textContent = 'No suggestions available';
      container.appendChild(span);
      return;
    }

    const select = document.createElement('select');
    select.className = 'dbv-select';

    const defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.textContent = placeholder;
    defaultOpt.disabled = false;
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
        // Reset dropdown after selection
        setTimeout(() => {
          select.value = '';
        }, 100);
      }
    });

    container.appendChild(select);
  }

  function isDateLikeColumn(col) {
    const name = (col.name || '').toLowerCase();
    const type = (col.type || '').toUpperCase();
    if (type.includes('DATE') || type.includes('TIME') || type.includes('TIMESTAMP')) return true;
    if (name.includes('date') || name.includes('time') || name.endsWith('_at') || name.endsWith('_on')) return true;
    return false;
  }

  function isNumericColumn(col) {
    const t = (col.type || '').toUpperCase();
    return /INT|REAL|FLOA|DOUB|NUMERIC|DEC|NUM/.test(t);
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

    // Global filters
    filterOptions.push({
      label: '📋 Show all rows (limit 500)',
      run: () => runAndRender(`SELECT * FROM "${table}" LIMIT 500`)
    });

    filterOptions.push({
      label: '📋 Show first 100 rows',
      run: () => runAndRender(`SELECT * FROM "${table}" LIMIT 100`)
    });

    cols.forEach((col) => {
      const isNumeric = isNumericColumn(col);

      if (isNumeric) {
        // Top N by numeric column
        filterOptions.push({
          label: `⬆️ Top 10 by ${col.name}`,
          run: () => runAndRender(`SELECT * FROM "${table}" ORDER BY "${col.name}" DESC LIMIT 10`)
        });

        filterOptions.push({
          label: `⬇️ Bottom 10 by ${col.name}`,
          run: () => runAndRender(`SELECT * FROM "${table}" ORDER BY "${col.name}" ASC LIMIT 10`)
        });

        // Histogram graph option
        graphOptions.push({
          label: `📊 Histogram: ${col.name}`,
          run: () => drawHistogram(table, col.name)
        });
      } else {
        // For text-like columns, build top-5 value filters
        try {
          const topRes = db.exec(`
            SELECT "${col.name}" AS v, COUNT(*) AS c
            FROM "${table}"
            WHERE "${col.name}" IS NOT NULL
            GROUP BY "${col.name}"
            ORDER BY c DESC
            LIMIT 5
          `);

          if (topRes.length && topRes[0].values.length) {
            topRes[0].values.forEach(([val, count]) => {
              const labelValue = String(val).slice(0, 20);
              const displayValue = labelValue.length < String(val).length ? labelValue + '…' : labelValue;

              filterOptions.push({
                label: `🔍 ${col.name} = "${displayValue}" (${count})`,
                run: () => {
                  const safeVal = String(val).replace(/'/g, "''");
                  runAndRender(`SELECT * FROM "${table}" WHERE "${col.name}" = '${safeVal}' LIMIT 200`);
                }
              });
            });
          }
        } catch (e) {
          console.warn('Top categories failed for', col.name, e);
        }
      }
    });

    // NULL value filter for each column
    cols.forEach((col) => {
      filterOptions.push({
        label: `❓ ${col.name} IS NULL`,
        run: () => runAndRender(`SELECT * FROM "${table}" WHERE "${col.name}" IS NULL LIMIT 200`)
      });
    });

    // Bar chart: first TEXT vs first NUMERIC
    const firstText = cols.find((c) => !isNumericColumn(c));
    const firstNum = cols.find((c) => isNumericColumn(c));

    if (firstText && firstNum) {
      graphOptions.push({
        label: `📊 Bar: avg ${firstNum.name} by ${firstText.name}`,
        run: () => drawCategoryBar(table, firstText.name, firstNum.name)
      });

      graphOptions.push({
        label: `📊 Bar: count by ${firstText.name}`,
        run: () => drawCategoryCount(table, firstText.name)
      });
    }

    // Time-aware graphs for date-ish columns
    const dateCols = cols.filter(isDateLikeColumn);
    dateCols.forEach((col) => {
      graphOptions.push({
        label: `📈 Line: rows per day (${col.name})`,
        run: () => drawTimeBuckets(table, col.name, 'day', 'line')
      });
      graphOptions.push({
        label: `📈 Line: rows per month (${col.name})`,
        run: () => drawTimeBuckets(table, col.name, 'month', 'line')
      });
      graphOptions.push({
        label: `📊 Bar: rows per day (${col.name})`,
        run: () => drawTimeBuckets(table, col.name, 'day', 'bar')
      });
    });

    // Pie chart for categorical data
    if (firstText) {
      graphOptions.push({
        label: `🥧 Pie: distribution of ${firstText.name}`,
        run: () => drawPieChart(table, firstText.name)
      });
    }

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

  // ============================================================
  // Chart Drawing Functions
  // ============================================================

  function getChartColors(count) {
    const baseColors = [
      '#f64040', '#7f31ff', '#39ce4d', '#f6f340', '#3498db',
      '#e74c3c', '#9b59b6', '#1abc9c', '#f39c12', '#2ecc71',
      '#e91e63', '#00bcd4', '#ff9800', '#8bc34a', '#673ab7'
    ];
    const colors = [];
    for (let i = 0; i < count; i++) {
      colors.push(baseColors[i % baseColors.length]);
    }
    return colors;
  }

  function drawHistogram(table, colName) {
    if (!db || !els.chartArea || !window.Chart) return;

    let res;
    try {
      res = db.exec(`
        SELECT "${colName}" AS v
        FROM "${table}"
        WHERE "${colName}" IS NOT NULL
        LIMIT 10000
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
    const bins = Math.min(20, Math.max(5, Math.ceil(Math.sqrt(values.length))));
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
      return `${formatNumber(start)} – ${formatNumber(end)}`;
    });

    showChartArea();
    const ctx = els.chartArea.getContext('2d');

    if (chart) chart.destroy();
    chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: `Distribution of ${colName}`,
          data: counts,
          backgroundColor: '#f64040',
          borderColor: '#f64040',
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          x: {
            ticks: { maxRotation: 45, minRotation: 0, color: '#a0a0a0' },
            grid: { color: '#2a2a2a' }
          },
          y: {
            beginAtZero: true,
            ticks: { color: '#a0a0a0' },
            grid: { color: '#2a2a2a' }
          }
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
        LIMIT 15
      `);
    } catch (e) {
      console.error(e);
      return;
    }

    if (!res.length) return;

    const labels = res[0].values.map(([cat]) =>
      cat === null ? 'NULL' : String(cat).slice(0, 20)
    );
    const data = res[0].values.map(([_, v]) => Number(v));

    showChartArea();
    const ctx = els.chartArea.getContext('2d');

    if (chart) chart.destroy();
    chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: `Average ${numCol} by ${catCol}`,
          data,
          backgroundColor: getChartColors(data.length),
          borderWidth: 0
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          x: {
            beginAtZero: true,
            ticks: { color: '#a0a0a0' },
            grid: { color: '#2a2a2a' }
          },
          y: {
            ticks: { color: '#a0a0a0' },
            grid: { color: '#2a2a2a' }
          }
        }
      }
    });
  }

  function drawCategoryCount(table, catCol) {
    if (!db || !els.chartArea || !window.Chart) return;

    let res;
    try {
      res = db.exec(`
        SELECT "${catCol}" AS cat, COUNT(*) AS c
        FROM "${table}"
        GROUP BY "${catCol}"
        ORDER BY c DESC
        LIMIT 15
      `);
    } catch (e) {
      console.error(e);
      return;
    }

    if (!res.length) return;

    const labels = res[0].values.map(([cat]) =>
      cat === null ? 'NULL' : String(cat).slice(0, 20)
    );
    const data = res[0].values.map(([_, c]) => Number(c));

    showChartArea();
    const ctx = els.chartArea.getContext('2d');

    if (chart) chart.destroy();
    chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: `Count by ${catCol}`,
          data,
          backgroundColor: getChartColors(data.length),
          borderWidth: 0
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          x: {
            beginAtZero: true,
            ticks: { color: '#a0a0a0' },
            grid: { color: '#2a2a2a' }
          },
          y: {
            ticks: { color: '#a0a0a0' },
            grid: { color: '#2a2a2a' }
          }
        }
      }
    });
  }

  function drawPieChart(table, catCol) {
    if (!db || !els.chartArea || !window.Chart) return;

    let res;
    try {
      res = db.exec(`
        SELECT "${catCol}" AS cat, COUNT(*) AS c
        FROM "${table}"
        GROUP BY "${catCol}"
        ORDER BY c DESC
        LIMIT 10
      `);
    } catch (e) {
      console.error(e);
      return;
    }

    if (!res.length) return;

    const labels = res[0].values.map(([cat]) =>
      cat === null ? 'NULL' : String(cat).slice(0, 20)
    );
    const data = res[0].values.map(([_, c]) => Number(c));

    showChartArea();
    const ctx = els.chartArea.getContext('2d');

    if (chart) chart.destroy();
    chart = new Chart(ctx, {
      type: 'pie',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: getChartColors(data.length),
          borderColor: '#191919',
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'right',
            labels: { color: '#e7e7e7' }
          }
        }
      }
    });
  }

  function drawTimeBuckets(table, colName, granularity, chartType) {
    if (!db || !els.chartArea || !window.Chart) return;

    const len = granularity === 'month' ? 7 : 10;

    let res;
    try {
      res = db.exec(`
        SELECT substr("${colName}", 1, ${len}) AS bucket, COUNT(*) AS c
        FROM "${table}"
        WHERE "${colName}" IS NOT NULL AND "${colName}" != ''
        GROUP BY bucket
        ORDER BY bucket
        LIMIT 100
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

    showChartArea();
    const ctx = els.chartArea.getContext('2d');

    if (chart) chart.destroy();

    const isLine = chartType === 'line';

    chart = new Chart(ctx, {
      type: isLine ? 'line' : 'bar',
      data: {
        labels,
        datasets: [{
          label: `${granularity === 'month' ? 'Rows per month' : 'Rows per day'} (${colName})`,
          data,
          backgroundColor: isLine ? 'rgba(246, 64, 64, 0.2)' : '#f64040',
          borderColor: '#f64040',
          borderWidth: isLine ? 2 : 1,
          fill: isLine,
          tension: 0.3,
          pointRadius: isLine ? 3 : 0,
          pointBackgroundColor: '#f64040'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          x: {
            ticks: { maxRotation: 45, minRotation: 0, color: '#a0a0a0' },
            grid: { color: '#2a2a2a' }
          },
          y: {
            beginAtZero: true,
            ticks: { color: '#a0a0a0' },
            grid: { color: '#2a2a2a' }
          }
        }
      }
    });
  }

  // ============================================================
  // Export Functions
  // ============================================================

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
      setStatus('Nothing to export.');
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

    const filename = `${currentTable || dbFileName || 'export'}.csv`;
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    triggerDownload(blob, filename);
    setStatus(`Exported ${rows.length} rows to ${filename}`);
  }

  function exportAsJson() {
    if (!baseResult || !filteredRows.length) {
      setStatus('Nothing to export.');
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

    const filename = `${currentTable || dbFileName || 'export'}.json`;
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json;charset=utf-8;'
    });
    triggerDownload(blob, filename);
    setStatus(`Exported ${rows.length} rows to ${filename}`);
  }

  // ============================================================
  // SQL Console
  // ============================================================

  function runSqlConsoleQuery() {
    if (!db) {
      if (els.sqlStatus) els.sqlStatus.textContent = 'No database loaded.';
      return;
    }
    if (!els.sqlInput) return;

    const sql = els.sqlInput.value.trim();
    if (!sql) {
      if (els.sqlStatus) els.sqlStatus.textContent = 'Enter a SELECT query to run.';
      return;
    }

    const firstTokenMatch = sql.match(/^\s*([A-Za-z]+)/);
    const firstToken = firstTokenMatch ? firstTokenMatch[1].toUpperCase() : '';

    // Only allow read-only queries
    const allowedTokens = ['SELECT', 'WITH', 'PRAGMA', 'EXPLAIN'];
    if (!allowedTokens.includes(firstToken)) {
      if (els.sqlStatus) {
        els.sqlStatus.textContent = 'Read-only mode: only SELECT, WITH, PRAGMA, EXPLAIN allowed.';
      }
      return;
    }

    const startTime = performance.now();

    try {
      const res = db.exec(sql);
      const elapsed = (performance.now() - startTime).toFixed(1);

      if (!res.length || !res[0].values.length) {
        if (els.sqlStatus) els.sqlStatus.textContent = `Query executed in ${elapsed}ms. No rows returned.`;
        baseResult = null;
        filteredRows = [];
        els.dataTable.innerHTML = '<p class="muted">Query returned no results.</p>';
        currentColumnTypes = [];
        updateNumericStats();
        return;
      }

      if (els.sqlStatus) {
        els.sqlStatus.textContent = `${res[0].values.length} rows in ${elapsed}ms`;
      }

      // Custom queries don't have column type info
      currentColumnTypes = res[0].columns.map((name) => ({ name, type: '' }));
      renderResultTable(res[0]);
    } catch (e) {
      console.error(e);
      if (els.sqlStatus) els.sqlStatus.textContent = `Error: ${e.message}`;
    }
  }

  // ============================================================
  // Event Handlers
  // ============================================================

  // File input
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
        els.dbInfo.textContent = 'Ready. Upload a SQLite .db file or drag & drop.';
      }
      dbFileName = '';
      setStatus('');
      clearUi();
      clearChart();
    });
  }

  // Quick search with debounce
  let searchTimeout = null;
  if (els.rowSearchInput) {
    els.rowSearchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        currentSearchTerm = e.target.value || '';
        applySearchAndRender();
      }, 150);
    });
  }

  // Export buttons
  if (els.exportCsvBtn) {
    els.exportCsvBtn.addEventListener('click', exportAsCsv);
  }
  if (els.exportJsonBtn) {
    els.exportJsonBtn.addEventListener('click', exportAsJson);
  }

  // SQL console
  if (els.runSqlBtn) {
    els.runSqlBtn.addEventListener('click', runSqlConsoleQuery);
  }

  // Enter key in SQL input
  if (els.sqlInput) {
    els.sqlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        runSqlConsoleQuery();
      }
    });
  }

  // Drag & drop support
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

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + O to open file
    if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
      e.preventDefault();
      els.fileInput.click();
    }
    // Escape to clear search
    if (e.key === 'Escape' && document.activeElement === els.rowSearchInput) {
      els.rowSearchInput.value = '';
      currentSearchTerm = '';
      applySearchAndRender();
    }
  });

  // Initialize
  initSql();
  clearUi();
})();
