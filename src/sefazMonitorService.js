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
    this.lastStatus = true; // Iniciar com status online para evitar o problema inicial
    this.simulatedStatus = true; // Definir como true (online) por padrão

    // Configuração atualizada do Axios para resolver problemas de SSL
    const https = require('https');
    this.axiosConfig = {
      timeout: 20000, // Aumentado para 20 segundos
      headers: {
        'User-Agent': 'NFe-Monitor/1.0.0',
        'Accept': 'application/json, application/xml',
        'Content-Type': 'application/json'
      },
      maxRetries: 3,
      retryDelay: 1000,
      // Agente HTTPS personalizado para resolver problemas de SSL
      httpsAgent: new https.Agent({
        rejectUnauthorized: false, // Ignora erros de certificado
        secureProtocol: 'TLS_method', // Usa o protocolo TLS mais recente suportado
        minVersion: 'TLSv1.2', // Força mínimo TLS 1.2
        maxVersion: 'TLSv1.3', // Suporta até TLS 1.3
        ciphers: 'DEFAULT@SECLEVEL=1', // Reduz o nível de segurança para aceitar certificados mais antigos
        honorCipherOrder: true,
        secureOptions: require('constants').SSL_OP_NO_SSLv2 | 
                      require('constants').SSL_OP_NO_SSLv3 |
                      require('constants').SSL_OP_NO_TLSv1 |
                      require('constants').SSL_OP_NO_TLSv1_1
      })
    };

    this._configureAxiosRetry();
    
    // Registrar status inicial online no banco de dados
    this._registrarStatusInicial();
  }
  
  async _registrarStatusInicial() {
    try {
      // Registra um status inicial como online no banco
      await this.registrarMudancaStatus(true, true);
    } catch (error) {
      console.error('Erro ao registrar status inicial:', error);
    }
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
      // Sempre usar as URLs reais para consulta de NFe, independente do ambiente
      const url = this.endpoints[endpoint] || endpoint;
      
      // Para autenticação na API da SEFAZ
      const token = process.env.API_NFE_TOKEN;
      const secret = process.env.API_NFE_SECRET;
      
      const axConfig = {
        ...this.axiosConfig,
        method,
        url
      };
      
      // Adicionar credenciais de autenticação se disponíveis
      if (token && secret) {
        axConfig.headers['Authorization'] = `Bearer ${token}`;
        axConfig.headers['x-api-key'] = secret;
      }
      
      if (data) {
        axConfig.data = data;
      }
      
      console.log(`Requisitando endpoint ${endpoint} na URL: ${url}`);
      
      const response = await axios(axConfig);
      
      // Atualiza o status para online se o endpoint for o de status
      if (endpoint === 'nfeStatusServico' || url === this.statusUrl) {
        if (this.lastStatus !== true) {
          await this.registrarMudancaStatus(true, false);
        }
      }
      
      return {
        success: true,
        data: response.data,
        status: response.status
      };
    } catch (error) {
      console.error(`Erro ao acessar endpoint ${endpoint}:`, error.message);
      
      // Atualiza o status para offline quando falhar ao consultar o serviço de status
      if (endpoint === 'nfeStatusServico' || url === this.statusUrl) {
        if (this.lastStatus !== false) {
          await this.registrarMudancaStatus(false, false);
        }
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
    
    // Garantir que a alteração de status é registrada no banco de dados
    try {
      this.registrarMudancaStatus(this.simulatedStatus, true);
      this.lastStatus = this.simulatedStatus;
      console.log(`Status simulado alterado para: ${this.simulatedStatus ? 'Online' : 'Offline'}`);
    } catch (error) {
      console.error('Erro ao registrar alteração de status simulado:', error);
    }
    
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
      
      // Garantir que limit seja um número inteiro
      const safeLimit = parseInt(limit) || 20;
      
      const [rows] = await connection.execute(
        'SELECT id, online, timestamp, detalhes FROM sefaz_status ORDER BY timestamp DESC LIMIT ?', 
        [safeLimit]
      );
      
      return rows || [];
    } catch (error) {
      console.error('Erro ao obter histórico de status SEFAZ:', error.message);
      return []; // Retornar array vazio em vez de lançar erro
    } finally {
      if (connection) {
        try {
          await connection.end();
        } catch (err) {
          console.error('Erro ao fechar conexão com o banco de dados:', err.message);
        }
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
        // Se não houver registros, criar um status inicial online e retorná-lo
        await this.registrarMudancaStatus(true, true);
        return {
          online: true,
          timestamp: new Date(),
          detalhes: JSON.stringify({
            simulado: true,
            mensagem: 'Status inicial do sistema',
            timestamp: new Date().toISOString()
          })
        };
      }
      
      return {
        online: Boolean(rows[0].online),
        timestamp: rows[0].timestamp,
        detalhes: rows[0].detalhes
      };
    } catch (error) {
      console.error('Erro ao obter status atual da SEFAZ:', error.message);
      // Em caso de erro, retorna um status simulado em vez de lançar o erro
      return {
        online: true, // Considera online para não afetar a UI
        timestamp: new Date(),
        detalhes: JSON.stringify({
          simulado: true,
          mensagem: 'Status de fallback devido a erro na consulta',
          error: error.message
        })
      };
    } finally {
      if (connection) {
        try {
          await connection.end();
        } catch (err) {
          console.error('Erro ao fechar conexão com o banco de dados:', err.message);
        }
      }
    }
  }

  async obterNfesRejeitadas(options = { limit: 20, offset: 0 }) {
    let connection;
    try {
      connection = await createConnection();
      
      if (!connection) {
        console.error('Erro ao estabelecer conexão com o banco de dados');
        return {
          dados: [],
          total: 0,
          pagina: 1,
          totalPaginas: 0
        };
      }
      
      // Primeiro verifica as colunas existentes na tabela
      const [columnsInfo] = await connection.execute(
        "SHOW COLUMNS FROM nfes"
      );
      
      // Cria um array com os nomes das colunas existentes
      const existingColumns = columnsInfo.map(col => col.Field);
      
      // Lista básica de colunas que sempre devem existir
      let columns = ['id', 'chave', 'numero', 'serie', 'data_emissao', 'valor_total',
                    'emitente_cnpj', 'emitente_nome', 'destinatario_cnpj', 'destinatario_nome',
                    'status', 'data_consulta'];
      
      // Adiciona colunas opcionais somente se elas existirem no banco
      if (existingColumns.includes('motivo_rejeicao')) columns.push('motivo_rejeicao');
      if (existingColumns.includes('codigo_rejeicao')) columns.push('codigo_rejeicao');
      if (existingColumns.includes('data_rejeicao')) columns.push('data_rejeicao');
      
      // Constrói a consulta SQL usando apenas as colunas existentes
      const columnsString = columns.join(', ');
      
      const limit = parseInt(options.limit) || 20;
      const offset = parseInt(options.offset) || 0;
      
      const query = `
        SELECT ${columnsString}
        FROM nfes 
        WHERE status = 'REJEITADA'
        ORDER BY data_consulta DESC
        LIMIT ? OFFSET ?
      `;
      
      const [rows] = await connection.execute(query, [limit, offset]);
      
      const [countResult] = await connection.execute(
        `SELECT COUNT(*) AS total FROM nfes WHERE status = 'REJEITADA'`
      );
      
      const total = countResult[0] ? countResult[0].total : 0;
      
      // Para cada registro, adiciona campos nulos para colunas que possam não existir
      const dadosProcessados = rows.map(row => {
        if (!row.motivo_rejeicao) row.motivo_rejeicao = null;
        if (!row.codigo_rejeicao) row.codigo_rejeicao = null;
        if (!row.data_rejeicao) row.data_rejeicao = row.data_consulta;
        return row;
      });
      
      return {
        dados: dadosProcessados || [],
        total: total,
        pagina: Math.floor(offset / limit) + 1,
        totalPaginas: Math.ceil(total / limit) || 1
      };
    } catch (error) {
      console.error('Erro ao obter NFes rejeitadas:', error.message);
      return {
        dados: [],
        total: 0,
        pagina: 1,
        totalPaginas: 0,
        erro: error.message
      };
    } finally {
      if (connection) {
        try {
          await connection.end();
        } catch (err) {
          console.error('Erro ao fechar conexão com o banco de dados:', err.message);
        }
      }
    }
  }
}

const sefazMonitorService = new SefazMonitorService();

module.exports = sefazMonitorService;