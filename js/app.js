import { db, auth } from './firebase.js';
import { 
    collection, addDoc, deleteDoc, doc, updateDoc, query, where, onSnapshot 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { 
    signInWithEmailAndPassword, onAuthStateChanged, signOut 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// --- VARIÁVEIS GLOBAIS ---
let currentUser = null;
let transactions = [];
let chartInstance = null;

// --- ELEMENTOS DO DOM (HTML) ---
const views = {
    dashboard: document.getElementById('tab-dashboard'),
    transacoes: document.getElementById('tab-transacoes'),
    futuras: document.getElementById('tab-futuras'),
    extrato: document.getElementById('tab-extrato')
};

// --- 1. AUTENTICAÇÃO E INICIALIZAÇÃO ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('app-content').classList.remove('hidden');
        // Atualiza o nome se disponível, senão pega o email
        const userName = user.displayName || user.email.split('@')[0];
        console.log("Logado como:", userName);
        initApp();
    } else {
        currentUser = null;
        document.getElementById('login-screen').classList.remove('hidden');
        document.getElementById('app-content').classList.add('hidden');
    }
});

// Botão de Entrar
document.getElementById('btn-login').onclick = async () => {
    const email = document.getElementById('email').value;
    const pass = document.getElementById('password').value;
    const msg = document.getElementById('auth-msg');
    
    if(!email || !pass) {
        msg.textContent = "Preencha e-mail e senha.";
        return;
    }

    try {
        msg.textContent = "Entrando...";
        msg.className = "text-yellow-600 text-sm mt-3 h-5";
        await signInWithEmailAndPassword(auth, email, pass);
    } catch (error) {
        console.error(error);
        msg.className = "text-red-500 text-sm mt-3 h-5";
        if(error.code === 'auth/invalid-credential') {
            msg.textContent = "E-mail ou senha incorretos.";
        } else {
            msg.textContent = "Erro: " + error.code;
        }
    }
};

// Botão Sair (Mobile)
document.getElementById('btn-user-menu-mobile').onclick = () => {
    if(confirm("Deseja sair do aplicativo?")) signOut(auth);
};

// --- 2. SISTEMA DE NAVEGAÇÃO ---
function switchTab(tabName) {
    // Esconde todas as abas
    Object.values(views).forEach(el => el.classList.add('hidden'));
    // Mostra a selecionada
    views[tabName].classList.remove('hidden');

    // Atualiza botões Mobile
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.classList.remove('text-yellow-500', 'font-bold');
        if(btn.dataset.tab === tabName) btn.classList.add('text-yellow-500', 'font-bold');
    });

    // Atualiza botões Desktop
    document.querySelectorAll('.nav-desktop').forEach(btn => {
        btn.classList.remove('border-b-2', 'border-yellow-500', 'text-yellow-500');
        if(btn.dataset.tab === tabName) btn.classList.add('border-b-2', 'border-yellow-500', 'text-yellow-500');
    });

    // Se for dashboard, atualiza o gráfico
    if(tabName === 'dashboard') renderChart(getCurrentMonthData());
}

// Adicionar eventos aos botões de navegação
document.querySelectorAll('.nav-item, .nav-desktop').forEach(btn => {
    btn.onclick = () => switchTab(btn.dataset.tab);
});

// --- 3. BANCO DE DADOS EM TEMPO REAL ---
async function initApp() {
    // Definir mês atual no input global se estiver vazio
    if(!document.getElementById('global-month').value) {
        const today = new Date();
        document.getElementById('global-month').value = today.toISOString().slice(0, 7);
    }
    
    loadCategories();

    // Ouvinte em tempo real (Real-time listener)
    const q = query(collection(db, "transactions"), where("user_id", "==", currentUser.uid));
    
    onSnapshot(q, (snapshot) => {
        transactions = [];
        snapshot.forEach((doc) => {
            transactions.push({ id: doc.id, ...doc.data() });
        });
        updateInterface();
    }, (error) => {
        console.error("Erro ao buscar dados:", error);
    });
}

function getCurrentMonthData() {
    const selectedMonth = document.getElementById('global-month').value; 
    return transactions.filter(t => t.date.startsWith(selectedMonth));
}

