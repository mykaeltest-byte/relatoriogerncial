/* ===== Relatório Gerencial — script.js ===== */

/* ---------- UTILS ---------- */
const fmtNum = n => new Intl.NumberFormat("pt-BR").format(n || 0);
const fmtPct = n => new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 }).format(n || 0);
const todayStr = () => new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
function fmtCell(v) {
  if (v === null || v === undefined || v === "") return "";
  if (v instanceof Date) return v.toLocaleDateString("pt-BR");
  if (typeof v === "number" && v > 30000 && v < 80000) {
    const d = new Date(Math.round((v - 25569) * 86400000));
    if (!isNaN(d.getTime())) return d.toLocaleDateString("pt-BR");
  }
  return String(v);
}
const norm = v => (v == null ? "" : String(v).trim());
const normH = s => String(s || "").trim().toLowerCase();
const svgIcon = id => `<svg class="w4 h4"><use href="#${id}"/></svg>`;
const debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

/* ---------- COLUMN MAPPING ---------- */
const HEADER_ALIASES = {
  FILIAL:["filial atual"],COLETA:["coleta"],NOTA:["nota"],JANELA:["janela operacional"],
  RANGE_DIAS:["range de dias"],DATA_BAIXA_SLA:["data baixa sla","data baixa","fonte data entrega"],
  DATA_VF:["data de criacao do vf","data de criação do vf"],
  CHAVE_FILIAL:["chave nota portal","chave_nfe","nota"],CHAVE_NFE:["chave_nfe","chave nfe"],
  SLA_ENTREGA:["status sla entrega"],
  OF:["of","ordem de frete","numero of","número of"],
  VALE_FRETE:["vale frete","vf"],
  PEDIDO:["pedido","numero pedido","número pedido","nro pedido","nº pedido"],
  CIDADE:["cidade","cidade destino","destino"],UF:["uf","estado"],
  VOCATIVO:["vocativo"],
  CLIENTE:["cliente","razão social","razao social","destinatario","destinatário","nome cliente"],
  ESTADO_DESTINO:["estado destino","uf destino","uf","estado"]
};
function resolveColumns(header) {
  const map = {};
  const lower = (header||[]).map(normH);
  for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
    let idx = -1;
    for (const a of aliases) { idx = lower.indexOf(a); if (idx !== -1) break; }
    map[key] = idx;
  }
  return map;
}

/* ---------- REPORT LOGIC ---------- */
const FILIAIS=["São Paulo - SP","Açailândia - MA","Contagem MG","Ipatinga MG","Piracicaba - SP","São Luiz - MA","Araquari - SC","Aparecida de Goiania - GO","Curitiba - PR","Ribeirão Preto - SP","Rio de Janeiro - RJ","Viana - ES"];
const RANGES_AGING=["0 dias","Entre 1 e 2 dias","Entre 3 e 5 dias","Entre 6 e 10 dias","Entre 11 e 20 dias","Mais de 20 dias"];
const RANGES_VIAGEM=[
  {label:"0 dias",test:d=>d===0},{label:"1 a 2 dias",test:d=>d>=1&&d<=2},
  {label:"3 a 5 dias",test:d=>d>=3&&d<=5},{label:"6 a 10 dias",test:d=>d>=6&&d<=10},
  {label:"11 a 20 dias",test:d=>d>=11&&d<=20},{label:"Mais de 20 dias",test:d=>d>20}
];
const OUTRAS_JANELAS=["Carregamento","Aguardando Ação Externa","Aguardando Ação Interna","Aguardando Tratativa"];

function toDate(v){
  if(!v)return null;if(v instanceof Date)return v;
  if(typeof v==="number"){return new Date(Math.round((v-25569)*86400000));}
  const d=new Date(v);return isNaN(d.getTime())?null:d;
}
function bucket(rows,keyIdx){
  const seen=new Set(),kept=[];
  for(const r of rows){const k=norm(r[keyIdx]);if(!k||seen.has(k))continue;seen.add(k);kept.push(r);}
  return{count:seen.size,rows:kept};
}
function groupBy(rows,idx){
  const map=new Map();
  for(const r of rows){const v=norm(r[idx]);if(!v)continue;if(!map.has(v))map.set(v,[]);map.get(v).push(r);}
  return[...map.entries()].map(([label,sub])=>({label,qtd:sub.length,rows:sub})).sort((a,b)=>b.qtd-a.qtd);
}

