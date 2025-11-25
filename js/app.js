import { db, auth } from './firebase.js';
import { 
    collection, addDoc, doc, updateDoc, query, where, onSnapshot, writeBatch 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { 
    signInWithEmailAndPassword, onAuthStateChanged, signOut 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// --- GLOBAIS ---
let currentUser = null;
let transactions = [];
let chartInstance = null;

const views = {
    dashboard: document.getElementById('tab-dashboard'),
    transacoes: document.getElementById('tab-transacoes'),
    futuras: document.getElementById('tab-futuras'),
    extrato: document.getElementById('tab-extrato')
};

// --- AUTH ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('app-content').classList.remove('hidden');
        initApp();
    } else {
        currentUser = null;
        document.getElementById('login-screen').classList.remove('hidden');
        document.getElementById('app-content').classList.add('hidden');
    }
});

document.getElementById('btn-login').onclick = async () => {
    const email = document.getElementById('email').value;
    const pass = document.getElementById('password').value;
    const msg = document.getElementById('auth-msg');
    if(!email || !pass) { msg.textContent = "Preencha tudo."; return; }
    try {
        msg.textContent = "Entrando...";
        await signInWithEmailAndPassword(auth, email, pass);
    } catch (error) {
        msg.textContent = "Erro de acesso.";
    }
};

document.getElementById('btn-user-menu-mobile').onclick = () => { if(confirm("Sair?")) signOut(auth); };
const btnLogoutDesk = document.getElementById('btn-logout-desktop');
if(btnLogoutDesk) btnLogoutDesk.onclick = () => { if(confirm("Sair?")) signOut(auth); };

// --- TEMA ---
const htmlEl = document.documentElement;
const themeBtns = [document.getElementById('btn-theme-mobile'), document.getElementById('btn-theme-desktop')];
function applyTheme(isDark) {
    if (isDark) { htmlEl.classList.add('dark'); localStorage.setItem('theme', 'dark'); themeBtns.forEach(b=>b?b.innerHTML='<i class="fas fa-sun"></i>':null); }
    else { htmlEl.classList.remove('dark'); localStorage.setItem('theme', 'light'); themeBtns.forEach(b=>b?b.innerHTML='<i class="fas fa-moon"></i>':null); }
}
const savedTheme = localStorage.getItem('theme');
if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) applyTheme(true);
else applyTheme(false);
themeBtns.forEach(b => { if(b) b.onclick = () => applyTheme(!htmlEl.classList.contains('dark')); });

// --- NAVEGAÇÃO ---
function switchTab(tabName) {
    Object.values(views).forEach(el => el.classList.add('hidden'));
    views[tabName].classList.remove('hidden');
    document.querySelectorAll('.nav-item').forEach(b => {
        b.classList.remove('text-yellow-500', 'font-bold');
        if(b.dataset.tab === tabName) b.classList.add('text-yellow-500', 'font-bold');
    });
    document.querySelectorAll('.nav-desktop').forEach(b => {
        b.classList.remove('border-b-2', 'border-yellow-500', 'text-yellow-500');
        if(b.dataset.tab === tabName) b.classList.add('border-b-2', 'border-yellow-500', 'text-yellow-500');
    });
    if(tabName === 'dashboard') renderChart(getCurrentMonthData());
}
document.querySelectorAll('.nav-item, .nav-desktop').forEach(b => b.onclick = () => switchTab(b.dataset.tab));

// --- APP ---
async function initApp() {
    if(!document.getElementById('global-month').value) {
        const today = new Date();
        document.getElementById('global-month').value = today.toISOString().slice(0, 7);
    }
    loadCategories();
    const q = query(collection(db, "transactions"), where("user_id", "==", currentUser.uid));
    onSnapshot(q, (snapshot) => {
        transactions = [];
        snapshot.forEach((doc) => transactions.push({ id: doc.id, ...doc.data() }));
        updateInterface();
    });
}

function getCurrentMonthData() {
    const m = document.getElementById('global-month').value; 
    return transactions.filter(t => t.date.startsWith(m));
}

