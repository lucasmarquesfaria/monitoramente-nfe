const nfeService = require('./nfeService');
const fs = require('fs').promises;
const path = require('path');

class NfeController {
  async consultarNfe(req, res) {
    try {
      const { chaveAcesso } = req.params;
      
      if (!chaveAcesso) {
        return res.status(400).json({ 
          success: false, 
          error: 'Chave de acesso não fornecida' 
        });
      }
      
      const resultado = await nfeService.consultarNfe(chaveAcesso);
      
      if (resultado.success) {
        return res.status(200).json(resultado);
      } else {
        return res.status(400).json(resultado);
      }
    } catch (error) {
      console.error('Erro ao processar consulta de NFe:', error.message);
      return res.status(500).json({ 
        success: false, 
        error: 'Erro ao processar a consulta',
        details: error.message
      });
    }
  }
  
  async obterDetalhesNfe(req, res) {
    try {
      const { chaveAcesso } = req.params;
      
      const nfe = await nfeService.buscarNfePorChave(chaveAcesso);
      
      if (!nfe) {
        return res.status(404).json({ 
          success: false, 
          error: 'NFe não encontrada no banco de dados' 
        });
      }
      
      const { xml_conteudo, ...nfeDados } = nfe;
      
      return res.status(200).json({ 
        success: true, 
        data: nfeDados 
      });
    } catch (error) {
      console.error('Erro ao obter detalhes da NFe:', error.message);
      return res.status(500).json({ 
        success: false, 
        error: 'Erro ao obter detalhes',
        details: error.message
      });
    }
  }
  
  async obterXmlNfe(req, res) {
    try {
      const { chaveAcesso } = req.params;
      
      const xmlContent = await nfeService.gerarArquivoXml(chaveAcesso);
      
      if (!xmlContent) {
        return res.status(404).json({ 
          success: false, 
          error: 'XML da NFe não encontrado' 
        });
      }
      
      res.setHeader('Content-Type', 'application/xml');
      res.setHeader('Content-Disposition', `attachment; filename="nfe-${chaveAcesso}.xml"`);
      
      return res.send(xmlContent);
    } catch (error) {
      console.error('Erro ao obter XML da NFe:', error.message);
      return res.status(500).json({ 
        success: false, 
        error: 'Erro ao obter o XML',
        details: error.message
      });
    }
  }
  
  async salvarXmlNfe(req, res) {
    try {
      const { chaveAcesso } = req.params;
      const { diretorio } = req.body;
      
      const defaultDir = path.join(process.cwd(), 'xml_files');
      const targetDir = diretorio || defaultDir;
      
      await fs.mkdir(targetDir, { recursive: true });
      
      const xmlContent = await nfeService.gerarArquivoXml(chaveAcesso);
      
      if (!xmlContent) {
        return res.status(404).json({ 
          success: false, 
          error: 'XML da NFe não encontrado' 
        });
      }
      
      const filePath = path.join(targetDir, `nfe-${chaveAcesso}.xml`);
      await fs.writeFile(filePath, xmlContent);
      
      return res.status(200).json({ 
        success: true, 
        message: 'XML salvo com sucesso',
        filePath: filePath
      });
    } catch (error) {
      console.error('Erro ao salvar XML da NFe:', error.message);
      return res.status(500).json({ 
        success: false, 
        error: 'Erro ao salvar o XML',
        details: error.message
      });
    }
  }
  
  async listarNfes(req, res) {
    let connection;
    try {
      const { page = 1, limit = 10 } = req.query;
      
      const offset = (parseInt(page) - 1) * parseInt(limit);
      
      connection = await require('../database/connection').createConnection();
      
      const [rows] = await connection.execute(
        `SELECT id, chave, numero, serie, data_emissao, valor_total, 
         emitente_cnpj, emitente_nome, destinatario_cnpj, destinatario_nome, 
         status, data_consulta 
         FROM nfes ORDER BY data_consulta DESC LIMIT ? OFFSET ?`,
        [parseInt(limit), offset]
      );
      
      const [countResult] = await connection.execute('SELECT COUNT(*) AS total FROM nfes');
      const total = countResult[0].total;
      
      return res.status(200).json({
        success: true,
        data: rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: total,
          pages: Math.ceil(total / parseInt(limit))
        }
      });
    } catch (error) {
      console.error('Erro ao listar NFes:', error.message);
      return res.status(500).json({ 
        success: false, 
        error: 'Erro ao listar NFes',
        details: error.message
      });
    } finally {
      if (connection) {
        await connection.end();
      }
    }
  }
}

module.exports = new NfeController();