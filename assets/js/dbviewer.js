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
    card: root.querySelector('.cardGlow')
  };

  if (!els.fileInput || !els.tableList || !els.dataTable) return;

  let SQL = null;
  let db = null;
  let currentTable = null;
  let chart = null;

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
      return;
    }

    if (!sampleRes.length) {
      els.dataTable.innerHTML = '<p class="muted">No rows in this table.</p>';
      return;
    }

    renderResultTable(sampleRes[0], els.dataTable);
  }

  function renderResultTable(result, containerEl) {
    const columns = result.columns;
    const values = result.values;

    const rowsHtml = values.map((row) => `
      <tr>
        ${row.map((v) => `
          <td>${v === null ? '<em>null</em>' : escapeHtml(String(v)).slice(0, 200)}</td>
        `).join('')}
      </tr>
    `).join('');

    containerEl.innerHTML = `
      <div class="dbv-table-inner">
        <table>
          <thead>
            <tr>${columns.map((c) => `<th>${escapeHtml(c)}</th>`).join('')}</tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    `;
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
      return;
    }

    if (!res.length || !res[0].values.length) {
      els.dataTable.innerHTML = '<p class="muted">No results.</p>';
      return;
    }

    renderResultTable(res[0], els.dataTable);
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
    });
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
