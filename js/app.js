 import { db, auth } from './firebase.js';
import { 
    collection, addDoc, doc, updateDoc, deleteDoc, query, where, onSnapshot, writeBatch 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { 
    signInWithEmailAndPassword, onAuthStateChanged, signOut 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

let currentUser = null;
let transactions = [];
let chartInstance = null;
let sortConfig = { column: 'date', direction: 'desc' };

const views = {
    dashboard: document.getElementById('tab-dashboard'),
    transacoes: document.getElementById('tab-transacoes'),
    futuras: document.getElementById('tab-futuras'),
    extrato: document.getElementById('tab-extrato')
};

const categoryIcons = {
    "Saldo Inicial": "🏛️", "Vendas": "💰", "Serviços": "🛠️", "Reposição de Estoque": "📦", "Poupança": "🐷", "Donativo": "🤝",
    "Pró-labore": "💼", "MEI/DAS": "📄", "Impostos": "💸", "Empréstimo": "🏦",
    "INSS": "🛡️", "Marketing": "📢", "Logística/Frete": "🚚", "Aluguel/Condomínio": "🏢",
    "Energia/Água/Net": "⚡", "Equipamentos": "💻", "Outros": "🔹"
};
function getIcon(cat) { return categoryIcons[cat] || "🔹"; }

onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('app-content').classList.remove('hidden');
        if(document.getElementById('top-controls')) document.getElementById('top-controls').classList.remove('hidden');
        if(document.getElementById('top-controls')) document.getElementById('top-controls').classList.add('md:flex');
        
        const email = user.email;
        document.getElementById('user-email-display').innerText = email;
        document.getElementById('user-name-display').innerText = "Olá, " + email.split('@')[0];
        document.getElementById('avatar-display').innerText = email.charAt(0).toUpperCase();
        document.getElementById('btn-profile-mobile').innerText = email.charAt(0).toUpperCase();
        initApp();
    } else {
        currentUser = null;
        document.getElementById('login-screen').classList.remove('hidden');
        document.getElementById('app-content').classList.add('hidden');
        if(document.getElementById('top-controls')) document.getElementById('top-controls').classList.add('hidden');
    }
});

const btnProfile = document.getElementById('btn-profile-desktop');
const dropdown = document.getElementById('profile-dropdown');
if(btnProfile && dropdown) {
    btnProfile.onclick = (e) => { e.stopPropagation(); dropdown.classList.toggle('hidden'); };
    window.addEventListener('click', (e) => { if (!btnProfile.contains(e.target) && !dropdown.contains(e.target)) dropdown.classList.add('hidden'); });
}

const logout = () => { if(confirm("Sair do sistema?")) signOut(auth); };
if(document.getElementById('btn-logout-dropdown')) document.getElementById('btn-logout-dropdown').onclick = logout;
if(document.getElementById('btn-user-menu-mobile')) document.getElementById('btn-user-menu-mobile').onclick = logout;

document.getElementById('btn-login').onclick = async () => {
    const email = document.getElementById('email').value;
    const pass = document.getElementById('password').value;
    if(!email || !pass) { document.getElementById('auth-msg').textContent = "Preencha tudo."; return; }
    try { await signInWithEmailAndPassword(auth, email, pass); } 
    catch (error) { document.getElementById('auth-msg').textContent = "Acesso negado."; }
};

const htmlEl = document.documentElement;
const themeBtns = [document.getElementById('btn-theme-mobile'), document.getElementById('btn-theme-desktop')];
function applyTheme(isDark) {
    if (isDark) { htmlEl.classList.add('dark'); localStorage.setItem('theme', 'dark'); themeBtns.forEach(b=>b.innerHTML='<i class="fas fa-sun"></i>'); }
    else { htmlEl.classList.remove('dark'); localStorage.setItem('theme', 'light'); themeBtns.forEach(b=>b.innerHTML='<i class="fas fa-moon"></i>'); }
}
if (localStorage.getItem('theme') === 'dark' || (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches)) applyTheme(true);
else applyTheme(false);
themeBtns.forEach(b => b.onclick = () => applyTheme(!htmlEl.classList.contains('dark')));

