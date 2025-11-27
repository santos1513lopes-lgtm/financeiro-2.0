 import { db, auth } from './firebase.js';
import { 
    collection, addDoc, doc, updateDoc, deleteDoc, query, where, onSnapshot, writeBatch, getDocs 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { 
    signInWithEmailAndPassword, onAuthStateChanged, signOut 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// --- VARIÁVEIS GLOBAIS ---
let currentUser = null;
let transactions = [];
let userCategories = {};
let chartInstance = null;
let sortConfig = { column: 'date', direction: 'desc' };
let valuesVisible = true;
let includeFuture = false; 
let showTotalFuture = false;
let startDate = "";
let endDate = "";

const views = {
    dashboard: document.getElementById('tab-dashboard'),
    transacoes: document.getElementById('tab-transacoes'),
    futuras: document.getElementById('tab-futuras'),
    extrato: document.getElementById('tab-extrato')
};

const defaultCategories = {
    "Saldo Inicial": "🏛️", "Vendas": "💰", "Serviços": "🛠️", "Reposição de Estoque": "📦", "Salário": "💵", 
    "Poupança": "🐷", "Donativo": "🤝", "Pró-labore": "💼", "MEI/DAS": "📄", "Impostos": "💸", 
    "Empréstimo": "🏦", "INSS": "🛡️", "Marketing": "📢", "Logística/Frete": "🚚", 
    "Aluguel/Condomínio": "🏢", "Energia/Água/Net": "⚡", "Equipamentos": "💻", "Outros": "🔹"
};

// --- FUNÇÕES UTILITÁRIAS ---
function getIcon(cat) { return userCategories[cat] || defaultCategories[cat] || "🔹"; }
function fmtMoney(v) { return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function fmtDate(d) { if (!d) return ''; return d.split('-').reverse().join('/'); }
function isDateInRange(dateStr) { return dateStr >= startDate && dateStr <= endDate; }

function setDateRange(preset) {
    const today = new Date();
    let start = new Date();
    let end = new Date();
    if (preset === 'today') { /* hoje */ }
    else if (preset === 'month') { start = new Date(today.getFullYear(), today.getMonth(), 1); end = new Date(today.getFullYear(), today.getMonth() + 1, 0); }
    else if (preset === 'last_month') { start = new Date(today.getFullYear(), today.getMonth() - 1, 1); end = new Date(today.getFullYear(), today.getMonth(), 0); }
    else if (preset === 'year') { start = new Date(today.getFullYear(), 0, 1); end = new Date(today.getFullYear(), 11, 31); }
    startDate = start.toISOString().split('T')[0];
    endDate = end.toISOString().split('T')[0];
    
    const elStart = document.getElementById('filter-start-date');
    const elEnd = document.getElementById('filter-end-date');
    if(elStart) elStart.value = startDate;
    if(elEnd) elEnd.value = endDate;
    
    updateDateLabel(); updateInterface();
    
    const dd = document.getElementById('date-dropdown');
    if(dd) dd.classList.add('hidden');
}

function updateDateLabel() {
    const el = document.getElementById('date-label');
    if(!el) return;
    const s = startDate.split('-'); const e = endDate.split('-');
    el.innerText = `${s[2]}/${s[1]} - ${e[2]}/${e[1]}`;
}

// --- SIDEBAR ---
const sidebar = document.getElementById('sidebar');
const btnCollapse = document.getElementById('btn-collapse');
if(btnCollapse && sidebar) {
    btnCollapse.onclick = () => {
        sidebar.classList.toggle('w-64'); sidebar.classList.toggle('w-20');
        document.querySelectorAll('.sidebar-text').forEach(t => t.classList.toggle('hidden'));
        const icon = btnCollapse.querySelector('i');
        if(sidebar.classList.contains('w-20')) { icon.classList.remove('fa-chevron-left'); icon.classList.add('fa-chevron-right'); }
        else { icon.classList.remove('fa-chevron-right'); icon.classList.add('fa-chevron-left'); }
    };
}

// --- AUTH ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('app-content').classList.remove('hidden');
        const topControls = document.getElementById('top-controls');
        if(topControls) { topControls.classList.remove('hidden'); topControls.classList.add('md:flex'); }
        
        const email = user.email;
        const initial = email.charAt(0).toUpperCase();
        if(document.getElementById('user-email-display')) document.getElementById('user-email-display').innerText = email;
        if(document.getElementById('user-email-mobile')) document.getElementById('user-email-mobile').innerText = email;
        if(document.getElementById('user-name-display')) document.getElementById('user-name-display').innerText = "Olá, " + email.split('@')[0];
        if(document.getElementById('avatar-display')) document.getElementById('avatar-display').innerText = initial;
        if(document.getElementById('btn-profile-mobile')) document.getElementById('btn-profile-mobile').innerText = initial;

        initApp();
    } else {
        currentUser = null;
        document.getElementById('login-screen').classList.remove('hidden');
        document.getElementById('app-content').classList.add('hidden');
        const topControls = document.getElementById('top-controls');
        if(topControls) topControls.classList.add('hidden');
    }
});

