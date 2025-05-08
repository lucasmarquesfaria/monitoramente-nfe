/**
 * Serviço de Nota Fiscal Eletrônica
 * Responsável por consultar, processar e gerenciar dados de NFEs
 */
const axios = require('axios');
const xml2js = require('xml2js');
const { executeQuery } = require('../database/connection');
const sefazMonitorService = require('./sefazMonitorService');

class NfeService {
  constructor() {
    this.parser = new xml2js.Parser({ explicitArray: false });
    this.baseUrl = process.env.API_NFE_URL || 'https://nfe.fazenda.mg.gov.br/nfe2/services';
  }

  /**
   * Consulta uma NFe pela chave de acesso
   * @param {string} chaveAcesso - Chave de acesso da NFe (44 dígitos)
   * @returns {Promise<Object>} Resultado da consulta com dados da NFe
   */
  async consultarNfe(chaveAcesso) {
    try {
      // Validar formato da chave de acesso
      if (!this.validarChaveAcesso(chaveAcesso)) {
        throw new Error('Chave de acesso inválida. Deve conter exatamente 44 dígitos numéricos.');
      }

      // Verificar se NFe já existe no banco de dados
      const nfeExistente = await this.buscarNfePorChave(chaveAcesso);
      if (nfeExistente) {
        return { 
          success: true, 
          data: this.converterNfeBancoDadosParaObjeto(nfeExistente),
          fromDatabase: true 
        };
      }
      
      // Consultar NFe na API da SEFAZ
      return await this.consultarNfeNaApi(chaveAcesso);
      
    } catch (error) {
      console.error('Erro ao consultar NFe:', error.message);
      return this.formatarRespostaErro(error);
    }
  }
  
  /**
   * Valida se a chave de acesso está no formato correto (44 dígitos numéricos)
   * @param {string} chaveAcesso - Chave de acesso para validar
   * @returns {boolean} Verdadeiro se a chave for válida
   */
  validarChaveAcesso(chaveAcesso) {
    return /^\d{44}$/.test(chaveAcesso);
  }
  
  /**
   * Consulta NFe diretamente na API da SEFAZ
   * @param {string} chaveAcesso - Chave de acesso da NFe
   * @returns {Promise<Object>} Resultados da consulta
   */
  async consultarNfeNaApi(chaveAcesso) {
    const resultado = await sefazMonitorService.requisitarSefaz('nfeConsultaProtocolo', {
      chaveAcesso: chaveAcesso
    }, 'post');
    
    if (!resultado.success) {
      throw new Error(resultado.error || 'Erro na consulta à API da SEFAZ');
    }
    
    const data = resultado.data;
    const xmlContent = data.xml || '';
    
    let nfeData;
    if (xmlContent) {
      nfeData = await this.processarXmlNfe(xmlContent);
    } else {
      nfeData = this.extrairDadosNfeDoJson(data);
    }
    
    await this.salvarNfeNoBanco(nfeData, xmlContent);
    return { success: true, data: nfeData, xml: xmlContent };
  }
  
  /**
   * Converte dados da NFe do formato do banco de dados para objeto de resposta
   * @param {Object} nfeBanco - Dados da NFe no formato do banco
   * @returns {Object} Objeto formatado para resposta ao cliente
   */
  converterNfeBancoDadosParaObjeto(nfeBanco) {
    return {
      chave: nfeBanco.chave,
      numero: nfeBanco.numero,
      serie: nfeBanco.serie,
      dataEmissao: nfeBanco.data_emissao,
      valorTotal: nfeBanco.valor_total,
      emitenteCnpj: nfeBanco.emitente_cnpj,
      emitenteNome: nfeBanco.emitente_nome,
      destinatarioCnpj: nfeBanco.destinatario_cnpj,
      destinatarioNome: nfeBanco.destinatario_nome,
      status: nfeBanco.status,
      motivoRejeicao: nfeBanco.motivo_rejeicao,
      codigoRejeicao: nfeBanco.codigo_rejeicao,
      dataRejeicao: nfeBanco.data_rejeicao,
      dataConsulta: nfeBanco.data_consulta
    };
  }

  /**
   * Processa o conteúdo XML da NFe e extrai os dados
   * @param {string} xmlContent - Conteúdo XML da NFe
   * @returns {Promise<Object>} Dados estruturados da NFe
   */
  async processarXmlNfe(xmlContent) {
    try {
      const result = await this.parser.parseStringPromise(xmlContent);
      
      const nfeObj = result.nfeProc?.NFe || result.NFe;
      const infNFe = nfeObj?.infNFe;
      
      if (!infNFe) {
        throw new Error('Estrutura de XML inválida: não foi possível encontrar os dados da NFe');
      }

      const ide = infNFe.ide;
      const emit = infNFe.emit;
      const dest = infNFe.dest;
      const total = infNFe.total?.ICMSTot;

      return {
        chave: infNFe.$.Id ? infNFe.$.Id.replace('NFe', '') : '',
        numero: ide.nNF,
        serie: ide.serie,
        dataEmissao: ide.dhEmi ? new Date(ide.dhEmi) : new Date(),
        valorTotal: total?.vNF || 0,
        emitenteCnpj: emit.CNPJ,
        emitenteNome: emit.xNome,
        destinatarioCnpj: dest.CNPJ || dest.CPF || '',
        destinatarioNome: dest.xNome,
        status: 'PROCESSADA',
      };
    } catch (error) {
      console.error('Erro ao processar o XML da NFe:', error.message);
      throw new Error(`Falha ao processar XML: ${error.message}`);
    }
  }