function computeReport(rows,header){
  const COL=resolveColumns(header);
  const get=(r,c)=>c>=0?r[c]:undefined;
  const armazem=rows.filter(r=>norm(get(r,COL.JANELA))==="Armazem");
  const viagem=rows.filter(r=>norm(get(r,COL.JANELA))==="Viagem");
  const entregue=rows.filter(r=>norm(get(r,COL.JANELA))==="Entregue");
  const coletar=rows.filter(r=>norm(get(r,COL.JANELA))==="Coletar");
  const dilig=rows.filter(r=>norm(get(r,COL.JANELA))==="Diligenciamento");

  const emArmazemB=bucket(armazem,COL.NOTA),emViagemB=bucket(viagem,COL.NOTA);
  const entreguesB=bucket(entregue,COL.CHAVE_NFE>=0?COL.CHAVE_NFE:COL.NOTA);
  const colPendB=bucket(coletar,COL.COLETA),colDiligB=bucket(dilig,COL.COLETA);
  const totalColetas=colPendB.count+colDiligB.count;
  const totalGeral=emArmazemB.count+emViagemB.count+entreguesB.count+totalColetas;

  const agingArmazem=RANGES_AGING.map(label=>{const sub=armazem.filter(r=>norm(get(r,COL.RANGE_DIAS))===label);const b=bucket(sub,COL.NOTA);return{label,qtd:b.count,rows:b.rows};});
  const totalAging=agingArmazem.reduce((s,x)=>s+x.qtd,0);

  const filDesc=new Set(armazem.map(r=>norm(get(r,COL.FILIAL))).filter(Boolean));
  const listaFil=[...new Set([...FILIAIS,...filDesc])];
  const porFilial=listaFil.map(f=>{const sub=armazem.filter(r=>norm(get(r,COL.FILIAL))===f);const b=bucket(sub,COL.NOTA);return{label:f,qtd:b.count,rows:b.rows};}).filter(x=>x.qtd>0);

  const today=new Date();today.setHours(0,0,0,0);
  const viagemMap=new Map();
  for(const r of viagem){const k=norm(get(r,COL.NOTA));if(!k)continue;const d=toDate(get(r,COL.DATA_VF));if(!d)continue;const cur=viagemMap.get(k);if(!cur||d>cur.data)viagemMap.set(k,{data:d,row:r});}
  const viagemEntries=[...viagemMap.values()].map(x=>{const ms=today.getTime()-new Date(x.data.getFullYear(),x.data.getMonth(),x.data.getDate()).getTime();return{dias:Math.floor(ms/86400000),row:x.row};});
  const agingViagem=RANGES_VIAGEM.map(({label,test})=>{const sub=viagemEntries.filter(e=>test(e.dias)).map(e=>e.row);return{label,qtd:sub.length,rows:sub};});
  const totalAgingViagem=agingViagem.reduce((s,x)=>s+x.qtd,0);

  const limiarSLA=new Date(2026,0,1);
  const slaSubset=status=>{const ns=norm(status);return entregue.filter(r=>{if(norm(get(r,COL.SLA_ENTREGA))!==ns)return false;const d=toDate(get(r,COL.DATA_BAIXA_SLA));return d&&d>=limiarSLA;});};
  const slaNoPrazoB=bucket(slaSubset("No Prazo"),COL.NOTA);
  const slaAtrasadoB=bucket(slaSubset("Atrasado"),COL.NOTA);
  const slaTotal=slaNoPrazoB.count+slaAtrasadoB.count;
  const semBaixaRows=rows.filter(r=>norm(get(r,COL.JANELA))==="Entregue sem data de baixa");

  const saidaVf=entregue.filter(r=>toDate(get(r,COL.DATA_VF)));
  const saidaVfPrazoB=bucket(saidaVf.filter(r=>norm(get(r,COL.SLA_ENTREGA))===norm("No Prazo")),COL.NOTA);
  const saidaVfAtrasoB=bucket(saidaVf.filter(r=>norm(get(r,COL.SLA_ENTREGA))===norm("Atrasado")),COL.NOTA);
  const saidaVfTotal=saidaVfPrazoB.count+saidaVfAtrasoB.count;

  const outras=OUTRAS_JANELAS.map(label=>{const ln=norm(label);const sub=rows.filter(r=>norm(get(r,COL.JANELA))===ln);return{label,qtd:sub.length,rows:sub};});

  const porVocativoItens=groupBy(rows,COL.VOCATIVO);
  const porClienteItens=groupBy(rows,COL.CLIENTE).slice(0,30);
  const porEstadoItens=groupBy(rows,COL.ESTADO_DESTINO);

  return{
    columns:COL,header,
    resumo:{emArmazem:emArmazemB.count,emArmazemRows:emArmazemB.rows,emViagem:emViagemB.count,emViagemRows:emViagemB.rows,entregues:entreguesB.count,entreguesRows:entreguesB.rows,coletaPendente:colPendB.count,coletaPendenteRows:colPendB.rows,coletaDiligenciamento:colDiligB.count,coletaDiligenciamentoRows:colDiligB.rows,totalColetas,total:totalGeral},
    agingArmazem:{itens:agingArmazem,total:totalAging},
    porFilial:{itens:porFilial,total:porFilial.reduce((s,x)=>s+x.qtd,0)},
    agingViagem:{itens:agingViagem,total:totalAgingViagem},
    sla:{noPrazo:slaNoPrazoB.count,noPrazoRows:slaNoPrazoB.rows,atrasado:slaAtrasadoB.count,atrasadoRows:slaAtrasadoB.rows,total:slaTotal,semBaixa:semBaixaRows.length,semBaixaRows},
    saidaVf:{noPrazo:saidaVfPrazoB.count,noPrazoRows:saidaVfPrazoB.rows,atrasado:saidaVfAtrasoB.count,atrasadoRows:saidaVfAtrasoB.rows,total:saidaVfTotal},
    outras,
    porVocativo:{itens:porVocativoItens,total:porVocativoItens.reduce((s,x)=>s+x.qtd,0)},
    porCliente:{itens:porClienteItens,total:porClienteItens.reduce((s,x)=>s+x.qtd,0)},
    porEstadoDestino:{itens:porEstadoItens,total:porEstadoItens.reduce((s,x)=>s+x.qtd,0)}
  };
}

/* ---------- DOM REFS ---------- */
const $=id=>document.getElementById(id);
const fileInput=$("fileInput"),btnExport=$("btnExport"),btnClear=$("btnClear");
const loadingOverlay=$("loadingOverlay"),loadingMsg=$("loadingMsg");
const emptyState=$("emptyState"),dashboard=$("dashboard");
const modalOverlay=$("modalOverlay");
const progressCircle=$("progressCircle");
const progressPct=$("progressPct");
const CIRCUMFERENCE=2*Math.PI*34;

function setProgress(pct){
  const offset=CIRCUMFERENCE-(pct/100)*CIRCUMFERENCE;
  progressCircle.style.strokeDashoffset=offset;
  progressPct.textContent=Math.round(pct)+"%";
}

let STATE={fileName:null,header:null,rows:null,report:null};

/* ---------- CACHE ---------- */
const STORAGE_KEY="relgen_data_v2";
function loadCache(){
  try{const raw=localStorage.getItem(STORAGE_KEY);if(!raw)return null;const p=JSON.parse(raw);const rows=p.rowsJson?JSON.parse(p.rowsJson):null;if(!rows||!p.header)return null;return{fileName:p.fileName,header:p.header,rows,report:computeReport(rows,p.header)};}catch{return null;}
}
function saveCache(state){
  try{const payload={fileName:state.fileName,rowCount:state.rows?.length,header:state.header,savedAt:new Date().toISOString()};try{const json=JSON.stringify(state.rows);if(json.length<4500000)payload.rowsJson=json;}catch{}localStorage.setItem(STORAGE_KEY,JSON.stringify(payload));}catch(e){console.warn("Falha ao salvar cache:",e);}
}

/* ---------- RENDER HELPERS ---------- */
function makeDataTable(items,total,titlePrefix,withBar=true){
  let html='<table class="data-table"><thead><tr><th>Indicador</th><th class="num">Qtd</th></tr></thead><tbody>';
  for(const it of items){
    const p=total?it.qtd/total:0;
    html+=`<tr class="clickable" data-drill="${encodeURIComponent(titlePrefix+" — "+it.label)}" data-idx="${items.indexOf(it)}"><td>${it.label}${withBar?`<div class="progress-bar"><span style="width:${(p*100).toFixed(1)}%"></span></div>`:""}</td><td class="num">${fmtNum(it.qtd)}</td></tr>`;
  }
  html+=`<tr class="total"><td>TOTAL</td><td class="num">${fmtNum(total)}</td></tr></tbody></table>`;
  return html;
}
function dataCard(title,iconId,items,total,titlePrefix,withBar=true){
  return`<div class="data-card"><h3>${svgIcon(iconId)} ${title}</h3>${makeDataTable(items,total,titlePrefix,withBar)}</div>`;
}

/* ---------- MAIN FILTER STATE ---------- */
let mainVocativo="",mainCliente="",mainStatus=[];
// Quick search: campo -> string
let quick={coleta:"",nota:"",chave:"",pedido:"",of:"",vf:""};
let dashboardSkeletonRendered=false; // controla 1ª renderização completa vs apenas atualização leve

/* ---------- CONFIG (visibility of sections) ---------- */
const SECTIONS=[
  {key:"kpis",label:"Indicadores (KPIs)"},
  {key:"estado",label:"Por Estado Destino"},
  {key:"agingArmazem",label:"Em Armazém — Aging"},
  {key:"porFilial",label:"Em Armazém — Por Filial"},
  {key:"agingViagem",label:"Em Viagem — Tempo desde saída"},
  {key:"sla",label:"Entregues — SLA"},
  {key:"saidaVf",label:"Saída por Vale Frete"},
  {key:"coletas",label:"Coletas em andamento"},
  {key:"outras",label:"Outras etapas operacionais"},
  {key:"explore",label:"Explorar base completa"},
  {key:"vocativo",label:"Por Vocativo"},
  {key:"cliente",label:"Por Cliente"}
];
const CFG_KEY="relgen_cfg_v1";
let CFG=(()=>{try{return JSON.parse(localStorage.getItem(CFG_KEY))||{}}catch{return{}}})();
function isVisible(k){return CFG[k]!==false;}
function saveCfg(){try{localStorage.setItem(CFG_KEY,JSON.stringify(CFG));}catch{}}

