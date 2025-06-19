// --- ESTADO GLOBAL DO APLICATIVO ---
let cumulativeTotals, processedAgents, history;
let currentMode = 'total';
let resetTimer = null;
let notificationTimer = null;
let cumulativePartialsCount = 0;

// Regex para CAPTURAR o corpo de cada mensagem do WhatsApp
const whatsappMessageRegex = /(?:\[\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4},?\s\d{1,2}:\d{2}(?::\d{2})?(?:\s(?:AM|PM))?\]\s.*?:)([\s\S]*?)(?=\s*\[\d{1,2}[\/-]|\z)/g;

function initializeState() {
    cumulativeTotals = { imoveisVisitados: 0, autodeclarado: 0, conexaoCalcada: 0, solicitacao65: 0, redePotencial: 0, drenagem: 0, cadastro: 0 };
    processedAgents = [];
    history = [];
    cumulativePartialsCount = 0;
}

// --- NOVO MOTOR DE LEITURA "CAÇA AO TESOURO" ---
function parseSingleReport(reportText) {
    const result = {
        totals: { imoveisVisitados: 0, autodeclarado: 0, conexaoCalcada: 0, solicitacao65: 0, redePotencial: 0, cadastro: 0 },
        agent: null
    };

    // Helper que busca todas as ocorrências de padrões e soma os resultados.
    const findAndSum = (key, patterns) => {
        for (const pattern of patterns) {
            const matches = reportText.matchAll(pattern);
            for (const match of matches) {
                if (match[1]) result.totals[key] += parseInt(match[1], 10) || 0;
            }
        }
    };

    // Dicionário de Padrões de Busca. A flag 'gi' busca globalmente e ignora maiúsculas/minúsculas.
    const PATTERNS = {
        imoveisVisitados: [/(?:im[oó]veis visitados)\s*\*?:\s*(\d+)/gi],
        autodeclarado: [/(?<!recusou assinar\s)autodeclarado\s*\*?:\s*(\d+)/gi, /(?<!recusou assinar\s)auto declarado\s*\*?:\s*(\d+)/gi],
        conexaoCalcada: [/conex[aã]o cal[cç]ada\s*\*?:\s*(\d+)/gi],
        solicitacao65: [/solicita[cç][aã]o da 65\s*\*?:\s*(\d+)/gi, /☆065\s*:?\s*(\d+)/gi],
        redePotencial: [/rede potencial\s*\*?:\s*(\d+)/gi, /imovel fechado rede po[nt]encial\s*\*?:\s*(\d+)/gi],
        cadastro: [/cadastro\s*\*?:\s*(\d+)/gi]
    };

    for (const key in PATTERNS) {
        findAndSum(key, PATTERNS[key]);
    }

    // Extrai o nome do agente
    const agentPatterns = [
        /(?:agente|equipe)[^:]*:\s*(.*)/i,
        /^\s*\d+\s*-\s*([A-Za-z\s].*)\s*$/im,
        /equipes?\s+em\s+(?:em\s+)?campo\s+\d+\s+(.*)/i
    ];
    for(const pattern of agentPatterns){
        const agentMatch = reportText.match(pattern);
        if (agentMatch && agentMatch[1]) {
            result.agent = agentMatch[1].replace(/^\*/, '').trim();
            if (result.agent) break;
        }
    }
    return result;
}

// --- FUNÇÃO DE ADICIONAR SIMPLIFICADA E CORRIGIDA ---
function addReportsToTotal() {
    const inputTextarea = document.getElementById('text-input');
    const sanitizedText = inputTextarea.value.replace(/\u00A0/g, ' '); // Limpeza básica de espaços
    if (!sanitizedText.trim()) { showNotification("Por favor, cole um relatório para adicionar.", "error"); return; }

    const reports = [];
    const matches = [...sanitizedText.matchAll(whatsappMessageRegex)];
    if (matches.length > 0) {
        for (const match of matches) reports.push(match[1]);
    } else {
        reports.push(sanitizedText);
    }
    
    let pasteTotals = { imoveisVisitados: 0, autodeclarado: 0, conexaoCalcada: 0, solicitacao65: 0, redePotencial: 0, cadastro: 0 };
    let newAgentsForList = [];
    
    for (const reportText of reports) {
        const parsedData = parseSingleReport(reportText);
        const totalSum = Object.values(parsedData.totals).reduce((s, v) => s + v, 0);
        if (totalSum === 0 && !parsedData.agent) continue;

        let identifier = parsedData.agent;
        if (currentMode === 'total' && identifier && processedAgents.includes(identifier)) {
            continue;
        }
        
        for (const key in pasteTotals) pasteTotals[key] += parsedData.totals[key] || 0;
        
        if (currentMode === 'total') {
            if (!identifier) identifier = `#AGENTE SEM NOME# ${processedAgents.filter(a => a.startsWith("#AGENTE")).length + newAgentsForList.length + 1}`;
        } else {
            identifier = `Parcial #${cumulativePartialsCount + newAgentsForList.length + 1}`;
        }
        newAgentsForList.push(identifier);
    }

    if (newAgentsForList.length === 0) { showNotification("Nenhum relatório novo encontrado (agentes podem já ter sido processados).", "error"); return; }
    
    history.push({ agents: newAgentsForList, totals: { ...pasteTotals } });
    processedAgents.push(...newAgentsForList);
    if(currentMode === 'parcial') cumulativePartialsCount += newAgentsForList.length;
    for (const key in cumulativeTotals) cumulativeTotals[key] += pasteTotals[key] || 0;
    
    updateDisplay();
    inputTextarea.value = '';
    showNotification(`${newAgentsForList.length} relatórios foram adicionados com sucesso!`);
}

function undoLastAction() {
    if (history.length === 0) return;
    const lastAction = history.pop();
    if (lastAction.agents.some(agent => agent.startsWith('Parcial'))) cumulativePartialsCount -= lastAction.agents.length;
    for (const key in cumulativeTotals) {
        if (typeof lastAction.totals[key] !== 'undefined') cumulativeTotals[key] -= lastAction.totals[key];
    }
    processedAgents = processedAgents.filter(agent => !lastAction.agents.includes(agent));
    updateDisplay();
}

function toggleMode() {
    currentMode = (currentMode === 'total') ? 'parcial' : 'total';
    initializeState();
    updateDisplay();
}

function handleResetClick() { 
    const resetButton = document.getElementById('reset-button');
    if (resetButton.classList.contains('pending-confirmation')) {
        clearTimeout(resetTimer);
        initializeState();
        updateDisplay();
    } else {
        resetButton.classList.add('pending-confirmation');
        resetButton.textContent = 'CONFIRMAR?';
        resetTimer = setTimeout(() => {
            resetButton.classList.remove('pending-confirmation');
            resetButton.textContent = '❌ Limpar Tudo';
            resetTimer = null;
        }, 4000);
    }
}

function showNotification(message, type = 'success') {
    const notificationArea = document.getElementById('notification-area');
    clearTimeout(notificationTimer);
    notificationArea.innerHTML = '';
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    notificationArea.appendChild(notification);
    setTimeout(() => notification.classList.add('show'), 10);
    notificationTimer = setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => { if(notification.parentNode) notification.parentNode.removeChild(notification); }, 500);
    }, 4000);
}