function switchTab(tabName) {
    Object.values(views).forEach(el => { if(el) el.classList.add('hidden'); });
    if(views[tabName]) views[tabName].classList.remove('hidden');
    document.querySelectorAll('.nav-item').forEach(b => {
        b.classList.remove('text-blue-600', 'font-bold');
        if(b.dataset.tab === tabName) b.classList.add('text-blue-600', 'font-bold');
    });
    document.querySelectorAll('.nav-desktop').forEach(b => {
        b.classList.remove('bg-blue-100', 'text-blue-700', 'dark:bg-slate-700', 'dark:text-white');
        b.classList.add('text-slate-500', 'dark:text-slate-400');
        if(b.dataset.tab === tabName) {
            b.classList.remove('text-slate-500', 'dark:text-slate-400');
            b.classList.add('bg-blue-100', 'text-blue-700', 'dark:bg-slate-700', 'dark:text-white');
        }
    });
    if(tabName === 'dashboard') renderChart(getCurrentMonthData());
}
document.querySelectorAll('.nav-item, .nav-desktop').forEach(b => b.onclick = () => switchTab(b.dataset.tab));

async function initApp() {
    const today = new Date().toISOString().slice(0, 7);
    const deskDate = document.getElementById('global-month');
    const mobDate = document.getElementById('global-month-mobile');
    if(!deskDate.value) deskDate.value = today;
    if(mobDate && !mobDate.value) mobDate.value = today;
    loadCategories();
    const q = query(collection(db, "transactions"), where("user_id", "==", currentUser.uid));
    onSnapshot(q, (snapshot) => {
        transactions = [];
        snapshot.forEach((doc) => transactions.push({ id: doc.id, ...doc.data() }));
        updateInterface();
    });
}

const syncDate = (e) => {
    const v = e.target.value;
    document.getElementById('global-month').value = v;
    if(document.getElementById('global-month-mobile')) document.getElementById('global-month-mobile').value = v;
    updateInterface();
};
if(document.getElementById('global-month')) document.getElementById('global-month').addEventListener('change', syncDate);
if(document.getElementById('global-month-mobile')) document.getElementById('global-month-mobile').addEventListener('change', syncDate);

function getCurrentMonthData() {
    return transactions.filter(t => t.date.startsWith(document.getElementById('global-month').value));
}

function updateInterface() {
    const data = getCurrentMonthData();
    const rec = data.filter(t => t.type === 'entrada' && t.status === 'efetivado').reduce((a,t) => a+t.amount,0);
    const desp = data.filter(t => t.type === 'saida' && t.status === 'efetivado').reduce((a,t) => a+t.amount,0);
    document.getElementById('dash-receitas').innerText = fmtMoney(rec);
    document.getElementById('dash-despesas').innerText = fmtMoney(desp);
    document.getElementById('dash-saldo').innerText = fmtMoney(rec - desp);
    
    const term = document.getElementById('search-trans') ? document.getElementById('search-trans').value.toLowerCase() : "";
    renderTransactionList(filterData(data, term));
    
    renderFutureList(); // Agora renderiza com sorting
    
    renderChart(data);
    
    const termRep = document.getElementById('search-report') ? document.getElementById('search-report').value.toLowerCase() : "";
    renderExtratoTable(filterData(data, termRep));
}

function filterData(data, term) {
    if(!term) return data;
    return data.filter(t => {
        const typeKeywords = t.type === 'entrada' ? 'entrada receita lucro ganho' : 'saida saída despesa custo gasto';
        return t.description.toLowerCase().includes(term) || t.category.toLowerCase().includes(term) || typeKeywords.includes(term);
    });
}

if(document.getElementById('search-trans')) document.getElementById('search-trans').addEventListener('input', (e) => renderTransactionList(filterData(getCurrentMonthData(), e.target.value.toLowerCase())));
if(document.getElementById('search-report')) document.getElementById('search-report').addEventListener('input', (e) => renderExtratoTable(filterData(getCurrentMonthData(), e.target.value.toLowerCase())));

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