/* ---------- FILTERS ---------- */
function hasAnyFilter(){
  return !!(mainVocativo||mainCliente||mainStatus.length||quick.coleta||quick.nota||quick.chave||quick.pedido||quick.of||quick.vf);
}
function getFilteredRows(){
  if(!STATE.rows)return[];
  if(!hasAnyFilter())return STATE.rows;
  const COL=STATE.report.columns;
  const voc=mainVocativo.toLowerCase();
  const cli=mainCliente.toLowerCase();
  const sts=mainStatus;
  const qCol=quick.coleta.toLowerCase();
  const qNota=quick.nota.toLowerCase();
  const qChave=quick.chave.toLowerCase();
  const qPed=quick.pedido.toLowerCase();
  const qOf=quick.of.toLowerCase();
  const qVf=quick.vf.toLowerCase();
  const get=(r,i)=>i>=0?String(r?.[i]??"").toLowerCase():"";
  return STATE.rows.filter(r=>{
    if(voc&&!get(r,COL.VOCATIVO).includes(voc))return false;
    if(cli&&get(r,COL.CLIENTE)!==cli)return false;
    if(sts.length){const s=norm(r?.[COL.JANELA]);if(!sts.includes(s))return false;}
    if(qCol&&!get(r,COL.COLETA).includes(qCol))return false;
    if(qNota&&!get(r,COL.NOTA).includes(qNota))return false;
    if(qChave&&!get(r,COL.CHAVE_NFE).includes(qChave))return false;
    if(qPed&&!get(r,COL.PEDIDO).includes(qPed))return false;
    if(qOf&&!get(r,COL.OF).includes(qOf))return false;
    if(qVf&&!get(r,COL.VALE_FRETE).includes(qVf))return false;
    return true;
  });
}

