const API_BASE_URL = '/api';
const STATUS_CHECK_INTERVAL = 5 * 60 * 1000;

const statusIndicator = document.getElementById('status-indicator');
const lastCheck = document.getElementById('last-check');
const statusHistoryElement = document.getElementById('status-history');
const refreshStatusBtn = document.getElementById('refresh-status');
const toggleStatusBtn = document.getElementById('toggle-status-btn');
const nfeForm = document.getElementById('nfe-form');
const chaveNfeInput = document.getElementById('chave-nfe');
const resultadoContainer = document.getElementById('resultado-container');
const resultadoContent = document.getElementById('resultado-content');
const rejeicoesTable = document.getElementById('rejeicoes-table');
const nfeDetailModalElement = document.getElementById('nfeDetailModal');
const modalContent = document.getElementById('modal-content');
const btnDownloadXml = document.getElementById('btn-download-xml');
const navLinks = document.querySelectorAll('.navbar-nav .nav-link');

let currentNfeChave = '';
let statusCheckInterval = null;
let statusHistory = [];
let nfeDetailModal = null;

document.addEventListener('DOMContentLoaded', () => {
    if (nfeDetailModalElement) {
        nfeDetailModal = new bootstrap.Modal(nfeDetailModalElement);
    }
    
    carregarHistoricoLocal();
    inicializarApp();
    configurarNavegacaoMenu();
});

async function inicializarApp() {
    await verificarStatusSefaz();
    
    statusCheckInterval = setInterval(verificarStatusSefaz, STATUS_CHECK_INTERVAL);
    
    await carregarHistoricoRejeicoes();
    
    if (refreshStatusBtn) {
        refreshStatusBtn.addEventListener('click', verificarStatusSefaz);
    }
    
    if (toggleStatusBtn) {
        toggleStatusBtn.addEventListener('click', alternarStatusSimulado);
    }
    
    if (nfeForm) {
        nfeForm.addEventListener('submit', handleConsultaNfe);
    }
    
    if (chaveNfeInput) {
        chaveNfeInput.addEventListener('input', function() {
            this.value = this.value.replace(/\D/g, '').substring(0, 44);
        });
    }
}

function configurarNavegacaoMenu() {
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            
            const navbarCollapse = document.getElementById('navbarNav');
            if (navbarCollapse && navbarCollapse.classList.contains('show')) {
                const bsCollapse = new bootstrap.Collapse(navbarCollapse);
                bsCollapse.hide();
            }
            
            const targetId = this.getAttribute('href').substring(1);
            const targetElement = document.getElementById(targetId);
            
            if (targetElement) {
                window.scrollTo({
                    top: targetElement.offsetTop - 70,
                    behavior: 'smooth'
                });
                
                navLinks.forEach(navLink => navLink.classList.remove('active'));
                this.classList.add('active');
            }
        });
    });
}