function updateInterface() {
    const data = getCurrentMonthData();
    const rec = data.filter(t => t.type === 'entrada' && t.status === 'efetivado').reduce((a,t) => a+t.amount,0);
    const desp = data.filter(t => t.type === 'saida' && t.status === 'efetivado').reduce((a,t) => a+t.amount,0);
    
    document.getElementById('dash-receitas').innerText = fmtMoney(rec);
    document.getElementById('dash-despesas').innerText = fmtMoney(desp);
    document.getElementById('dash-saldo').innerText = fmtMoney(rec - desp);
    
    renderTransactionList(data);
    renderFutureList();
    renderChart(data);
    renderExtratoTable(data);
}
document.getElementById('global-month').addEventListener('change', updateInterface);
document.getElementById('search-trans').addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    renderTransactionList(getCurrentMonthData().filter(t => t.description.toLowerCase().includes(term)));
});

// --- RENDER ---
function renderTransactionList(data) {
    const el = document.getElementById('transaction-list');
    el.innerHTML = '';
    if (data.length === 0) { el.innerHTML = '<div class="text-center text-gray-400 mt-10">Sem transações.</div>'; return; }
    data.sort((a, b) => new Date(b.date) - new Date(a.date));
    data.forEach(t => {
        const isExp = t.type === 'saida';
        const color = isExp ? 'text-red-500' : 'text-green-500';
        const icon = isExp ? 'fa-arrow-down' : 'fa-arrow-up';
        const bg = isExp ? 'bg-red-50 dark:bg-red-900/20' : 'bg-green-50 dark:bg-green-900/20';
        el.innerHTML += `
            <div class="bg-white dark:bg-darkcard p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 flex justify-between items-center mb-3" onclick="editTransaction('${t.id}')">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-full ${bg} flex items-center justify-center ${color}"><i class="fas ${icon}"></i></div>
                    <div><div class="font-bold text-gray-800 dark:text-gray-100 text-sm">${t.description}</div><div class="text-xs text-gray-400">${fmtDate(t.date)} • ${t.category}</div></div>
                </div>
                <div class="text-right">
                    <div class="font-bold ${color} text-sm">${isExp?'-':'+'} ${fmtMoney(t.amount)}</div>
                    <div class="text-[10px] ${t.status==='efetivado'?'text-green-500':'text-yellow-500'} font-bold uppercase">${t.status==='efetivado'?'Pago':'Pendente'}</div>
                </div>
            </div>`;
    });
}

function renderFutureList() {
    const today = new Date().toISOString().split('T')[0];
    const pending = transactions.filter(t => t.status === 'pendente');
    const recP = pending.filter(t => t.type === 'entrada').reduce((a,b)=>a+b.amount,0);
    const despP = pending.filter(t => t.type === 'saida').reduce((a,b)=>a+b.amount,0);
    document.getElementById('future-balance').innerText = fmtMoney(recP - despP);
    
    const el = document.getElementById('future-list');
    el.innerHTML = '';
    pending.sort((a,b) => new Date(a.date) - new Date(b.date));
    if(pending.length===0) { el.innerHTML='<div class="text-center text-gray-400 text-xs py-4">Nada pendente.</div>'; return; }
    pending.forEach(t => {
        const isLate = t.date < today;
        el.innerHTML += `
            <div class="flex justify-between items-center p-3 border-b dark:border-gray-700 bg-white dark:bg-darkcard">
                <div class="flex flex-col"><span class="font-bold text-sm text-gray-800 dark:text-gray-200">${t.description}</span><span class="text-xs ${isLate?'text-red-500 font-bold':'text-gray-400'}">${isLate?'VENCIDA':fmtDate(t.date)}</span></div>
                <button onclick="payTransaction('${t.id}')" class="bg-green-100 text-green-600 px-3 py-1 rounded-lg text-xs font-bold">Pagar ${fmtMoney(t.amount)}</button>
            </div>`;
    });
}