async function initApp() {
    setDateRange('month'); 
    await loadCategories(); 
    const q = query(collection(db, "transactions"), where("user_id", "==", currentUser.uid));
    onSnapshot(q, (snapshot) => {
        transactions = [];
        snapshot.forEach((doc) => transactions.push({ id: doc.id, ...doc.data() }));
        updateInterface();
    });
}

// --- UPDATE INTERFACE ---
function updateInterface() {
    const periodData = transactions.filter(t => isDateInRange(t.date));
    const accData = transactions.filter(t => t.date <= endDate);
    
    const investTotalData = transactions.filter(t => t.category === 'Poupança' && t.status === 'efetivado');
    const investIn = investTotalData.filter(t => t.type === 'saida').reduce((a,t) => a+t.amount, 0);
    const investOut = investTotalData.filter(t => t.type === 'entrada').reduce((a,t) => a+t.amount, 0);
    if(document.getElementById('dash-invest')) document.getElementById('dash-invest').innerText = fmtMoney(investIn - investOut);

    const rec = periodData.filter(t => t.type === 'entrada' && t.status === 'efetivado' && t.category !== 'Poupança').reduce((a,t) => a+t.amount,0);
    const desp = periodData.filter(t => t.type === 'saida' && t.status === 'efetivado' && t.category !== 'Poupança').reduce((a,t) => a+t.amount,0);
    if(document.getElementById('dash-receitas')) document.getElementById('dash-receitas').innerText = fmtMoney(rec);
    if(document.getElementById('dash-despesas')) document.getElementById('dash-despesas').innerText = fmtMoney(desp);
    
    let recAcc=0, despAcc=0;
    const dataForSaldo = includeFuture ? accData : accData.filter(t => t.status === 'efetivado');
    recAcc = dataForSaldo.filter(t => t.type === 'entrada').reduce((a,t) => a+t.amount,0);
    despAcc = dataForSaldo.filter(t => t.type === 'saida').reduce((a,t) => a+t.amount,0);
    if(document.getElementById('dash-saldo')) document.getElementById('dash-saldo').innerText = fmtMoney(recAcc - despAcc);

    try {
        const term = document.getElementById('search-trans') ? document.getElementById('search-trans').value.toLowerCase() : "";
        renderTransactionList(filterData(periodData, term));
        renderFutureList(); 
        renderRecentList(periodData);
        renderChart(periodData.filter(t => t.category !== 'Poupança'));
        const termRep = document.getElementById('search-report') ? document.getElementById('search-report').value.toLowerCase() : "";
        renderExtratoTable(filterData(periodData, termRep));
    } catch (e) { console.error(e); }
    
    if(!valuesVisible) { document.querySelectorAll('.value-blur').forEach(el => el.classList.add('blur-sm', 'select-none')); }
}

// --- EVENTOS DE TABS (CORRIGIDOS) ---
// Agora usa addEventListener para garantir que funciona
function switchTab(tabName) {
    Object.values(views).forEach(el => el && el.classList.add('hidden'));
    if(views[tabName]) views[tabName].classList.remove('hidden');
    
    document.querySelectorAll('.nav-desktop').forEach(b => {
        if(b.dataset.tab === tabName) { b.classList.add('bg-white/10', 'text-white'); b.classList.remove('text-slate-400'); }
        else { b.classList.remove('bg-white/10', 'text-white'); b.classList.add('text-slate-400'); }
    });
    document.querySelectorAll('.nav-item').forEach(b => {
        if(b.dataset.tab === tabName) b.classList.add('text-blue-600', 'font-bold');
        else b.classList.remove('text-blue-600', 'font-bold');
    });
    
    const titles = { dashboard: "Visão Geral", transacoes: "Lançamentos", futuras: "Contas a Pagar", extrato: "Relatórios" };
    const titleEl = document.getElementById('page-title');
    if(titleEl && titles[tabName]) titleEl.innerText = titles[tabName];
    
    if(tabName === 'dashboard') renderChart(transactions.filter(t => isDateInRange(t.date)));
}

