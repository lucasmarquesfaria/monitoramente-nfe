const axios = require('axios');
const { createConnection } = require('../database/connection');

class SefazMonitorService {
  constructor() {
    this.endpoints = {
      nfeInutilizacao: 'https://nfe.fazenda.mg.gov.br/nfe2/services/NFeInutilizacao4',
      nfeConsultaProtocolo: 'https://nfe.fazenda.mg.gov.br/nfe2/services/NFeConsultaProtocolo4',
      nfeStatusServico: 'https://nfe.fazenda.mg.gov.br/nfe2/services/NFeStatusServico4',
      nfeConsultaCadastro: 'https://nfe.fazenda.mg.gov.br/nfe2/services/CadConsultaCadastro4',
      recepcaoEvento: 'https://nfe.fazenda.mg.gov.br/nfe2/services/NFeRecepcaoEvento4',
      nfeAutorizacao: 'https://nfe.fazenda.mg.gov.br/nfe2/services/NFeAutorizacao4',
      nfeRetAutorizacao: 'https://nfe.fazenda.mg.gov.br/nfe2/services/NFeRetAutorizacao4'
    };
    
    const isDev = process.env.NODE_ENV === 'development';
    
    this.statusUrl = isDev 
      ? 'http://localhost:' + (process.env.PORT || 3000) + '/api/simular-status-sefaz-mg'
      : process.env.SEFAZ_MG_STATUS_URL || this.endpoints.nfeStatusServico;
    
    this.checkInterval = parseInt(process.env.STATUS_CHECK_INTERVAL) || 5 * 60 * 1000;
    
    this.intervalId = null;
    this.lastStatus = null;
    this.simulatedStatus = true;

    this.axiosConfig = {
      timeout: 15000,
      headers: {
        'User-Agent': 'NFe-Monitor/1.0.0',
        'Accept': 'application/json, application/xml',
        'Content-Type': 'application/json'
      },
      maxRetries: 3,
      retryDelay: 1000
    };

    this._configureAxiosRetry();
  }

  _configureAxiosRetry() {
    axios.interceptors.response.use(undefined, async (err) => {
      const config = err.config;
      
      if (!config || !config.maxRetries) {
        return Promise.reject(err);
      }
      
      config.__retryCount = config.__retryCount || 0;
      
      if (config.__retryCount >= config.maxRetries) {
        return Promise.reject(err);
      }
      
      config.__retryCount += 1;
      
      const delay = config.retryDelay * Math.pow(2, config.__retryCount - 1);
      
      await new Promise(resolve => setTimeout(resolve, delay));
      
      return axios(config);
    });
  }

  iniciarMonitoramento() {
    this.verificarStatusSefaz();
    
    this.intervalId = setInterval(() => {
      this.verificarStatusSefaz();
    }, this.checkInterval);
    
    return true;
  }

