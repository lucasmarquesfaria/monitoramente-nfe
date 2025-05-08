/**
 * Configuração das rotas da API
 * Organiza e expõe os endpoints disponíveis no sistema
 */
const express = require('express');
const nfeController = require('./nfeController');
const sefazMonitorController = require('./sefazMonitorController');
const sefazMonitorService = require('./sefazMonitorService');

const router = express.Router();

/**
 * Rotas para gerenciamento de NFes
 */
// Operações de consulta
router.get('/nfe/:chaveAcesso/consultar', nfeController.consultarNfe);
router.get('/nfe/:chaveAcesso', nfeController.obterDetalhesNfe);
router.get('/nfes', nfeController.listarNfes);

// Operações com XML
router.get('/nfe/:chaveAcesso/xml', nfeController.obterXmlNfe);
router.post('/nfe/:chaveAcesso/salvar-xml', nfeController.salvarXmlNfe);

/**
 * Rotas para monitoramento do SEFAZ
 */
// Status do SEFAZ-MG
router.get('/status-sefaz-mg', sefazMonitorController.obterStatusSefaz);
router.get('/status-sefaz-mg/verificar', sefazMonitorController.verificarStatusSefaz);
router.get('/status-sefaz-mg/historico', sefazMonitorController.obterHistoricoStatus);

// Controle de monitoramento
router.post('/status-sefaz-mg/iniciar-monitoramento', sefazMonitorController.iniciarMonitoramento);
router.post('/status-sefaz-mg/parar-monitoramento', sefazMonitorController.pararMonitoramento);

// NFes rejeitadas
router.get('/nfes-rejeitadas', sefazMonitorController.listarNfesRejeitadas);

/**
 * Rotas para simulação (ambiente de desenvolvimento)
 */
// Simulação de status do SEFAZ-MG
router.get('/simular-status-sefaz-mg', (req, res) => {
  const status = sefazMonitorService.getSimulatedStatus();
  res.json(status);
});

// Alternar status simulado
router.post('/simular-status-sefaz-mg/toggle', (req, res) => {
  const novoStatus = sefazMonitorService.toggleSimulatedStatus();
  res.json({ 
    success: true, 
    online: novoStatus,
    message: `Status alterado para: ${novoStatus ? 'Online' : 'Offline'}`
  });
});

module.exports = router;