function renderExtratoTable(data) {
    const el = document.getElementById('report-preview');
    if(data.length===0) { el.innerHTML='<div class="text-center p-4 text-gray-400">Sem dados</div>'; return; }
    let h = '<table class="w-full text-sm text-left text-gray-500 dark:text-gray-400"><thead class="text-xs uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400"><tr><th class="px-4 py-3">Data</th><th class="px-4 py-3">Desc</th><th class="px-4 py-3 text-right">Valor</th></tr></thead><tbody>';
    data.sort((a,b)=>new Date(b.date)-new Date(a.date));
    data.forEach(t => {
        h += `<tr class="bg-white border-b dark:bg-gray-800 dark:border-gray-700"><td class="px-4 py-3">${fmtDate(t.date)}</td><td class="px-4 py-3 whitespace-nowrap">${t.description}</td><td class="px-4 py-3 text-right font-bold ${t.type==='saida'?'text-red-600':'text-green-600'}">${fmtMoney(t.amount)}</td></tr>`;
    });
    el.innerHTML = h + '</tbody></table>';
}

// --- MODAL SEGURO ---
const modal = document.getElementById('modal-transaction');
const form = document.getElementById('form-transaction');
const inputAmount = document.getElementById('input-amount');
const inputRecurrence = document.getElementById('input-recurrence');
const inputFrequency = document.getElementById('input-frequency');

if(inputAmount) {
    inputAmount.addEventListener('input', (e) => {
        let v = e.target.value.replace(/\D/g,"");
        v = (Number(v)/100).toFixed(2)+"";
        e.target.value = v.replace(".",",");
    });
}

// Eventos de Mostrar/Esconder (Com verificação se elemento existe)
if(inputRecurrence) {
    inputRecurrence.addEventListener('change', () => {
        const divCount = document.getElementById('div-period-count');
        const divFreq = document.getElementById('div-frequency');
        if(!divCount || !divFreq) return;

        if (inputRecurrence.value === 'single') {
            divCount.classList.add('hidden');
            divFreq.classList.add('hidden');
        } else {
            divCount.classList.remove('hidden');
            divFreq.classList.remove('hidden');
        }
    });
}

if(inputFrequency) {
    inputFrequency.addEventListener('change', () => {
        const divCustom = document.getElementById('div-custom-days');
        if(!divCustom) return;
        if (inputFrequency.value === 'custom') divCustom.classList.remove('hidden');
        else divCustom.classList.add('hidden');
    });
}

// ABRIR MODAL
document.getElementById('fab-add').onclick = () => {
    form.reset();
    document.getElementById('tx-id').value = '';
    
    // Reset seguro
    const elDate = document.getElementById('input-date');
    if(elDate) elDate.value = new Date().toISOString().split('T')[0];
    if(inputAmount) inputAmount.value = "";
    
    // Esconder campos
    const divCount = document.getElementById('div-period-count');
    const divFreq = document.getElementById('div-frequency');
    const divCustom = document.getElementById('div-custom-days');
    if(divCount) divCount.classList.add('hidden');
    if(divFreq) divFreq.classList.add('hidden');
    if(divCustom) divCustom.classList.add('hidden');

    modal.classList.remove('hidden');
    modal.classList.add('flex'); // Novo: Adiciona Flex ao abrir
};

// FECHAR MODAL
document.getElementById('close-modal').onclick = () => {
    modal.classList.add('hidden');
    modal.classList.remove('flex'); // Novo: Remove Flex ao fechar
};