// Adiciona listeners a todos os botões de navegação
document.addEventListener('DOMContentLoaded', () => {
    const navBtns = document.querySelectorAll('.nav-desktop, .nav-item');
    navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            if(btn.dataset.tab) switchTab(btn.dataset.tab);
        });
    });
});
// Fallback para caso o DOMContentLoaded já tenha passado
const navBtns = document.querySelectorAll('.nav-desktop, .nav-item');
navBtns.forEach(btn => {
    btn.onclick = () => { if(btn.dataset.tab) switchTab(btn.dataset.tab); };
});


// --- EVENTOS GLOBAIS ---
// Toggles
const toggleValuesBtn = () => {
    valuesVisible = !valuesVisible;
    document.querySelectorAll('.value-blur').forEach(el => el.classList.toggle('blur-sm', !valuesVisible));
    document.querySelectorAll('[id^="btn-toggle-values"]').forEach(b => b.innerHTML = valuesVisible ? '<i class="fas fa-eye"></i>' : '<i class="fas fa-eye-slash"></i>');
};
document.querySelectorAll('[id^="btn-toggle-values"]').forEach(b => b.onclick = toggleValuesBtn);

if(document.getElementById('toggle-future-balance')) {
    document.getElementById('toggle-future-balance').addEventListener('change', (e) => {
        includeFuture = e.target.checked;
        updateInterface();
    });
}
if(document.getElementById('toggle-total-future')) {
    document.getElementById('toggle-total-future').addEventListener('change', (e) => {
        showTotalFuture = e.target.checked;
        updateInterface();
    });
}

// Menus Perfil
const btnMobProfile = document.getElementById('btn-profile-mobile');
const dropMob = document.getElementById('mobile-profile-dropdown');
if(btnMobProfile && dropMob) {
    btnMobProfile.onclick = (e) => { e.stopPropagation(); dropMob.classList.toggle('hidden'); };
    window.addEventListener('click', (e) => { if (!btnMobProfile.contains(e.target) && !dropMob.contains(e.target)) dropMob.classList.add('hidden'); });
}
const btnDeskProfile = document.getElementById('btn-profile-desktop');
const dropDesk = document.getElementById('profile-dropdown');
if(btnDeskProfile && dropDesk) {
    btnDeskProfile.onclick = (e) => { e.stopPropagation(); dropDesk.classList.toggle('hidden'); };
    window.addEventListener('click', (e) => { if (!btnDeskProfile.contains(e.target) && !dropDesk.contains(e.target)) dropDesk.classList.add('hidden'); });
}

// Ações
const wipeData = async () => {
    if(confirm("ATENÇÃO: Apagar TUDO?")) {
        if(prompt("Digite ZERAR:") === "ZERAR") {
            try {
                const snap = await getDocs(query(collection(db, "transactions"), where("user_id", "==", currentUser.uid)));
                await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
                alert("Dados apagados."); window.location.reload();
            } catch(e){ alert(e.message); }
        }
    }
};
if(document.getElementById('btn-wipe-data')) document.getElementById('btn-wipe-data').onclick = wipeData;
if(document.getElementById('btn-wipe-data-mobile')) document.getElementById('btn-wipe-data-mobile').onclick = wipeData;

const logout = () => { if(confirm("Sair?")) signOut(auth); };
if(document.getElementById('btn-logout-dropdown')) document.getElementById('btn-logout-dropdown').onclick = logout;
if(document.getElementById('btn-logout-mobile')) document.getElementById('btn-logout-mobile').onclick = logout;

document.getElementById('btn-login').onclick = async () => {
    const email = document.getElementById('email').value;
    const pass = document.getElementById('password').value;
    if(!email || !pass) { document.getElementById('auth-msg').textContent = "Preencha tudo."; return; }
    try { await signInWithEmailAndPassword(auth, email, pass); } 
    catch (error) { document.getElementById('auth-msg').textContent = "Acesso negado."; }
};