  /**
   * Extrai dados da NFe a partir de um objeto JSON
   * @param {Object} jsonData - Dados da NFe em formato JSON
   * @returns {Object} Dados estruturados da NFe
   */
  extrairDadosNfeDoJson(jsonData) {
    const data = jsonData.nfe || jsonData.dados || jsonData;
    
    return {
      chave: data.chaveAcesso || data.chave || '',
      numero: data.numero || '',
      serie: data.serie || '',
      dataEmissao: data.dataEmissao ? new Date(data.dataEmissao) : new Date(),
      valorTotal: parseFloat(data.valorTotal || 0),
      emitenteCnpj: data.emitenteCnpj || data.cnpjEmitente || '',
      emitenteNome: data.emitenteNome || data.nomeEmitente || '',
      destinatarioCnpj: data.destinatarioCnpj || data.cnpjDestinatario || '',
      destinatarioNome: data.destinatarioNome || data.nomeDestinatario || '',
      status: data.status || 'PROCESSADA',
    };
  }

  /**
   * Salva os dados da NFe no banco de dados
   * @param {Object} nfeData - Dados da NFe
   * @param {string} xmlContent - Conteúdo XML da NFe
   * @returns {Promise<Object>} Resultado da operação
   */
  async salvarNfeNoBanco(nfeData, xmlContent) {
    const query = `
      INSERT INTO nfes (
        chave, numero, serie, data_emissao, valor_total, 
        emitente_cnpj, emitente_nome, destinatario_cnpj, 
        destinatario_nome, status, xml_conteudo
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        numero = VALUES(numero),
        serie = VALUES(serie),
        data_emissao = VALUES(data_emissao),
        valor_total = VALUES(valor_total),
        emitente_cnpj = VALUES(emitente_cnpj),
        emitente_nome = VALUES(emitente_nome),
        destinatario_cnpj = VALUES(destinatario_cnpj),
        destinatario_nome = VALUES(destinatario_nome),
        status = VALUES(status),
        xml_conteudo = VALUES(xml_conteudo),
        data_consulta = CURRENT_TIMESTAMP
    `;
    
    const values = [
      nfeData.chave,
      nfeData.numero,
      nfeData.serie,
      nfeData.dataEmissao,
      nfeData.valorTotal,
      nfeData.emitenteCnpj,
      nfeData.emitenteNome,
      nfeData.destinatarioCnpj,
      nfeData.destinatarioNome,
      nfeData.status,
      xmlContent || null
    ];
    
    try {
      const result = await executeQuery(query, values);
      return result;
    } catch (error) {
      console.error('Erro ao salvar NFe no banco de dados:', error.message);
      throw new Error(`Erro ao salvar dados: ${error.message}`);
    }
  }

  /**
   * Busca uma NFe no banco de dados pela chave de acesso
   * @param {string} chaveAcesso - Chave de acesso da NFe
   * @returns {Promise<Object|null>} Dados da NFe ou null se não encontrada
   */
  async buscarNfePorChave(chaveAcesso) {
    try {
      const rows = await executeQuery(
        'SELECT * FROM nfes WHERE chave = ?', 
        [chaveAcesso]
      );
      
      return rows.length > 0 ? rows[0] : null;
    } catch (error) {
      console.error('Erro ao buscar NFe no banco de dados:', error.message);
      throw new Error(`Erro na consulta ao banco: ${error.message}`);
    }
  }
  
  /**
   * Gera o arquivo XML de uma NFe
   * @param {string} chaveAcesso - Chave de acesso da NFe
   * @returns {Promise<string>} Conteúdo XML da NFe
   */
  async gerarArquivoXml(chaveAcesso) {
    try {
      const nfeData = await this.buscarNfePorChave(chaveAcesso);
      
      if (!nfeData || !nfeData.xml_conteudo) {
        // Se não temos o XML, tentamos consultá-lo novamente
        const resultado = await this.consultarNfe(chaveAcesso);
        if (!resultado.success) {
          throw new Error(`Não foi possível consultar a NFe: ${resultado.error}`);
        }
        return resultado.xml;
      }
      
      return nfeData.xml_conteudo;
    } catch (error) {
      console.error('Erro ao gerar arquivo XML:', error.message);
      throw new Error(`Falha ao gerar XML: ${error.message}`);
    }
  }
  
  /**
   * Formata resposta de erro de forma padronizada
   * @param {Error} error - Objeto de erro
   * @returns {Object} Resposta de erro formatada
   */
  formatarRespostaErro(error) {
    return { 
      success: false, 
      error: error.message || 'Erro na consulta', 
      details: error.response?.data || 'Sem detalhes adicionais' 
    };
  }
}

module.exports = new NfeService();