function updateInterface() {
    const monthData = getCurrentMonthData();

    // Calcular Totais
    const receitas = monthData.filter(t => t.type === 'entrada' && t.status === 'efetivado')
                              .reduce((acc, t) => acc + t.amount, 0);
    const despesas = monthData.filter(t => t.type === 'saida' && t.status === 'efetivado')
                              .reduce((acc, t) => acc + t.amount, 0);

    // Atualizar Dashboard
    document.getElementById('dash-receitas').innerText = fmtMoney(receitas);
    document.getElementById('dash-despesas').innerText = fmtMoney(despesas);
    document.getElementById('dash-saldo').innerText = fmtMoney(receitas - despesas);

    // Renderizar Listas
    renderTransactionList(monthData);
    renderFutureList();
    renderChart(monthData);
    renderExtratoTable(monthData);
}

document.getElementById('global-month').addEventListener('change', updateInterface);
document.getElementById('search-trans').addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const filtered = getCurrentMonthData().filter(t => 
        t.description.toLowerCase().includes(term) || t.category.toLowerCase().includes(term)
    );
    renderTransactionList(filtered);
});

// --- 4. RENDERIZAÇÃO (CARD LIST) ---
function renderTransactionList(data) {
    const listEl = document.getElementById('transaction-list');
    listEl.innerHTML = '';

    if (data.length === 0) {
        listEl.innerHTML = '<div class="text-center text-gray-400 mt-10 p-4">Nenhuma transação encontrada neste período.</div>';
        return;
    }

    // Ordenar por data (mais recente primeiro)
    data.sort((a, b) => new Date(b.date) - new Date(a.date));

    data.forEach(t => {
        const isExpense = t.type === 'saida';
        const colorClass = isExpense ? 'text-red-500' : 'text-green-500';
        const icon = isExpense ? 'fa-arrow-down' : 'fa-arrow-up';
        const bgColor = isExpense ? 'bg-red-50 dark:bg-red-900/20' : 'bg-green-50 dark:bg-green-900/20';

        const html = `
            <div class="bg-white dark:bg-darkcard p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 flex justify-between items-center cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition" onclick="editTransaction('${t.id}')">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-full ${bgColor} flex items-center justify-center ${colorClass}">
                        <i class="fas ${icon}"></i>
                    </div>
                    <div>
                        <div class="font-bold text-gray-800 dark:text-gray-100 text-sm md:text-base">${t.description}</div>
                        <div class="text-xs text-gray-400">${fmtDate(t.date)} • ${t.category}</div>
                    </div>
                </div>
                <div class="text-right">
                    <div class="font-bold ${colorClass} text-sm md:text-base">${isExpense ? '-' : '+'} ${fmtMoney(t.amount)}</div>
                    <div class="text-[10px] ${t.status === 'efetivado' ? 'text-green-500' : 'text-yellow-500'} font-bold uppercase">
                        ${t.status === 'efetivado' ? '<i class="fas fa-check-circle"></i> Pago' : '<i class="fas fa-clock"></i> Pendente'}
                    </div>
                </div>
            </div>
        `;
        listEl.innerHTML += html;
    });
}

function renderFutureList() {
    const today = new Date().toISOString().split('T')[0];
    const pending = transactions.filter(t => t.status === 'pendente');
    const listEl = document.getElementById('future-list');
    
    // Calcular Saldo Futuro
    const recP = pending.filter(t => t.type === 'entrada').reduce((a, b) => a + b.amount, 0);
    const despP = pending.filter(t => t.type === 'saida').reduce((a, b) => a + b.amount, 0);
    document.getElementById('future-balance').innerText = fmtMoney(recP - despP);

    listEl.innerHTML = '';
    
    // Filtrar apenas futuras ou vencidas (não pagas)
    const displayList = pending.filter(t => true); // Pode ajustar filtros aqui
    displayList.sort((a,b) => new Date(a.date) - new Date(b.date));

    if(displayList.length === 0) {
         listEl.innerHTML = '<div class="text-center text-gray-400 text-xs py-4">Nenhuma conta pendente.</div>';
         return;
    }

    displayList.forEach(t => {
        const isLate = t.date < today;
        const dateDisplay = isLate ? `<span class="text-red-500 font-bold">VENCIDA (${fmtDate(t.date)})</span>` : fmtDate(t.date);
        
        listEl.innerHTML += `
            <div class="flex justify-between items-center p-3 border-b dark:border-gray-700 bg-white dark:bg-darkcard first:rounded-t-lg last:rounded-b-lg">
                <div class="flex flex-col">
                    <span class="font-bold text-sm text-gray-800 dark:text-gray-200">${t.description}</span>
                    <span class="text-xs text-gray-400">${dateDisplay}</span>
                </div>
                <button onclick="payTransaction('${t.id}')" class="bg-green-100 text-green-600 px-3 py-1 rounded-lg text-xs font-bold hover:bg-green-200 transition">
                    Pagar ${fmtMoney(t.amount)}
                </button>
            </div>
        `;
    });
}