// CÁLCULO E SALVAR
form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btn-save');
    btn.textContent = 'Salvando...'; btn.disabled = true;

    try {
        const id = document.getElementById('tx-id').value;
        let rawAmount = document.getElementById('input-amount').value || "0";
        const totalAmount = parseFloat(rawAmount.replace(/\./g,'').replace(',','.'));
        const type = document.querySelector('input[name="type"]:checked').value;
        const baseDate = document.getElementById('input-date').value;
        const category = document.getElementById('input-category').value;
        const desc = document.getElementById('input-desc').value;
        const isPaid = document.getElementById('input-paid').checked;
        const recurrence = document.getElementById('input-recurrence').value;
        const count = parseInt(document.getElementById('input-installments').value) || 1;
        const frequency = document.getElementById('input-frequency').value;
        const customDays = parseInt(document.getElementById('input-custom-days').value) || 10;

        const baseData = { user_id: currentUser.uid, type, category, status: isPaid ? 'efetivado' : 'pendente' };

        if (id) {
            await updateDoc(doc(db, "transactions", id), { ...baseData, amount: totalAmount, date: baseDate, description: desc });
        } 
        else {
            const batch = writeBatch(db);

            if (recurrence === 'single') {
                await addDoc(collection(db, "transactions"), { ...baseData, amount: totalAmount, date: baseDate, description: desc });
            } 
            else {
                let finalAmountEach = totalAmount;
                let remainder = 0;
                if (recurrence === 'installment') {
                    finalAmountEach = Math.floor((totalAmount / count) * 100) / 100;
                    remainder = Math.round((totalAmount - (finalAmountEach * count)) * 100) / 100;
                }

                for (let i = 0; i < count; i++) {
                    const myDate = new Date(baseDate + 'T12:00:00');
                    
                    if (frequency === 'monthly') myDate.setMonth(myDate.getMonth() + i);
                    else if (frequency === 'biweekly') myDate.setDate(myDate.getDate() + (i * 15));
                    else if (frequency === 'custom') myDate.setDate(myDate.getDate() + (i * customDays));
                    
                    const valueThisTime = (recurrence === 'installment' && i === 0) ? (finalAmountEach + remainder) : finalAmountEach;
                    let descText = desc;
                    if(recurrence === 'installment') descText = `${desc} (${i+1}/${count})`;
                    
                    const newDoc = doc(collection(db, "transactions"));
                    batch.set(newDoc, {
                        ...baseData,
                        amount: Number(valueThisTime.toFixed(2)),
                        date: myDate.toISOString().split('T')[0],
                        description: descText,
                        status: (i === 0 && isPaid) ? 'efetivado' : 'pendente'
                    });
                }
                await batch.commit();
            }
        }
        modal.classList.add('hidden');
        modal.classList.remove('flex');
        form.reset();
    } catch (error) {
        alert("Erro: " + error.message);
    } finally {
        btn.textContent = 'Salvar Lançamento'; btn.disabled = false;
    }
};

window.editTransaction = (id) => {
    const t = transactions.find(x => x.id === id); if(!t) return;
    document.getElementById('tx-id').value = id;
    if(inputAmount) inputAmount.value = t.amount.toFixed(2).replace('.',',');
    document.getElementById('input-desc').value = t.description;
    document.getElementById('input-date').value = t.date;
    document.getElementById('input-category').value = t.category;
    const rt = document.querySelector(`input[name="type"][value="${t.type}"]`);
    if(rt) rt.checked = true;
    document.getElementById('input-paid').checked = (t.status === 'efetivado');

    const divCount = document.getElementById('div-period-count');
    const divFreq = document.getElementById('div-frequency');
    if(divCount) divCount.classList.add('hidden');
    if(divFreq) divFreq.classList.add('hidden');
    if(inputRecurrence) inputRecurrence.value = 'single';

    modal.classList.remove('hidden');
    modal.classList.add('flex');
};

window.payTransaction = async (id) => {
    const e = window.event; e.cancelBubble=true; if(e.stopPropagation) e.stopPropagation();
    if(confirm("Pagar?")) await updateDoc(doc(db, "transactions", id), { status: 'efetivado' });
};

function loadCategories() {
    const cats = ["Alimentação", "Transporte", "Moradia", "Lazer", "Saúde", "Educação", "Mercado", "Restaurante", "Salário", "Vendas", "Serviços", "Investimento", "Outros"];
    const sel = document.getElementById('input-category'); sel.innerHTML = '';
    cats.forEach(c => { const o = document.createElement('option'); o.value=c; o.innerText=c; sel.appendChild(o); });
}

function renderChart(data) {
    const ctx = document.getElementById('expenseChart').getContext('2d');
    if (chartInstance) chartInstance.destroy();
    const ex = (data||[]).filter(t=>t.type==='saida'&&t.status==='efetivado');
    const cats={}; ex.forEach(t=>{cats[t.category]=(cats[t.category]||0)+t.amount});
    chartInstance=new Chart(ctx,{type:'doughnut',data:{labels:Object.keys(cats),datasets:[{data:Object.values(cats),backgroundColor:['#ef4444','#f59e0b','#3b82f6','#10b981','#8b5cf6'],borderWidth:0}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{boxWidth:12,color:document.body.classList.contains('dark')?'#cbd5e1':'#4b5563'}}},cutout:'75%'}});
}

function fmtMoney(v) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function fmtDate(d) { return d.split('-').reverse().join('/'); }