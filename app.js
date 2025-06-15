// --- ESTADO GLOBAL DO APLICATIVO ---
let cumulativeTotals, processedAgents, history;
let currentMode = 'total';
let resetTimer = null;
let notificationTimer = null;
let cumulativePartialsCount = 0;

const whatsappSplitter = /\[\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4},?\s\d{1,2}:\d{2}(?::\d{2})?(?:\s(?:AM|PM))?\]\s.*?:/g;

function initializeState() {
    cumulativeTotals = { imoveisVisitados: 0, autodeclarado: 0, conexaoCalcada: 0, solicitacao65: 0, redePotencial: 0, drenagem: 0, cadastro: 0 };
    processedAgents = [];
    history = [];
    cumulativePartialsCount = 0;
}

// --- MOTOR DE LEITURA INTELIGENTE E PRECISO ---
function parseSingleReport(reportText) {
    const result = {
        totals: { imoveisVisitados: 0, autodeclarado: 0, conexaoCalcada: 0, solicitacao65: 0, redePotencial: 0, cadastro: 0 },
        agent: null,
        isProcessed: false
    };
    const KEYWORD_REGEX = {
        imoveisVisitados: /^\s*(?:-|\*)?\s*IM[OÓ]VEIS VISITADOS/i,
        autodeclarado:    /^\s*(?:-|\*)?\s*AUTODECLARADO/i,
        autoDeclaradoAlt: /^\s*(?:-|\*)?\s*AUTO DECLARADO/i,
        conexaoCalcada:   /^\s*(?:-|\*)?\s*CONEX[AÃ]O CAL[CÇ]ADA/i,
        solicitacao65:    /^\s*(?:-|\*)?\s*SOLICITA[CÇ][AÃ]O DA 65/i,
        solicitacao65Alt: /^\s*(?:-|\*)?\s*☆065/i,
        redePotencial:    /^\s*(?:-|\*)?\s*REDE POTENCIAL/i,
        redePotencialAlt: /^\s*(?:-|\*)?\s*IMOVEL FECHADO REDE PONTENCIAL/i,
        cadastro:         /^\s*(?:-|\*)?\s*CADASTRO/i
    };
    const lines = reportText.split('\n');
    for (const line of lines) {
        if (!line.trim()) continue;
        let lineProcessed = false;
        for (const key in KEYWORD_REGEX) {
            if (KEYWORD_REGEX[key].test(line)) {
                const numberMatch = line.match(/:\s*(\d+)/);
                if (numberMatch && numberMatch[1]) {
                    const value = parseInt(numberMatch[1], 10);
                    if (key === 'autoDeclaradoAlt') result.totals.autodeclarado += value;
                    else if (key === 'solicitacao65Alt') result.totals.solicitacao65 += value;
                    else if (key === 'redePotencialAlt') result.totals.redePotencial += value;
                    else if (result.totals[key] !== undefined) result.totals[key] += value;
                }
                lineProcessed = true;
                break;
            }
        }
        if (lineProcessed) continue;
        const agentPatterns = [ /(?:AGENTE|EQUIPE)\s*:?\s*\d*\s*[-:]?\s*(.*)/i, /^\s*\d+\s*-\s*([A-Za-z\s]+)\s*$/im ];
        if (!result.agent) {
            for (const pattern of agentPatterns) {
                const match = line.match(pattern);
                if (match && match[1]) {
                    const potentialName = match[1].trim();
                    if (potentialName && !/visitados|autodeclarado|cal[cç]ada/i.test(potentialName)) {
                        result.agent = potentialName;
                        break;
                    }
                }
            }
        }
    }
    const totalSum = Object.values(result.totals).reduce((sum, val) => sum + val, 0);
    if (totalSum > 0 || result.agent) result.isProcessed = true;
    return result;
}