function updateDisplay() {
    const outputTextarea = document.getElementById('report-output'), reportCountSpan = document.getElementById('report-count'),
          agentListSpan = document.getElementById('agent-list'), agentListWrapper = document.getElementById('agent-list-wrapper'),
          undoButton = document.getElementById('undo-button'), modeToggleButton = document.getElementById('mode-toggle-button'),
          title = document.getElementById('main-title'), description = document.getElementById('main-description'),
          resetButton = document.getElementById('reset-button');
    
    let itemsForDisplay = [];
    let itemsForCounting = 0;

    if (currentMode === 'total') {
        title.textContent = 'Total Consolidado';
        description.textContent = 'Some os relatórios de agente. Relatórios de agentes já processados serão ignorados.';
        modeToggleButton.textContent = 'Mudar para Soma de Parciais';
        agentListWrapper.style.display = 'inline';
        itemsForDisplay = processedAgents.filter(agent => !agent.startsWith('Parcial'));
        itemsForCounting = itemsForDisplay.length;
    } else {
        title.textContent = 'Soma de Parciais';
        description.textContent = 'Some múltiplos relatórios parciais.';
        modeToggleButton.textContent = 'Mudar para Total Consolidado';
        agentListWrapper.style.display = 'none';
        itemsForCounting = cumulativePartialsCount;
        itemsForDisplay = [];
    }
    
    resetButton.classList.remove('pending-confirmation');
    resetButton.textContent = '❌ Limpar Tudo';
    if (resetTimer) {
        clearTimeout(resetTimer);
        resetTimer = null;
    }

    reportCountSpan.textContent = itemsForCounting;
    agentListSpan.textContent = itemsForDisplay.length > 0 ? itemsForDisplay.join(', ') : 'Nenhum';
    undoButton.disabled = history.length === 0;

    const today = new Date();
    const day = String(today.getDate()).padStart(2, '0'), month = String(today.getMonth() + 1).padStart(2, '0'),
          year = String(today.getFullYear()).slice(-2);
    const reportDate = `${day}/${month}/${year}`;
    let finalReport = '';

    if (currentMode === 'total') {
        finalReport = `GERAL DO DIA ${reportDate}\nVan 2 Diego Muniz\n\nIMÓVEIS VISITADOS: ${cumulativeTotals.imoveisVisitados}\n\nAUTODECLARADO: ${cumulativeTotals.autodeclarado}\n\nCONEXÃO CALÇADA: ${cumulativeTotals.conexaoCalcada}\n\nSOLICITAÇÃO 065: ${cumulativeTotals.solicitacao65}\n\nREDE POTENCIAL: ${cumulativeTotals.redePotencial}\n\nDRENAGEM: ${cumulativeTotals.drenagem}\n\nCADASTRO: ${cumulativeTotals.cadastro}\n\nEQUIPES EM CAMPO: ${itemsForCounting}`;
    } else {
        finalReport = `PARCIAL DIÁRIA ${reportDate}\n\nIMÓVEIS VISITADOS: ${cumulativeTotals.imoveisVisitados}\n\nAUTODECLARADO: ${cumulativeTotals.autodeclarado}\n\nCONEXÃO CALÇADA: ${cumulativeTotals.conexaoCalcada}\n\nAGENTES EM CAMPO: ${itemsForCounting}`;
    }

    outputTextarea.value = finalReport;
}

document.addEventListener('DOMContentLoaded', () => {
    const mainButton = document.querySelector('.button-group button');
    if(mainButton) mainButton.id = 'add-button';

    initializeState();
    updateDisplay(); 
    document.getElementById('add-button').addEventListener('click', addReportsToTotal);
    document.getElementById('reset-button').addEventListener('click', handleResetClick);
    document.getElementById('undo-button').addEventListener('click', undoLastAction);
    document.getElementById('mode-toggle-button').addEventListener('click', toggleMode);
    
    document.getElementById('report-output').addEventListener('click', () => {
        const outputTextarea = document.getElementById('report-output');
        if (!outputTextarea.value) return;
        navigator.clipboard.writeText(outputTextarea.value);
    });
});