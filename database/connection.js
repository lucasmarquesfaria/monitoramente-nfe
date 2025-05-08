/**
 * Módulo de conexão com o banco de dados
 * Responsável por criar e gerenciar conexões com o MySQL
 */
const mysql = require('mysql2/promise');
const dbConfig = require('../config/database');

/**
 * Cria uma nova conexão com o banco de dados
 * @returns {Promise<Connection>} Conexão com o banco de dados
 * @throws {Error} Erro caso a conexão falhe
 */
async function createConnection() {
  try {
    const connection = await mysql.createConnection(dbConfig);
    return connection;
  } catch (error) {
    console.error('Erro ao conectar ao banco de dados:', error.message);
    throw new Error(`Falha na conexão com o banco de dados: ${error.message}`);
  }
}

/**
 * Executa uma consulta com valores seguros e tratamento de erro
 * @param {string} query - A consulta SQL a ser executada
 * @param {Array} params - Parâmetros para a consulta
 * @returns {Promise<Array>} Resultado da consulta
 */
async function executeQuery(query, params = []) {
  let connection;
  try {
    connection = await createConnection();
    const [result] = await connection.execute(query, params);
    return result;
  } catch (error) {
    console.error('Erro ao executar consulta:', error.message);
    throw new Error(`Falha na consulta SQL: ${error.message}`);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

module.exports = { 
  createConnection,
  executeQuery
};