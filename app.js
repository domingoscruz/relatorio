// --- VARIÁVEIS GLOBAIS PARA MANTER O ESTADO ---
let cumulativeTotals;
let processedAgents;
let history; // Guarda o histórico de ações para permitir o "desfazer"

// Função para iniciar ou resetar o estado
function initializeState() {
    cumulativeTotals = {
        imoveisVisitados: 0, autodeclarado: 0, conexaoCalcada: 0,
        solicitacao65: 0, redePotencial: 0, drenagem: 0, cadastro: 0
    };
    processedAgents = [];
    history = [];
}

// Garante que o script só rode após a página carregar
document.addEventListener('DOMContentLoaded', () => {
    // Inicia o estado pela primeira vez e atualiza a tela
    initializeState();
    updateDisplay(); 

    // --- EVENTOS DOS BOTÕES ---
    document.getElementById('add-button').addEventListener('click', addReportsToTotal);
    
    document.getElementById('reset-button').addEventListener('click', () => {
        if (confirm("Tem certeza que deseja limpar todos os dados e começar de novo?")) {
            initializeState();
            updateDisplay();
        }
    });

    document.getElementById('undo-button').addEventListener('click', undoLastAction);
    
    document.getElementById('report-output').addEventListener('click', () => {
        const outputTextarea = document.getElementById('report-output');
        if (!outputTextarea.value) return;
        outputTextarea.select();
        navigator.clipboard.writeText(outputTextarea.value);
    });
});

// Função para somar os valores de um texto
function extractAndSum(text, regex) {
    let total = 0;
    let match;
    // Reinicia o índice da regex para garantir que ela funcione em textos diferentes
    regex.lastIndex = 0; 
    while ((match = regex.exec(text)) !== null) {
        total += parseInt(match[1], 10) || 0;
    }
    return total;
}

// Função principal que ADICIONA os novos relatórios
function addReportsToTotal() {
    const inputTextarea = document.getElementById('text-input');
    const inputText = inputTextarea.value;

    if (!inputText.trim()) {
        alert("Por favor, cole um ou mais relatórios para adicionar.");
        return;
    }

    // --- ENCONTRAR NOVOS AGENTES ---
    const agentRegex = /\*AGENTE:\*.*?(?:\d+\s)?(.*?)\s*$/gm;
    let agentMatch;
    const newlyAddedAgents = [];
    while((agentMatch = agentRegex.exec(inputText)) !== null) {
        const agentName = agentMatch[1].trim();
        if (agentName && !processedAgents.includes(agentName)) {
            newlyAddedAgents.push(agentName);
        }
    }

    if (newlyAddedAgents.length === 0 && inputText.includes('*AGENTE:')) {
        alert("Atenção: Nenhum relatório novo foi adicionado. Os agentes no texto já foram processados.");
        return;
    }

    // --- CALCULAR OS VALORES *APENAS* DO NOVO TEXTO ---
    const regexMap = {
        imoveisVisitados: /\*IMÓVEIS VISITADOS:\*\s*(\d+)/g,
        autodeclarado: /\*-AUTODECLARADO:\*\s*(\d+)/g,
        conexaoCalcada: /\*-CONEXÃO CALÇADA:\*\s*(\d+)/g,
        solicitacao65: /\*-SOLICITAÇÃO DA 65:\*\s*(\d+)/g,
        redePotencial: /\*-REDE POTENCIAL:\*\s*(\d+)/g,
        imovelFechadoRedePotencial: /\*-IMÓVEL FECHADO REDE POTENCIAL:\*\s*(\d+)/g, // Nova regex
        cadastro: /\*-CADASTRO:\*\s*(\d+)/g
    };
    const newTotals = {
        imoveisVisitados: extractAndSum(inputText, regexMap.imoveisVisitados),
        autodeclarado: extractAndSum(inputText, regexMap.autodeclarado),
        conexaoCalcada: extractAndSum(inputText, regexMap.conexaoCalcada),
        solicitacao65: extractAndSum(inputText, regexMap.solicitacao65),
        // AQUI ESTÁ A MUDANÇA: Soma os valores de duas fontes diferentes
        redePotencial: extractAndSum(inputText, regexMap.redePotencial) + extractAndSum(inputText, regexMap.imovelFechadoRedePotencial),
        cadastro: extractAndSum(inputText, regexMap.cadastro)
    };

    // --- GUARDAR A AÇÃO NO HISTÓRICO ANTES DE APLICAR ---
    history.push({
        agents: newlyAddedAgents,
        totals: newTotals
    });

    // --- APLICAR AS MUDANÇAS AO ESTADO GLOBAL ---
    processedAgents.push(...newlyAddedAgents);
    for (const key in cumulativeTotals) {
        if (newTotals[key]) {
            cumulativeTotals[key] += newTotals[key];
        }
    }
    
    updateDisplay();
    inputTextarea.value = ''; // Limpa a caixa de entrada para o próximo
}

// Função para desfazer a última ação
function undoLastAction() {
    if (history.length === 0) return; // Não faz nada se não houver histórico

    const lastAction = history.pop(); // Remove a última ação do histórico

    // --- REVERTE AS MUDANÇAS NO ESTADO GLOBAL ---
    // Subtrai os totais da última ação
    for (const key in cumulativeTotals) {
        // Verifica se a chave existe no objeto de totais da ação
        if (typeof lastAction.totals[key] !== 'undefined') {
            cumulativeTotals[key] -= lastAction.totals[key];
        }
    }
    // Remove os agentes da última ação
    processedAgents = processedAgents.filter(agent => !lastAction.agents.includes(agent));

    updateDisplay(); // Atualiza a tela para refletir o estado restaurado
}

// Função única para atualizar TODA a informação na tela
function updateDisplay() {
    const outputTextarea = document.getElementById('report-output');
    const reportCountSpan = document.getElementById('report-count');
    const agentListSpan = document.getElementById('agent-list');

    // --- ATUALIZA CONTADOR E LISTA DE AGENTES ---
    const teamsInField = processedAgents.length;
    reportCountSpan.textContent = teamsInField;
    agentListSpan.textContent = teamsInField > 0 ? processedAgents.join(', ') : 'Nenhum';
    
    // --- HABILITA/DESABILITA O BOTÃO DE DESFAZER ---
    document.getElementById('undo-button').disabled = history.length === 0;

    // --- MONTA O RELATÓRIO FINAL ---
    const today = new Date();
    const day = String(today.getDate()).padStart(2, '0');
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const year = String(today.getFullYear()).slice(-2);
    const reportDate = `${day}/${month}/${year}`;

    const finalReport = `*GERAL DO DIA ${reportDate}*
*Van 2 Diego Muniz*

*IMÓVEIS VISITADOS:* ${cumulativeTotals.imoveisVisitados}

*AUTODECLARADO:* ${cumulativeTotals.autodeclarado}

*CONEXÃO CALÇADA:* ${cumulativeTotals.conexaoCalcada}

*SOLICITAÇÃO 065:* ${cumulativeTotals.solicitacao65}

*REDE POTENCIAL:* ${cumulativeTotals.redePotencial}

*DRENAGEM:* ${cumulativeTotals.drenagem}
 
*CADASTRO:* ${cumulativeTotals.cadastro}

*EQUIPES EM CAMPO:* ${teamsInField}`;

    outputTextarea.value = finalReport;
}