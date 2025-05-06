const { createConnection } = require('./connection');

async function initializeDatabase() {
  let connection;
  try {
    connection = await createConnection();
    
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS nfes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        chave VARCHAR(44) NOT NULL UNIQUE,
        numero VARCHAR(20) NOT NULL,
        serie VARCHAR(10) NOT NULL,
        data_emissao DATETIME NOT NULL,
        valor_total DECIMAL(15,2) NOT NULL,
        emitente_cnpj VARCHAR(14) NOT NULL,
        emitente_nome VARCHAR(255) NOT NULL,
        destinatario_cnpj VARCHAR(14) NOT NULL,
        destinatario_nome VARCHAR(255) NOT NULL,
        status VARCHAR(50) NOT NULL,
        motivo_rejeicao TEXT,
        codigo_rejeicao VARCHAR(10),
        data_rejeicao DATETIME,
        xml_conteudo TEXT,
        data_consulta DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE INDEX idx_chave (chave)
      )
    `);
    
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS sefaz_status (
        id INT AUTO_INCREMENT PRIMARY KEY,
        online BOOLEAN NOT NULL,
        timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        detalhes TEXT
      )
    `);
    
    return true;
  } catch (error) {
    console.error('Erro ao inicializar o banco de dados:', error.message);
    throw error;
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

module.exports = { initializeDatabase };