function renderExtratoTable(data) {
    const container = document.getElementById('report-preview');
    if(data.length === 0) {
        container.innerHTML = '<div class="text-center p-4 text-gray-400">Sem dados para relatório</div>';
        return;
    }
    
    let html = `
    <table class="w-full text-sm text-left text-gray-500 dark:text-gray-400">
        <thead class="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400">
            <tr>
                <th scope="col" class="px-4 py-3">Data</th>
                <th scope="col" class="px-4 py-3">Desc</th>
                <th scope="col" class="px-4 py-3 text-right">Valor</th>
                <th scope="col" class="px-4 py-3 text-center">Status</th>
            </tr>
        </thead>
        <tbody>
    `;

    data.sort((a,b) => new Date(b.date) - new Date(a.date));

    data.forEach(t => {
        const color = t.type === 'saida' ? 'text-red-600' : 'text-green-600';
        html += `
            <tr class="bg-white border-b dark:bg-gray-800 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600">
                <td class="px-4 py-3">${fmtDate(t.date)}</td>
                <td class="px-4 py-3 font-medium text-gray-900 dark:text-white whitespace-nowrap">${t.description}</td>
                <td class="px-4 py-3 text-right font-bold ${color}">${fmtMoney(t.amount)}</td>
                <td class="px-4 py-3 text-center">${t.status === 'efetivado' ? '✅' : '⏳'}</td>
            </tr>
        `;
    });

    html += '</tbody></table>';
    container.innerHTML = html;
}

// --- 5. MODAL E FORMULÁRIO ---
const modal = document.getElementById('modal-transaction');
const form = document.getElementById('form-transaction');
const inputAmount = document.getElementById('input-amount');

// Formatação automática de moeda no input
inputAmount.addEventListener('input', (e) => {
    let value = e.target.value.replace(/\D/g, "");
    value = (Number(value) / 100).toFixed(2) + "";
    e.target.value = value.replace(".", ",");
});

document.getElementById('fab-add').onclick = () => {
    form.reset();
    document.getElementById('tx-id').value = '';
    document.getElementById('input-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('input-amount').value = "";
    
    // Resetar botões radio
    document.querySelectorAll('input[name="type"]').forEach(r => r.checked = false);
    document.querySelector('input[name="type"][value="saida"]').checked = true;

    modal.classList.remove('hidden');
    inputAmount.focus();
};

document.getElementById('close-modal').onclick = () => modal.classList.add('hidden');

form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btn-save');
    const originalText = btn.textContent;
    btn.textContent = 'Salvando...';
    btn.disabled = true;

    const id = document.getElementById('tx-id').value;
    // Converter "1.234,56" para 1234.56
    let rawAmount = document.getElementById('input-amount').value;
    if(!rawAmount) rawAmount = "0";
    // Remove tudo que não é número ou virgula
    const amount = parseFloat(rawAmount.replace(/\./g, '').replace(',', '.'));

    const type = document.querySelector('input[name="type"]:checked').value;
    const date = document.getElementById('input-date').value;
    const category = document.getElementById('input-category').value;
    const desc = document.getElementById('input-desc').value;
    const isPaid = document.getElementById('input-paid').checked;

    const data = {
        user_id: currentUser.uid,
        amount, type, date, category, description: desc,
        status: isPaid ? 'efetivado' : 'pendente'
    };

    try {
        if (id) {
            await updateDoc(doc(db, "transactions", id), data);
        } else {
            await addDoc(collection(db, "transactions"), data);
        }
        modal.classList.add('hidden');
        form.reset();
    } catch (error) {
        alert("Erro ao salvar: " + error.message);
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
};

// --- FUNÇÕES AUXILIARES ---
window.editTransaction = (id) => {
    const t = transactions.find(x => x.id === id);
    if (!t) return;
    
    document.getElementById('tx-id').value = id;
    // Formata valor para o input (ex: 10.50 -> 10,50)
    document.getElementById('input-amount').value = t.amount.toFixed(2).replace('.', ',');
    document.getElementById('input-desc').value = t.description;
    document.getElementById('input-date').value = t.date;
    document.getElementById('input-category').value = t.category;
    
    document.querySelectorAll('input[name="type"]').forEach(r => r.checked = false);
    document.querySelector(`input[name="type"][value="${t.type}"]`).checked = true;
    
    document.getElementById('input-paid').checked = (t.status === 'efetivado');

    modal.classList.remove('hidden');
};

window.payTransaction = async (id) => {
    // Stop propagation para não abrir o modal de edição ao clicar no botão
    const event = window.event;
    event.cancelBubble = true;
    if(event.stopPropagation) event.stopPropagation();

    if(confirm("Marcar esta conta como PAGA?")) {
        await updateDoc(doc(db, "transactions", id), { status: 'efetivado' });
    }
};

function loadCategories() {
    const cats = [
        "Alimentação", "Transporte", "Moradia", "Lazer", "Saúde", "Educação", 
        "Mercado", "Restaurante", "Salário", "Vendas", "Serviços", "Investimento", "Outros"
    ];
    const sel = document.getElementById('input-category');
    // Salva a seleção atual caso exista
    const currentVal = sel.value; 
    
    sel.innerHTML = '';
    cats.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c;
        opt.innerText = c;
        sel.appendChild(opt);
    });
    
    if(currentVal) sel.value = currentVal;
}

