// --- ESTADO GLOBAL DO APLICATIVO ---
let cumulativeTotals, processedAgents, history;
let currentMode = 'total';
let resetTimer = null;
let notificationTimer = null;
let cumulativePartialsCount = 0;

// Regex para identificar e dividir as mensagens do WhatsApp (versão robusta)
const whatsappSplitter = /\[\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4},?\s\d{1,2}:\d{2}(?::\d{2})?(?:\s(?:AM|PM))?\]\s.*?:/g;

// Função para iniciar ou resetar o estado
function initializeState() {
    cumulativeTotals = { imoveisVisitados: 0, autodeclarado: 0, conexaoCalcada: 0, solicitacao65: 0, redePotencial: 0, drenagem: 0, cadastro: 0 };
    processedAgents = [];
    history = [];
    cumulativePartialsCount = 0;
}

// --- NOVO MOTOR DE LEITURA INTELIGENTE ---
function parseSingleReport(reportText) {
    const result = {
        totals: { imoveisVisitados: 0, autodeclarado: 0, conexaoCalcada: 0, solicitacao65: 0, redePotencial: 0, cadastro: 0 },
        agent: null,
        isProcessed: false
    };

    // Helper para buscar um valor numérico após uma palavra-chave no texto
    const findAndSum = (patterns) => {
        let sum = 0;
        for (const pattern of patterns) {
            // Cria uma regex global para encontrar todas as ocorrências
            const regex = new RegExp(pattern.source + '.*?:?\\s*(\\d+)', 'gi');
            let match;
            while ((match = regex.exec(reportText)) !== null) {
                sum += parseInt(match[1], 10) || 0;
            }
        }
        return sum;
    };

    // Extrai os totais numéricos
    result.totals.imoveisVisitados = findAndSum([/IM[OÓ]VEIS VISITADOS/i]);
    result.totals.autodeclarado = findAndSum([/AUTODECLARADO/i, /AUTO DECLARADO/i]);
    result.totals.conexaoCalcada = findAndSum([/CONEX[AÃ]O CAL[CÇ]ADA/i]);
    result.totals.solicitacao65 = findAndSum([/SOLICITA[CÇ][AÃ]O DA 65/i, /☆065/i]);
    result.totals.redePotencial = findAndSum([/REDE POTENCIAL/i, /IMOVEL FECHADO REDE PONTENCIAL/i]);
    result.totals.cadastro = findAndSum([/CADASTRO/i]);

    // Extrai o nome do agente ou da equipe
    const agentPatterns = [/AGENTE\s*:\s*\d+\s*-\s*(.*?)\s*$/im, /\*AGENTE:\*.*?(?:\d+\s)?(.*?)\s*$/im, /EQUIPE.*?:?\s*(.*?)\s*$/im];
    for (const pattern of agentPatterns) {
        const match = reportText.match(pattern);
        if (match && match[1]) {
            // Limpa o nome para remover números e traços extras
            let name = match[1].replace(/\d+\s*-\s*/, '').trim();
            if (name) {
                result.agent = name;
                break;
            }
        }
    }
    
    // Um relatório é considerado processável se tiver algum valor ou um agente identificado
    const totalSum = Object.values(result.totals).reduce((sum, val) => sum + val, 0);
    if (totalSum > 0 || result.agent) {
        result.isProcessed = true;
    }

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
    if (reports.length === 0 && rawInputText.trim() !== '') {
        reports.push(rawInputText);
    }
    
    let pasteTotals = { imoveisVisitados: 0, autodeclarado: 0, conexaoCalcada: 0, solicitacao65: 0, redePotencial: 0, cadastro: 0 };
    let pasteAgents = [];
    
    for (const reportText of reports) {
        const parsedData = parseSingleReport(reportText);

        if (!parsedData.isProcessed) continue; // Pula relatórios vazios ou não reconhecidos

        if (currentMode === 'total') {
            let agentToAdd = null;
            if (parsedData.agent && !processedAgents.includes(parsedData.agent)) {
                agentToAdd = parsedData.agent;
            }
            // Se não encontrou agente, mas encontrou totais, conta como uma parcial genérica
            else if (!parsedData.agent && Object.values(parsedData.totals).some(v => v > 0)) {
                 agentToAdd = `Parcial #${history.length + pasteAgents.length + 1}`;
            }

            if(agentToAdd) {
                pasteAgents.push(agentToAdd);
                for (const key in pasteTotals) {
                     pasteTotals[key] += parsedData.totals[key] || 0;
                }
            }
        } else { // currentMode === 'parcial'
             const partialSum = parsedData.totals.imoveisVisitados + parsedData.totals.autodeclarado + parsedData.totals.conexaoCalcada;
             if(partialSum > 0 || /IM[OÓ]VEIS VISITADOS/i.test(reportText) || /AUTODECLARADO/i.test(reportText) || /CONEX[AÃ]O CAL[CÇ]ADA/i.test(reportText) ){
                pasteAgents.push(`Parcial #${history.length + pasteAgents.length + 1}`);
                pasteTotals.imoveisVisitados += parsedData.totals.imoveisVisitados;
                pasteTotals.autodeclarado += parsedData.totals.autodeclarado;
                pasteTotals.conexaoCalcada += parsedData.totals.conexaoCalcada;
             }
        }
    }

    if (pasteAgents.length === 0) {
        showNotification("Nenhum relatório novo ou dado relevante encontrado.", "error");
        return;
    }
    
    history.push({ agents: pasteAgents, totals: { ...pasteTotals } });
    processedAgents.push(...pasteAgents);
    if(currentMode === 'parcial') {
        cumulativePartialsCount += pasteAgents.length;
    }
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
    
    const agentNames = processedAgents.filter(agent => !agent.startsWith('Parcial'));
    let itemsProcessedCount;

    if (currentMode === 'total') {
        title.textContent = 'Total Consolidado';
        description.textContent = 'Some os relatórios de agente (inclusive do WhatsApp). A detecção de formato é automática.';
        modeToggleButton.textContent = 'Mudar para Soma de Parciais';
        agentListWrapper.style.display = 'inline';
        itemsProcessedCount = agentNames.length;
    } else {
        title.textContent = 'Soma de Parciais';
        description.textContent = 'Some múltiplos relatórios parciais. O sistema busca apenas por "Imóveis Visitados", "Autodeclarado" e "Conexão Calçada".';
        modeToggleButton.textContent = 'Mudar para Total Consolidado';
        agentListWrapper.style.display = 'none';
        itemsProcessedCount = cumulativePartialsCount;
    }
    
    resetButton.classList.remove('pending-confirmation');
    resetButton.textContent = '❌ Limpar Tudo';
    if (resetTimer) {
        clearTimeout(resetTimer);
        resetTimer = null;
    }

    reportCountSpan.textContent = itemsProcessedCount;
    agentListSpan.textContent = agentNames.length > 0 ? agentNames.join(', ') : 'Nenhum';
    undoButton.disabled = history.length === 0;

    const today = new Date();
    const day = String(today.getDate()).padStart(2, '0'), month = String(today.getMonth() + 1).padStart(2, '0'),
          year = String(today.getFullYear()).slice(-2);
    const reportDate = `${day}/${month}/${year}`;
    let finalReport = '';

    if (currentMode === 'total') {
        finalReport = `*GERAL DO DIA ${reportDate}*\n*Van 2 Diego Muniz*\n\n*IMÓVEIS VISITADOS:* ${cumulativeTotals.imoveisVisitados}\n\n*AUTODECLARADO:* ${cumulativeTotals.autodeclarado}\n\n*CONEXÃO CALÇADA:* ${cumulativeTotals.conexaoCalcada}\n\n*SOLICITAÇÃO 065:* ${cumulativeTotals.solicitacao65}\n\n*REDE POTENCIAL:* ${cumulativeTotals.redePotencial}\n\n*DRENAGEM:* ${cumulativeTotals.drenagem}\n \n*CADASTRO:* ${cumulativeTotals.cadastro}\n\n*EQUIPES EM CAMPO:* ${itemsProcessedCount}`;
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