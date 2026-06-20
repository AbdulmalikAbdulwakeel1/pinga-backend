require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../config/database');

class MigrationRunner {
  constructor() {
    this.migrationsDir = path.join(__dirname, 'migrations');
  }

  // Ensure migration tracking table exists with batch support
  async ensureMigrationsTable() {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        migration_name VARCHAR(255) UNIQUE NOT NULL,
        batch INTEGER NOT NULL DEFAULT 1,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Add batch column for existing installations that don't have it
    try {
      await pool.query(`ALTER TABLE migrations ADD COLUMN IF NOT EXISTS batch INTEGER DEFAULT 1;`);
    } catch {
      // Column already exists or can't be added — safe to ignore
    }
  }

  // Get all .sql files from migrations directory, sorted
  getMigrationFiles() {
    if (!fs.existsSync(this.migrationsDir)) {
      fs.mkdirSync(this.migrationsDir, { recursive: true });
      return [];
    }

    return fs.readdirSync(this.migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort();
  }

  // Get migrations already recorded in the database
  async getExecutedMigrations() {
    try {
      const result = await pool.query(
        'SELECT migration_name, batch, executed_at FROM migrations ORDER BY id'
      );
      return result.rows;
    } catch (error) {
      // Table doesn't exist yet
      if (error.code === '42P01') return [];
      throw error;
    }
  }

  // Get the next batch number
  async getNextBatch() {
    try {
      const result = await pool.query('SELECT COALESCE(MAX(batch), 0) + 1 AS next_batch FROM migrations');
      return result.rows[0].next_batch;
    } catch {
      return 1;
    }
  }

  // Run a single migration wrapped in a transaction
  async runMigration(filename, batch) {
    const filePath = path.join(this.migrationsDir, filename);
    const migrationSQL = fs.readFileSync(filePath, 'utf8');
    const migrationName = filename.replace('.sql', '');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Execute the migration SQL
      await client.query(migrationSQL);

      // Record the migration (runner handles this — ON CONFLICT for safety)
      await client.query(
        `INSERT INTO migrations (migration_name, batch) VALUES ($1, $2) ON CONFLICT (migration_name) DO NOTHING`,
        [migrationName, batch]
      );

      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Run all pending migrations
  async runPendingMigrations() {
    await this.ensureMigrationsTable();

    const migrationFiles = this.getMigrationFiles();

    if (migrationFiles.length === 0) {
      console.log('\n  INFO  Nothing to migrate.\n');
      return;
    }

    const executedRows = await this.getExecutedMigrations();
    const executedNames = executedRows.map(r => r.migration_name);

    const pendingMigrations = migrationFiles.filter(file => {
      const name = file.replace('.sql', '');
      return !executedNames.includes(name);
    });

    if (pendingMigrations.length === 0) {
      console.log('\n  INFO  Nothing to migrate.\n');
      return;
    }

    const batch = await this.getNextBatch();

    console.log('');
    console.log('  MIGRATING  Batch ' + batch);
    console.log('');

    const results = [];

    for (const file of pendingMigrations) {
      const migrationName = file.replace('.sql', '');
      const startTime = Date.now();

      try {
        await this.runMigration(file, batch);
        const duration = Date.now() - startTime;
        const dots = '.'.repeat(Math.max(2, 60 - migrationName.length));
        console.log(`  ${migrationName} ${dots} ${duration}ms DONE`);
        results.push({ name: migrationName, status: 'done', duration });
      } catch (error) {
        const dots = '.'.repeat(Math.max(2, 60 - migrationName.length));
        console.error(`  ${migrationName} ${dots} FAILED`);
        console.error('');
        console.error(`  ERROR  ${error.message}`);
        console.error('');

        if (results.length > 0) {
          console.log(`  ${results.length} migration(s) succeeded before failure.`);
          console.log('  Fix the error and run migrate again to continue.\n');
        }

        throw error;
      }
    }

    const totalTime = results.reduce((sum, r) => sum + r.duration, 0);
    console.log('');
    console.log(`  DONE  Ran ${results.length} migration(s) in ${totalTime}ms (batch ${batch})`);
    console.log('');
  }

  // Show migration status (like Laravel's migrate:status)
  async showStatus() {
    await this.ensureMigrationsTable();

    const migrationFiles = this.getMigrationFiles();
    const executedRows = await this.getExecutedMigrations();
    const executedMap = {};
    executedRows.forEach(r => { executedMap[r.migration_name] = r; });

    if (migrationFiles.length === 0) {
      console.log('\n  INFO  No migration files found.\n');
      return;
    }

    console.log('');
    console.log('  Migration name                                                   Batch / Status');
    console.log('  ' + '─'.repeat(80));

    let pendingCount = 0;
    let ranCount = 0;

    migrationFiles.forEach(file => {
      const name = file.replace('.sql', '');
      const record = executedMap[name];

      if (record) {
        const date = new Date(record.executed_at).toISOString().replace('T', ' ').slice(0, 19);
        const dots = '.'.repeat(Math.max(2, 65 - name.length));
        console.log(`  ${name} ${dots} [${record.batch}] Ran on ${date}`);
        ranCount++;
      } else {
        const dots = '.'.repeat(Math.max(2, 65 - name.length));
        console.log(`  ${name} ${dots} Pending`);
        pendingCount++;
      }
    });

    console.log('  ' + '─'.repeat(80));
    console.log(`  Ran: ${ranCount} | Pending: ${pendingCount} | Total: ${migrationFiles.length}`);
    console.log('');
  }

  // Rollback the last batch of migrations
  async rollbackLastBatch() {
    await this.ensureMigrationsTable();

    const result = await pool.query('SELECT COALESCE(MAX(batch), 0) AS last_batch FROM migrations');
    const lastBatch = result.rows[0].last_batch;

    if (lastBatch === 0) {
      console.log('\n  INFO  Nothing to rollback.\n');
      return;
    }

    const batchMigrations = await pool.query(
      'SELECT migration_name FROM migrations WHERE batch = $1 ORDER BY id DESC',
      [lastBatch]
    );

    console.log('');
    console.log(`  ROLLBACK  Removing batch ${lastBatch} records (${batchMigrations.rows.length} migration(s))`);
    console.log('');
    console.log('  WARNING  This only removes migration records from the tracking table.');
    console.log('  It does NOT undo the SQL changes (tables/columns remain in the database).');
    console.log('  To fully rollback, you must manually reverse the SQL or use migrate:fresh.');
    console.log('');

    for (const row of batchMigrations.rows) {
      await pool.query('DELETE FROM migrations WHERE migration_name = $1', [row.migration_name]);
      console.log(`  Removed: ${row.migration_name}`);
    }

    console.log('');
    console.log(`  DONE  Batch ${lastBatch} rolled back. Run migrate again to re-run those migrations.`);
    console.log('');
  }

  // Fresh migration — drops everything and re-migrates
  async fresh() {
    console.log('');
    console.log('  FRESH  Dropping all tables...');
    console.log('');

    try {
      // Get all table names in public schema
      const tablesResult = await pool.query(`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      `);

      if (tablesResult.rows.length > 0) {
        const tableNames = tablesResult.rows.map(r => r.table_name).join(', ');
        await pool.query(`DROP TABLE IF EXISTS ${tableNames} CASCADE`);
        console.log(`  Dropped: ${tablesResult.rows.length} table(s)`);
      } else {
        console.log('  No tables to drop.');
      }

      // Drop the trigger function too
      await pool.query('DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE');

      console.log('');

      // Now run all migrations fresh
      await this.runPendingMigrations();
    } catch (error) {
      console.error(`  ERROR  ${error.message}\n`);
      throw error;
    }
  }

  // Create a new empty migration file
  async createMigration(name) {
    if (!name) {
      console.log('\n  ERROR  Please provide a migration name.');
      console.log('  Usage: npm run migrate:create -- <name>\n');
      return;
    }

    const sanitized = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

    // Get next number
    const files = this.getMigrationFiles();
    let nextNum = 1;
    if (files.length > 0) {
      const lastFile = files[files.length - 1];
      const match = lastFile.match(/^(\d+)/);
      if (match) nextNum = parseInt(match[1]) + 1;
    }

    const numStr = String(nextNum).padStart(3, '0');
    const filename = `${numStr}_${sanitized}.sql`;
    const filePath = path.join(this.migrationsDir, filename);

    const template = `-- Migration: ${sanitized}
-- Created: ${new Date().toISOString().split('T')[0]}

-- Write your migration SQL here
-- Use IF NOT EXISTS / IF EXISTS for safety
-- Examples:
--   CREATE TABLE IF NOT EXISTS table_name (...);
--   ALTER TABLE table_name ADD COLUMN IF NOT EXISTS column_name TYPE;
--   CREATE INDEX IF NOT EXISTS idx_name ON table_name(column);

`;

    fs.writeFileSync(filePath, template);
    console.log(`\n  CREATED  ${filename}\n`);
    console.log(`  Path: ${filePath}\n`);
  }
}

// CLI interface
const command = process.argv[2];
const arg = process.argv[3];

const runner = new MigrationRunner();

(async () => {
  try {
    switch (command) {
      case 'up':
        await runner.runPendingMigrations();
        break;

      case 'status':
        await runner.showStatus();
        break;

      case 'rollback':
        await runner.rollbackLastBatch();
        break;

      case 'fresh':
        console.log('\n  WARNING  This will DROP ALL TABLES and re-run all migrations!');
        console.log('  All data will be lost. Press Ctrl+C within 5 seconds to cancel...\n');
        await new Promise(resolve => setTimeout(resolve, 5000));
        await runner.fresh();
        break;

      case 'create':
        await runner.createMigration(arg);
        break;

      default:
        console.log('');
        console.log('  Pinga Migration Tool');
        console.log('  ' + '─'.repeat(40));
        console.log('');
        console.log('  Commands:');
        console.log('    npm run migrate              Run pending migrations');
        console.log('    npm run migrate:status       Show migration status');
        console.log('    npm run migrate:rollback     Rollback last batch');
        console.log('    npm run migrate:fresh        Drop all tables & re-migrate');
        console.log('    npm run migrate:create       Create a new migration file');
        console.log('');
        console.log('  Examples:');
        console.log('    npm run migrate:create -- add_conversations');
        console.log('');
    }

    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error(`\n  ERROR  ${error.message}\n`);
    await pool.end();
    process.exit(1);
  }
})();
