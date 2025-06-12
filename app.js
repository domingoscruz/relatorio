// --- ESTADO GLOBAL DO APLICATIVO ---
let cumulativeTotals, processedAgents, history;
let currentMode = 'total'; // 'total' ou 'parcial'
let resetTimer = null; // Timer para o botão de reset

// --- REGRAS DE LEITURA (PARSING) ---
// (As regras de regex são omitidas aqui para clareza, mas estão no código abaixo)
const regexMapFormat1 = { agent: /\*AGENTE:\*.*?(?:\d+\s)?(.*?)\s*$/gm, imoveisVisitados: /\*IMÓVEIS VISITADOS:\*\s*(\d+)/g, autodeclarado: /\*-AUTODECLARADO:\*\s*(\d+)/g, conexaoCalcada: /\*-CONEXÃO CALÇADA:\*\s*(\d+)/g, solicitacao65: /\*-SOLICITAÇÃO DA 65:\*\s*(\d+)/g, redePotencial1: /\*-REDE POTENCIAL:\*\s*(\d+)/g, redePotencial2: /\*-IMÓVEL FECHADO REDE POTENCIAL:\*\s*(\d+)/g, cadastro: /\*-CADASTRO:\*\s*(\d+)/g };
const regexMapFormat2 = { agent: /AGENTE\s*:\s*\d+\s*-\s*(.*?)\s*$/gim, imoveisVisitados: /IMOVEIS VISITADOS:\s*(\d+)/gi, autodeclarado: /-\s*AUTO DECLARADO\s*:\s*(\d*)/gi, conexaoCalcada: /-\s*CONEXÃO CALÇADA\s*:\s*(\d*)/gi, solicitacao65: /\*\s*SOLICITAÇÃO DA 65\s*:\s*(\d*)/gi, redePotencial1: /-\s*REDE POTENCIAL\s*:\s*(\d*)/gi, redePotencial2: /\*\s*IMOVEL FECHADO REDE PONTENCIAL:\s*(\d*)/gi, cadastro: /\*\s*CADASTRO\s*:\s*(\d*)/gi };
const regexMapFormat3Parcial = { imoveisVisitados: /\*IMÓVEIS VISITADOS:\*\s*(\d+)/gi, autodeclarado: /\*AUTODECLARADO:\*\s*(\d+)/gi, conexaoCalcada: /\*CONEXÃO CALÇADA:\*\s*(\d+)/gi };
const regexMapFormat4Parcial = { imoveisVisitados: /IMÓVEIS VISITADOS:\s*(\d+)/gi, autodeclarado: /AUTODECLARADO:\s*(\d+)/gi, conexaoCalcada: /CONEXÃO CALÇADA:\s*(\d+)/gi };

// Função para iniciar ou resetar o estado
function initializeState() {
    cumulativeTotals = {
        imoveisVisitados: 0, autodeclarado: 0, conexaoCalcada: 0,
        solicitacao65: 0, redePotencial: 0, drenagem: 0, cadastro: 0
    };
    processedAgents = [];
    history = [];
}

function extractAndSum(text, regex) {
    let total = 0;
    let match;
    regex.lastIndex = 0; 
    while ((match = regex.exec(text)) !== null) {
        total += parseInt(match[1], 10) || 0;
    }
    return total;
}

// --- FUNÇÕES DE CONTROLE DO APLICATIVO ---

function addReportsToTotal() {
    // (Esta função permanece a mesma da versão anterior)
    const inputTextarea = document.getElementById('text-input');
    const inputText = inputTextarea.value;
    if (!inputText.trim()) {
        alert("Por favor, cole um relatório para adicionar.");
        return;
    }

    let newlyAddedAgents = [];
    let newTotals = {};

    if (currentMode === 'total') {
        const formatMap = /IMOVEIS VISITADOS:/.test(inputText) ? regexMapFormat2 : regexMapFormat1;
        const agentRegex = formatMap.agent;
        agentRegex.lastIndex = 0;
        let agentMatch;
        while((agentMatch = agentRegex.exec(inputText)) !== null) {
            const agentName = agentMatch[1].trim();
            if (agentName && !processedAgents.includes(agentName)) {
                newlyAddedAgents.push(agentName);
            }
        }
        if (newlyAddedAgents.length === 0 && (/\*AGENTE:/.test(inputText) || /AGENTE\s*:/.test(inputText))) {
            alert("Atenção: Nenhum relatório novo foi adicionado. Os agentes no texto já foram processados.");
            return;
        }
        newTotals = {
            imoveisVisitados: extractAndSum(inputText, formatMap.imoveisVisitados), autodeclarado: extractAndSum(inputText, formatMap.autodeclarado),
            conexaoCalcada: extractAndSum(inputText, formatMap.conexaoCalcada), solicitacao65: extractAndSum(inputText, formatMap.solicitacao65),
            redePotencial: extractAndSum(inputText, formatMap.redePotencial1) + extractAndSum(inputText, formatMap.redePotencial2),
            cadastro: extractAndSum(inputText, formatMap.cadastro)
        };
    } else {
        if (!/PARCIAL DIÁRIA/i.test(inputText)) {
            alert("Modo 'Soma de Parciais' ativo.\nPor favor, insira um relatório no formato 'PARCIAL DIÁRIA'.");
            return;
        }
        const parcialFormatMap = inputText.includes('*IMÓVEIS VISITADOS:*') ? regexMapFormat3Parcial : regexMapFormat4Parcial;
        newTotals = {
            imoveisVisitados: extractAndSum(inputText, parcialFormatMap.imoveisVisitados),
            autodeclarado: extractAndSum(inputText, parcialFormatMap.autodeclarado),
            conexaoCalcada: extractAndSum(inputText, parcialFormatMap.conexaoCalcada),
        };
        newlyAddedAgents.push(`Parcial #${history.length + 1}`);
    }

    history.push({ agents: newlyAddedAgents, totals: newTotals });
    processedAgents.push(...newlyAddedAgents);
    for (const key in cumulativeTotals) {
        if (newTotals[key] !== undefined) {
            cumulativeTotals[key] += newTotals[key];
        }
    }
    
    updateDisplay();
    inputTextarea.value = '';
}

