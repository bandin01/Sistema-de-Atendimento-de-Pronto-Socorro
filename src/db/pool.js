'use strict';

const mysql = require('mysql2/promise');

/** Pool mysql2. Os repositories só precisam de um objeto com .execute() (pool ou conexão). */
function criarPool(config = process.env) {
  return mysql.createPool({
    host: config.DB_HOST || 'localhost',
    port: Number(config.DB_PORT || 3306),
    user: config.DB_USER,
    password: config.DB_PASSWORD,
    database: config.DB_NAME || 'pronto_socorro',
    waitForConnections: true,
    connectionLimit: Number(config.DB_CONNECTION_LIMIT || 10),
    decimalNumbers: true, // DECIMAL (ex.: temperatura) volta como number
    charset: 'utf8mb4',
  });
}

module.exports = { criarPool };
