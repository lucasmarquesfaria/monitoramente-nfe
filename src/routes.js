const express = require('express');
const nfeController = require('./nfeController');
const sefazMonitorController = require('./sefazMonitorController');
const sefazMonitorService = require('./sefazMonitorService');

const router = express.Router();

router.get('/nfe/:chaveAcesso/consultar', nfeController.consultarNfe);
router.get('/nfe/:chaveAcesso', nfeController.obterDetalhesNfe);
router.get('/nfe/:chaveAcesso/xml', nfeController.obterXmlNfe);
router.post('/nfe/:chaveAcesso/salvar-xml', nfeController.salvarXmlNfe);
router.get('/nfes', nfeController.listarNfes);

router.get('/status-sefaz-mg', sefazMonitorController.obterStatusSefaz);
router.get('/status-sefaz-mg/verificar', sefazMonitorController.verificarStatusSefaz);
router.get('/status-sefaz-mg/historico', sefazMonitorController.obterHistoricoStatus);
router.post('/status-sefaz-mg/iniciar-monitoramento', sefazMonitorController.iniciarMonitoramento);
router.post('/status-sefaz-mg/parar-monitoramento', sefazMonitorController.pararMonitoramento);
router.get('/nfes-rejeitadas', sefazMonitorController.listarNfesRejeitadas);

router.get('/simular-status-sefaz-mg', (req, res) => {
  const status = sefazMonitorService.getSimulatedStatus();
  res.json(status);
});

router.post('/simular-status-sefaz-mg/toggle', (req, res) => {
  const novoStatus = sefazMonitorService.toggleSimulatedStatus();
  res.json({ 
    success: true, 
    online: novoStatus,
    message: `Status alterado para: ${novoStatus ? 'Online' : 'Offline'}`
  });
});

module.exports = router;