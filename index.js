require('dotenv').config();
const express = require('express');
const cors = require('cors');
const routes = require('./src/routes');
const { initializeDatabase } = require('./database/init');
const sefazMonitorService = require('./src/sefazMonitorService');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api', routes);

app.get('/api/status', (req, res) => {
  res.json({
    status: 'online',
    message: 'API de Consulta de NFe funcionando corretamente',
    version: '1.0.0'
  });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

async function startServer() {
  try {
    await initializeDatabase();
    
    app.listen(PORT, () => {
      console.log(`Servidor rodando na porta ${PORT}`);
      sefazMonitorService.iniciarMonitoramento();
    });
  } catch (error) {
    console.error('Erro ao inicializar o servidor:', error.message);
    process.exit(1);
  }
}

startServer();