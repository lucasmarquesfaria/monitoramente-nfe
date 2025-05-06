const mysql = require('mysql2/promise');
const dbConfig = require('../config/database');

async function createConnection() {
  try {
    const connection = await mysql.createConnection(dbConfig);
    return connection;
  } catch (error) {
    console.error('Erro ao conectar ao banco de dados:', error.message);
    throw error;
  }
}

module.exports = { createConnection };