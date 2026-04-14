// ============================================================
// SECTION 1: SHARED FORMATTERS
// ============================================================

const fmtN   = d3.format(",.0f");
const fmtPct = d3.format(".1%");

function fmtBRL(v) {
  const n = +v;
  if (isNaN(n)) return "—";
  if (Math.abs(n) >= 1e9) return "R$ " + d3.format(".2f")(n / 1e9) + " bi";
  if (Math.abs(n) >= 1e6) return "R$ " + d3.format(".2f")(n / 1e6) + " mi";
  if (Math.abs(n) >= 1e3) return "R$ " + d3.format(",.0f")(n);
  return "R$ " + d3.format(".2f")(n);
}

// Axis formatter that avoids "G" — uses "bi"/"mi"/"k"
function fmtAxis(v) {
  const n = +v;
  if (Math.abs(n) >= 1e9) return d3.format(".1f")(n / 1e9) + " bi";
  if (Math.abs(n) >= 1e6) return d3.format(".1f")(n / 1e6) + " mi";
  if (Math.abs(n) >= 1e3) return d3.format(".0f")(n / 1e3) + " k";
  return d3.format(".0f")(n);
}

// ============================================================
// SECTION 2: TOOLTIP ELEMENT
// ============================================================

const tooltip = d3.select("body").append("div").attr("class", "chart-tooltip");

function showTooltip(html, event) {
  tooltip.style("display", "block").html(html);
  moveTooltip(event);
}
function moveTooltip(event) {
  tooltip.style("left", (event.clientX + 14) + "px").style("top", (event.clientY - 10) + "px");
}
function hideTooltip() {
  tooltip.style("display", "none");
}

// ============================================================
// SECTION 3: PMTILES + MAPLIBRE SETUP
// ============================================================

const protocol = new pmtiles.Protocol();
maplibregl.addProtocol('pmtiles', protocol.tile.bind(protocol));

const map = new maplibregl.Map({
  container: 'map-panel',
  style: {
    version: 8,
    sources: {
      'carto-light': {
        type: 'raster',
        tiles: [
          'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
          'https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
          'https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
          'https://d.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png'
        ],
        tileSize: 256,
        attribution: '© OpenStreetMap © CARTO'
      },
      municipios: {
        type: 'vector',
        url: 'pmtiles://./GEO/municipios.pmtiles',
        promoteId: 'code_muni'
      },
      estados: {
        type: 'vector',
        url: 'pmtiles://./GEO/ufs.pmtiles'
      }
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#d4e8f7' } },
      { id: 'carto-light', type: 'raster', source: 'carto-light' },
      {
        id: 'municipios-fill',
        type: 'fill',
        source: 'municipios',
        'source-layer': 'mun',
        paint: { 'fill-color': '#7ab8d4', 'fill-opacity': 0.85 }
      },
      {
        id: 'municipios-outline',
        type: 'line',
        source: 'municipios',
        'source-layer': 'mun',
        paint: { 'line-color': '#ffffff', 'line-width': 0.3 }
      },
      // Selected municipality highlight (yellow)
      {
        id: 'municipios-selected-fill',
        type: 'fill',
        source: 'municipios',
        'source-layer': 'mun',
        paint: {
          'fill-color': '#ffe600',
          'fill-opacity': ['case', ['boolean', ['feature-state', 'selected'], false], 0.55, 0]
        }
      },
      {
        id: 'municipios-selected-stroke',
        type: 'line',
        source: 'municipios',
        'source-layer': 'mun',
        paint: {
          'line-color': '#ffe600',
          'line-width': ['case', ['boolean', ['feature-state', 'selected'], false], 2.5, 0]
        }
      },
      // State borders
      {
        id: 'estados-outline',
        type: 'line',
        source: 'estados',
        'source-layer': 'ufs',
        paint: {
          'line-color': '#334',
          'line-width': ['interpolate', ['linear'], ['zoom'], 3, 1, 8, 2]
        }
      }
    ]
  },
  center: [-52, -14],
  zoom: 4,
  attributionControl: false
});

map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');

const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12 });

// ============================================================
// SECTION 4: HOVER / CLICK STATE
// ============================================================

let hoveredId  = null;
let selectedId = null;

function clearSelection() {
  if (selectedId !== null) {
    map.setFeatureState({ source: 'municipios', sourceLayer: 'mun', id: selectedId }, { selected: false });
    selectedId = null;
  }
}

// ============================================================
// SECTION 5: LOAD DATA + WIRE EVERYTHING AFTER MAP LOADS
// ============================================================