function undoLastAction() {
    if (history.length === 0) return;
    const lastAction = history.pop();
    for (const key in cumulativeTotals) {
        if (typeof lastAction.totals[key] !== 'undefined') {
            cumulativeTotals[key] -= lastAction.totals[key];
        }
    }
    processedAgents = processedAgents.filter(agent => !lastAction.agents.includes(agent));
    updateDisplay();
}

function toggleMode() {
    currentMode = (currentMode === 'total') ? 'parcial' : 'total';
    initializeState();
    updateDisplay();
}

// --- NOVA LÓGICA PARA O BOTÃO DE RESET ---
function handleResetClick() {
    const resetButton = document.getElementById('reset-button');

    if (resetButton.classList.contains('pending-confirmation')) {
        // SEGUNDO CLIQUE: Executa a limpeza
        clearTimeout(resetTimer); // Cancela o timer de segurança
        initializeState();
        updateDisplay(); // updateDisplay irá restaurar o botão ao normal
    } else {
        // PRIMEIRO CLIQUE: Arma o botão para confirmação
        resetButton.classList.add('pending-confirmation');
        resetButton.textContent = 'CONFIRMAR?';

        // Inicia um timer para reverter o botão se não houver confirmação
        resetTimer = setTimeout(() => {
            resetButton.classList.remove('pending-confirmation');
            resetButton.textContent = '❌ Limpar Tudo';
            resetTimer = null;
        }, 4000); // 4 segundos para confirmar
    }
}


// --- FUNÇÃO CENTRAL DE ATUALIZAÇÃO DA INTERFACE (UI) ---
function updateDisplay() {
    // ... (referências aos elementos)
    const outputTextarea = document.getElementById('report-output'), reportCountSpan = document.getElementById('report-count'),
          agentListSpan = document.getElementById('agent-list'), agentListWrapper = document.getElementById('agent-list-wrapper'),
          undoButton = document.getElementById('undo-button'), modeToggleButton = document.getElementById('mode-toggle-button'),
          title = document.getElementById('main-title'), description = document.getElementById('main-description'),
          resetButton = document.getElementById('reset-button');
    
    // 1. Atualiza textos da interface conforme o modo
    if (currentMode === 'total') {
        title.textContent = 'Total Consolidado';
        description.textContent = 'Some os relatórios de agente. A detecção de formato é automática.';
        modeToggleButton.textContent = 'Mudar para Soma de Parciais';
        agentListWrapper.style.display = 'inline';
    } else {
        title.textContent = 'Soma de Parciais';
        description.textContent = 'Some múltiplos relatórios de PARCIAL DIÁRIA (com ou sem asteriscos).';
        modeToggleButton.textContent = 'Mudar para Total Consolidado';
        agentListWrapper.style.display = 'none';
    }
    
    // 2. Restaura o botão de reset para o estado normal (cancela qualquer confirmação pendente)
    resetButton.classList.remove('pending-confirmation');
    resetButton.textContent = '❌ Limpar Tudo';
    if (resetTimer) {
        clearTimeout(resetTimer);
        resetTimer = null;
    }

    // 3. Atualiza contadores e botões
    const itemsProcessedCount = (currentMode === 'total') ? processedAgents.length : history.length;
    reportCountSpan.textContent = itemsProcessedCount;
    agentListSpan.textContent = processedAgents.length > 0 ? processedAgents.join(', ') : 'Nenhum';
    undoButton.disabled = history.length === 0;

    // 4. Gera o relatório de saída conforme o modo
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

// --- INICIALIZAÇÃO DO APLICATIVO ---
document.addEventListener('DOMContentLoaded', () => {
    initializeState();
    updateDisplay(); 
    document.getElementById('add-button').addEventListener('click', addReportsToTotal);
    document.getElementById('reset-button').addEventListener('click', handleResetClick); // <- ATUALIZADO
    document.getElementById('undo-button').addEventListener('click', undoLastAction);
    document.getElementById('mode-toggle-button').addEventListener('click', toggleMode);
    
    document.getElementById('report-output').addEventListener('click', () => {
        const outputTextarea = document.getElementById('report-output');
        if (!outputTextarea.value) return;
        outputTextarea.select();
        navigator.clipboard.writeText(outputTextarea.value);
    });
});