if(document.getElementById('btn-download-pdf')) document.getElementById('btn-download-pdf').onclick = () => {
    const term = document.getElementById('search-report') ? document.getElementById('search-report').value.toLowerCase() : "";
    const data = filterData(getCurrentMonthData(), term);
    if (data.length === 0) return alert("Sem dados.");
    const totalRec = data.filter(t => t.type === 'entrada').reduce((sum, t) => sum + t.amount, 0);
    const totalDesp = data.filter(t => t.type === 'saida').reduce((sum, t) => sum + t.amount, 0);
    const saldo = totalRec - totalDesp;
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.setFontSize(16); doc.text(`Relatório Gerencial - ${document.getElementById('global-month').value}`, 14, 20);
    doc.setFontSize(10); doc.text(`Gerado em: ${new Date().toLocaleString()}`, 14, 26);
    const tableData = data.map(t => [fmtDate(t.date), t.description, t.category, t.type==='entrada'?'Entrada':'Saída', fmtMoney(t.amount)]);
    doc.autoTable({ head: [['Data', 'Descrição', 'Categoria', 'Tipo', 'Valor']], body: tableData, startY: 35, theme: 'grid', headStyles: { fillColor: [30, 41, 59] } });
    let finalY = doc.lastAutoTable.finalY + 10;
    doc.setFontSize(12);
    doc.setTextColor(22, 163, 74); doc.text(`Total Receitas: ${fmtMoney(totalRec)}`, 14, finalY);
    doc.setTextColor(220, 38, 38); doc.text(`Total Despesas: ${fmtMoney(totalDesp)}`, 14, finalY + 7);
    doc.setTextColor(0, 0, 0); doc.setFont(undefined, 'bold'); doc.text(`Saldo do Período: ${fmtMoney(saldo)}`, 14, finalY + 14);
    doc.save('relatorio_financeiro.pdf');
};

if(document.getElementById('btn-download-csv')) document.getElementById('btn-download-csv').onclick = () => {
    const term = document.getElementById('search-report') ? document.getElementById('search-report').value.toLowerCase() : "";
    const data = filterData(getCurrentMonthData(), term);
    if (data.length === 0) return alert("Sem dados.");
    let csv = "Data,Descricao,Categoria,Tipo,Valor\n";
    data.forEach(t => { csv += `${t.date},"${t.description}",${t.category},${t.type},${t.amount}\n`; });
    const totalRec = data.filter(t => t.type === 'entrada').reduce((sum, t) => sum + t.amount, 0);
    const totalDesp = data.filter(t => t.type === 'saida').reduce((sum, t) => sum + t.amount, 0);
    csv += `\nRESUMO\nTotal Receitas,${totalRec}\nTotal Despesas,${totalDesp}\nSaldo,${totalRec - totalDesp}`;
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI("data:text/csv;charset=utf-8,"+csv));
    link.setAttribute("download", "relatorio.csv");
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
};

