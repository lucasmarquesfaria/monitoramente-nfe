const sefazMonitorService = require('./sefazMonitorService');

class SefazMonitorController {
  async obterStatusSefaz(req, res) {
    try {
      const status = await sefazMonitorService.obterStatusAtual();
      
      return res.status(200).json({
        success: true,
        online: status.online,
        timestamp: status.timestamp,
        detalhes: status.detalhes || {}
      });
    } catch (error) {
      console.error('Erro ao obter status da SEFAZ MG:', error.message);
      return res.status(500).json({
        success: false,
        error: 'Erro ao obter o status da SEFAZ MG',
        details: error.message
      });
    }
  }

  async verificarStatusSefaz(req, res) {
    try {
      const status = await sefazMonitorService.verificarStatusSefaz();
      
      return res.status(200).json({
        success: true,
        online: status.online,
        timestamp: status.timestamp,
        detalhes: status.detalhes || {}
      });
    } catch (error) {
      console.error('Erro ao verificar status da SEFAZ MG:', error.message);
      return res.status(500).json({
        success: false,
        error: 'Erro ao verificar o status da SEFAZ MG',
        details: error.message
      });
    }
  }

  async obterHistoricoStatus(req, res) {
    try {
      const { limit = 20 } = req.query;
      
      const historico = await sefazMonitorService.obterHistoricoStatus(parseInt(limit));
      
      return res.status(200).json({
        success: true,
        data: historico
      });
    } catch (error) {
      console.error('Erro ao obter histórico de status:', error.message);
      return res.status(500).json({
        success: false,
        error: 'Erro ao obter o histórico de status',
        details: error.message
      });
    }
  }

  async iniciarMonitoramento(req, res) {
    try {
      const resultado = sefazMonitorService.iniciarMonitoramento();
      
      return res.status(200).json({
        success: true,
        message: 'Monitoramento iniciado com sucesso',
        resultado
      });
    } catch (error) {
      console.error('Erro ao iniciar monitoramento:', error.message);
      return res.status(500).json({
        success: false,
        error: 'Erro ao iniciar o monitoramento',
        details: error.message
      });
    }
  }

  async pararMonitoramento(req, res) {
    try {
      const resultado = sefazMonitorService.pararMonitoramento();
      
      return res.status(200).json({
        success: true,
        message: 'Monitoramento interrompido com sucesso',
        resultado
      });
    } catch (error) {
      console.error('Erro ao parar monitoramento:', error.message);
      return res.status(500).json({
        success: false,
        error: 'Erro ao interromper o monitoramento',
        details: error.message
      });
    }
  }

  async listarNfesRejeitadas(req, res) {
    try {
      const { page = 1, limit = 10 } = req.query;
      
      const offset = (parseInt(page) - 1) * parseInt(limit);
      const options = {
        limit: parseInt(limit),
        offset: offset
      };
      
      const resultado = await sefazMonitorService.obterNfesRejeitadas(options);
      
      return res.status(200).json({
        success: true,
        data: resultado.dados,
        pagination: {
          page: resultado.pagina,
          limit: options.limit,
          total: resultado.total,
          pages: resultado.totalPaginas
        }
      });
    } catch (error) {
      console.error('Erro ao listar NFes rejeitadas:', error.message);
      return res.status(500).json({
        success: false,
        error: 'Erro ao listar NFes rejeitadas',
        details: error.message
      });
    }
  }
}

module.exports = new SefazMonitorController();