import fs from 'node:fs';
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { ConfigManager } from './config.js';
import { TemplateManager } from './templates.js';
import { readAllFiles, validateModuleTags, parseBlocks, syncBlocksInContent, getFileLevelModuleTag, getBlockChanges } from './utils.js';

export interface ModuleInfo {
  name: string;
  active: boolean;
}

export interface SyncFileReport {
  relativePath: string;
  status: 'created' | 'diff' | 'deleted';
  blockChanges?: { tag: string; status: 'created' | 'diff' | 'deleted' }[];
}

export class ModuleManager {
  static list(): ModuleInfo[] {
    const config = ConfigManager.get();
    const modules = config.modules || [];
    const active = config.active_modules || [];
    return modules.map(m => ({
      name: m,
      active: active.includes(m)
    }));
  }

  static clear(): void {
    ConfigManager.setModules([]);
  }

  static add(moduleNames: string[]): void {
    ConfigManager.addModules(moduleNames);
  }

  static remove(moduleNames: string[]): void {
    const config = ConfigManager.get();
    const modules = config.modules || [];
    const updatedModules = modules.filter(m => !moduleNames.includes(m));
    ConfigManager.setModules(updatedModules);
  }

  static enable(moduleName: string): void {
    ConfigManager.enableModule(moduleName);
  }

  static disable(moduleName: string): void {
    ConfigManager.disableModule(moduleName);
  }

  static async sync(selectedTemplateName: string, backupName?: string): Promise<{ success: boolean; message: string; reports: SyncFileReport[] }> {
    const config = ConfigManager.get();
    if (config.cwd === undefined) {
      return { success: false, message: 'Please define cwd (project root directory) in configuration before synchronizing folders.', reports: [] };
    }

    const templates = TemplateManager.list();
    if (!templates.includes(selectedTemplateName)) {
      return { success: false, message: `Template "${selectedTemplateName}" not found.`, reports: [] };
    }

    try {
      const backupRoot = path.join(process.cwd(), 'backups');
      const includes = config.includes || [];
      const excludes = config.excludes && config.excludes.length > 0
        ? config.excludes
        : ['node_modules', '.git', 'dist', '.modulix', 'backups'];

      const folders = config.folders && config.folders.length > 0
        ? config.folders
        : [{ name: '', path: config.cwd || process.cwd() }];

      const activeModules = config.active_modules || [];
      const templateDir = path.join(TemplateManager.getTemplatesDir(), selectedTemplateName);
      const reports: SyncFileReport[] = [];

      for (const folder of folders) {
        const sourceDir = path.resolve(config.cwd || process.cwd(), folder.path);
        if (!fs.existsSync(sourceDir)) {
          continue;
        }

        const files = await readAllFiles(sourceDir, includes, excludes);
        const folderTemplateDir = folder.name ? path.join(templateDir, folder.name) : templateDir;

        for (const file of files) {
          const content = await readFile(file, 'utf-8');
          const relativePath = path.relative(sourceDir, file);
          const reportPath = folder.name ? path.join(folder.name, relativePath) : relativePath;

          validateModuleTags(content, file);

          // Check file-level module tag
          const fileLevelModule = getFileLevelModuleTag(content);
          if (fileLevelModule && !activeModules.includes(fileLevelModule)) {
            if (config.backupBeforeSync && backupName) {
              const backupFilePath = folder.name
                ? path.join(backupRoot, backupName, folder.name, relativePath)
                : path.join(backupRoot, backupName, relativePath);
              await mkdir(path.dirname(backupFilePath), { recursive: true });
              await writeFile(backupFilePath, content, 'utf-8');
            }
            await rm(file, { force: true });
            reports.push({ relativePath: reportPath, status: 'deleted' });
            continue;
          }

          if (config.backupBeforeSync && backupName) {
            const backupFilePath = folder.name
              ? path.join(backupRoot, backupName, folder.name, relativePath)
              : path.join(backupRoot, backupName, relativePath);
            await mkdir(path.dirname(backupFilePath), { recursive: true });
            await writeFile(backupFilePath, content, 'utf-8');
          }

          const templateFilePath = path.join(folderTemplateDir, relativePath);
          let templateBlocks = new Map<string, string>();

          if (fs.existsSync(templateFilePath)) {
            const templateContent = await readFile(templateFilePath, 'utf-8');
            templateBlocks = parseBlocks(templateContent);
          }

          const updatedContent = syncBlocksInContent(content, templateBlocks, activeModules);

          if (updatedContent !== content) {
            await writeFile(file, updatedContent, 'utf-8');
            const blockChanges = getBlockChanges(content, updatedContent, templateBlocks, activeModules);
            reports.push({ relativePath: reportPath, status: 'diff', blockChanges });
          }
        }

        // Check template files and restore
        if (fs.existsSync(folderTemplateDir)) {
          const templateFiles = await readAllFiles(folderTemplateDir, [], []);
          for (const tempFile of templateFiles) {
            const relativePath = path.relative(folderTemplateDir, tempFile);
            const projectFilePath = path.join(sourceDir, relativePath);
            const reportPath = folder.name ? path.join(folder.name, relativePath) : relativePath;

            if (!fs.existsSync(projectFilePath)) {
              const templateContent = await readFile(tempFile, 'utf-8');
              const fileLevelModule = getFileLevelModuleTag(templateContent);

              if (fileLevelModule && activeModules.includes(fileLevelModule)) {
                await mkdir(path.dirname(projectFilePath), { recursive: true });
                const updatedContent = syncBlocksInContent(templateContent, new Map(), activeModules);
                await writeFile(projectFilePath, updatedContent, 'utf-8');
                reports.push({ relativePath: reportPath, status: 'created' });
              }
            }
          }
        }
      }

      return { success: true, message: 'Synchronization completed successfully.', reports };
    } catch (err: any) {
      return { success: false, message: err.message, reports: [] };
    }
  }
}
