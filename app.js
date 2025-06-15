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
        agent: null
    };

    const KEYWORD_REGEX = {
        imoveisVisitados: /^\s*[-*]*\s*IM[OÓ]VEIS VISITADOS/i,
        autodeclarado:    /^\s*[-*]*\s*(?:AUTODECLARADO|AUTO DECLARADO)(?!.*\bASSINAR\b)/i,
        conexaoCalcada:   /^\s*[-*]*\s*CONEX[AÃ]O CAL[CÇ]ADA/i,
        solicitacao65:    /^\s*[-*]*\s*(?:SOLICITA[CÇ][AÃ]O DA 65|☆065)/i,
        redePotencial:    /^\s*[-*]*\s*(?:REDE POTENCIAL|IMOVEL FECHADO REDE PONTENCIAL)/i,
        cadastro:         /^\s*[-*]*\s*CADASTRO/i
    };

    const lines = reportText.split(/\r?\n/);

    for (const line of lines) {
        if (!line.trim()) continue;

        let lineProcessed = false;
        // Tenta extrair os totais numéricos
        for (const key in KEYWORD_REGEX) {
            if (KEYWORD_REGEX[key].test(line)) {
                const numberMatch = line.match(/:\s*(\d+)/);
                if (numberMatch && numberMatch[1]) {
                    result.totals[key] += parseInt(numberMatch[1], 10) || 0;
                }
                lineProcessed = true;
                break;
            }
        }
        if (lineProcessed) continue;

        // Tenta extrair o nome do agente com TODAS as regras
        const agentPatterns = [
            /^\s*(?:\*|\-)?\s*(?:AGENTE|EQUIPE)[^:]*:\s*(.*)/i,
            /^\s*\d+\s*-\s*([A-Za-z\s].*)\s*$/im
        ];
        if (!result.agent) {
            for (const pattern of agentPatterns) {
                const match = line.match(pattern);
                if (match && match[1]) {
                    const potentialName = match[1].trim();
                    if (potentialName) {
                        result.agent = potentialName;
                        break;
                    }
                }
            }
        }
    }
    return result;
}

// --- FUNÇÃO DE ADICIONAR COM REGRA DE AGENTE DUPLICADO ---
function addReportsToTotal() {
    const inputTextarea = document.getElementById('text-input');
    const rawInputText = inputTextarea.value;
    if (!rawInputText.trim()) {
        showNotification("Por favor, cole um relatório para adicionar.", "error");
        return;
    }

    const reports = rawInputText.split(whatsappSplitter).filter(text => text.trim() !== '');
    if (reports.length === 0 && rawInputText.trim() !== '') {
        reports.push(rawInputText);
    }
    
    let pasteTotals = { imoveisVisitados: 0, autodeclarado: 0, conexaoCalcada: 0, solicitacao65: 0, redePotencial: 0, cadastro: 0 };
    let newAgentsForList = [];
    
    for (const reportText of reports) {
        const parsedData = parseSingleReport(reportText);
        const totalSum = Object.values(parsedData.totals).reduce((s, v) => s + v, 0);

        if (totalSum === 0 && !parsedData.agent) continue;

        // REGRA PRINCIPAL: Ignora o relatório se o agente já foi processado
        if (currentMode === 'total' && parsedData.agent && processedAgents.includes(parsedData.agent)) {
            continue; // Pula este relatório
        }

        // Soma os dados
        for (const key in pasteTotals) {
            pasteTotals[key] += parsedData.totals[key] || 0;
        }
        
        // Decide o nome a ser adicionado na lista
        let identifier;
        if (currentMode === 'total') {
            identifier = parsedData.agent || `#AGENTE SEM NOME# ${processedAgents.filter(a => a.startsWith("#AGENTE")).length + newAgentsForList.length + 1}`;
        } else { // currentMode === 'parcial'
            identifier = `Parcial #${cumulativePartialsCount + newAgentsForList.length + 1}`;
        }
        newAgentsForList.push(identifier);
    }

    if (newAgentsForList.length === 0) {
        showNotification("Nenhum relatório novo encontrado (agentes podem já ter sido processados).", "error");
        return;
    }
    
    // ATUALIZA O ESTADO GLOBAL
    history.push({ agents: newAgentsForList, totals: { ...pasteTotals } });
    processedAgents.push(...newAgentsForList);
    if(currentMode === 'parcial') {
        cumulativePartialsCount += newAgentsForList.length;
    }
    for (const key in cumulativeTotals) {
        cumulativeTotals[key] += pasteTotals[key] || 0;
    }
    
    updateDisplay();
    inputTextarea.value = '';
    showNotification(`${newAgentsForList.length} relatórios foram adicionados com sucesso!`);
}

function undoLastAction() {
    if (history.length === 0) return;
    const lastAction = history.pop();
    if (lastAction.agents.some(agent => agent.startsWith('Parcial'))) {
        cumulativePartialsCount -= lastAction.agents.length;
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