// RENDER (Lista Principal)
function renderTransactionList(data) {
    const el = document.getElementById('transaction-list');
    if(!el) return;
    el.innerHTML = '';
    if (data.length === 0) { el.innerHTML = '<div class="text-center text-gray-400 mt-10 p-4">Nenhum lançamento.</div>'; return; }
    sortData(data); 
    data.forEach((t, index) => {
        const isExp = t.type === 'saida'; const color = isExp ? 'text-red-600' : 'text-green-600';
        const bg = isExp ? 'bg-red-50 dark:bg-red-900/20' : 'bg-green-50 dark:bg-green-900/20';
        const statusBadge = t.status==='efetivado' ? '<span class="bg-green-100 text-green-700 px-2 py-1 rounded text-[10px] font-bold uppercase">Pago</span>' : '<span class="bg-yellow-100 text-yellow-700 px-2 py-1 rounded text-[10px] font-bold uppercase">Pendente</span>';
        const rowBg = index % 2 === 0 ? 'bg-white dark:bg-darkcard' : 'bg-slate-50 dark:bg-slate-800/50';
        el.innerHTML += `
            <div class="group ${rowBg} p-4 md:p-3 rounded-xl shadow-sm md:shadow-none border-b border-slate-100 dark:border-gray-700 flex flex-col md:grid md:grid-cols-12 md:gap-4 md:items-center cursor-pointer hover:bg-blue-50 dark:hover:bg-slate-700 transition" onclick="editTransaction('${t.id}')">
                <div class="flex items-center gap-3 md:hidden">
                    <div class="w-10 h-10 rounded-full ${bg} flex items-center justify-center ${color}"><i class="fas ${isExp?'fa-arrow-down':'fa-arrow-up'}"></i></div>
                    <div class="flex-1"><div class="font-bold text-slate-800 dark:text-gray-100 text-sm truncate">${t.description}</div><div class="text-xs text-gray-400">${fmtDate(t.date)} • ${getIcon(t.category)} ${t.category}</div></div>
                    <div class="text-right"><div class="font-bold ${color} text-sm">${isExp?'-':'+'} ${fmtMoney(t.amount)}</div><div>${statusBadge}</div></div>
                </div>
                <div class="hidden md:block text-sm text-slate-600 dark:text-gray-300 col-span-2 font-mono">${fmtDate(t.date)}</div>
                <div class="hidden md:block text-sm font-medium text-slate-800 dark:text-gray-100 col-span-4 truncate">${t.description}</div>
                <div class="hidden md:block text-sm text-slate-500 col-span-2 truncate">${getIcon(t.category)} ${t.category}</div>
                <div class="hidden md:block text-sm font-bold text-right col-span-2 ${color}">${isExp?'-':'+'} ${fmtMoney(t.amount)}</div>
                <div class="hidden md:block text-center col-span-1">${statusBadge}</div>
                <div class="hidden md:flex justify-center col-span-1"><button onclick="deleteTransaction('${t.id}')" class="text-gray-400 hover:text-red-500 transition p-2" title="Excluir"><i class="fas fa-trash"></i></button></div>
            </div>`;
    });
}

// RENDER (Contas Futuras) - AGORA COM TABELA E ORDENAÇÃO
function renderFutureList() {
    const today = new Date().toISOString().split('T')[0];
    const pending = transactions.filter(t => t.status === 'pendente');
    
    const recP = pending.filter(t => t.type === 'entrada').reduce((a,b)=>a+b.amount,0);
    const despP = pending.filter(t => t.type === 'saida').reduce((a,b)=>a+b.amount,0);
    const elFutBal = document.getElementById('future-balance');
    if(elFutBal) elFutBal.innerText = fmtMoney(recP - despP);
    
    const el = document.getElementById('future-list');
    if(!el) return;
    el.innerHTML = '';
    if(pending.length===0) { el.innerHTML='<div class="text-center text-gray-400 text-xs py-4">Tudo em dia!</div>'; return; }
    
    // Usa o sortConfig para ordenar também esta lista se quiseres, ou força por data
    // Por padrão, listas futuras ordenam-se melhor por data, mas se usarmos sortData, obedece ao clique no cabeçalho
    sortData(pending);

    pending.forEach((t, idx) => {
        const isLate = t.date < today;
        const isExp = t.type === 'saida';
        const color = isExp ? 'text-red-600' : 'text-green-600';
        const icon = isExp ? 'fa-arrow-down' : 'fa-arrow-up';
        const bgIcon = isExp ? 'bg-red-50 dark:bg-red-900/20' : 'bg-green-50 dark:bg-green-900/20';
        const rowBg = idx % 2 === 0 ? 'bg-white dark:bg-darkcard' : 'bg-slate-50 dark:bg-slate-800/50';

        el.innerHTML += `
            <div class="group ${rowBg} p-3 border-b border-slate-100 dark:border-gray-700 flex flex-col md:grid md:grid-cols-12 md:gap-4 md:items-center">
                <div class="flex items-center gap-3 md:hidden">
                    <div class="w-8 h-8 rounded-full ${bgIcon} flex items-center justify-center ${color} text-xs"><i class="fas ${icon}"></i></div>
                    <div class="flex-1"><span class="font-bold text-sm text-slate-800 dark:text-gray-200 truncate">${t.description}</span><div class="text-xs ${isLate?'text-red-500 font-bold':'text-gray-400'}">${isLate?'VENCIDA':fmtDate(t.date)}</div></div>
                    <div class="text-right"><div class="text-sm font-bold ${color}">${fmtMoney(t.amount)}</div><button onclick="payTransaction('${t.id}')" class="text-[10px] bg-slate-100 hover:bg-green-100 text-slate-600 hover:text-green-700 px-2 py-1 rounded mt-1">Baixar</button></div>
                </div>
                <div class="hidden md:block text-sm text-slate-600 dark:text-gray-300 col-span-2 font-mono ${isLate?'text-red-500 font-bold':''}">${fmtDate(t.date)}</div>
                <div class="hidden md:block text-sm font-medium text-slate-800 dark:text-gray-100 col-span-5 truncate">${t.description}</div>
                <div class="hidden md:block text-sm font-bold text-right col-span-3 ${color}">${fmtMoney(t.amount)}</div>
                <div class="hidden md:flex justify-center col-span-2">
                    <button onclick="payTransaction('${t.id}')" class="text-xs bg-green-100 hover:bg-green-200 text-green-700 font-bold px-3 py-1 rounded transition">Baixar</button>
                </div>
            </div>`;
    });
}