// --- FUNÇÕES DE CONTROLE DO APLICATIVO ---
function addReportsToTotal() {
    const inputTextarea = document.getElementById('text-input');
    const rawInputText = inputTextarea.value;
    if (!rawInputText.trim()) {
        showNotification("Por favor, cole um relatório para adicionar.", "error");
        return;
    }
    const reports = rawInputText.split(whatsappSplitter).filter(text => text.trim() !== '');
    if (reports.length === 0 && rawInputText.trim() !== '') reports.push(rawInputText);
    
    let pasteTotals = { imoveisVisitados: 0, autodeclarado: 0, conexaoCalcada: 0, solicitacao65: 0, redePotencial: 0, cadastro: 0 };
    let pasteAgents = [];
    
    for (const reportText of reports) {
        const parsedData = parseSingleReport(reportText);
        if (!parsedData.isProcessed) continue;
        let agentToAdd = null;
        let shouldProcess = false;
        if (currentMode === 'total') {
            if (parsedData.agent && !processedAgents.includes(parsedData.agent) && !pasteAgents.includes(parsedData.agent)) {
                agentToAdd = parsedData.agent;
                shouldProcess = true;
            } else if (!parsedData.agent && Object.values(parsedData.totals).some(v => v > 0)) {
                agentToAdd = `#AGENTE SEM NOME# ${history.length + pasteAgents.length + 1}`;
                shouldProcess = true;
            }
        } else {
             const partialSum = parsedData.totals.imoveisVisitados + parsedData.totals.autodeclarado + parsedData.totals.conexaoCalcada;
             if(partialSum > 0 || /IM[OÓ]VEIS VISITADOS|AUTODECLARADO|CONEX[AÃ]O CAL[CÇ]ADA/i.test(reportText)){
                agentToAdd = `Parcial #${history.length + pasteAgents.length + 1}`;
                shouldProcess = true;
             }
        }
        if (shouldProcess) {
            pasteAgents.push(agentToAdd);
            for (const key in pasteTotals) {
                 if (parsedData.totals[key] !== undefined) pasteTotals[key] += parsedData.totals[key];
            }
        }
    }

    if (pasteAgents.length === 0) {
        showNotification("Nenhum relatório novo ou dado relevante encontrado.", "error");
        return;
    }
    
    history.push({ agents: pasteAgents, totals: { ...pasteTotals } });
    processedAgents.push(...pasteAgents);
    if(currentMode === 'parcial') cumulativePartialsCount += pasteAgents.length;
    for (const key in cumulativeTotals) {
        if (pasteTotals[key] !== undefined) cumulativeTotals[key] += pasteTotals[key];
    }
    
    updateDisplay();
    inputTextarea.value = '';
    showNotification(`${pasteAgents.length} relatórios foram adicionados com sucesso!`);
}

function undoLastAction() {
    if (history.length === 0) return;
    const lastAction = history.pop();
    if (lastAction.agents.some(agent => agent.startsWith('Parcial') || agent.startsWith('#AGENTE SEM NOME#'))) {
        if (currentMode === 'parcial') cumulativePartialsCount -= lastAction.agents.length;
    }
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

// --- FUNÇÃO CENTRAL DE ATUALIZAÇÃO DA INTERFACE (UI) ---
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
        description.textContent = 'Some os relatórios de agente (inclusive do WhatsApp). A detecção de formato é automática.';
        modeToggleButton.textContent = 'Mudar para Soma de Parciais';
        agentListWrapper.style.display = 'inline';
        
        // LÓGICA CORRIGIDA AQUI
        // Lista para exibição: Inclui todos os relatórios processados neste modo.
        itemsForDisplay = processedAgents.filter(agent => !agent.startsWith('Parcial'));
        // Contagem para "Equipes em Campo": Agora é o total de itens na lista de exibição.
        itemsForCounting = itemsForDisplay.length;

    } else { // Modo 'parcial'
        title.textContent = 'Soma de Parciais';
        description.textContent = 'Some múltiplos relatórios parciais. O sistema busca apenas por "Imóveis Visitados", "Autodeclarado" e "Conexão Calçada".';
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
        finalReport = `*GERAL DO DIA ${reportDate}*\n*Van 2 Diego Muniz*\n\n*IMÓVEIS VISITADOS:* ${cumulativeTotals.imoveisVisitados}\n\n*AUTODECLARADO:* ${cumulativeTotals.autodeclarado}\n\n*CONEXÃO CALÇADA:* ${cumulativeTotals.conexaoCalcada}\n\n*SOLICITAÇÃO 065:* ${cumulativeTotals.solicitacao65}\n\n*REDE POTENCIAL:* ${cumulativeTotals.redePotencial}\n\n*DRENAGEM:* ${cumulativeTotals.drenagem}\n \n*CADASTRO:* ${cumulativeTotals.cadastro}\n\n*EQUIPES EM CAMPO:* ${itemsForCounting}`;
    } else {
        finalReport = `*PARCIAL DIÁRIA*\n\n*IMÓVEIS VISITADOS:* ${cumulativeTotals.imoveisVisitados}\n\n*AUTODECLARADO:* ${cumulativeTotals.autodeclarado}\n\n*CONEXÃO CALÇADA:* ${cumulativeTotals.conexaoCalcada}`;
    }

    outputTextarea.value = finalReport;
}

document.addEventListener('DOMContentLoaded', () => {
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