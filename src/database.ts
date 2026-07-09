import fs from 'node:fs';
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { exec } from 'node:child_process';
import { ConfigManager } from './config.js';
import { TemplateManager } from './templates.js';
import { syncBlocksInContent } from './utils.js';

export interface DbBackupInfo {
  name: string;
  birthtime: Date;
  size: number;
}

function runCommand(cmd: string, env: Record<string, string>): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    exec(cmd, { env: { ...process.env, ...env } }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

function getFileSizeSync(filePath: string): number {
  if (!fs.existsSync(filePath)) return 0;
  const stats = fs.statSync(filePath);
  return stats.size;
}

export class DatabaseManager {
  static getDbBackupsDir(): string {
    const localDir = path.join(process.cwd(), '.modulix');
    const localFile = path.join(localDir, 'config.json');
    if (fs.existsSync(localFile)) {
      return path.join(localDir, 'backups', 'db');
    }
    return path.join(os.homedir(), '.modulix', 'backups', 'db');
  }

  static async createBackup(backupName?: string): Promise<{ success: boolean; message: string; name: string }> {
    const config = ConfigManager.get();
    if (!config.db || !config.db.provider || !config.db.database || !config.db.user) {
      return { success: false, message: 'Database configuration (provider, name, user) is incomplete.', name: '' };
    }

    let name = backupName?.trim();
    if (!name) {
      const now = new Date();
      const pad = (num: number) => String(num).padStart(2, '0');
      name = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
    }

    if (/[\\/:*?"<>|]/.test(name)) {
      return { success: false, message: 'Backup name contains invalid characters!', name };
    }

    const backupsDir = this.getDbBackupsDir();
    const targetFile = path.join(backupsDir, `${name}.sql`);

    if (fs.existsSync(targetFile)) {
      return { success: false, message: `Database backup with name "${name}" already exists.`, name };
    }

    await mkdir(backupsDir, { recursive: true });

    const host = config.db.host || 'localhost';
    const port = config.db.port || (config.db.provider === 'postgresql' ? 5432 : 3306);
    const dbName = config.db.database;
    const user = config.db.user;
    const password = config.db.password || '';

    try {
      if (config.db.provider === 'postgresql') {
        const pgDump = config.db.pgDumpPath || 'pg_dump';
        const cmd = `"${pgDump}" -h ${host} -p ${port} -U ${user} -d ${dbName} -F p -b -f "${targetFile}"`;
        await runCommand(cmd, { PGPASSWORD: password });
      } else {
        const mysqldump = config.db.mysqldumpPath || 'mysqldump';
        const cmd = `"${mysqldump}" -h ${host} -P ${port} -u ${user} --result-file="${targetFile}" ${dbName}`;
        await runCommand(cmd, { MYSQL_PWD: password });
      }

      return { success: true, message: `Database backup "${name}" created successfully.`, name };
    } catch (err: any) {
      if (fs.existsSync(targetFile)) {
        await rm(targetFile, { force: true });
      }
      return { success: false, message: `Failed to create database backup: ${err.message}`, name };
    }
  }

  static listBackups(): DbBackupInfo[] {
    const backupsDir = this.getDbBackupsDir();
    if (!fs.existsSync(backupsDir)) {
      return [];
    }

    return fs.readdirSync(backupsDir)
      .filter((file) => file.endsWith('.sql'))
      .map((file) => {
        const fullPath = path.join(backupsDir, file);
        const stats = fs.statSync(fullPath);
        return {
          name: path.basename(file, '.sql'),
          birthtime: stats.birthtime,
          size: getFileSizeSync(fullPath),
        };
      });
  }

  static async removeBackups(names: string[]): Promise<{ successCount: number; failed: string[] }> {
    const backupsDir = this.getDbBackupsDir();
    let successCount = 0;
    const failed: string[] = [];

    for (const name of names) {
      const targetPath = path.join(backupsDir, `${name}.sql`);
      try {
        if (fs.existsSync(targetPath)) {
          await rm(targetPath, { force: true });
          successCount++;
        } else {
          failed.push(name);
        }
      } catch {
        failed.push(name);
      }
    }

    return { successCount, failed };
  }

  static async swapBackup(backupName: string): Promise<{ success: boolean; message: string }> {
    const config = ConfigManager.get();
    if (!config.db || !config.db.provider || !config.db.database || !config.db.user) {
      return { success: false, message: 'Database configuration is incomplete.' };
    }

    const backupsDir = this.getDbBackupsDir();
    const targetFile = path.join(backupsDir, `${backupName}.sql`);

    if (!fs.existsSync(targetFile)) {
      return { success: false, message: `Database backup file "${backupName}.sql" not found.` };
    }

    const host = config.db.host || 'localhost';
    const port = config.db.port || (config.db.provider === 'postgresql' ? 5432 : 3306);
    const dbName = config.db.database;
    const user = config.db.user;
    const password = config.db.password || '';

    try {
      if (config.db.provider === 'postgresql') {
        const psql = config.db.psqlPath || 'psql';
        const dropCmd = `"${psql}" -h ${host} -p ${port} -U ${user} -d ${dbName} -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"`;
        await runCommand(dropCmd, { PGPASSWORD: password });

        const importCmd = `"${psql}" -h ${host} -p ${port} -U ${user} -d ${dbName} -f "${targetFile}"`;
        await runCommand(importCmd, { PGPASSWORD: password });
      } else {
        const mysql = config.db.mysqlPath || 'mysql';
        const dropCmd = `"${mysql}" -h ${host} -P ${port} -u ${user} -e "DROP DATABASE IF EXISTS \`${dbName}\`; CREATE DATABASE \`${dbName}\`;"`;
        await runCommand(dropCmd, { MYSQL_PWD: password });

        const sqlEscapedPath = targetFile.replace(/\\/g, '/');
        const importCmd = `"${mysql}" -h ${host} -P ${port} -u ${user} ${dbName} -e "source ${sqlEscapedPath}"`;
        await runCommand(importCmd, { MYSQL_PWD: password });
      }

      return { success: true, message: `Database successfully restored from backup "${backupName}".` };
    } catch (err: any) {
      return { success: false, message: `Failed to restore database backup: ${err.message}` };
    }
  }

  static async sync(selectedTemplateName: string, customSchemaPath?: string): Promise<{ success: boolean; message: string }> {
    const config = ConfigManager.get();
    if (!config.db || !config.db.provider || !config.db.database || !config.db.user) {
      return { success: false, message: 'Database configuration is incomplete.' };
    }

    const templateDir = path.join(TemplateManager.getTemplatesDir(), selectedTemplateName);
    if (!fs.existsSync(templateDir)) {
      return { success: false, message: `Template "${selectedTemplateName}" not found.` };
    }

    let templateSqlPath = '';
    if (customSchemaPath) {
      templateSqlPath = customSchemaPath;
    } else {
      const possiblePaths = [
        path.join(templateDir, 'db', 'schema.sql'),
        path.join(templateDir, 'schema.sql')
      ];

      for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
          templateSqlPath = p;
          break;
        }
      }
    }

    if (!templateSqlPath || !fs.existsSync(templateSqlPath)) {
      return { success: false, message: `No database schema file found.` };
    }

    const host = config.db.host || 'localhost';
    const port = config.db.port || (config.db.provider === 'postgresql' ? 5432 : 3306);
    const dbName = config.db.database;
    const user = config.db.user;
    const password = config.db.password || '';

    const tempSqlFile = path.join(process.cwd(), '.modulix', 'temp_sync.sql');

    try {
      const rawContent = await readFile(templateSqlPath, 'utf-8');
      const activeModules = config.active_modules || [];
      const syncedContent = syncBlocksInContent(rawContent, new Map(), activeModules);

      await mkdir(path.dirname(tempSqlFile), { recursive: true });
      await writeFile(tempSqlFile, syncedContent, 'utf-8');

      if (config.db.provider === 'postgresql') {
        const psql = config.db.psqlPath || 'psql';
        const dropCmd = `"${psql}" -h ${host} -p ${port} -U ${user} -d ${dbName} -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"`;
        await runCommand(dropCmd, { PGPASSWORD: password });

        const importCmd = `"${psql}" -h ${host} -p ${port} -U ${user} -d ${dbName} -f "${tempSqlFile}"`;
        await runCommand(importCmd, { PGPASSWORD: password });
      } else {
        const mysql = config.db.mysqlPath || 'mysql';
        const dropCmd = `"${mysql}" -h ${host} -P ${port} -u ${user} -e "DROP DATABASE IF EXISTS \`${dbName}\`; CREATE DATABASE \`${dbName}\`;"`;
        await runCommand(dropCmd, { MYSQL_PWD: password });

        const sqlEscapedPath = tempSqlFile.replace(/\\/g, '/');
        const importCmd = `"${mysql}" -h ${host} -P ${port} -u ${user} ${dbName} -e "source ${sqlEscapedPath}"`;
        await runCommand(importCmd, { MYSQL_PWD: password });
      }

      return { success: true, message: 'Database schema synchronized successfully.' };
    } catch (err: any) {
      return { success: false, message: `Failed to synchronize database schema: ${err.message}` };
    } finally {
      if (fs.existsSync(tempSqlFile)) {
        await rm(tempSqlFile, { force: true });
      }
    }
  }
}
