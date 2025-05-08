/**
 * Controlador de Nota Fiscal Eletrônica
 * Responsável por gerenciar as rotas relacionadas a NFes
 */
const nfeService = require('./nfeService');
const fs = require('fs').promises;
const path = require('path');
const { executeQuery } = require('../database/connection');

class NfeController {
  /**
   * Consulta uma NFe pela sua chave de acesso
   * @param {Request} req - Requisição HTTP
   * @param {Response} res - Resposta HTTP
   */
  async consultarNfe(req, res) {
    try {
      const { chaveAcesso } = req.params;
      
      if (!chaveAcesso) {
        return this.enviarRespostaErro(res, 400, 'Chave de acesso não fornecida');
      }
      
      const resultado = await nfeService.consultarNfe(chaveAcesso);
      
      if (resultado.success) {
        return res.status(200).json(resultado);
      } else {
        return res.status(400).json(resultado);
      }
    } catch (error) {
      console.error('Erro ao processar consulta de NFe:', error.message);
      return this.enviarRespostaErro(
        res, 
        500, 
        'Erro ao processar a consulta', 
        error.message
      );
    }
  }
  
  /**
   * Obtém os detalhes de uma NFe pela sua chave de acesso
   * @param {Request} req - Requisição HTTP
   * @param {Response} res - Resposta HTTP
   */
  async obterDetalhesNfe(req, res) {
    try {
      const { chaveAcesso } = req.params;
      const nfe = await nfeService.buscarNfePorChave(chaveAcesso);
      
      if (!nfe) {
        return this.enviarRespostaErro(res, 404, 'NFe não encontrada no banco de dados');
      }
      
      const { xml_conteudo, ...nfeDados } = nfe;
      
      return res.status(200).json({ success: true, data: nfeDados });
    } catch (error) {
      console.error('Erro ao obter detalhes da NFe:', error.message);
      return this.enviarRespostaErro(res, 500, 'Erro ao obter detalhes', error.message);
    }
  }
  
  /**
   * Obtém o arquivo XML de uma NFe
   * @param {Request} req - Requisição HTTP
   * @param {Response} res - Resposta HTTP
   */
  async obterXmlNfe(req, res) {
    try {
      const { chaveAcesso } = req.params;
      const xmlContent = await nfeService.gerarArquivoXml(chaveAcesso);
      
      if (!xmlContent) {
        return this.enviarRespostaErro(res, 404, 'XML da NFe não encontrado');
      }
      
      this.enviarArquivoXml(res, chaveAcesso, xmlContent);
    } catch (error) {
      console.error('Erro ao obter XML da NFe:', error.message);
      return this.enviarRespostaErro(res, 500, 'Erro ao obter o XML', error.message);
    }
  }
  
  /**
   * Salva o arquivo XML da NFe no sistema de arquivos
   * @param {Request} req - Requisição HTTP
   * @param {Response} res - Resposta HTTP
   */
  async salvarXmlNfe(req, res) {
    try {
      const { chaveAcesso } = req.params;
      const { diretorio } = req.body;
      
      const defaultDir = path.join(process.cwd(), 'xml_files');
      const targetDir = diretorio || defaultDir;
      
      await fs.mkdir(targetDir, { recursive: true });
      
      const xmlContent = await nfeService.gerarArquivoXml(chaveAcesso);
      
      if (!xmlContent) {
        return this.enviarRespostaErro(res, 404, 'XML da NFe não encontrado');
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
      return this.enviarRespostaErro(res, 500, 'Erro ao salvar o XML', error.message);
    }
  }
  
  /**
   * Lista as NFes disponíveis no banco de dados com paginação
   * @param {Request} req - Requisição HTTP
   * @param {Response} res - Resposta HTTP
   */
  async listarNfes(req, res) {
    try {
      const { page = 1, limit = 10 } = req.query;
      const result = await this.obterNfesPaginadas(page, limit);
      
      return res.status(200).json({
        success: true,
        data: result.rows,
        pagination: result.pagination
      });
    } catch (error) {
      console.error('Erro ao listar NFes:', error.message);
      return this.enviarRespostaErro(res, 500, 'Erro ao listar NFes', error.message);
    }
  }
  
  // --- Métodos auxiliares ---
  
  /**
   * Envia arquivo XML como resposta HTTP
   * @param {Response} res - Resposta HTTP
   * @param {string} chaveAcesso - Chave de acesso da NFe
   * @param {string} xmlContent - Conteúdo do arquivo XML
   */
  enviarArquivoXml(res, chaveAcesso, xmlContent) {
    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Content-Disposition', `attachment; filename="nfe-${chaveAcesso}.xml"`);
    return res.send(xmlContent);
  }
  
  /**
   * Estrutura padrão para respostas de erro
   * @param {Response} res - Resposta HTTP
   * @param {number} status - Código de status HTTP
   * @param {string} message - Mensagem de erro
   * @param {string} details - Detalhes do erro (opcional)
   */
  enviarRespostaErro(res, status, message, details = null) {
    return res.status(status).json({
      success: false,
      error: message,
      details: details
    });
  }
  
  /**
   * Busca NFes com paginação
   * @param {number} page - Número da página atual
   * @param {number} limit - Limite de resultados por página
   * @returns {Promise<Object>} Dados das NFes e informações de paginação
   */
  async obterNfesPaginadas(page, limit) {
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const limitInt = parseInt(limit);
    
    const query = `
      SELECT id, chave, numero, serie, data_emissao, valor_total, 
      emitente_cnpj, emitente_nome, destinatario_cnpj, destinatario_nome, 
      status, data_consulta 
      FROM nfes ORDER BY data_consulta DESC LIMIT ? OFFSET ?
    `;
    
    const rows = await executeQuery(query, [limitInt, offset]);
    const countResult = await executeQuery('SELECT COUNT(*) AS total FROM nfes');
    const total = countResult[0].total;
    
    return {
      rows,
      pagination: {
        page: parseInt(page),
        limit: limitInt,
        total: total,
        pages: Math.ceil(total / limitInt)
      }
    };
  }
}

module.exports = new NfeController();