// RENDER (Extrato Relatórios - Limpo)
function renderExtratoTable(data) {
    const el = document.getElementById('report-preview');
    if(!el) return;
    if(data.length===0) { el.innerHTML='<div class="text-center p-4 text-gray-400">Sem dados</div>'; return; }
    
    sortData(data);

    let h = '<div class="min-w-[600px]">';
    // SEM CABEÇALHO AQUI (já está no HTML fixo)
    
    data.forEach((t, idx) => {
        const rowBg = idx % 2 === 0 ? 'bg-white dark:bg-darkcard' : 'bg-slate-50 dark:bg-slate-800/50';
        h += `<div class="grid grid-cols-12 gap-4 p-3 ${rowBg} border-b border-slate-100 dark:border-gray-700 items-center">
            <div class="col-span-2 text-sm font-mono">${fmtDate(t.date)}</div>
            <div class="col-span-6 text-sm font-medium truncate">${getIcon(t.category)} ${t.description}</div>
            <div class="col-span-4 text-sm font-bold text-right ${t.type==='saida'?'text-red-600':'text-green-600'}">${fmtMoney(t.amount)}</div>
        </div>`;
    });
    el.innerHTML = h + '</div>';
}

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
    document.getElementById('div-period-count').classList.add('hidden');
    document.getElementById('div-frequency').classList.add('hidden');
    document.getElementById('div-custom-days').classList.add('hidden');
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
    document.querySelector(`input[name="type"][value="${t.type}"]`).checked=true;
    const pb=document.getElementById('input-paid');
    pb.checked=(t.status==='efetivado');
    if(statusText) {
        if(pb.checked) { statusText.innerText = "Concluído/Pago"; statusText.className = "font-bold text-green-600"; }
        else { statusText.innerText = "Pendente/A Receber"; statusText.className = "font-bold text-yellow-600"; }
    }
    document.getElementById('div-period-count').classList.add('hidden');
    document.getElementById('div-frequency').classList.add('hidden');
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
function loadCategories() {
    const s=document.getElementById('input-category'); if(s){s.innerHTML=''; Object.keys(categoryIcons).forEach(c=>{const o=document.createElement('option');o.value=c;o.innerText=categoryIcons[c]+" "+c;s.appendChild(o);});}
}
function renderChart(d){
    const el=document.getElementById('expenseChart'); if(!el)return; 
    const ctx=el.getContext('2d'); 
    if(chartInstance)chartInstance.destroy(); 
    const ex=(d||[]).filter(t=>t.type==='saida'&&t.status==='efetivado'); 
    const cats={}; ex.forEach(t=>{cats[t.category]=(cats[t.category]||0)+t.amount}); 
    chartInstance=new Chart(ctx,{type:'doughnut',data:{labels:Object.keys(cats),datasets:[{data:Object.values(cats),backgroundColor:['#ef4444','#f59e0b','#3b82f6','#10b981','#8b5cf6','#64748b'],borderWidth:0}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'right',labels:{boxWidth:12,color:document.body.classList.contains('dark')?'#cbd5e1':'#4b5563'}}},cutout:'75%'}});
}
function fmtMoney(v){return v.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});}
function fmtDate(d){return d.split('-').reverse().join('/');}