/* ---------- RENDER DASHBOARD ---------- */
function renderDashboard(){
  const r0=STATE.report;if(!r0)return;
  btnExport.disabled=false;btnClear.disabled=false;
  emptyState.classList.add("hidden");dashboard.classList.remove("hidden");

  const filteredRows=getFilteredRows();
  const r=hasAnyFilter()?computeReport(filteredRows,STATE.header):r0;
  const res=r.resumo;

  const kpis=[
    {label:"Em Armazém",value:res.emArmazem,sub:fmtPct(res.total?res.emArmazem/res.total:0),cls:"",key:"emArmazem",ico:"ico-box"},
    {label:"Em Viagem",value:res.emViagem,sub:fmtPct(res.total?res.emViagem/res.total:0),cls:"warn",key:"emViagem",ico:"ico-truck"},
    {label:"Entregues",value:res.entregues,sub:fmtPct(res.total?res.entregues/res.total:0),cls:"success",key:"entregues",ico:"ico-check"},
    {label:"Total Coletas",value:res.totalColetas,sub:`${res.coletaPendente} pendentes · ${res.coletaDiligenciamento} diligenciamento`,cls:"accent",key:"coletas",ico:"ico-refresh"},
    {label:"TOTAL",value:res.total,sub:"Notas únicas + coletas",cls:"",key:"total",ico:"ico-sigma"}
  ];

  // Collect unique clientes for combobox (cached on STATE)
  if(!STATE._allClientes){
    const out=[];
    if(STATE.report.columns.CLIENTE>=0){
      const set=new Set();
      for(const row of STATE.rows){const v=norm(row?.[STATE.report.columns.CLIENTE]);if(v&&!set.has(v)){set.add(v);out.push(v);}}
      out.sort((a,b)=>a.localeCompare(b,"pt-BR"));
    }
    STATE._allClientes=out;
  }
  if(!STATE._allStatus){
    const out=[];
    if(STATE.report.columns.JANELA>=0){
      const set=new Set();
      for(const row of STATE.rows){const v=norm(row?.[STATE.report.columns.JANELA]);if(v)set.add(v);}
      out.push(...[...set].sort((a,b)=>a.localeCompare(b,"pt-BR")));
    }
    STATE._allStatus=out;
  }
  const allClientes=STATE._allClientes,allStatus=STATE._allStatus;

  let html=`
  <div class="report-header">
    <div><h2>Resumo Geral</h2><p class="meta">Arquivo: ${STATE.fileName||"—"} · ${fmtNum(STATE.rows?.length||0)} linhas processadas${hasAnyFilter()?` · Filtro ativo: ${fmtNum(filteredRows.length)} linhas`:""}</p></div>
    <div style="display:flex;gap:.5rem;align-items:center">
      <button class="btn" id="btnConfig">${svgIcon("ico-search")} Configurar visões</button>
      <div class="date-badge">${svgIcon("ico-calendar")} ${todayStr()}</div>
    </div>
  </div>`;

  // KPI indicators at the TOP
  if(isVisible("kpis")){
    html+=`<h3 style="margin:.25rem 0 .75rem;font-size:1.1rem;font-weight:600">${svgIcon("ico-chart")} Indicadores</h3>`;
    html+=`<div class="kpi-grid">${kpis.map(k=>`<div class="kpi-card ${k.cls}" data-kpi="${k.key}"><div class="kpi-label">${svgIcon(k.ico)} ${k.label}</div><div class="kpi-value">${fmtNum(k.value)}</div><div class="kpi-sub">${k.sub}</div></div>`).join("")}</div>`;
  }

  // Vocativo + Cliente (linha de cima) e Status Operacional (linha de baixo, largura total)
  html+=`<div class="main-filters">
    <div class="main-filter-group">
      <label>${svgIcon("ico-user-check")} Vocativo</label>
      <input type="text" id="mainVocativo" placeholder="Filtrar por vocativo..." value="${mainVocativo}"/>
    </div>
    <div class="main-filter-group">
      <label>${svgIcon("ico-users")} Cliente</label>
      <div class="combobox-main" id="mainClienteWrap">
        <input type="text" id="mainCliente" placeholder="Pesquisar cliente..." value="${mainCliente}" autocomplete="off"/>
        <svg class="w4 h4 combo-arrow"><use href="#ico-chevron"/></svg>
        <div class="combobox-list hidden" id="mainClienteList"></div>
      </div>
    </div>
  </div>

  <!-- Quick search (busca rápida) -->
  <div class="quick-search">
    <div class="quick-search-title">${svgIcon("ico-search")} Pesquisa rápida na base</div>
    <div class="qs-field"><label>Coleta</label><input id="qsColeta" type="text" value="${quick.coleta}" placeholder="nº coleta"/></div>
    <div class="qs-field"><label>Nota</label><input id="qsNota" type="text" value="${quick.nota}" placeholder="nº nota"/></div>
    <div class="qs-field"><label>Chave NFe</label><input id="qsChave" type="text" value="${quick.chave}" placeholder="44 dígitos"/></div>
    <div class="qs-field"><label>Pedido</label><input id="qsPedido" type="text" value="${quick.pedido}" placeholder="nº pedido"/></div>
    <div class="qs-field"><label>OF</label><input id="qsOf" type="text" value="${quick.of}" placeholder="nº OF"/></div>
    <div class="qs-field"><label>Vale Frete</label><input id="qsVf" type="text" value="${quick.vf}" placeholder="nº VF"/></div>
    ${(quick.coleta||quick.nota||quick.chave||quick.pedido||quick.of||quick.vf)?'<div class="qs-clear"><button class="btn" id="qsClear">'+svgIcon("ico-x")+' Limpar pesquisa</button></div>':''}
  </div>

  <div class="main-filter-group main-filter-full">
    <label>${svgIcon("ico-clock")} Status Operacional (Janela)</label>
    <div class="status-chips" id="statusChips">
      ${allStatus.map(s=>`<button type="button" class="status-chip${mainStatus.includes(s)?" active":""}" data-val="${s.replace(/"/g,'&quot;')}">${s}</button>`).join("")}
      ${mainStatus.length?`<button type="button" class="status-chip clear" id="statusClear">${svgIcon("ico-x")} Limpar</button>`:""}
    </div>
  </div>

  <p class="tip">${svgIcon("ico-search")} Dica: clique em qualquer linha das tabelas abaixo para ver as OFs / coletas detalhadas.</p>`;

  if(isVisible("estado")&&r.porEstadoDestino.itens.length) html+='<div class="grid-2">'+dataCard("Por Estado Destino","ico-map",r.porEstadoDestino.itens,r.porEstadoDestino.total,"Estado")+'</div>';

  if(isVisible("agingArmazem")||isVisible("porFilial")){
    html+='<div class="grid-2">';
    if(isVisible("agingArmazem")) html+=dataCard("Em Armazém — Aging (Range de Dias)","ico-box",r.agingArmazem.itens,r.agingArmazem.total,"Armazém");
    if(isVisible("porFilial")) html+=dataCard("Em Armazém — Por Filial","ico-box",r.porFilial.itens,res.emArmazem,"Armazém");
    html+='</div>';
  }

  if(isVisible("agingViagem")||isVisible("sla")){
    html+='<div class="grid-2">';
    if(isVisible("agingViagem")) html+=dataCard("Em Viagem — Tempo desde saída (Data VF)","ico-truck",r.agingViagem.itens,r.agingViagem.total,"Viagem");
    if(isVisible("sla")) html+=dataCard("Entregues — SLA","ico-check",[
      {label:"No Prazo",qtd:r.sla.noPrazo,rows:r.sla.noPrazoRows},
      {label:"Atrasado",qtd:r.sla.atrasado,rows:r.sla.atrasadoRows},
      {label:"Sem data de baixa",qtd:r.sla.semBaixa,rows:r.sla.semBaixaRows}
    ],r.sla.total,"Entregues");
    html+='</div>';
  }

  if(isVisible("saidaVf")||isVisible("coletas")){
    html+='<div class="grid-2">';
    if(isVisible("saidaVf")) html+=dataCard("Saída por Vale Frete","ico-arrows",[
      {label:"No Prazo",qtd:r.saidaVf.noPrazo,rows:r.saidaVf.noPrazoRows},
      {label:"Atrasado",qtd:r.saidaVf.atrasado,rows:r.saidaVf.atrasadoRows}
    ],r.saidaVf.total,"Saída por VF");
    if(isVisible("coletas")) html+=dataCard("Coletas em andamento","ico-refresh",[
      {label:"Pendente (aguardando ir p/ rua)",qtd:res.coletaPendente,rows:res.coletaPendenteRows},
      {label:"Diligenciamento (na rua, sem conclusão)",qtd:res.coletaDiligenciamento,rows:res.coletaDiligenciamentoRows}
    ],res.totalColetas,"Coletas");
    html+='</div>';
  }

  if(isVisible("outras")||isVisible("explore")){
    html+='<div class="grid-2">';
    if(isVisible("outras")) html+=dataCard("Outras etapas operacionais","ico-clock",r.outras,r.outras.reduce((s,x)=>s+x.qtd,0)||1,"Outras",false);
    if(isVisible("explore")) html+=`<div class="explore-card"><h3>${svgIcon("ico-search")} Explorar base completa</h3><p>Abra a planilha completa com filtros por filial, range, SLA, janela e busca livre.</p><button class="btn btn-primary" id="btnExplore">${svgIcon("ico-search")} Abrir explorador</button></div>`;
    html+='</div>';
  }

  if((isVisible("vocativo")&&r.porVocativo.itens.length)||(isVisible("cliente")&&r.porCliente.itens.length)){
    html+='<div class="grid-2">';
    if(isVisible("vocativo")&&r.porVocativo.itens.length) html+=dataCard("Por Vocativo","ico-user-check",r.porVocativo.itens,r.porVocativo.total,"Vocativo");
    if(isVisible("cliente")&&r.porCliente.itens.length) html+=dataCard("Por Cliente","ico-users",r.porCliente.itens,r.porCliente.total,"Cliente");
    html+='</div>';
  }

  dashboard.innerHTML=html;
  // restore focus on the field user was typing in
  if(window.__focusTarget){
    const el=$(window.__focusTarget);
    if(el){el.focus();const v=el.value;el.value="";el.value=v;}
    window.__focusTarget=null;
  }

  // Status chips
  dashboard.querySelectorAll(".status-chip[data-val]").forEach(el=>{
    el.addEventListener("click",()=>{
      const v=el.dataset.val;
      const i=mainStatus.indexOf(v);
      if(i>=0)mainStatus.splice(i,1); else mainStatus.push(v);
      renderDashboard();
    });
  });
  const sc=$("statusClear"); if(sc) sc.addEventListener("click",()=>{mainStatus=[];renderDashboard();});
  const bc=$("btnConfig"); if(bc) bc.addEventListener("click",openConfig);

  // Wire main vocativo filter (debounced)
  const vocInput=$("mainVocativo");
  vocInput.addEventListener("input",debounce(()=>{mainVocativo=vocInput.value.trim();window.__focusTarget="mainVocativo";renderDashboard();},300));

  // Wire main cliente combobox
  setupMainClienteCombo(allClientes);

  // Quick search wiring
  const qsMap=[["qsColeta","coleta"],["qsNota","nota"],["qsChave","chave"],["qsPedido","pedido"],["qsOf","of"],["qsVf","vf"]];
  qsMap.forEach(([id,key])=>{
    const el=$(id);if(!el)return;
    el.addEventListener("input",debounce(()=>{quick[key]=el.value.trim();window.__focusTarget=id;renderDashboard();},300));
  });
  const qc=$("qsClear");
  if(qc)qc.addEventListener("click",()=>{quick={coleta:"",nota:"",chave:"",pedido:"",of:"",vf:""};renderDashboard();});

  // Wire KPI clicks
  dashboard.querySelectorAll("[data-kpi]").forEach(el=>{
    el.addEventListener("click",()=>{
      const key=el.dataset.kpi;
      if(key==="emArmazem")openModal("Notas Em Armazém",res.emArmazemRows);
      else if(key==="emViagem")openModal("Notas Em Viagem",res.emViagemRows);
      else if(key==="entregues")openModal("Notas Entregues",res.entreguesRows);
      else if(key==="coletas")openModal("Notas Total Coletas",[...res.coletaPendenteRows,...res.coletaDiligenciamentoRows]);
    });
  });

  // Wire table row clicks
  const allItems=getAllItems(r);
  dashboard.querySelectorAll("tr.clickable").forEach(tr=>{
    tr.addEventListener("click",()=>{
      const drillLabel=decodeURIComponent(tr.dataset.drill||"");
      const match=allItems.find(x=>x.drillLabel===drillLabel);
      if(match)openModal(drillLabel,match.rows);
    });
  });

  const btnExp=$("btnExplore");
  if(btnExp)btnExp.addEventListener("click",()=>openModal("Base completa",filteredRows));
}

function setupMainClienteCombo(allClientes){
  const input=$("mainCliente");
  const list=$("mainClienteList");
  if(!input||!list)return;

  function renderList(filter){
    const q=filter.toLowerCase();
    const matches=q?allClientes.filter(c=>c.toLowerCase().includes(q)):allClientes;
    if(!matches.length){list.innerHTML='<div class="combo-empty">Nenhum cliente encontrado</div>';return;}
    list.innerHTML=matches.slice(0,50).map(c=>`<div class="combo-item${c.toLowerCase()===mainCliente.toLowerCase()?" selected":""}" data-val="${c}">${c}</div>`).join("");
    list.querySelectorAll(".combo-item").forEach(el=>{
      el.addEventListener("mousedown",e=>{
        e.preventDefault();
        mainCliente=el.dataset.val;
        input.value=mainCliente;
        list.classList.add("hidden");
        renderDashboard();
      });
    });
  }

  input.addEventListener("focus",()=>{renderList(input.value);list.classList.remove("hidden");});
  input.addEventListener("input",()=>{renderList(input.value);list.classList.remove("hidden");});
  input.addEventListener("blur",()=>{setTimeout(()=>list.classList.add("hidden"),150);});
  input.addEventListener("keydown",e=>{
    if(e.key==="Escape"){list.classList.add("hidden");input.blur();}
    if(e.key==="Enter"){
      const first=list.querySelector(".combo-item");
      if(first){mainCliente=first.dataset.val;input.value=mainCliente;list.classList.add("hidden");renderDashboard();}
    }
  });

  input.addEventListener("change",()=>{
    if(!input.value.trim()&&mainCliente){mainCliente="";renderDashboard();}
  });
}

function getAllItems(r){
  const items=[];
  const add=(prefix,list)=>{for(const it of list)items.push({drillLabel:prefix+" — "+it.label,rows:it.rows});};
  add("Vocativo",r.porVocativo.itens);add("Cliente",r.porCliente.itens);add("Estado",r.porEstadoDestino.itens);
  add("Armazém",r.agingArmazem.itens);add("Armazém",r.porFilial.itens);add("Viagem",r.agingViagem.itens);
  add("Entregues",[{label:"No Prazo",rows:r.sla.noPrazoRows},{label:"Atrasado",rows:r.sla.atrasadoRows},{label:"Sem data de baixa",rows:r.sla.semBaixaRows}]);
  add("Saída por VF",[{label:"No Prazo",rows:r.saidaVf.noPrazoRows},{label:"Atrasado",rows:r.saidaVf.atrasadoRows}]);
  add("Coletas",[{label:"Pendente (aguardando ir p/ rua)",rows:r.resumo.coletaPendenteRows},{label:"Diligenciamento (na rua, sem conclusão)",rows:r.resumo.coletaDiligenciamentoRows}]);
  add("Outras",r.outras);
  return items;
}

/* ---------- MODAL ---------- */
const PRIORITY_COLS=["of","ordem de frete","vale frete","vf","nota","chave_nfe","chave nfe","chave nota portal","coleta","filial atual","cidade","uf","vocativo","janela operacional","range de dias","status sla entrega","data de criacao do vf","data de criação do vf","data baixa sla","data baixa","fonte data entrega","pedido"];

let modalRows=[],modalCols=[],modalAllRows=[];

function pickColumns(header){
  const lower=header.map(h=>normH(h));const seen=new Set(),ordered=[];
  for(const name of PRIORITY_COLS){const i=lower.indexOf(name);if(i!==-1&&!seen.has(i)){seen.add(i);ordered.push(i);}}
  for(let i=0;i<header.length;i++)if(!seen.has(i))ordered.push(i);
  return ordered;
}
function uniqVals(rows,idx){
  if(idx==null||idx<0)return[];const s=new Set();
  for(const r of rows){const v=r?.[idx];if(v!=null&&String(v).trim()!=="")s.add(String(v).trim());}
  return[...s].sort((a,b)=>a.localeCompare(b,"pt-BR"));
}
function sla2cls(v){const s=String(v).toLowerCase();if(s.includes("no prazo"))return"success";if(s.includes("atras"))return"danger";return"";}

function openModal(title,rows){
  modalAllRows=rows;modalCols=pickColumns(STATE.header);
  $("modalTitle").textContent=title;
  $("modalSub").textContent=fmtNum(rows.length)+" linhas";
  $("modalSearch").value="";
  const COL=STATE.report.columns;
  const fillSelect=(id,vals)=>{const sel=$(id);sel.innerHTML='<option value="">'+sel.querySelector("option").textContent+'</option>';for(const v of vals)sel.innerHTML+=`<option value="${v}">${v}</option>`;sel.value="";};
  fillSelect("fFilial",uniqVals(rows,COL.FILIAL));
  fillSelect("fRange",uniqVals(rows,COL.RANGE_DIAS));
  fillSelect("fSla",uniqVals(rows,COL.SLA_ENTREGA));
  fillSelect("fJanela",uniqVals(rows,COL.JANELA));
  $("fVocativo").value="";
  setupModalClienteCombo(rows,COL);

  let thead='<tr>';for(const i of modalCols)thead+=`<th>${STATE.header[i]||""}</th>`;thead+='</tr>';
  $("modalThead").innerHTML=thead;

  renderModalRows();
  modalOverlay.classList.remove("hidden");
}

function setupModalClienteCombo(rows,COL){
  const input=$("fCliente");
  const list=$("clienteList");
  if(!input||!list)return;
  const allVals=uniqVals(rows,COL.CLIENTE);
  input.value="";

  function renderList(filter){
    const q=filter.toLowerCase();
    const matches=q?allVals.filter(c=>c.toLowerCase().includes(q)):allVals;
    if(!matches.length){list.innerHTML='<div class="combo-empty">Nenhum</div>';return;}
    list.innerHTML=matches.slice(0,40).map(c=>`<div class="combo-item" data-val="${c}">${c}</div>`).join("");
    list.querySelectorAll(".combo-item").forEach(el=>{
      el.addEventListener("mousedown",e=>{
        e.preventDefault();
        input.value=el.dataset.val;
        list.classList.add("hidden");
        renderModalRows();
      });
    });
  }

  input.addEventListener("focus",()=>{renderList(input.value);list.classList.remove("hidden");});
  input.addEventListener("input",()=>{renderList(input.value);list.classList.remove("hidden");renderModalRows();});
  input.addEventListener("blur",()=>{setTimeout(()=>list.classList.add("hidden"),150);});
  input.addEventListener("keydown",e=>{
    if(e.key==="Escape"){list.classList.add("hidden");}
    if(e.key==="Enter"){
      const first=list.querySelector(".combo-item");
      if(first){input.value=first.dataset.val;list.classList.add("hidden");renderModalRows();}
    }
  });
}

function getFilteredModalRows(){
  const COL=STATE.report.columns;
  const q=$("modalSearch").value.trim().toLowerCase();
  const filial=$("fFilial").value,range=$("fRange").value,sla=$("fSla").value,janela=$("fJanela").value;
  const vocativo=$("fVocativo").value.trim().toLowerCase();
  const cliente=$("fCliente").value.trim().toLowerCase();
  return modalAllRows.filter(r=>{
    if(filial&&String(r?.[COL.FILIAL]??"").trim()!==filial)return false;
    if(range&&String(r?.[COL.RANGE_DIAS]??"").trim()!==range)return false;
    if(sla&&String(r?.[COL.SLA_ENTREGA]??"").trim()!==sla)return false;
    if(janela&&String(r?.[COL.JANELA]??"").trim()!==janela)return false;
    if(vocativo){const v=String(r?.[COL.VOCATIVO]??"").trim().toLowerCase();if(!v.includes(vocativo))return false;}
    if(cliente){const c=String(r?.[COL.CLIENTE]??"").trim().toLowerCase();if(!c.includes(cliente))return false;}
    if(q){let hit=false;for(let i=0;i<r.length;i++){if(String(r[i]??"").toLowerCase().includes(q)){hit=true;break;}}if(!hit)return false;}
    return true;
  });
}

function renderModalRows(){
  const filtered=getFilteredModalRows();
  modalRows=filtered;
  const MAX=1000,slice=filtered.slice(0,MAX);
  const COL=STATE.report.columns;
  let html="";
  for(const r of slice){
    html+="<tr>";
    for(const i of modalCols){
      const v=fmtCell(r?.[i]);
      const badge=i===COL.SLA_ENTREGA?sla2cls(v):"";
      html+=`<td>${badge?`<span class="badge-sla ${badge}">${v}</span>`:v}</td>`;
    }
    html+="</tr>";
  }
  if(filtered.length>MAX)html+=`<tr><td colspan="${modalCols.length}" style="text-align:center;color:var(--muted-fg);padding:.85rem">Mostrando primeiras ${MAX} linhas. Use os filtros ou exporte para ver tudo.</td></tr>`;
  $("modalTbody").innerHTML=html;
  $("filterCount").textContent=`${fmtNum(filtered.length)} de ${fmtNum(modalAllRows.length)} linhas`;
}

function closeModal(){modalOverlay.classList.add("hidden");}

/* Modal events */
$("modalBg").addEventListener("click",closeModal);
$("modalClose").addEventListener("click",closeModal);
const debouncedRenderModal=debounce(renderModalRows,200);
["modalSearch","fFilial","fRange","fSla","fJanela","fVocativo"].forEach(id=>{
  $(id).addEventListener("input",debouncedRenderModal);
  $(id).addEventListener("change",renderModalRows);
});
$("modalExport").addEventListener("click",()=>{
  const filtered=getFilteredModalRows();
  const wb=XLSX.utils.book_new();
  const aoa=[modalCols.map(i=>STATE.header[i]||""),...filtered.map(r=>modalCols.map(i=>r?.[i]??""))];
  const ws=XLSX.utils.aoa_to_sheet(aoa);
  XLSX.utils.book_append_sheet(wb,ws,"Detalhes");
  const title=$("modalTitle").textContent.replace(/[^a-z0-9]+/gi,"_").slice(0,40);
  XLSX.writeFile(wb,`detalhes_${title}_${new Date().toISOString().slice(0,10)}.xlsx`);
});

/* ---------- FILE HANDLING ---------- */
async function processXlsx(buf,fileName){
  loadingMsg.textContent="Decodificando planilha...";
  setProgress(20);
  await new Promise(r=>setTimeout(r,15));
  const wb=XLSX.read(buf,{type:"array",cellDates:true});
  setProgress(40);
  const sheetName=wb.SheetNames.includes("Export")?"Export":wb.SheetNames[0];
  const ws=wb.Sheets[sheetName];
  const aoa=XLSX.utils.sheet_to_json(ws,{header:1,raw:true,defval:""});
  if(!aoa.length){alert("Planilha vazia.");return;}
  const header=aoa[0];
  const rows=aoa.slice(1).filter(r=>r.some(c=>c!==""&&c!==null&&c!==undefined));
  loadingMsg.textContent=`Processando ${rows.length.toLocaleString("pt-BR")} linhas...`;
  setProgress(70);
  await new Promise(r=>setTimeout(r,15));
  const report=computeReport(rows,header);
  setProgress(90);
  await new Promise(r=>setTimeout(r,15));
  STATE={fileName,header,rows,report};
  saveCache(STATE);
  mainVocativo="";mainCliente="";mainStatus=[];
  quick={coleta:"",nota:"",chave:"",pedido:"",of:"",vf:""};
  renderDashboard();
  setProgress(100);
}

async function handleFile(file){
  loadingOverlay.classList.remove("hidden");
  loadingMsg.textContent="Lendo arquivo...";
  setProgress(5);
  try{
    const buf=await file.arrayBuffer();
    setProgress(10);
    if(file.name.toLowerCase().endsWith(".zip")){
      loadingMsg.textContent="Extraindo arquivo ZIP...";
      setProgress(15);
      const zip=await JSZip.loadAsync(buf);
      const xlsxFile=Object.values(zip.files).find(f=>!f.dir&&/\.xlsx?$/i.test(f.name));
      if(!xlsxFile){alert("Nenhum arquivo .xlsx encontrado no ZIP.");return;}
      const xlsxBuf=await xlsxFile.async("arraybuffer");
      await processXlsx(xlsxBuf,xlsxFile.name);
    }else{
      await processXlsx(buf,file.name);
    }
  }finally{
    setTimeout(()=>{loadingOverlay.classList.add("hidden");setProgress(0);},250);
  }
}

fileInput.addEventListener("change",e=>{const f=e.target.files?.[0];if(f)handleFile(f);});

/* ---------- EXPORT (espelha Relatório Modelo) ---------- */
btnExport.addEventListener("click",async()=>{
  try{
  if(!STATE.report||!STATE.rows||!STATE.header){alert("Importe um relatório antes de exportar.");return;}
  // Respeita filtros aplicados no Resumo Geral
  const exportRows=getFilteredRows();
  const r=hasAnyFilter()?computeReport(exportRows,STATE.header):STATE.report;
  const pct=(n,d)=>d?n/d:0;

  // ========= Cores da marca =========
  const ORANGE="FFF8981D", DEEP="FFED771F", LIGHT="FFFCE5C9", SOFT="FFFFF4E6";
  const WHITE="FFFFFFFF", DARK="FF2A2A2A", BORDERC="FFE5E5E5", ALT="FFFAFAFA";

  const wb=new ExcelJS.Workbook();
  wb.creator="Relatório Gerencial"; wb.created=new Date();

  // ========= Aba 1: Export (base bruta) — usa addRows em lote, sem limite de propriedades =========
  const wsRaw=wb.addWorksheet("Export",{views:[{state:"frozen",ySplit:1}]});
  wsRaw.addRow(STATE.header);
  const headerRow=wsRaw.getRow(1);
  headerRow.font={bold:true,color:{argb:WHITE}};
  headerRow.fill={type:"pattern",pattern:"solid",fgColor:{argb:ORANGE}};
  headerRow.alignment={vertical:"middle",horizontal:"left"};
  headerRow.height=22;
  // Normaliza cada linha para array primitivo do tamanho do header (evita "Invalid array length" do ExcelJS)
  const HLEN=STATE.header.length;
  const sanitize=(v)=>{
    if(v===null||v===undefined)return null;
    if(v instanceof Date)return v;
    const t=typeof v;
    if(t==="number"){return Number.isFinite(v)?v:null;}
    if(t==="boolean")return v;
    if(t==="object"){try{return String(v);}catch{return"";}}
    const s=String(v);
    return s.length>32000?s.slice(0,32000):s;
  };
  const CHUNK=500;
  let buffer=[];
  for(let i=0;i<exportRows.length;i++){
    const src=exportRows[i]||[];
    const out=new Array(HLEN);
    for(let c=0;c<HLEN;c++)out[c]=sanitize(src[c]);
    buffer.push(out);
    if(buffer.length>=CHUNK){wsRaw.addRows(buffer);buffer=[];}
  }
  if(buffer.length)wsRaw.addRows(buffer);
  // largura simples
  STATE.header.forEach((h,i)=>{wsRaw.getColumn(i+1).width=Math.min(28,Math.max(10,String(h||"").length+4));});

  // ========= Aba 2: Relatório Gerencial — totalmente estilizada =========
  const ws=wb.addWorksheet("Relatório Gerencial",{views:[{showGridLines:false}]});
  ws.getColumn(1).width=2;
  ws.getColumn(2).width=55;
  ws.getColumn(3).width=22;
  ws.getColumn(4).width=16;
  ws.getColumn(5).width=2;
  ws.getColumn(6).width=42; // coluna de gráfico (data bar)
  for(let c=7;c<=11;c++)ws.getColumn(c).width=12;

  const border={top:{style:"thin",color:{argb:BORDERC}},left:{style:"thin",color:{argb:BORDERC}},bottom:{style:"thin",color:{argb:BORDERC}},right:{style:"thin",color:{argb:BORDERC}}};
  const setCell=(addr,val,style={})=>{const c=ws.getCell(addr);c.value=val;Object.assign(c,style);return c;};
  const fillSolid=(argb)=>({type:"pattern",pattern:"solid",fgColor:{argb}});

  // Título
  ws.mergeCells("B2:K2");
  setCell("B2","RELATÓRIO GERENCIAL DE OPERAÇÃO",{font:{bold:true,size:18,color:{argb:WHITE}},fill:fillSolid(ORANGE),alignment:{vertical:"middle",horizontal:"center"}});
  ws.getRow(2).height=32;
  ws.mergeCells("B3:H3");
  setCell("B3",`Visão consolidada por chave de nota (notas únicas) | Coletas não possuem nota vinculada${hasAnyFilter()?` | FILTRO ATIVO: ${fmtNum(exportRows.length)} linhas`:""}`,{font:{italic:true,color:{argb:"FF666666"}}});
  setCell("J3","Gerado em:",{font:{bold:true,color:{argb:DEEP}},alignment:{horizontal:"right"}});
  ws.mergeCells("J3:K3");
  const dt=ws.getCell("J3"); // re-write merged value
  setCell("J3","Gerado em: "+new Date().toLocaleString("pt-BR"),{font:{bold:true,color:{argb:DEEP}},alignment:{horizontal:"right"}});

  // Helper: cabeçalho de seção (faixa laranja)
  const sectionTitle=(row,text)=>{
    ws.mergeCells(`B${row}:F${row}`);
    setCell(`B${row}`,text,{font:{bold:true,size:13,color:{argb:WHITE}},fill:fillSolid(DEEP),alignment:{vertical:"middle",horizontal:"left",indent:1}});
    ws.getRow(row).height=24;
  };
  // Helper: cabeçalho de tabela
  const tableHead=(row,cols)=>{
    cols.forEach((t,i)=>{
      const cell=ws.getCell(row,2+i);
      cell.value=t;
      cell.font={bold:true,color:{argb:WHITE}};
      cell.fill=fillSolid(ORANGE);
      cell.alignment={vertical:"middle",horizontal:i===0?"left":"center"};
      cell.border=border;
    });
    // célula de gráfico (col F = 6)
    const g=ws.getCell(row,6);
    g.value="Gráfico";
    g.font={bold:true,color:{argb:WHITE}};
    g.fill=fillSolid(ORANGE);
    g.alignment={vertical:"middle",horizontal:"center"};
    g.border=border;
    ws.getRow(row).height=20;
  };
  // Helper: linha de dado com gráfico
  const dataRow=(row,label,qty,pctVal,opts={})=>{
    const labelCell=ws.getCell(`B${row}`); labelCell.value=label;
    labelCell.font={color:{argb:DARK},bold:!!opts.bold};
    labelCell.fill=fillSolid(opts.bold?LIGHT:(row%2===0?ALT:WHITE));
    labelCell.alignment={vertical:"middle",horizontal:"left",indent:1};
    labelCell.border=border;
    const qCell=ws.getCell(`C${row}`); qCell.value=qty;
    qCell.numFmt="#,##0"; qCell.alignment={horizontal:"center"};
    qCell.font={bold:!!opts.bold,color:{argb:DARK}};
    qCell.fill=fillSolid(opts.bold?LIGHT:(row%2===0?ALT:WHITE));
    qCell.border=border;
    const pCell=ws.getCell(`D${row}`); pCell.value=pctVal;
    pCell.numFmt="0.0%"; pCell.alignment={horizontal:"center"};
    pCell.font={bold:!!opts.bold,color:{argb:DEEP}};
    pCell.fill=fillSolid(opts.bold?LIGHT:(row%2===0?ALT:WHITE));
    pCell.border=border;
    // Gráfico (data bar usa o valor da col C indiretamente via referência)
    const g=ws.getCell(`F${row}`); g.value=qty;
    g.numFmt=";;;"; // oculta o número, mantém só a barra
    g.fill=fillSolid(WHITE);
    g.border=border;
  };
  // Helper: aplica data bar laranja em range
  const addBar=(range)=>{
    ws.addConditionalFormatting({ref:range,rules:[{type:"dataBar",cfvo:[{type:"min"},{type:"max"}],color:{argb:ORANGE},gradient:true,showValue:false,priority:1}]});
  };

  // ===== RESUMO GERAL =====
  sectionTitle(5,"RESUMO GERAL");
  tableHead(7,["Indicador","Qtde Notas Únicas","% do Total"]);
  const resumoRows=[
    ["📦 Em Armazém",r.resumo.emArmazem],
    ["🚚 Em Viagem",r.resumo.emViagem],
    ["✅ Entregues",r.resumo.entregues],
    ["   🔄 Coleta - Pendente*",r.resumo.coletaPendente],
    ["   📋 Coleta - Diligenciamento",r.resumo.coletaDiligenciamento],
    ["🔄 Total Coletas",r.resumo.totalColetas],
  ];
  resumoRows.forEach((d,i)=>dataRow(8+i,d[0],d[1],pct(d[1],r.resumo.total)));
  dataRow(14,"TOTAL",r.resumo.total,1,{bold:true});
  addBar("F8:F13");
  setCell("B15","* Coletas pendentes não possuem nota vinculada, contagem por linhas na base",{font:{italic:true,size:9,color:{argb:"FF888888"}}});

  // ===== AGING ARMAZÉM =====
  sectionTitle(17,"📦 NOTAS EM ARMAZÉM - AGING (Range de Dias)");
  tableHead(19,["Range de Dias","Qtde Notas Únicas","% do Armazém"]);
  const agArmMap=new Map(r.agingArmazem.itens.map(x=>[x.label,x.qtd]));
  const rangesArm=["0 dias","Entre 1 e 2 dias","Entre 3 e 5 dias","Entre 6 e 10 dias","Entre 11 e 20 dias","Mais de 20 dias"];
  rangesArm.forEach((lab,i)=>{const q=agArmMap.get(lab)||0;dataRow(20+i,lab,q,pct(q,r.agingArmazem.total));});
  dataRow(26,"TOTAL",r.agingArmazem.total,1,{bold:true});
  addBar("F20:F25");

  // ===== POR FILIAL =====
  sectionTitle(27,"📦 NOTAS EM ARMAZÉM - POR FILIAL");
  tableHead(29,["Filial","Qtde Notas Únicas","% do Armazém"]);
  const FILIAIS_MODELO=["São Paulo - SP","Açailândia - MA","Contagem MG","Ipatinga MG","Piracicaba - SP","São Luiz - MA","Araquari - SC","Aparecida de Goiania - GO","Curitiba - PR","Ribeirão Preto - SP","Rio de Janeiro - RJ","Viana - ES"];
  const filMap=new Map(r.porFilial.itens.map(x=>[x.label,x.qtd]));
  FILIAIS_MODELO.forEach((f,i)=>{const q=filMap.get(f)||0;dataRow(30+i,f,q,pct(q,r.resumo.emArmazem));});
  const totFil=FILIAIS_MODELO.reduce((s,f)=>s+(filMap.get(f)||0),0);
  dataRow(42,"TOTAL",totFil,pct(totFil,r.resumo.emArmazem),{bold:true});
  addBar("F30:F41");

  // ===== AGING VIAGEM =====
  sectionTitle(43,"🚚 NOTAS EM VIAGEM - TEMPO DESDE SAÍDA DO ARMAZÉM (Data Criação VF)");
  tableHead(45,["Range de Dias","Qtde Notas Únicas","% da Viagem"]);
  const agViaMap=new Map(r.agingViagem.itens.map(x=>[x.label,x.qtd]));
  const rangesVia=["0 dias","1 a 2 dias","3 a 5 dias","6 a 10 dias","11 a 20 dias","Mais de 20 dias"];
  rangesVia.forEach((lab,i)=>{const q=agViaMap.get(lab)||0;dataRow(46+i,lab,q,pct(q,r.agingViagem.total));});
  dataRow(52,"TOTAL",r.agingViagem.total,1,{bold:true});
  addBar("F46:F51");

  // ===== ENTREGUES =====
  const semBaixa=r.sla.semBaixa||0;
  sectionTitle(54,"✅ NOTAS ENTREGUES");
  tableHead(56,["Indicador","Valor",""]);
  dataRow(57,"Total Notas Entregues (únicas)",r.resumo.entregues,pct(r.resumo.entregues,r.resumo.entregues||1));
  dataRow(58,"Entregue sem data de baixa (linhas)",semBaixa,pct(semBaixa,r.resumo.entregues||1));
  ws.getCell("D57").value=null; ws.getCell("D58").value=null; // % não faz sentido aqui

  sectionTitle(60,"SLA de Entrega");
  tableHead(61,["Status SLA","Qtde Notas Únicas","% do Total"]);
  dataRow(62,"✅ No Prazo",r.sla.noPrazo,pct(r.sla.noPrazo,r.sla.total));
  dataRow(63,"⚠ Atrasado",r.sla.atrasado,pct(r.sla.atrasado,r.sla.total));
  dataRow(64,"TOTAL",r.sla.total,1,{bold:true});
  addBar("F62:F63");

  // ===== COLETAS =====
  sectionTitle(67,"🔄 COLETAS EM ANDAMENTO");
  tableHead(69,["Indicador","Valor",""]);
  dataRow(70,"Coleta - Pendente (aguardando ir p/ rua)",r.resumo.coletaPendente,0);
  dataRow(71,"Coleta - Diligenciamento (na rua, sem conclusão)",r.resumo.coletaDiligenciamento,0);
  ws.getCell("D70").value=null; ws.getCell("D71").value=null;

  // ===== OUTRAS =====
  const outrasMap=new Map(r.outras.map(x=>[x.label,x.qtd]));
  sectionTitle(73,"⏳ OUTRAS ETAPAS OPERACIONAIS");
  tableHead(75,["Janela Operacional","Qtde (linhas)",""]);
  ["Carregamento","Aguardando Ação Externa","Aguardando Ação Interna","Aguardando Tratativa"].forEach((lab,i)=>{
    dataRow(76+i,lab,outrasMap.get(lab)||0,0);
    ws.getCell(`D${76+i}`).value=null;
  });
  addBar("F76:F79");

  // ========= Salvar =========
  const buf=await wb.xlsx.writeBuffer();
  const blob=new Blob([buf],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url; a.download=`relatorio_gerencial_${new Date().toISOString().slice(0,10)}.xlsx`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(err){console.error("Erro ao exportar:",err);alert("Erro ao exportar relatório: "+(err?.message||err));}
});

/* ---------- CLEAR ---------- */
btnClear.addEventListener("click",()=>{
  if(!confirm("Limpar dados do cache?"))return;
  localStorage.removeItem(STORAGE_KEY);
  STATE={fileName:null,header:null,rows:null,report:null};
  mainVocativo="";mainCliente="";mainStatus=[];
  quick={coleta:"",nota:"",chave:"",pedido:"",of:"",vf:""};
  dashboard.classList.add("hidden");emptyState.classList.remove("hidden");
  btnExport.disabled=true;btnClear.disabled=true;
});

/* ---------- CONFIG MODAL ---------- */
function openConfig(){
  const ov=$("configOverlay");
  const list=$("configList");
  list.innerHTML=SECTIONS.map(s=>`
    <label class="cfg-row">
      <input type="checkbox" data-key="${s.key}" ${isVisible(s.key)?"checked":""}/>
      <span>${s.label}</span>
    </label>`).join("");
  list.querySelectorAll("input[type=checkbox]").forEach(cb=>{
    cb.addEventListener("change",()=>{CFG[cb.dataset.key]=cb.checked;saveCfg();renderDashboard();});
  });
  ov.classList.remove("hidden");
}
document.addEventListener("click",e=>{
  if(e.target.id==="configBg"||e.target.id==="configClose")$("configOverlay").classList.add("hidden");
});

/* ---------- INIT ---------- */
const cached=loadCache();
if(cached){STATE=cached;renderDashboard();}