const htmlEl = document.documentElement;
const toggleTheme = () => {
    const isDark = htmlEl.classList.toggle('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    document.querySelectorAll('[id^="btn-theme"]').forEach(b => b.innerHTML = isDark ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>');
};
document.querySelectorAll('[id^="btn-theme"]').forEach(b => b.onclick = toggleTheme);
if (localStorage.getItem('theme') === 'dark' || (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    htmlEl.classList.add('dark'); document.querySelectorAll('[id^="btn-theme"]').forEach(b => b.innerHTML = '<i class="fas fa-sun"></i>');
}

// Date Picker
const btnDateRange = document.getElementById('btn-date-range');
const dateDropdown = document.getElementById('date-dropdown');
if(btnDateRange && dateDropdown) {
    btnDateRange.onclick = (e) => { e.stopPropagation(); dateDropdown.classList.toggle('hidden'); };
    window.addEventListener('click', (e) => { if (!btnDateRange.contains(e.target) && !dateDropdown.contains(e.target)) dateDropdown.classList.add('hidden'); });
}
document.querySelectorAll('.date-preset').forEach(btn => btn.onclick = () => setDateRange(btn.dataset.range));
if(document.getElementById('btn-apply-date')) document.getElementById('btn-apply-date').onclick = () => {
    startDate = document.getElementById('filter-start-date').value;
    endDate = document.getElementById('filter-end-date').value;
    if(!startDate || !endDate) return alert("Selecione as datas");
    updateDateLabel(); updateInterface(); dateDropdown.classList.add('hidden');
};

// --- FUNÇÕES DE SUPORTE ---
function filterData(data, term) {
    if(!term) return data;
    return data.filter(t => {
        return t.description.toLowerCase().includes(term) || t.category.toLowerCase().includes(term);
    });
}

async function loadCategories() {
    try {
        const q = query(collection(db, "categories"), where("user_id", "==", currentUser.uid));
        const snapshot = await getDocs(q);
        if (snapshot.empty) { userCategories = { ...defaultCategories }; } 
        else {
            userCategories = {};
            snapshot.forEach(doc => { const d = doc.data(); userCategories[d.name] = d.icon; });
            Object.keys(defaultCategories).forEach(k => { if(!userCategories[k]) userCategories[k] = defaultCategories[k]; });
        }
        populateCategorySelect();
    } catch (e) { console.error(e); userCategories = { ...defaultCategories }; populateCategorySelect(); }
}

function populateCategorySelect() {
    const sel = document.getElementById('input-category');
    if(sel) {
        sel.innerHTML = '';
        Object.keys(userCategories).sort().forEach(c => {
            const o = document.createElement('option'); o.value = c; o.innerText = userCategories[c] + " " + c; sel.appendChild(o);
        });
    }
}

window.toggleSort = (col) => {
    if (sortConfig.column === col) sortConfig.direction = sortConfig.direction === 'asc' ? 'desc' : 'asc';
    else { sortConfig.column = col; sortConfig.direction = 'asc'; }
    updateInterface();
};

function sortData(data) {
    return data.sort((a, b) => {
        let valA = a[sortConfig.column]; let valB = b[sortConfig.column];
        if (sortConfig.column === 'amount') return sortConfig.direction === 'asc' ? valA - valB : valB - valA;
        if (sortConfig.column === 'date') return sortConfig.direction === 'asc' ? new Date(valA) - new Date(valB) : new Date(valB) - new Date(valA);
        return sortConfig.direction === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
    });
}

// --- RENDERIZADORES ---
function renderTransactionList(data) {
    const el = document.getElementById('transaction-list'); if(!el) return; el.innerHTML = '';
    if (data.length === 0) { el.innerHTML = '<div class="text-center text-slate-400 mt-10">Sem dados.</div>'; return; }
    sortData(data); 
    data.forEach(t => {
        const isExp = t.type === 'saida'; const color = isExp ? 'text-red-600' : 'text-green-600';
        const bg = isExp ? 'bg-red-50 dark:bg-red-900/20' : 'bg-green-50 dark:bg-green-900/20';
        const statusBadge = t.status==='efetivado' ? '<span class="bg-green-100 text-green-800 px-2 py-1 rounded text-[10px] font-bold">PAGO</span>' : '<span class="bg-yellow-100 text-yellow-800 px-2 py-1 rounded text-[10px] font-bold">PENDENTE</span>';
        el.innerHTML += `<div class="bg-white dark:bg-darkcard p-3 rounded-lg border border-slate-100 dark:border-slate-700 flex flex-col md:grid md:grid-cols-12 md:gap-4 md:items-center cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 mb-2" onclick="editTransaction('${t.id}')"><div class="flex items-center gap-3 md:hidden"><div class="w-10 h-10 rounded-full ${bg} flex items-center justify-center ${color} shrink-0"><i class="fas ${isExp?'fa-arrow-down':'fa-arrow-up'}"></i></div><div class="flex-1 min-w-0"><div class="font-bold text-slate-800 dark:text-white truncate">${t.description}</div><div class="text-xs text-slate-500">${fmtDate(t.date)} • ${getIcon(t.category)}</div></div><div class="text-right"><div class="font-bold ${color} value-blur">${isExp?'-':'+'} ${fmtMoney(t.amount)}</div>${statusBadge}</div></div><div class="hidden md:block text-sm text-slate-600 dark:text-gray-300 col-span-2 font-mono">${fmtDate(t.date)}</div><div class="hidden md:block text-sm font-medium text-slate-800 dark:text-white col-span-4 truncate">${t.description}</div><div class="hidden md:block text-sm text-slate-500 col-span-2 truncate">${getIcon(t.category)} ${t.category}</div><div class="hidden md:block text-sm font-bold text-right col-span-2 ${color} value-blur">${isExp?'-':'+'} ${fmtMoney(t.amount)}</div><div class="hidden md:block text-center col-span-1">${statusBadge}</div><div class="hidden md:flex justify-center col-span-1"><button onclick="deleteTransaction('${t.id}')" class="text-gray-400 hover:text-red-500 transition"><i class="fas fa-trash"></i></button></div></div>`;
    });
}

function renderFutureList() {
    const today = new Date().toISOString().split('T')[0];
    let pending = transactions.filter(t => t.status === 'pendente');
    if(!showTotalFuture) pending = pending.filter(t => isDateInRange(t.date));
    const recP = pending.filter(t => t.type === 'entrada').reduce((a,b)=>a+b.amount,0);
    const despP = pending.filter(t => t.type === 'saida').reduce((a,b)=>a+b.amount,0);
    if(document.getElementById('future-income')) document.getElementById('future-income').innerText = fmtMoney(recP);
    if(document.getElementById('future-expense')) document.getElementById('future-expense').innerText = fmtMoney(despP);
    if(document.getElementById('future-balance')) document.getElementById('future-balance').innerText = fmtMoney(recP - despP);
    const el = document.getElementById('future-list'); if(!el) return; el.innerHTML = '';
    if(pending.length===0) { el.innerHTML='<div class="text-center text-slate-400 text-xs py-4">Nada pendente.</div>'; return; }
    sortData(pending);
    pending.forEach(t => {
        const isLate = t.date < today; const color = t.type === 'saida' ? 'text-red-600' : 'text-green-600'; const warningIcon = isLate ? '<i class="fas fa-exclamation-triangle mr-1 text-red-500"></i>' : '';
        el.innerHTML += `<div class="flex justify-between items-center p-3 border-b dark:border-slate-700"><div><div class="font-bold text-slate-700 dark:text-white text-sm truncate w-48">${t.description}</div><div class="text-xs ${isLate?'text-red-500 font-bold':'text-slate-400'}">${warningIcon} ${fmtDate(t.date)}</div></div><div class="text-right"><div class="text-sm font-bold ${color} value-blur">${fmtMoney(t.amount)}</div><button onclick="payTransaction('${t.id}')" class="text-xs bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded mt-1 hover:bg-green-100 hover:text-green-700">Baixar</button></div></div>`;
    });
}

function renderRecentList(data) {
    const el = document.getElementById('recent-transactions-list'); if(!el) return; el.innerHTML = '';
    const recent = [...data].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);
    if(recent.length === 0) { el.innerHTML = '<div class="text-center text-slate-400 text-xs py-4">Sem dados.</div>'; return; }
    recent.forEach(t => {
        const isExp = t.type === 'saida'; const color = isExp ? 'text-red-600' : 'text-green-600'; const icon = isExp ? 'fa-arrow-down' : 'fa-arrow-up'; const bg = isExp ? 'bg-red-50 dark:bg-red-900/20' : 'bg-green-50 dark:bg-green-900/20';
        el.innerHTML += `<div class="flex items-center gap-3 p-2 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition"><div class="w-8 h-8 rounded-full ${bg} flex items-center justify-center ${color} text-xs"><i class="fas ${icon}"></i></div><div class="flex-1 min-w-0"><div class="font-bold text-slate-700 dark:text-gray-200 text-sm truncate">${t.description}</div><div class="text-xs text-gray-400">${fmtDate(t.date)}</div></div><div class="font-bold ${color} text-sm value-blur">${isExp?'-':'+'} ${fmtMoney(t.amount)}</div></div>`;
    });
}

