import 'reflect-metadata'
import Database from 'better-sqlite3'
import { injectable, inject } from 'inversify'
import fs from 'fs'
import path from 'path'
import type { PathseekrConfig } from '@pathseekr/shared'
import { TYPES } from '../container/types'
import { Tables } from './schema'

@injectable()
export class DatabaseConnection {
    private db: Database.Database | null = null

    constructor(
        @inject(TYPES.PathseekrConfig)
        private readonly config: PathseekrConfig
    ) {}

    getDb(): Database.Database {
        if (this.db) {
            return this.db
        }

        const dataDir = this.resolveDataDir()
        fs.mkdirSync(dataDir, { recursive: true })

        const dbPath = path.join(dataDir, 'pathseekr.db')
        this.db = new Database(dbPath)

        this.applyPragmas(this.db)
        this.runMigrations(this.db)

        return this.db
    }

    close(): void {
        if (this.db) {
            this.db.close()
            this.db = null
        }
    }

    private applyPragmas(db: Database.Database): void {
        // WAL mode so reads and writes don't block each other
        db.pragma('journal_mode = WAL')
        // NORMAL sync safe and fast
        db.pragma('synchronous = NORMAL')
        // Enforce foreign key constraints
        db.pragma('foreign_keys = ON')
        // 64MB page cache
        db.pragma('cache_size = -64000')
    }

    private runMigrations(db: Database.Database): void {
        db.exec(`
            CREATE TABLE IF NOT EXISTS ${Tables.MIGRATIONS} (
                id      INTEGER PRIMARY KEY AUTOINCREMENT,
                name    TEXT NOT NULL UNIQUE,
                run_at  DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `)

        const migrationsDir = path.join(__dirname, 'migrations')

        if (!fs.existsSync(migrationsDir)) {
            throw new Error(
                `Migrations directory not found at ${migrationsDir}. ` +
                `Run npm run build in packages/core to copy migration files.`
            )
        }

        const migrationFiles = fs
            .readdirSync(migrationsDir)
            .filter((f) => f.endsWith('.sql'))
            .sort()

        const hasMigration = db.prepare(
            `SELECT id FROM ${Tables.MIGRATIONS} WHERE name = ?`
        )
        const recordMigration = db.prepare(
            `INSERT INTO ${Tables.MIGRATIONS} (name) VALUES (?)`
        )

        for (const file of migrationFiles) {
            const migrationName = file.replace('.sql', '')
            const alreadyRun = hasMigration.get(migrationName)

            if (!alreadyRun) {
                const sql = fs.readFileSync(
                    path.join(migrationsDir, file),
                    'utf-8'
                )
                db.exec(sql)
                recordMigration.run(migrationName)
            }
        }
    }

    private resolveDataDir(): string {
        const dataDir = this.config.storage.dataDir
        if (dataDir.startsWith('~')) {
            const home =
                process.env['HOME'] ?? process.env['USERPROFILE'] ?? '.'
            return path.join(home, dataDir.slice(1))
        }
        return dataDir
    }
}