  pararMonitoramento() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    
    return true;
  }

  async verificarStatusSefaz() {
    let connection;
    try {
      const axConfig = {
        ...this.axiosConfig,
        method: 'get',
        url: this.statusUrl
      };
      
      const response = await axios(axConfig);
      
      const online = response.status === 200 && response.data && 
        (response.data.online || response.data.status === 'online');
      
      const detalhes = response.data && typeof response.data === 'object' 
        ? JSON.stringify(response.data) 
        : String(response.data || '');
      
      if (this.lastStatus === null || this.lastStatus !== online) {
        connection = await createConnection();
        
        await connection.execute(
          `INSERT INTO sefaz_status (online, detalhes) VALUES (?, ?)`,
          [online, detalhes]
        );
        
        this.lastStatus = online;
      }
      
      return { 
        online, 
        timestamp: new Date(),
        detalhes: response.data
      };
    } catch (error) {
      console.error('Erro ao verificar status da SEFAZ MG:', error.message);
      
      if (this.lastStatus !== false) {
        try {
          connection = connection || await createConnection();
          
          await connection.execute(
            `INSERT INTO sefaz_status (online, detalhes) VALUES (?, ?)`,
            [false, `Erro ao verificar: ${error.message}`]
          );
          
          this.lastStatus = false;
        } catch (dbError) {
          console.error('Erro ao registrar status no banco de dados:', dbError.message);
        }
      }
      
      return { 
        online: false, 
        timestamp: new Date(),
        error: error.message
      };
    } finally {
      if (connection) {
        await connection.end();
      }
    }
  }

  async requisitarSefaz(endpoint, data = null, method = 'get') {
    try {
      const url = this.endpoints[endpoint] || endpoint;
      
      const axConfig = {
        ...this.axiosConfig,
        method,
        url
      };
      
      if (data) {
        axConfig.data = data;
      }
      
      const response = await axios(axConfig);
      return {
        success: true,
        data: response.data,
        status: response.status
      };
    } catch (error) {
      console.error(`Erro ao acessar endpoint ${endpoint}:`, error.message);
      
      if (endpoint === 'nfeStatusServico' || endpoint === this.statusUrl) {
        this.lastStatus = false;
        this.registrarMudancaStatus(false, false);
      }
      
      return {
        success: false,
        error: error.message,
        response: error.response ? {
          status: error.response.status,
          data: error.response.data
        } : null
      };
    }
  }

  toggleSimulatedStatus() {
    this.simulatedStatus = !this.simulatedStatus;
    this.registrarMudancaStatus(this.simulatedStatus, true);
    return this.simulatedStatus;
  }
  
  getSimulatedStatus() {
    return {
      online: this.simulatedStatus,
      timestamp: new Date(),
      detalhes: {
        simulado: true,
        ambiente: process.env.NODE_ENV,
        mensagem: this.simulatedStatus ? 'Sistema em operação normal' : 'Sistema indisponível'
      }
    };
  }
  
  async registrarMudancaStatus(online, simulado = false) {
    let connection;
    try {
      connection = await createConnection();
      
      const detalhes = JSON.stringify({
        simulado,
        mensagem: online ? 'Sistema em operação normal' : 'Sistema indisponível',
        timestamp: new Date().toISOString()
      });
      
      await connection.execute(
        `INSERT INTO sefaz_status (online, detalhes) VALUES (?, ?)`,
        [online, detalhes]
      );
      
      this.lastStatus = online;
      
      return true;
    } catch (error) {
      console.error('Erro ao registrar mudança de status:', error.message);
      return false;
    } finally {
      if (connection) {
        await connection.end();
      }
    }
  }

  async obterHistoricoStatus(limit = 20) {
    let connection;
    try {
      connection = await createConnection();
      
      const [rows] = await connection.execute(
        `SELECT id, online, timestamp, detalhes 
         FROM sefaz_status 
         ORDER BY timestamp DESC 
         LIMIT ?`, 
        [limit]
      );
      
      return rows;
    } catch (error) {
      console.error('Erro ao obter histórico de status SEFAZ:', error.message);
      throw error;
    } finally {
      if (connection) {
        await connection.end();
      }
    }
  }

  async obterStatusAtual() {
    let connection;
    try {
      connection = await createConnection();
      
      const [rows] = await connection.execute(
        `SELECT online, timestamp, detalhes 
         FROM sefaz_status 
         ORDER BY timestamp DESC 
         LIMIT 1`
      );
      
      if (rows.length === 0) {
        return await this.verificarStatusSefaz();
      }
      
      return {
        online: Boolean(rows[0].online),
        timestamp: rows[0].timestamp,
        detalhes: rows[0].detalhes
      };
    } catch (error) {
      console.error('Erro ao obter status atual da SEFAZ:', error.message);
      throw error;
    } finally {
      if (connection) {
        await connection.end();
      }
    }
  }

  async obterNfesRejeitadas(options = { limit: 20, offset: 0 }) {
    let connection;
    try {
      connection = await createConnection();
      
      const [rows] = await connection.execute(
        `SELECT id, chave, numero, serie, data_emissao, valor_total,
         emitente_cnpj, emitente_nome, destinatario_cnpj, destinatario_nome,
         status, motivo_rejeicao, codigo_rejeicao, data_rejeicao, data_consulta
         FROM nfes 
         WHERE status = 'REJEITADA'
         ORDER BY data_consulta DESC
         LIMIT ? OFFSET ?`,
        [options.limit, options.offset]
      );
      
      const [countResult] = await connection.execute(
        `SELECT COUNT(*) AS total FROM nfes WHERE status = 'REJEITADA'`
      );
      
      return {
        dados: rows,
        total: countResult[0].total,
        pagina: Math.floor(options.offset / options.limit) + 1,
        totalPaginas: Math.ceil(countResult[0].total / options.limit)
      };
    } catch (error) {
      console.error('Erro ao obter NFes rejeitadas:', error.message);
      throw error;
    } finally {
      if (connection) {
        await connection.end();
      }
    }
  }
}

const sefazMonitorService = new SefazMonitorService();

module.exports = sefazMonitorService;