function renderExtratoTable(data) {
    const el = document.getElementById('report-preview'); if(!el) return;
    if(data.length===0) { el.innerHTML='<div class="text-center p-4 text-slate-400">Sem dados</div>'; return; }
    sortData(data);
    let h = '<div class="min-w-[600px]">';
    data.forEach((t, idx) => {
        const rowBg = idx % 2 === 0 ? 'bg-white dark:bg-darkcard' : 'bg-slate-50 dark:bg-slate-800/50';
        h += `<div class="grid grid-cols-12 gap-4 p-3 ${rowBg} border-b border-slate-100 dark:border-slate-700 items-center text-sm"><div class="col-span-2 font-mono text-slate-600 dark:text-gray-300">${fmtDate(t.date)}</div><div class="col-span-6 font-medium text-slate-800 dark:text-white truncate">${getIcon(t.category)} ${t.description}</div><div class="col-span-4 font-bold text-right ${t.type==='saida'?'text-red-600':'text-green-600'} value-blur">${fmtMoney(t.amount)}</div></div>`;
    });
    el.innerHTML = h + '</div>';
}

function renderChart(d){
    const el=document.getElementById('expenseChart'); if(!el)return; 
    const ctx=el.getContext('2d'); 
    if(chartInstance)chartInstance.destroy(); 
    const ex=(d||[]).filter(t=>t.type==='saida'&&t.status==='efetivado'); 
    const cats={}; ex.forEach(t=>{cats[t.category]=(cats[t.category]||0)+t.amount}); 
    chartInstance=new Chart(ctx,{type:'doughnut',data:{labels:Object.keys(cats),datasets:[{data:Object.values(cats),backgroundColor:['#ef4444','#f59e0b','#3b82f6','#10b981','#8b5cf6','#64748b'],borderWidth:0}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'right',labels:{boxWidth:12,color:document.body.classList.contains('dark')?'#cbd5e1':'#4b5563'}}},cutout:'75%'}});
}

