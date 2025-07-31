const Database = require('better-sqlite3');
const db = new Database('/data/memory.db');

// Create the table if it doesn't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS memories (
    userId TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    PRIMARY KEY (userId, key)
  )
`);

module.exports = db;