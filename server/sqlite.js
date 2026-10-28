const { DatabaseSync } = require('node:sqlite');

class Database extends DatabaseSync {
  pragma(statement) {
    this.exec(`PRAGMA ${statement}`);
  }

  transaction(fn) {
    return (...args) => {
      this.exec('BEGIN');
      try {
        const result = fn(...args);
        this.exec('COMMIT');
        return result;
      } catch (err) {
        try {
          this.exec('ROLLBACK');
        } catch (rollbackError) {
          // Ignore rollback failures and rethrow the original error.
        }
        throw err;
      }
    };
  }
}

module.exports = Database;