// --- MODAL & GESTÃO CATEGORIAS ---
const modalCat = document.getElementById('modal-categories');
if(document.getElementById('btn-open-categories')) document.getElementById('btn-open-categories').onclick = openCategories;
function openCategories() { renderCategoryList(); modalCat.classList.remove('hidden'); modalCat.classList.add('flex'); }
if(document.getElementById('close-categories')) document.getElementById('close-categories').onclick = () => { modalCat.classList.add('hidden'); modalCat.classList.remove('flex'); };

if(document.getElementById('form-add-category')) {
    document.getElementById('form-add-category').onsubmit = async (e) => {
        e.preventDefault();
        const name = document.getElementById('new-cat-name').value.trim();
        const icon = document.getElementById('new-cat-icon').value.trim() || "🔹";
        if(!name) return;
        try {
            await addDoc(collection(db, "categories"), { user_id: currentUser.uid, name, icon });
            document.getElementById('new-cat-name').value = "";
            document.getElementById('new-cat-icon').value = "";
            loadCategories(); setTimeout(renderCategoryList, 500);
        } catch(e) { console.error(e); }
    };
}
async function renderCategoryList() {
    const list = document.getElementById('categories-list'); if(!list) return;
    const q = query(collection(db, "categories"), where("user_id", "==", currentUser.uid));
    const snap = await getDocs(q);
    list.innerHTML = '';
    snap.forEach(docItem => {
        const d = docItem.data();
        list.innerHTML += `<div class="flex justify-between items-center p-2 bg-slate-50 dark:bg-slate-800 rounded border dark:border-slate-700"><span class="text-slate-700 dark:text-white text-sm">${d.icon} ${d.name}</span><button onclick="deleteCategory('${docItem.id}')" class="text-red-500 hover:bg-red-100 p-1 rounded"><i class="fas fa-trash"></i></button></div>`;
    });
}
window.deleteCategory = async (id) => { if(confirm("Apagar?")) { await deleteDoc(doc(db, "categories", id)); loadCategories(); setTimeout(renderCategoryList, 500); } };

