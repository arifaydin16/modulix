import fs from 'node:fs';
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { ConfigManager } from './config.js';
import { readAllFiles } from './utils.js';

export interface BackupInfo {
  name: string;
  birthtime: Date;
  size: number;
}

export interface FileStatus {
  relativePath: string;
  status: 'backed_up' | 'diff' | 'no_backup';
}

function getFolderSizeSync(dirPath: string): number {
  let size = 0;
  if (!fs.existsSync(dirPath)) return 0;
  const stats = fs.statSync(dirPath);
  if (stats.isFile()) {
    return stats.size;
  }
  if (stats.isDirectory()) {
    const files = fs.readdirSync(dirPath);
    for (const file of files) {
      size += getFolderSizeSync(path.join(dirPath, file));
    }
  }
  return size;
}

export class BackupManager {
  static getBackupsDir(): string {
    const localDir = path.join(process.cwd(), '.modulix');
    const localFile = path.join(localDir, 'config.json');
    if (fs.existsSync(localFile)) {
      return path.join(localDir, 'backups');
    }
    return path.join(os.homedir(), '.modulix', 'backups');
  }

  static async create(backupName?: string): Promise<{ success: boolean; message: string; name: string }> {
    const config = ConfigManager.get();
    const backupsDir = this.getBackupsDir();

    let name = backupName?.trim();
    if (!name) {
      const now = new Date();
      const pad = (num: number) => String(num).padStart(2, '0');
      name = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
    }

    if (/[\\/:*?"<>|]/.test(name)) {
      return { success: false, message: 'Backup name contains invalid characters!', name };
    }

    const targetDir = path.join(backupsDir, name);
    if (fs.existsSync(targetDir)) {
      return { success: false, message: `Backup with name "${name}" already exists.`, name };
    }

    const folders = config.folders && config.folders.length > 0
      ? config.folders
      : [{ name: '', path: config.cwd || process.cwd() }];

    const includes = config.includes || [];
    const excludes = config.excludes && config.excludes.length > 0
      ? config.excludes
      : ['node_modules', '.git', 'dist', '.modulix', 'backups'];

    try {
      let copiedFilesCount = 0;

      for (const folder of folders) {
        const sourceDir = path.resolve(config.cwd || process.cwd(), folder.path);
        if (!fs.existsSync(sourceDir)) {
          continue;
        }

        const files = await readAllFiles(sourceDir, includes, excludes);

        for (const file of files) {
          const relativePath = path.relative(sourceDir, file);
          const targetPath = folder.name
            ? path.join(targetDir, folder.name, relativePath)
            : path.join(targetDir, relativePath);

          const content = await readFile(file);
          await mkdir(path.dirname(targetPath), { recursive: true });
          await writeFile(targetPath, content);
          copiedFilesCount++;
        }
      }

      return {
        success: true,
        message: `Backup "${name}" created successfully. ${copiedFilesCount} files backed up.`,
        name
      };
    } catch (err: any) {
      if (fs.existsSync(targetDir)) {
        await rm(targetDir, { recursive: true, force: true });
      }
      return { success: false, message: `Failed to create backup: ${err.message}`, name };
    }
  }

  static list(): BackupInfo[] {
    const backupsDir = this.getBackupsDir();
    if (!fs.existsSync(backupsDir)) {
      return [];
    }

    return fs.readdirSync(backupsDir)
      .filter((file) => {
        const fullPath = path.join(backupsDir, file);
        return fs.statSync(fullPath).isDirectory();
      })
      .map((file) => {
        const fullPath = path.join(backupsDir, file);
        const stats = fs.statSync(fullPath);
        return {
          name: file,
          birthtime: stats.birthtime,
          size: getFolderSizeSync(fullPath),
        };
      });
  }

  static async remove(names: string[]): Promise<{ successCount: number; failed: string[] }> {
    const backupsDir = this.getBackupsDir();
    let successCount = 0;
    const failed: string[] = [];

    for (const name of names) {
      const targetPath = path.join(backupsDir, name);
      try {
        if (fs.existsSync(targetPath)) {
          await rm(targetPath, { recursive: true, force: true });
          successCount++;
        } else {
          failed.push(name);
        }
      } catch (err) {
        failed.push(name);
      }
    }

    return { successCount, failed };
  }

  static async status(backupName: string): Promise<{ success: boolean; message: string; files: FileStatus[] }> {
    const config = ConfigManager.get();
    const backupsDir = this.getBackupsDir();
    const targetDir = path.join(backupsDir, backupName);

    if (!fs.existsSync(targetDir)) {
      return { success: false, message: `Backup with name "${backupName}" does not exist.`, files: [] };
    }

    const folders = config.folders && config.folders.length > 0
      ? config.folders
      : [{ name: '', path: config.cwd || process.cwd() }];

    const includes = config.includes || [];
    const excludes = config.excludes && config.excludes.length > 0
      ? config.excludes
      : ['node_modules', '.git', 'dist', '.modulix', 'backups'];

    try {
      const fileStatuses: FileStatus[] = [];

      for (const folder of folders) {
        const sourceDir = path.resolve(config.cwd || process.cwd(), folder.path);
        if (!fs.existsSync(sourceDir)) {
          continue;
        }

        const files = await readAllFiles(sourceDir, includes, excludes);
        const folderBackupDir = folder.name ? path.join(targetDir, folder.name) : targetDir;

        for (const file of files) {
          const relativePath = path.relative(sourceDir, file);
          const backupFilePath = path.join(folderBackupDir, relativePath);
          const reportPath = folder.name ? path.join(folder.name, relativePath) : relativePath;

          if (!fs.existsSync(backupFilePath)) {
            fileStatuses.push({ relativePath: reportPath, status: 'no_backup' });
          } else {
            try {
              const projectBuffer = await readFile(file);
              const backupBuffer = await readFile(backupFilePath);
              if (projectBuffer.equals(backupBuffer)) {
                fileStatuses.push({ relativePath: reportPath, status: 'backed_up' });
              } else {
                fileStatuses.push({ relativePath: reportPath, status: 'diff' });
              }
            } catch (err) {
              fileStatuses.push({ relativePath: reportPath, status: 'diff' });
            }
          }
        }
      }

      return { success: true, message: 'Status calculated successfully.', files: fileStatuses };
    } catch (err: any) {
      return { success: false, message: `Failed to calculate backup status: ${err.message}`, files: [] };
    }
  }

  static async swap(backupName: string): Promise<{ success: boolean; message: string }> {
    const config = ConfigManager.get();
    const backupsDir = this.getBackupsDir();
    const targetDir = path.join(backupsDir, backupName);

    if (!fs.existsSync(targetDir)) {
      return { success: false, message: `Backup with name "${backupName}" does not exist.` };
    }

    const folders = config.folders && config.folders.length > 0
      ? config.folders
      : [{ name: '', path: config.cwd || process.cwd() }];

    const includes = config.includes || [];
    const excludes = config.excludes && config.excludes.length > 0
      ? config.excludes
      : ['node_modules', '.git', 'dist', '.modulix', 'backups'];

    try {
      for (const folder of folders) {
        const sourceDir = path.resolve(config.cwd || process.cwd(), folder.path);
        if (!fs.existsSync(sourceDir)) {
          continue;
        }

        const projectFiles = await readAllFiles(sourceDir, includes, excludes);

        for (const file of projectFiles) {
          if (fs.existsSync(file)) {
            await rm(file, { force: true });
          }
        }

        const folderBackupDir = folder.name ? path.join(targetDir, folder.name) : targetDir;

        if (fs.existsSync(folderBackupDir)) {
          const backupFiles = await readAllFiles(folderBackupDir, [], []);

          for (const file of backupFiles) {
            const relativePath = path.relative(folderBackupDir, file);
            const projectFilePath = path.join(sourceDir, relativePath);

            const content = await readFile(file);
            await mkdir(path.dirname(projectFilePath), { recursive: true });
            await writeFile(projectFilePath, content);
          }
        }
      }

      return { success: true, message: `Project successfully restored from backup "${backupName}".` };
    } catch (err: any) {
      return { success: false, message: `Failed to restore backup: ${err.message}` };
    }
  }
}
