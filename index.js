/**
 * Ponto de entrada principal do sistema Monitor NFe MG
 * Configura e inicia o servidor Express e seus middlewares
 */
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const routes = require('./src/routes');
const { initializeDatabase } = require('./database/init');
const sefazMonitorService = require('./src/sefazMonitorService');

const app = express();
const PORT = process.env.PORT || 3000;

/**
 * Configura os middlewares do Express
 * @param {Express} app - Instância do aplicativo Express
 */
function configurarMiddlewares(app) {
  // Configurando parse de JSON e URL encoded
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  
  // Habilitando CORS para todas as origens
  app.use(cors());
  
  // Servindo arquivos estáticos
  app.use(express.static(path.join(__dirname, 'public')));
  
  // Configurando rotas da API
  app.use('/api', routes);
}

/**
 * Configura as rotas base do aplicativo
 * @param {Express} app - Instância do aplicativo Express
 */
function configurarRotas(app) {
  // Rota de status da API
  app.get('/api/status', (req, res) => {
    res.json({
      status: 'online',
      message: 'API de Consulta de NFe funcionando corretamente',
      version: '1.0.0'
    });
  });

  // Rota raiz (serve a página principal)
  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });
}

/**
 * Inicia o servidor e os serviços associados
 */
async function startServer() {
  try {
    // Inicializa o banco de dados
    console.log('Inicializando banco de dados...');
    await initializeDatabase();
    
    // Configura a aplicação
    configurarMiddlewares(app);
    configurarRotas(app);
    
    // Inicia o servidor HTTP
    app.listen(PORT, () => {
      console.log(`Servidor rodando na porta ${PORT}`);
      
      // Inicia o monitoramento automatizado do SEFAZ
      console.log('Iniciando serviço de monitoramento do SEFAZ...');
      sefazMonitorService.iniciarMonitoramento();
    });
  } catch (error) {
    console.error('Erro fatal ao inicializar o servidor:', error.message);
    process.exit(1);
  }
}

// Inicia a aplicação
startServer();