const modal = document.getElementById('modal-transaction');
const form = document.getElementById('form-transaction');
const inputAmount = document.getElementById('input-amount');
const inputRecurrence = document.getElementById('input-recurrence');
const inputFrequency = document.getElementById('input-frequency');
const inputPaid = document.getElementById('input-paid');
const statusText = document.getElementById('status-text');
const btnDelete = document.getElementById('btn-delete');

if(inputPaid && statusText) {
    inputPaid.addEventListener('change', () => {
        if(inputPaid.checked) { statusText.innerText = "Concluído/Pago"; statusText.className = "font-bold text-green-600"; }
        else { statusText.innerText = "Pendente/A Receber"; statusText.className = "font-bold text-yellow-600"; }
    });
}
if(inputAmount) inputAmount.addEventListener('input', (e) => { let v = e.target.value.replace(/\D/g,""); e.target.value = (Number(v)/100).toFixed(2).replace(".",","); });
if(inputRecurrence) inputRecurrence.addEventListener('change', () => {
    const c=document.getElementById('div-period-count'); const f=document.getElementById('div-frequency');
    if(c && f) { if(inputRecurrence.value==='single'){c.classList.add('hidden');f.classList.add('hidden');}else{c.classList.remove('hidden');f.classList.remove('hidden');} }
});
if(inputFrequency) inputFrequency.addEventListener('change', () => {
    const d=document.getElementById('div-custom-days');
    if(d) { if(inputFrequency.value==='custom') d.classList.remove('hidden'); else d.classList.add('hidden'); }
});

document.getElementById('fab-add').onclick = () => {
    form.reset(); document.getElementById('tx-id').value=''; 
    const today=new Date().toISOString().split('T')[0]; 
    const elDate=document.getElementById('input-date'); if(elDate) elDate.value=today;
    if(inputAmount)inputAmount.value="";
    const dpc = document.getElementById('div-period-count'); if(dpc) dpc.classList.add('hidden');
    const df = document.getElementById('div-frequency'); if(df) df.classList.add('hidden');
    const dcd = document.getElementById('div-custom-days'); if(dcd) dcd.classList.add('hidden');
    if(statusText) { statusText.innerText = "Concluído/Pago"; statusText.className = "font-bold text-green-600"; }
    if(btnDelete) btnDelete.classList.add('hidden');
    modal.classList.remove('hidden'); modal.classList.add('flex');
};
document.getElementById('close-modal').onclick = () => { modal.classList.add('hidden'); modal.classList.remove('flex'); };

form.onsubmit = async (e) => {
    e.preventDefault(); const btn=document.getElementById('btn-save'); btn.textContent='Salvando...'; btn.disabled=true;
    try {
        const id=document.getElementById('tx-id').value;
        let raw=document.getElementById('input-amount').value||"0";
        const total=parseFloat(raw.replace(/\./g,'').replace(',','.'));
        const type=document.querySelector('input[name="type"]:checked').value;
        const date=document.getElementById('input-date').value;
        const cat=document.getElementById('input-category').value;
        const desc=document.getElementById('input-desc').value;
        const paid=document.getElementById('input-paid').checked;
        const recurrence=document.getElementById('input-recurrence').value;
        const count=parseInt(document.getElementById('input-installments').value)||1;
        const frequency=document.getElementById('input-frequency').value;
        const customDays=parseInt(document.getElementById('input-custom-days').value)||10;
        const baseData={user_id:currentUser.uid,type,category:cat,status:paid?'efetivado':'pendente'};

        if(id) await updateDoc(doc(db,"transactions",id),{...baseData,amount:total,date,description:desc});
        else {
            const batch=writeBatch(db);
            if(recurrence==='single') await addDoc(collection(db,"transactions"),{...baseData,amount:total,date,description:desc});
            else {
                let finalAmount=total, rem=0;
                if(recurrence==='installment') { finalAmount=Math.floor((total/count)*100)/100; rem=Math.round((total-(finalAmount*count))*100)/100; }
                for(let i=0; i<count; i++) {
                    const d=new Date(date+'T12:00:00');
                    if(frequency==='monthly') d.setMonth(d.getMonth()+i);
                    else if(frequency==='biweekly') d.setDate(d.getDate()+(i*15));
                    else if(frequency==='custom') d.setDate(d.getDate()+(i*customDays));
                    const val=(recurrence==='installment' && i===0) ? (finalAmount+rem) : finalAmount;
                    const dText=(recurrence==='installment') ? `${desc} (${i+1}/${count})` : desc;
                    batch.set(doc(collection(db,"transactions")),{...baseData,amount:Number(val.toFixed(2)),date:d.toISOString().split('T')[0],description:dText,status:(i===0 && paid)?'efetivado':'pendente'});
                }
                await batch.commit();
            }
        }
        modal.classList.add('hidden'); modal.classList.remove('flex'); form.reset();
    } catch(err){alert(err.message);} finally{btn.textContent='Salvar';btn.disabled=false;}
};

