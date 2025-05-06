const axios = require('axios');
const xml2js = require('xml2js');
const { createConnection } = require('../database/connection');
const sefazMonitorService = require('./sefazMonitorService');

class NfeService {
  constructor() {
    this.parser = new xml2js.Parser({ explicitArray: false });
    this.baseUrl = process.env.API_NFE_URL || 'https://nfe.fazenda.mg.gov.br/nfe2/services';
  }

  async consultarNfe(chaveAcesso) {
    try {
      if (!/^\d{44}$/.test(chaveAcesso)) {
        throw new Error('Chave de acesso inválida. Deve conter exatamente 44 dígitos numéricos.');
      }

      const nfeExistente = await this.buscarNfePorChave(chaveAcesso);
      if (nfeExistente) {
        return { 
          success: true, 
          data: this.converterNfeBancoDadosParaObjeto(nfeExistente),
          fromDatabase: true 
        };
      }
      
      const resultado = await sefazMonitorService.requisitarSefaz('nfeConsultaProtocolo', {
        chaveAcesso: chaveAcesso
      }, 'post');
      
      if (!resultado.success) {
        if (process.env.NODE_ENV === 'development') {
          const nfeSimulada = this.gerarNfeSimulada(chaveAcesso);
          await this.salvarNfeNoBanco(nfeSimulada, '<xml_simulado/>');
          return { success: true, data: nfeSimulada, simulated: true };
        }
        
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
    } catch (error) {
      console.error('Erro ao consultar NFe:', error.message);
      
      if (process.env.NODE_ENV === 'development') {
        const nfeSimulada = this.gerarNfeSimulada(chaveAcesso);
        await this.salvarNfeNoBanco(nfeSimulada, '<xml_simulado/>');
        return { success: true, data: nfeSimulada, simulated: true };
      }
      
      return { 
        success: false, 
        error: error.message || 'Erro na consulta', 
        details: error.response?.data || 'Sem detalhes adicionais' 
      };
    }
  }
  
  gerarNfeSimulada(chaveAcesso) {
    const hoje = new Date();
    const valorAleatorio = Math.floor(Math.random() * 10000) / 100;
    
    return {
      chave: chaveAcesso,
      numero: Math.floor(Math.random() * 1000000).toString(),
      serie: Math.floor(Math.random() * 999).toString(),
      dataEmissao: hoje,
      valorTotal: valorAleatorio,
      emitenteCnpj: '12345678901234',
      emitenteNome: 'EMPRESA SIMULADA LTDA',
      destinatarioCnpj: '98765432109876',
      destinatarioNome: 'CLIENTE SIMULADO SA',
      status: Math.random() > 0.3 ? 'PROCESSADA' : 'REJEITADA',
      motivoRejeicao: null,
      codigoRejeicao: null
    };
  }
  
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
      throw error;
    }
  }

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

  async salvarNfeNoBanco(nfeData, xmlContent) {
    let connection;
    try {
      connection = await createConnection();
      
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
      
      const [result] = await connection.execute(query, values);
      return result;
    } catch (error) {
      console.error('Erro ao salvar NFe no banco de dados:', error.message);
      throw error;
    } finally {
      if (connection) {
        await connection.end();
      }
    }
  }

  async buscarNfePorChave(chaveAcesso) {
    let connection;
    try {
      connection = await createConnection();
      const [rows] = await connection.execute(
        'SELECT * FROM nfes WHERE chave = ?', 
        [chaveAcesso]
      );
      
      return rows.length > 0 ? rows[0] : null;
    } catch (error) {
      console.error('Erro ao buscar NFe no banco de dados:', error.message);
      throw error;
    } finally {
      if (connection) {
        await connection.end();
      }
    }
  }
  
  async gerarArquivoXml(chaveAcesso) {
    try {
      const nfeData = await this.buscarNfePorChave(chaveAcesso);
      
      if (!nfeData || !nfeData.xml_conteudo) {
        const resultado = await this.consultarNfe(chaveAcesso);
        if (!resultado.success) {
          throw new Error(`Não foi possível consultar a NFe: ${resultado.error}`);
        }
        return resultado.xml;
      }
      
      return nfeData.xml_conteudo;
    } catch (error) {
      console.error('Erro ao gerar arquivo XML:', error.message);
      throw error;
    }
  }
}

module.exports = new NfeService();