Promise.all([
  d3.csv("DADOS/rais_municipios_6x1.csv"),
  d3.csv("DADOS/SICONFI_6x1_novo_somente39_real2024.csv").catch(() => d3.dsv(";", "DADOS/SICONFI_6x1_novo_somente39.csv", r => ({
      id_municipio:           r.id_municipio,
      ano:                    r.ano,
      despesa_corrente_total: parseFloat(String(r.despesa_corrente_total).replace(",",".")),
      elemento_39:            parseFloat(String(r.elemento_39).replace(",","."))
    })))
]).then(([raisRaw, siconfiRaw]) => {

  // --- Parse numeric columns ---
  const raisNumCols = [
    "qtd_vinculos","massa_horas","massa_salarial",
    "vinculos_36h_mais","vinculos_40h_mais",
    "horas_excedentes_36","horas_excedentes_40",
    "massa_salarial_excedente_36","massa_salarial_excedente_40"
  ];
  raisRaw.forEach(r => {
    raisNumCols.forEach(c => { r[c] = +r[c]; });
    r.id_municipio = String(r.id_municipio).trim();
  });

  siconfiRaw.forEach(r => {
    r.despesa_corrente_total = +r.despesa_corrente_total;
    r.elemento_39            = +r.elemento_39;
    r.id_municipio           = String(r.id_municipio).trim();
    r.ano                    = +r.ano;
  });

  // --- Group by id_municipio ---
  const raisMap    = d3.group(raisRaw.filter(r => r.id_municipio !== ""), d => d.id_municipio);
  const siconfiMap = d3.group(siconfiRaw, d => d.id_municipio);
  siconfiMap.forEach(rows => rows.sort((a, b) => a.ano - b.ano));

  // --- Compute choropleth: ratio = Σ exc_40 / Σ massa_salarial ---
  const choroMap = new Map();
  raisMap.forEach((rows, id) => {
    const sumExc = d3.sum(rows, r => r.massa_salarial_excedente_40);
    const sumTot = d3.sum(rows, r => r.massa_salarial);
    choroMap.set(id, sumTot > 0 ? sumExc / sumTot : 0);
  });

  // --- Discrete color scale: 0-5%, 5-10%, 10-20%, >20% ---
  const choroBins   = [0, 0.05, 0.10, 0.20, Infinity];
  const choroColors = ["#ffffb2", "#fecc5c", "#fd8d3c", "#e31a1c"];
  const choroLabels = ["0–5%", "5–10%", "10–20%", "> 20%"];

  function discreteColor(ratio) {
    for (let i = 0; i < choroBins.length - 1; i++) {
      if (ratio < choroBins[i + 1]) return choroColors[i];
    }
    return choroColors[choroColors.length - 1];
  }

  // --- Apply choropleth to map (called after map loads) ---
  function applyChoropleth() {
    const matchExpr = ['match', ['get', 'code_muni']];
    choroMap.forEach((ratio, id) => {
      matchExpr.push(parseInt(id));
      matchExpr.push(discreteColor(ratio));
    });
    matchExpr.push('#d0d0d0'); // fallback for municipalities with no data
    map.setPaintProperty('municipios-fill', 'fill-color', matchExpr);
    renderLegend();
  }

  // --- Discrete legend ---
  function renderLegend() {
    const container = document.getElementById('choro-legend');
    container.innerHTML = '';
    const SW = 16, SH = 12, gap = 4, rowH = SH + gap;
    const W  = 110;
    const H  = choroColors.length * rowH + 16;

    const svg = d3.select(container).append('svg').attr('width', W).attr('height', H);

    svg.append('text')
      .attr('x', 0).attr('y', 10)
      .attr('font-size', 9).attr('fill', '#555').attr('font-weight', 'bold')
      .text('% Massa sal. exc. (40h)');

    choroColors.forEach((col, i) => {
      const y = 16 + i * rowH;
      svg.append('rect').attr('x', 0).attr('y', y).attr('width', SW).attr('height', SH)
        .attr('fill', col).attr('stroke', '#aaa').attr('stroke-width', 0.5);
      svg.append('text').attr('x', SW + 5).attr('y', y + SH - 2)
        .attr('font-size', 10).attr('fill', '#333').text(choroLabels[i]);
    });
  }

  // --- Map event: hover ---
  map.on('mousemove', 'municipios-fill', (e) => {
    if (e.features.length === 0) return;

    if (hoveredId !== null) {
      map.setFeatureState({ source: 'municipios', sourceLayer: 'mun', id: hoveredId }, { hover: false });
    }
    hoveredId = e.features[0].id;
    map.setFeatureState({ source: 'municipios', sourceLayer: 'mun', id: hoveredId }, { hover: true });
    map.getCanvas().style.cursor = 'pointer';

    const { name_muni, abbrev_state, code_muni } = e.features[0].properties;
    popup.setLngLat(e.lngLat)
      .setHTML(`<strong>${name_muni}</strong><br><span>${abbrev_state}</span>`)
      .addTo(map);

    if (selectedId === null) {
      updatePanel(String(Math.round(code_muni)), name_muni, abbrev_state);
    }
  });

  map.on('mouseleave', 'municipios-fill', () => {
    if (hoveredId !== null) {
      map.setFeatureState({ source: 'municipios', sourceLayer: 'mun', id: hoveredId }, { hover: false });
    }
    hoveredId = null;
    map.getCanvas().style.cursor = '';
    popup.remove();
    if (selectedId === null) {
      clearPanel();
    }
  });

  // --- Map event: click ---
  map.on('click', 'municipios-fill', (e) => {
    if (e.features.length === 0) return;
    const feat     = e.features[0];
    const clickedId = feat.id;
    const { name_muni, abbrev_state, code_muni } = feat.properties;

    if (selectedId === clickedId) {
      clearSelection();
      clearPanel();
    } else {
      clearSelection();
      selectedId = clickedId;
      map.setFeatureState({ source: 'municipios', sourceLayer: 'mun', id: selectedId }, { selected: true });
      updatePanel(String(Math.round(code_muni)), name_muni, abbrev_state);
    }
  });

  // Click outside municipalities deselects
  map.on('click', (e) => {
    const features = map.queryRenderedFeatures(e.point, { layers: ['municipios-fill'] });
    if (features.length === 0) {
      clearSelection();
      clearPanel();
    }
  });

  // --- Wait for map to load, then apply choropleth and hide overlay ---
  map.on('load', () => {
    applyChoropleth();
    document.getElementById('loading-overlay').style.display = 'none';
  });

  // ============================================================
  // SECTION 6: PANEL UPDATE
  // ============================================================

  function clearPanel() {
    d3.select("#hover-label").text("Passe o mouse sobre um município").classed("active", false);
    d3.select("#placeholder").style("display", null);
    d3.select("#panel-content").style("display", "none");
    _currentRaisId    = null;
    _currentSiconfiId = null;
  }

  function updatePanel(id, name, state) {
    d3.select("#mun-name").text(name);
    d3.select("#mun-state").text(state);
    d3.select("#hover-label").text(`${name} — ${state}`).classed("active", true);
    d3.select("#placeholder").style("display", "none");
    d3.select("#panel-content").style("display", "block");
    renderRaisTable(id);
    renderSiconfiSection(id);
    renderResultado(id, id);
  }

  // ============================================================
  // SECTION 7: RAIS TABLE
  // ============================================================

  const raisColumns = [
    { key: "grupo_vinculo",               label: "Vínculo",           fmt: v => v },
    { key: "grupo_natureza_juridica",     label: "Natureza Jurídica",  fmt: v => v },
    { key: "qtd_vinculos",                label: "Vínculos",           fmt: fmtN },
    { key: "massa_salarial",              label: "Massa Salarial",     fmt: fmtBRL },
    { key: "vinculos_36h_mais",           label: "Vínculos ≥36h",      fmt: fmtN },
    { key: "vinculos_40h_mais",           label: "Vínculos ≥40h",      fmt: fmtN },
    { key: "horas_excedentes_36",         label: "H.exc. 36h",         fmt: fmtN },
    { key: "horas_excedentes_40",         label: "H.exc. 40h",         fmt: fmtN },
    { key: "massa_salarial_excedente_36", label: "Sal.exc. 36h",       fmt: fmtBRL },
    { key: "massa_salarial_excedente_40", label: "Sal.exc. 40h",       fmt: fmtBRL },
  ];

  function renderRaisTable(id) {
    const container = d3.select("#rais-content");
    container.html("");
    const natOrder = {
      "Administração direta municipal":   0,
      "Administração indireta municipal": 1
    };
    const vincOrder = { "Estatutário": 0, "CLT": 1 };

    const allRows = raisMap.get(id) || [];
    const rows = allRows
      .filter(r =>
        r.grupo_natureza_juridica === "Administração direta municipal" ||
        r.grupo_natureza_juridica === "Administração indireta municipal"
      )
      .sort((a, b) => {
        const nA = natOrder[a.grupo_natureza_juridica] ?? 99;
        const nB = natOrder[b.grupo_natureza_juridica] ?? 99;
        if (nA !== nB) return nA - nB;
        const vA = vincOrder[a.grupo_vinculo] ?? 99;
        const vB = vincOrder[b.grupo_vinculo] ?? 99;
        return vA - vB;
      });
    if (rows.length === 0) {
      container.append("p").attr("class", "no-data").text("Sem dados RAIS (adm. direta/indireta) para este município.");
      return;
    }
    const wrap  = container.append("div").attr("class", "data-table-wrap");
    const table = wrap.append("table").attr("class", "data-table");
    table.append("thead").append("tr")
      .selectAll("th").data(raisColumns).enter().append("th").text(c => c.label);
    const tbody = table.append("tbody");
    rows.forEach(row => {
      const tr = tbody.append("tr");
      raisColumns.forEach(c => { tr.append("td").text(c.fmt(row[c.key])); });
    });
  }

  // ============================================================
  // SECTION 8: SICONFI CHARTS + TABLE
  // ============================================================

  function renderSiconfiSection(id) {
    const container = d3.select("#siconfi-content");
    container.html("");
    const rows = siconfiMap.get(id);
    if (!rows || rows.length === 0) {
      container.append("p").attr("class", "no-data").text("Sem dados SICONFI para este município.");
      return;
    }
    renderRatioLine(container, rows);
    renderSiconfiTable(container, rows);
  }

  // ============================================================
  // SECTION 9: RESULTADO FISCAL
  // ============================================================

  // Seletores globais de cenário (persistem entre municípios)
  document.getElementById('sel-limiar')   .addEventListener('change', () => refreshResultado());
  document.getElementById('sel-proporcao').addEventListener('change', () => refreshResultado());
  document.getElementById('sel-impacto')  .addEventListener('change', () => refreshResultado());

  let _currentRaisId    = null;
  let _currentSiconfiId = null;

  function refreshResultado() {
    if (_currentRaisId !== null) renderResultado(_currentRaisId, _currentSiconfiId);
  }

  function renderResultado(raisId, siconfiId) {
    _currentRaisId    = raisId;
    _currentSiconfiId = siconfiId;

    const container = d3.select("#resultado-content");
    container.html("");

    const limiar    = document.getElementById('sel-limiar').value;     // "36" ou "40"
    const propFolha = +document.getElementById('sel-proporcao').value; // 0.75 / 0.85 / 0.95
    const taxaImp   = +document.getElementById('sel-impacto').value;   // 0.06 ... 0.12

    // --- Impacto direto: somente CLT, adm direta + indireta ---
    const raisRows = (raisMap.get(raisId) || []).filter(r =>
      r.grupo_vinculo === "CLT" &&
      (r.grupo_natureza_juridica === "Administração direta municipal" ||
       r.grupo_natureza_juridica === "Administração indireta municipal")
    );

    const campoExc   = limiar === "36" ? "massa_salarial_excedente_36" : "massa_salarial_excedente_40";
    const impactoDireto = d3.sum(raisRows, r => r[campoExc]) * 13.3;

    // --- Impacto indireto: último ano SICONFI × proporção × taxa ---
    const siconfiRows = siconfiMap.get(siconfiId) || [];
    const ultimoAno   = siconfiRows.length > 0 ? siconfiRows[siconfiRows.length - 1] : null;
    const terceirizacao = ultimoAno ? ultimoAno.elemento_39 : null;
    const impactoIndireto = terceirizacao !== null ? terceirizacao * propFolha * taxaImp : null;

    const temDireto   = impactoDireto > 0 || raisRows.length > 0;
    const temIndireto = impactoIndireto !== null;

    if (!temDireto && !temIndireto) {
      container.append("p").attr("class", "no-data").text("Sem dados suficientes para estimar o impacto.");
      return;
    }

    const total = (impactoDireto || 0) + (impactoIndireto || 0);

    const table = container.append("table").attr("class", "resultado-table");
    const tbody = table.append("tbody");

    const addRow = (label, valor, cls) => {
      const tr = tbody.append("tr");
      if (cls) tr.attr("class", cls);
      tr.append("td").text(label);
      tr.append("td").text(valor !== null ? fmtBRL(valor) : "—");
    };

    addRow(
      `Impacto direto — folha CLT (exc. ${limiar}h) × 13,3 salários`,
      temDireto ? impactoDireto : null
    );
    addRow(
      `Impacto indireto — terceirização (${ultimoAno ? ultimoAno.ano : "—"}) × ${Math.round(propFolha*100)}% × ${Math.round(taxaImp*100)}%`,
      temIndireto ? impactoIndireto : null,
      "indirect-row"
    );
    addRow("Impacto fiscal total estimado (anual)", temDireto || temIndireto ? total : null, "total-row");

    // Nota de rodapé
    container.append("p")
      .style("font-size", "10px").style("color", "#888").style("margin-top", "8px")
      .text(`Valores em R$ de 2024. Impacto direto: custo da jornada CLT acima de ${limiar}h/sem × 13,3 (12 meses + décimo terceiro + adicional de férias). Impacto indireto (anual): despesa total com terceirização do último ano SICONFI × participação da folha nos custos do setor × taxa de impacto estimada.`);
  }

  // Line chart: elemento_39 / despesa_corrente_total by year
  function renderRatioLine(container, rows) {
    const wrap = container.append("div").attr("class", "chart-wrap");
    wrap.append("div").attr("class", "chart-title").text("% Elem. 39 sobre despesa corrente total");

    const margin = { top: 16, right: 14, bottom: 28, left: 48 };
    const W = 420, H = 120;
    const iW = W - margin.left - margin.right;
    const iH = H - margin.top  - margin.bottom;

    const data = rows.map(r => ({
      ano:   r.ano,
      ratio: r.despesa_corrente_total > 0 ? r.elemento_39 / r.despesa_corrente_total : 0
    }));

    const xScale = d3.scaleLinear().domain(d3.extent(data, d => d.ano)).range([0, iW]);
    const yScale = d3.scaleLinear().domain([0, d3.max(data, d => d.ratio) * 1.2 || 0.01]).range([iH, 0]);
    const line   = d3.line().x(d => xScale(d.ano)).y(d => yScale(d.ratio));

    const svg = wrap.append("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("preserveAspectRatio", "xMidYMid meet");
    const g   = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    g.append("g").selectAll("line")
      .data(yScale.ticks(4)).enter().append("line").attr("class", "gridline")
      .attr("x1", 0).attr("x2", iW).attr("y1", d => yScale(d)).attr("y2", d => yScale(d));

    g.append("path").datum(data).attr("fill", "none").attr("stroke", "#1a5f8a").attr("stroke-width", 2).attr("d", line);

    g.selectAll("circle").data(data).enter().append("circle")
      .attr("cx", d => xScale(d.ano)).attr("cy", d => yScale(d.ratio))
      .attr("r", 4).attr("fill", "#1a5f8a").attr("stroke", "#fff").attr("stroke-width", 1.5)
      .on("mouseover", (event, d) => showTooltip(`<strong>${d.ano}</strong><br>% Terceirização: ${fmtPct(d.ratio)}`, event))
      .on("mousemove", event => moveTooltip(event))
      .on("mouseout",  () => hideTooltip());

    g.append("g").attr("class", "axis").attr("transform", `translate(0,${iH})`)
      .call(d3.axisBottom(xScale).tickValues(data.map(d => d.ano)).tickFormat(d3.format("d")));
    g.append("g").attr("class", "axis")
      .call(d3.axisLeft(yScale).ticks(4).tickFormat(fmtPct));
  }

  // SICONFI table
  const siconfiColumns = [
    { key: "ano",                  label: "Ano",              fmt: d3.format("d") },
    { key: "despesa_corrente_total", label: "Desp. Corrente", fmt: fmtBRL },
    { key: "elemento_39",          label: "Elem. 39",         fmt: fmtBRL },
    { key: "_pct",                 label: "% Desp.",          fmt: fmtPct },
  ];

  function renderSiconfiTable(container, rows) {
    const data  = rows.map(r => ({ ...r, _pct: r.despesa_corrente_total > 0 ? r.elemento_39 / r.despesa_corrente_total : 0 }));
    const wrap  = container.append("div").attr("class", "data-table-wrap").style("margin-top", "10px");
    const table = wrap.append("table").attr("class", "data-table");
    table.append("thead").append("tr")
      .selectAll("th").data(siconfiColumns).enter().append("th").text(c => c.label);
    const tbody = table.append("tbody");
    data.forEach(row => {
      const tr = tbody.append("tr");
      siconfiColumns.forEach(c => { tr.append("td").text(c.fmt(row[c.key])); });
    });
  }

}).catch(err => {
  console.error("Erro ao carregar dados:", err);
  document.getElementById('loading-msg').textContent = `Erro: ${err.message}`;
});