window.editTransaction = (id) => {
    const t=transactions.find(x=>x.id===id); if(!t)return;
    document.getElementById('tx-id').value=id;
    document.getElementById('input-amount').value=t.amount.toFixed(2).replace('.',',');
    document.getElementById('input-desc').value=t.description;
    document.getElementById('input-date').value=t.date;
    document.getElementById('input-category').value=t.category;
    const rt = document.querySelector(`input[name="type"][value="${t.type}"]`);
    if(rt) rt.checked = true;
    const paidBox = document.getElementById('input-paid');
    paidBox.checked = (t.status === 'efetivado');
    if(statusText) {
        if(paidBox.checked) { statusText.innerText = "Concluído/Pago"; statusText.className = "font-bold text-green-600"; }
        else { statusText.innerText = "Pendente/A Receber"; statusText.className = "font-bold text-yellow-600"; }
    }
    const dpc = document.getElementById('div-period-count'); if(dpc) dpc.classList.add('hidden');
    const df = document.getElementById('div-frequency'); if(df) df.classList.add('hidden');
    document.getElementById('input-recurrence').value='single';
    if(btnDelete){btnDelete.classList.remove('hidden'); btnDelete.onclick=()=>deleteTransaction(id);}
    modal.classList.remove('hidden'); modal.classList.add('flex');
};

window.deleteTransaction = async (id) => {
    const e=window.event; if(e){e.cancelBubble=true; if(e.stopPropagation)e.stopPropagation();}
    if(confirm("Excluir?")) { await deleteDoc(doc(db,"transactions",id)); modal.classList.add('hidden'); modal.classList.remove('flex'); }
};

window.payTransaction = async (id) => {
    const e=window.event; e.cancelBubble=true; if(e.stopPropagation)e.stopPropagation();
    if(confirm("Baixar?")) await updateDoc(doc(db,"transactions",id),{status:'efetivado'});
};

// PDF & CSV
if(document.getElementById('btn-download-pdf')) document.getElementById('btn-download-pdf').onclick = () => {
    const term = document.getElementById('search-report') ? document.getElementById('search-report').value.toLowerCase() : "";
    const data = filterData(transactions.filter(t => isDateInRange(t.date)), term);
    if (data.length === 0) return alert("Sem dados.");
    const totalRec = data.filter(t => t.type === 'entrada').reduce((sum, t) => sum + t.amount, 0);
    const totalDesp = data.filter(t => t.type === 'saida').reduce((sum, t) => sum + t.amount, 0);
    const saldo = totalRec - totalDesp;
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.setFontSize(16); doc.text(`Relatório Gerencial`, 14, 20);
    const tableData = data.map(t => [fmtDate(t.date), t.description, t.category, t.type==='entrada'?'Entrada':'Saída', fmtMoney(t.amount)]);
    doc.autoTable({ head: [['Data', 'Descrição', 'Categoria', 'Tipo', 'Valor']], body: tableData, startY: 35 });
    let finalY = doc.lastAutoTable.finalY + 10;
    doc.text(`Total Receitas: ${fmtMoney(totalRec)}`, 14, finalY);
    doc.text(`Total Despesas: ${fmtMoney(totalDesp)}`, 14, finalY+7);
    doc.save('relatorio.pdf');
};

if(document.getElementById('btn-download-csv')) document.getElementById('btn-download-csv').onclick = () => {
    const term = document.getElementById('search-report') ? document.getElementById('search-report').value.toLowerCase() : "";
    const data = filterData(transactions.filter(t => isDateInRange(t.date)), term);
    if (data.length === 0) return alert("Sem dados.");
    let csv = "Data,Descricao,Categoria,Tipo,Valor\n";
    data.forEach(t => { csv += `${t.date},"${t.description}",${t.category},${t.type},${t.amount}\n`; });
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI("data:text/csv;charset=utf-8,"+csv));
    link.setAttribute("download", "relatorio.csv");
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
};