async function verificarStatusSefaz() {
    try {
        if (!statusIndicator) return false;
        
        statusIndicator.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Verificando...';
        
        // Adicionar timeout para a requisição fetch
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 segundos de timeout
        
        const response = await fetch(`${API_BASE_URL}/status-sefaz-mg/verificar`, {
            signal: controller.signal,
            headers: {
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            }
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            let errorData;
            try {
                errorData = await response.json();
            } catch (parseError) {
                throw new Error(`Erro de rede: ${response.status}`);
            }
            throw new Error(errorData.error || `Erro ao verificar status (${response.status})`);
        }
        
        const data = await response.json();
        
        // Aceitar resposta mesmo que success não seja true, contanto que tenha o campo online
        if (data.online === undefined && !data.success) {
            throw new Error(data.error || 'Resposta inválida do servidor');
        }
        
        console.log('Status SEFAZ recebido:', data);
        
        // Sempre usar o campo online da resposta, independente do campo success
        const online = Boolean(data.online);
        
        const statusClass = online ? 'status-online' : 'status-offline';
        const statusText = online ? 'Online - Sistema Operacional' : 'Offline - Sistema Indisponível';
        const statusIcon = online ? 'check-circle' : 'times-circle';
        
        statusIndicator.className = `status-badge ${statusClass}`;
        statusIndicator.innerHTML = `<i class="fas fa-${statusIcon} me-2"></i>${statusText}`;
        
        const agora = new Date();
        if (lastCheck) {
            lastCheck.textContent = formatarDataHora(agora);
        }
        
        adicionarEntradaHistorico(online ? 'online' : 'offline', agora);
        salvarHistoricoLocal();
        
        // Atualiza o histórico do servidor
        await atualizarHistoricoStatus().catch(err => {
            console.warn('Erro ao atualizar histórico, usando dados locais:', err.message);
        });
        
        return online;
    } catch (error) {
        console.error('Erro ao verificar status SEFAZ:', error);
        
        if (statusIndicator) {
            statusIndicator.className = 'status-badge status-warning';
            statusIndicator.innerHTML = '<i class="fas fa-exclamation-triangle me-2"></i>Erro ao verificar status';
        }
        
        // Em caso de erro, usa o último status conhecido do histórico local (se disponível)
        if (statusHistory.length > 0) {
            const ultimoStatus = statusHistory[0].status === 'online';
            return ultimoStatus;
        }
        
        // Se não houver histórico, assume online para evitar alarmes falsos
        return true;
    }
}

async function alternarStatusSimulado() {
    try {
        if (!toggleStatusBtn) return;
        
        toggleStatusBtn.disabled = true;
        toggleStatusBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Alterando...';
        
        const response = await fetch(`${API_BASE_URL}/simular-status-sefaz-mg/toggle`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache'
            }
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Erro ao alternar status');
        }
        
        // Forçar atualizações imediatas na interface
        const online = Boolean(data.online);
        const statusClass = online ? 'status-online' : 'status-offline';
        const statusText = online ? 'Online - Sistema Operacional' : 'Offline - Sistema Indisponível';
        const statusIcon = online ? 'check-circle' : 'times-circle';
        
        if (statusIndicator) {
            statusIndicator.className = `status-badge ${statusClass}`;
            statusIndicator.innerHTML = `<i class="fas fa-${statusIcon} me-2"></i>${statusText}`;
        }
        
        // Adiciona ao histórico local
        const agora = new Date();
        adicionarEntradaHistorico(online ? 'online' : 'offline', agora);
        salvarHistoricoLocal();
        
        // Atualiza último horário de verificação
        if (lastCheck) {
            lastCheck.textContent = formatarDataHora(agora);
        }
        
        // Atualizar o histórico de status
        setTimeout(() => {
            atualizarHistoricoStatus().catch(err => {
                console.warn('Erro ao atualizar histórico após alternar status:', err);
            });
        }, 500);
        
        alert(`Status alterado com sucesso para: ${online ? 'Online' : 'Offline'}`);
    } catch (error) {
        console.error('Erro ao alternar status:', error);
        alert('Erro ao alternar status: ' + error.message);
    } finally {
        if (toggleStatusBtn) {
            toggleStatusBtn.disabled = false;
            toggleStatusBtn.innerHTML = '<i class="fas fa-exchange-alt me-2"></i>Alternar Status (Simulação)';
        }
    }
}

function adicionarEntradaHistorico(status, data) {
    statusHistory.unshift({
        status,
        timestamp: data.getTime()
    });
    
    if (statusHistory.length > 20) {
        statusHistory = statusHistory.slice(0, 20);
    }
    
    renderizarHistorico();
}

function renderizarHistorico() {
    if (!statusHistoryElement) return;
    
    if (statusHistory.length === 0) {
        statusHistoryElement.innerHTML = '<div class="text-center py-3">Nenhum registro de status disponível</div>';
        return;
    }
    
    const html = statusHistory.map(item => {
        const statusClass = item.status;
        const statusText = item.status === 'online' 
            ? 'Sistema Online' 
            : (item.status === 'offline' ? 'Sistema Offline' : 'Status Desconhecido');
        const icon = item.status === 'online' 
            ? 'check-circle' 
            : (item.status === 'offline' ? 'times-circle' : 'question-circle');
        
        return `
            <div class="status-item ${statusClass}">
                <i class="fas fa-${icon} me-2"></i>
                <strong>${statusText}</strong>
                <div class="status-time">${formatarDataHora(new Date(item.timestamp))}</div>
            </div>
        `;
    }).join('');
    
    statusHistoryElement.innerHTML = html;
}

