/**
 * Controlador do Monitor SEFAZ
 * Gerencia as operações relacionadas ao monitoramento do status do SEFAZ-MG
 */
const sefazMonitorService = require('./sefazMonitorService');

class SefazMonitorController {
  /**
   * Obtém o status atual do SEFAZ-MG
   * @param {Request} req - Requisição HTTP
   * @param {Response} res - Resposta HTTP
   */
  async obterStatusSefaz(req, res) {
    try {
      const status = await sefazMonitorService.obterStatusAtual();
      
      return this.enviarRespostaSucesso(res, {
        online: status.online,
        timestamp: status.timestamp,
        detalhes: status.detalhes || {}
      });
    } catch (error) {
      console.error('Erro ao obter status da SEFAZ MG:', error.message);
      return this.enviarRespostaErro(res, 'Erro ao obter o status da SEFAZ MG', error.message);
    }
  }

  /**
   * Verifica e atualiza o status atual do SEFAZ-MG
   * @param {Request} req - Requisição HTTP
   * @param {Response} res - Resposta HTTP
   */
  async verificarStatusSefaz(req, res) {
    try {
      const status = await sefazMonitorService.verificarStatusSefaz();
      
      return this.enviarRespostaSucesso(res, {
        online: status.online,
        timestamp: status.timestamp,
        detalhes: status.detalhes || {}
      });
    } catch (error) {
      console.error('Erro ao verificar status da SEFAZ MG:', error.message);
      return this.enviarRespostaErro(res, 'Erro ao verificar o status da SEFAZ MG', error.message);
    }
  }

  /**
   * Obtém o histórico de status do SEFAZ-MG
   * @param {Request} req - Requisição HTTP
   * @param {Response} res - Resposta HTTP
   */
  async obterHistoricoStatus(req, res) {
    try {
      const { limit = 20 } = req.query;
      const limitInt = this.validarLimite(limit);
      
      const historico = await sefazMonitorService.obterHistoricoStatus(limitInt);
      
      return this.enviarRespostaSucesso(res, { data: historico });
    } catch (error) {
      console.error('Erro ao obter histórico de status:', error.message);
      return this.enviarRespostaErro(res, 'Erro ao obter o histórico de status', error.message);
    }
  }

  /**
   * Inicia o monitoramento automático do status do SEFAZ
   * @param {Request} req - Requisição HTTP
   * @param {Response} res - Resposta HTTP
   */
  async iniciarMonitoramento(req, res) {
    try {
      const resultado = sefazMonitorService.iniciarMonitoramento();
      
      return this.enviarRespostaSucesso(res, {
        message: 'Monitoramento iniciado com sucesso',
        resultado
      });
    } catch (error) {
      console.error('Erro ao iniciar monitoramento:', error.message);
      return this.enviarRespostaErro(res, 'Erro ao iniciar o monitoramento', error.message);
    }
  }

  /**
   * Para o monitoramento automático do status do SEFAZ
   * @param {Request} req - Requisição HTTP
   * @param {Response} res - Resposta HTTP
   */
  async pararMonitoramento(req, res) {
    try {
      const resultado = sefazMonitorService.pararMonitoramento();
      
      return this.enviarRespostaSucesso(res, {
        message: 'Monitoramento interrompido com sucesso',
        resultado
      });
    } catch (error) {
      console.error('Erro ao parar monitoramento:', error.message);
      return this.enviarRespostaErro(res, 'Erro ao interromper o monitoramento', error.message);
    }
  }

  /**
   * Lista as NFes que foram rejeitadas
   * @param {Request} req - Requisição HTTP
   * @param {Response} res - Resposta HTTP
   */
  async listarNfesRejeitadas(req, res) {
    try {
      const { page = 1, limit = 10 } = req.query;
      
      const options = this.criarOpcoesPaginacao(page, limit);
      const resultado = await sefazMonitorService.obterNfesRejeitadas(options);
      
      // Verificar se há um erro no resultado
      if (resultado.erro) {
        console.warn('Aviso: Erro recuperado do serviço:', resultado.erro);
        // Nota: Não falamos completamente, retornamos dados parciais quando possível
      }
      
      return this.enviarRespostaSucesso(res, {
        data: resultado.dados || [],
        pagination: {
          page: resultado.pagina || 1,
          limit: options.limit,
          total: resultado.total || 0,
          pages: resultado.totalPaginas || 1
        },
        message: resultado.erro ? 'Dados parciais ou vazios devido a um erro' : null
      });
    } catch (error) {
      console.error('Erro ao listar NFes rejeitadas:', error.message);
      // Retornamos uma resposta de sucesso com dados vazios para manter a compatibilidade com a UI
      return this.enviarRespostaStatusSeguro(res, {
        data: [],
        pagination: {
          page: 1,
          limit: parseInt(req.query.limit || 10),
          total: 0,
          pages: 1
        },
        error: 'Erro ao carregar dados. Por favor, tente novamente.'
      });
    }
  }
  
  // --- Métodos auxiliares ---
  
  /**
   * Envia uma resposta de sucesso padronizada
   * @param {Response} res - Resposta HTTP
   * @param {Object} data - Dados a serem incluídos na resposta
   */
  enviarRespostaSucesso(res, data) {
    return res.status(200).json({
      success: true,
      ...data
    });
  }
  
  /**
   * Envia uma resposta de erro padronizada
   * @param {Response} res - Resposta HTTP
   * @param {string} mensagem - Mensagem de erro
   * @param {string} detalhes - Detalhes do erro
   */
  enviarRespostaErro(res, mensagem, detalhes) {
    return res.status(500).json({
      success: false,
      error: mensagem,
      details: detalhes
    });
  }
  
  /**
   * Envia uma resposta com status de sucesso mesmo em caso de erro
   * Útil para manter a compatibilidade com a UI quando ocorrem erros não críticos
   * @param {Response} res - Resposta HTTP
   * @param {Object} data - Dados a serem incluídos na resposta
   */
  enviarRespostaStatusSeguro(res, data) {
    return res.status(200).json({
      success: true,
      ...data
    });
  }
  
  /**
   * Valida e converte o parâmetro de limite para um inteiro
   * @param {string|number} limit - Valor do limite
   * @returns {number} - Valor do limite como inteiro
   */
  validarLimite(limit) {
    const limitInt = parseInt(limit);
    return isNaN(limitInt) ? 20 : limitInt;
  }
  
  /**
   * Cria objeto de opções para paginação
   * @param {string|number} page - Número da página
   * @param {string|number} limit - Limite de itens por página
   * @returns {Object} - Opções de paginação
   */
  criarOpcoesPaginacao(page, limit) {
    const pageInt = parseInt(page) || 1;
    const limitInt = parseInt(limit) || 10;
    
    return {
      limit: limitInt,
      offset: (pageInt - 1) * limitInt
    };
  }
}

module.exports = new SefazMonitorController();