function renderChart(data) {
    const ctx = document.getElementById('expenseChart').getContext('2d');
    if (chartInstance) chartInstance.destroy();

    // Agrupar gastos por categoria
    const expenses = (data || []).filter(t => t.type === 'saida' && t.status === 'efetivado');
    const categories = {};
    expenses.forEach(t => {
        categories[t.category] = (categories[t.category] || 0) + t.amount;
    });

    // Se não houver dados, mostrar gráfico vazio ou mensagem
    if(Object.keys(categories).length === 0) {
        // Opcional: desenhar gráfico vazio
    }

    chartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(categories),
            datasets: [{
                data: Object.values(categories),
                backgroundColor: ['#ef4444', '#f59e0b', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899'],
                borderWidth: 0,
                hoverOffset: 10
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { 
                    position: 'bottom', 
                    labels: { 
                        boxWidth: 12,
                        color: document.body.classList.contains('dark') ? '#cbd5e1' : '#4b5563'
                    } 
                }
            },
            cutout: '75%'
        }
    });
}

function fmtMoney(v) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function fmtDate(d) { return d.split('-').reverse().join('/'); }
// --- 6. SISTEMA DE TEMA (DARK/LIGHT) ---
const html = document.documentElement;
const themeBtns = [document.getElementById('btn-theme-mobile'), document.getElementById('btn-theme-desktop')];

// Função para aplicar o tema
function applyTheme(isDark) {
    if (isDark) {
        html.classList.add('dark');
        localStorage.setItem('theme', 'dark');
        // Mudar ícones para Sol
        themeBtns.forEach(btn => {
            if(btn) btn.innerHTML = '<i class="fas fa-sun"></i>';
        });
    } else {
        html.classList.remove('dark');
        localStorage.setItem('theme', 'light');
        // Mudar ícones para Lua
        themeBtns.forEach(btn => {
            if(btn) btn.innerHTML = '<i class="fas fa-moon"></i>';
        });
    }
}

// Verificar preferência salva ao carregar
const savedTheme = localStorage.getItem('theme');
if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    applyTheme(true);
} else {
    applyTheme(false);
}

// Adicionar evento de clique aos botões
themeBtns.forEach(btn => {
    if(btn) {
        btn.onclick = () => {
            const isDarkNow = html.classList.contains('dark');
            applyTheme(!isDarkNow); // Inverte o estado atual
        };
    }
});

// Adicionar lógica ao botão de Sair do Desktop que adicionei no HTML acima
const btnLogoutDesk = document.getElementById('btn-logout-desktop');
if(btnLogoutDesk) {
    btnLogoutDesk.onclick = () => {
        if(confirm("Sair do sistema?")) signOut(auth);
    }
}