async function handleConsultaNfe(e) {
    e.preventDefault();
    
    const chaveAcesso = chaveNfeInput.value.trim();
    
    if (!/^\d{44}$/.test(chaveAcesso)) {
        exibirMensagem('erro', 'Chave de acesso inválida. Deve conter exatamente 44 dígitos numéricos.');
        return;
    }
    
    try {
        resultadoContainer.classList.remove('d-none');
        resultadoContent.innerHTML = `
            <div class="text-center py-4">
                <div class="spinner-border text-primary" role="status"></div>
                <p class="mt-2">Consultando NFe...</p>
            </div>
        `;
        
        const response = await fetch(`${API_BASE_URL}/nfe/${chaveAcesso}/consultar`);
        const data = await response.json();
        
        if (!response.ok || !data.success) {
            throw new Error(data.error || 'Erro ao consultar NFe');
        }
        
        currentNfeChave = chaveAcesso;
        
        renderizarResultadoNfe(data.data);
        
        if (data.data.status === 'REJEITADA') {
            await carregarHistoricoRejeicoes();
        }
        
    } catch (error) {
        console.error('Erro na consulta de NFe:', error);
        resultadoContent.innerHTML = `
            <div class="alert alert-danger">
                <i class="fas fa-exclamation-circle me-2"></i>
                ${error.message || 'Erro ao consultar NFe. Tente novamente.'}
            </div>
        `;
    }
}

function renderizarResultadoNfe(nfe) {
    const statusClass = getStatusClass(nfe.status);
    const statusLabel = getStatusLabel(nfe.status);
    
    resultadoContent.innerHTML = `
        <div class="nfe-card">
            <div class="nfe-card-header d-flex justify-content-between align-items-center">
                <div>NFe ${nfe.numero}/${nfe.serie}</div>
                <div class="nfe-status ${statusClass}">${statusLabel}</div>
            </div>
            <div class="nfe-card-body">
                <div class="row">
                    <div class="col-md-6">
                        <div class="detail-row">
                            <div class="detail-label">Chave de Acesso:</div>
                            <div>${formatarChaveNfe(nfe.chave)}</div>
                        </div>
                        <div class="detail-row">
                            <div class="detail-label">Data de Emissão:</div>
                            <div>${formatarDataHora(new Date(nfe.dataEmissao))}</div>
                        </div>
                        <div class="detail-row">
                            <div class="detail-label">Valor Total:</div>
                            <div>R$ ${parseFloat(nfe.valorTotal).toFixed(2).replace('.', ',')}</div>
                        </div>
                    </div>
                    <div class="col-md-6">
                        <div class="detail-row">
                            <div class="detail-label">Emitente:</div>
                            <div>${nfe.emitenteNome}<br>CNPJ: ${formatarCnpj(nfe.emitenteCnpj)}</div>
                        </div>
                        <div class="detail-row">
                            <div class="detail-label">Destinatário:</div>
                            <div>${nfe.destinatarioNome}<br>CNPJ: ${formatarCnpj(nfe.destinatarioCnpj)}</div>
                        </div>
                    </div>
                </div>
                
                ${nfe.status === 'REJEITADA' ? renderizarDetalhesRejeicao(nfe) : ''}
                
                <div class="d-flex justify-content-end mt-3">
                    <button class="btn btn-primary btn-sm" onclick="mostrarDetalhesNfe('${nfe.chave}')">
                        <i class="fas fa-search-plus me-2"></i>Ver Detalhes Completos
                    </button>
                </div>
            </div>
        </div>
    `;
}

function renderizarDetalhesRejeicao(nfe) {
    return `
        <div class="alert alert-danger mt-3">
            <h5 class="alert-heading">
                <i class="fas fa-exclamation-triangle me-2"></i>NFe Rejeitada
            </h5>
            <hr>
            <p><strong>Motivo da Rejeição:</strong> ${nfe.motivoRejeicao || 'Não informado'}</p>
            <p><strong>Data da Rejeição:</strong> ${formatarDataHora(new Date(nfe.dataRejeicao || nfe.dataConsulta))}</p>
            <p class="mb-0"><strong>Código:</strong> ${nfe.codigoRejeicao || 'N/A'}</p>
        </div>
    `;
}

