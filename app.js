// --- ESTADO GLOBAL DO APLICATIVO ---
let cumulativeTotals;
let processedAgents; // Agora será um array de objetos: {name: string, isDuplicate: boolean}
let history;
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

// --- MOTOR DE LEITURA (Inalterado) ---
function parseSingleReport(reportText) {
    const result = {
        totals: { imoveisVisitados: 0, autodeclarado: 0, conexaoCalcada: 0, solicitacao65: 0, redePotencial: 0, cadastro: 0 },
        agent: null
    };
    const findAndSum = (key, patterns) => {
        for (const pattern of patterns) {
            const globalPattern = new RegExp(pattern.source, 'gi');
            const matches = reportText.matchAll(globalPattern);
            for (const match of matches) {
                if (match[1]) result.totals[key] += parseInt(match[1], 10) || 0;
            }
        }
    };
    const PATTERNS = {
        imoveisVisitados: [/\*?\s*IM[OÓ]VEIS VISITADOS\s*\*?:?\s*(\d+)/],
        autodeclarado: [/\*?\s*(?<!ASSINAR\s)AUTODECLARADO\s*\*?:?\s*(\d+)/i, /\*?\s*(?<!ASSINAR\s)AUTO DECLARADO\s*\*?:?\s*(\d+)/i],
        conexaoCalcada: [/\*?\s*CONEX[AÃ]O CAL[CÇ]ADA\s*\*?:?\s*(\d+)/i],
        solicitacao65: [/\*?\s*SOLICITA[CÇ][AÃ]O DA 65\s*\*?:?\s*(\d+)/i, /\*?\s*☆065:?\s*(\d+)/i],
        redePotencial: [/\*?\s*REDE POTENCIAL:?\s*(\d+)/i, /\*?\s*IMOVEL FECHADO REDE PONTENCIAL:?\s*(\d+)/i],
        cadastro: [/\*?\s*CADASTRO:?\s*(\d+)/i]
    };
    for (const key in PATTERNS) findAndSum(key, PATTERNS[key]);
    const agentPatterns = [/(?:AGENTE|EQUIPE)[^:]*:\s*(.*)/i, /^\s*\d+\s*-\s*([A-Za-z\s].*)\s*$/im, /EQUIPES?\s+EM\s+(?:EM\s+)?CAMPO\s+\d+\s+(.*)/i];
    for(const pattern of agentPatterns){
        const agentMatch = reportText.match(pattern);
        if (agentMatch && agentMatch[1]) {
            result.agent = agentMatch[1].replace(/^\*/, '').trim();
            break;
        }
    }
    return result;
}

// --- NOVAS FUNÇÕES HELPER ---
function areTotalsIdentical(totals1, totals2) {
    const keys = Object.keys(totals1);
    if (keys.length !== Object.keys(totals2).length) return false;
    for(const key of keys) {
        if ((totals1[key] || 0) !== (totals2[key] || 0)) return false;
    }
    return true;
}

function checkForExactDuplicate(newReport) {
    if (!newReport.agent) return false;
    for(const processedReport of history) {
        if (processedReport.agent === newReport.agent && areTotalsIdentical(processedReport.totals, newReport.totals)) {
            return true;
        }
    }
    return false;
}

// --- FUNÇÃO DE ADICIONAR COM NOVA LÓGICA ---
function addReportsToTotal() {
    const inputTextarea = document.getElementById('text-input');
    const rawInputText = sanitizeInput(inputTextarea.value);
    if (!rawInputText.trim()) { showNotification("Por favor, cole um relatório para adicionar.", "error"); return; }

    const reports = rawInputText.split(whatsappSplitter).filter(text => text.trim() !== '');
    if (reports.length === 0 && rawInputText.trim() !== '') reports.push(rawInputText);
    
    let pasteTotals = { imoveisVisitados: 0, autodeclarado: 0, conexaoCalcada: 0, solicitacao65: 0, redePotencial: 0, cadastro: 0 };
    let newAgentsForList = [];
    
    for (const reportText of reports) {
        const parsedData = parseSingleReport(reportText);
        const totalSum = Object.values(parsedData.totals).reduce((s, v) => s + v, 0);
        if (totalSum === 0 && !parsedData.agent) continue;

        if (currentMode === 'total') {
            if (checkForExactDuplicate(parsedData)) {
                showNotification(`Aviso: Relatório para ${parsedData.agent} parece ser uma duplicata exata.`, 'error');
            }
        }
        
        for (const key in pasteTotals) pasteTotals[key] += parsedData.totals[key] || 0;
        
        let agentIdentifier;
        if (currentMode === 'total') {
            const agentName = parsedData.agent || `#AGENTE SEM NOME# ${processedAgents.filter(a => a.name.startsWith("#AGENTE")).length + newAgentsForList.length + 1}`;
            const isDuplicate = processedAgents.some(p => p.name === agentName);
            agentIdentifier = { name: agentName, isDuplicate: isDuplicate };
        } else {
            const partialName = `Parcial #${cumulativePartialsCount + newAgentsForList.length + 1}`;
            agentIdentifier = { name: partialName, isDuplicate: false };
        }
        newAgentsForList.push(agentIdentifier);
    }

    if (newAgentsForList.length === 0) { showNotification("Nenhum relatório novo encontrado.", "error"); return; }
    
    history.push(...newAgentsForList.map(agentObj => ({ agent: agentObj.name, totals: pasteTotals })));
    processedAgents.push(...newAgentsForList);

    if(currentMode === 'parcial') cumulativePartialsCount += newAgentsForList.length;
    for (const key in cumulativeTotals) cumulativeTotals[key] += pasteTotals[key] || 0;
    
    updateDisplay();
    inputTextarea.value = '';
    showNotification(`${newAgentsForList.length} relatórios foram adicionados com sucesso!`);
}

function undoLastAction() {
    if (history.length === 0) return;
    const lastReport = history.pop();
    if (lastReport) {
        if (lastReport.agent.startsWith('Parcial')) cumulativePartialsCount--;
        
        for (const key in cumulativeTotals) {
            cumulativeTotals[key] -= lastReport.totals[key] || 0;
        }
        // Remove a última entrada da lista de agentes processados
        processedAgents.pop();
    }
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

function sanitizeInput(text) {
    if (!text) return '';
    return text.replace(/\r\n?/g, '\n').replace(/\u00A0/g, ' ');
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
        description.textContent = 'Some os relatórios de agente. Avisos serão mostrados para relatórios duplicados.';
        modeToggleButton.textContent = 'Mudar para Soma de Parciais';
        agentListWrapper.style.display = 'inline';
        itemsForDisplay = processedAgents.filter(agent => !agent.name.startsWith('Parcial'));
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
    if (resetTimer) clearTimeout(resetTimer);

    reportCountSpan.textContent = itemsForCounting;
    
    // Lógica para renderizar a lista de agentes com destaque para duplicatas
    agentListSpan.innerHTML = ''; // Limpa a lista
    if (itemsForDisplay.length > 0) {
        itemsForDisplay.forEach((agentObj, index) => {
            const agentSpan = document.createElement('span');
            agentSpan.textContent = agentObj.name;
            if (agentObj.isDuplicate) {
                agentSpan.className = 'agent-duplicate';
            }
            agentListSpan.appendChild(agentSpan);
            if (index < itemsForDisplay.length - 1) {
                agentListSpan.appendChild(document.createTextNode(', '));
            }
        });
    } else {
        agentListSpan.textContent = 'Nenhum';
    }

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