async function carregarHistoricoRejeicoes() {
    try {
        if (!rejeicoesTable) {
            console.warn('Elemento de tabela de rejeições não encontrado');
            return;
        }

        rejeicoesTable.innerHTML = `
            <tr>
                <td colspan="5" class="text-center py-3">
                    <span class="spinner-border spinner-border-sm"></span> Carregando histórico de rejeições...
                </td>
            </tr>
        `;
        
        const response = await fetch(`${API_BASE_URL}/nfes-rejeitadas`);
        
        // Verificar se houve falha na requisição HTTP
        if (!response.ok) {
            // Tentar analisar a resposta mesmo em caso de erro HTTP
            let errorData;
            try {
                errorData = await response.json();
            } catch (parseErr) {
                throw new Error(`Erro HTTP: ${response.status}`);
            }
            throw new Error(errorData.error || `Erro ao carregar histórico (${response.status})`);
        }
        
        const data = await response.json();
        
        // Sempre verifique se a propriedade data existe, mesmo que success seja true
        if (!data || !data.data) {
            throw new Error('Resposta sem dados recebida do servidor');
        }
        
        console.log('Dados de rejeições recebidos:', data);
        renderizarTabelaRejeicoes(data.data);
        
    } catch (error) {
        console.error('Erro ao carregar histórico de rejeições:', error);
        if (rejeicoesTable) {
            rejeicoesTable.innerHTML = `
                <tr>
                    <td colspan="5" class="text-center py-3">
                        <div class="alert alert-danger mb-0">
                            <i class="fas fa-exclamation-circle me-2"></i>
                            Erro ao carregar histórico de rejeições: ${error.message}. 
                            <button class="btn btn-sm btn-outline-danger ms-2" onclick="carregarHistoricoRejeicoes()">
                                Tentar novamente
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }
    }
}

function renderizarTabelaRejeicoes(rejeicoes) {
    if (!rejeicoes || rejeicoes.length === 0) {
        rejeicoesTable.innerHTML = `
            <tr>
                <td colspan="5" class="text-center py-3">
                    <i class="fas fa-info-circle me-2 text-info"></i>
                    Nenhuma rejeição encontrada no histórico.
                </td>
            </tr>
        `;
        return;
    }
    
    rejeicoesTable.innerHTML = rejeicoes.map(nfe => `
        <tr>
            <td>${formatarDataHora(new Date(nfe.dataRejeicao || nfe.dataConsulta))}</td>
            <td>${formatarChaveNfe(nfe.chave, true)}</td>
            <td><span class="badge bg-danger">Rejeitada</span></td>
            <td>${nfe.motivoRejeicao || 'Não informado'}</td>
            <td>
                <button class="btn btn-sm btn-primary" onclick="mostrarDetalhesNfe('${nfe.chave}')">
                    <i class="fas fa-search me-1"></i> Detalhes
                </button>
            </td>
        </tr>
    `).join('');
}

async function mostrarDetalhesNfe(chaveAcesso) {
    try {
        modalContent.innerHTML = `
            <div class="text-center py-4">
                <div class="spinner-border text-primary" role="status"></div>
                <p class="mt-2">Carregando detalhes...</p>
            </div>
        `;
        
        nfeDetailModal.show();
        
        const response = await fetch(`${API_BASE_URL}/nfe/${chaveAcesso}`);
        const data = await response.json();
        
        if (!response.ok || !data.success) {
            throw new Error(data.error || 'Erro ao buscar detalhes');
        }
        
        currentNfeChave = chaveAcesso;
        
        renderizarDetalhesModal(data.data);
        
    } catch (error) {
        console.error('Erro ao buscar detalhes da NFe:', error);
        modalContent.innerHTML = `
            <div class="alert alert-danger">
                <i class="fas fa-exclamation-circle me-2"></i>
                Erro ao carregar detalhes da NFe. Tente novamente.
            </div>
        `;
    }
}

function renderizarDetalhesModal(nfe) {
    const statusClass = getStatusClass(nfe.status);
    const statusLabel = getStatusLabel(nfe.status);
    
    modalContent.innerHTML = `
        <div class="mb-3 d-flex justify-content-between align-items-center">
            <h5>NFe ${nfe.numero}/${nfe.serie}</h5>
            <div class="nfe-status ${statusClass}">${statusLabel}</div>
        </div>
        
        <div class="row mb-4">
            <div class="col-md-6">
                <div class="detail-row">
                    <div class="detail-label">Chave de Acesso:</div>
                    <div>${formatarChaveNfe(nfe.chave)}</div>
                </div>
                <div class="detail-row">
                    <div class="detail-label">Data de Emissão:</div>
                    <div>${formatarDataHora(new Date(nfe.dataEmissao))}</div>
                </div>
                <div class="detail-row">
                    <div class="detail-label">Data da Consulta:</div>
                    <div>${formatarDataHora(new Date(nfe.dataConsulta))}</div>
                </div>
                <div class="detail-row">
                    <div class="detail-label">Valor Total:</div>
                    <div>R$ ${parseFloat(nfe.valorTotal).toFixed(2).replace('.', ',')}</div>
                </div>
            </div>
            <div class="col-md-6">
                <div class="detail-row">
                    <div class="detail-label">Emitente:</div>
                    <div>${nfe.emitenteNome}<br>CNPJ: ${formatarCnpj(nfe.emitenteCnpj)}</div>
                </div>
                <div class="detail-row">
                    <div class="detail-label">Destinatário:</div>
                    <div>${nfe.destinatarioNome}<br>CNPJ: ${formatarCnpj(nfe.destinatarioCnpj)}</div>
                </div>
            </div>
        </div>
        
        ${nfe.status === 'REJEITADA' ? renderizarDetalhesRejeicao(nfe) : ''}
    `;
    
    btnDownloadXml.onclick = () => {
        window.location.href = `${API_BASE_URL}/nfe/${nfe.chave}/xml`;
    };
}

function formatarDataHora(data) {
    return data.toLocaleString('pt-BR');
}

function formatarChaveNfe(chave, resumida = false) {
    if (resumida) {
        return chave.substring(0, 11) + '...' + chave.substring(chave.length - 11);
    }
    
    return chave.replace(/(.{4})/g, '$1 ').trim();
}

function formatarCnpj(cnpj) {
    if (!cnpj) return 'N/A';
    return cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

function getStatusClass(status) {
    switch (status) {
        case 'PROCESSADA':
        case 'AUTORIZADA':
            return 'aprovada';
        case 'REJEITADA':
            return 'rejeitada';
        default:
            return 'processando';
    }
}

function getStatusLabel(status) {
    switch (status) {
        case 'PROCESSADA':
        case 'AUTORIZADA':
            return 'Aprovada';
        case 'REJEITADA':
            return 'Rejeitada';
        default:
            return 'Processando';
    }
}

function exibirMensagem(tipo, mensagem) {
    resultadoContainer.classList.remove('d-none');
    
    const alertClass = tipo === 'erro' ? 'alert-danger' : 
                       tipo === 'sucesso' ? 'alert-success' : 
                       'alert-info';
    
    const icon = tipo === 'erro' ? 'exclamation-circle' : 
                 tipo === 'sucesso' ? 'check-circle' : 
                 'info-circle';
    
    resultadoContent.innerHTML = `
        <div class="alert ${alertClass}">
            <i class="fas fa-${icon} me-2"></i>
            ${mensagem}
        </div>
    `;
}

function salvarHistoricoLocal() {
    try {
        localStorage.setItem('statusHistory', JSON.stringify(statusHistory));
    } catch (error) {
        console.error('Erro ao salvar histórico no localStorage:', error);
    }
}

function carregarHistoricoLocal() {
    try {
        const salvo = localStorage.getItem('statusHistory');
        if (salvo) {
            statusHistory = JSON.parse(salvo);
            renderizarHistorico();
        }
    } catch (error) {
        console.error('Erro ao carregar histórico do localStorage:', error);
        statusHistory = [];
    }
}

async function atualizarHistoricoStatus() {
    try {
        if (!statusHistoryElement) return;
        
        const response = await fetch(`${API_BASE_URL}/status-sefaz-mg/historico?limit=20`);
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Erro ao obter histórico de status (${response.status})`);
        }
        
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.error || 'Erro ao obter histórico de status');
        }
        
        // Atualiza histórico de status com dados do servidor
        if (data.data && data.data.length > 0) {
            console.log('Histórico de status recebido do servidor:', data.data);
            
            // Atualiza o histórico local com os dados do servidor
            const historicoServidor = data.data.map(item => ({
                status: item.online ? 'online' : 'offline',
                timestamp: new Date(item.timestamp).getTime()
            }));
            
            // Mescla histórico do servidor com o histórico local
            statusHistory = [...historicoServidor];
            
            // Limita o número de entradas no histórico
            if (statusHistory.length > 20) {
                statusHistory = statusHistory.slice(0, 20);
            }
            
            // Atualiza a exibição e salva o histórico local
            renderizarHistorico();
            salvarHistoricoLocal();
        }
    } catch (error) {
        console.error('Erro ao atualizar histórico de status:', error);
    }
}

window.mostrarDetalhesNfe = mostrarDetalhesNfe;