import fs from 'fs';
import path from 'path';
import os from 'os';
import { ConfigManager } from './config.js';
import { readAllFiles, validateModuleTags, extractBlockedContent, getFileLevelModuleTag } from './utils.js';

export class TemplateManager {
  static getTemplatesDir(): string {
    const localDir = path.join(process.cwd(), '.modulix');
    const localFile = path.join(localDir, 'config.json');
    if (fs.existsSync(localFile)) {
      return path.join(localDir, 'templates');
    }
    return path.join(os.homedir(), '.modulix', 'templates');
  }

  private static get templatesDir(): string {
    return this.getTemplatesDir();
  }

  static async add(templateName: string): Promise<{ success: boolean; message: string }> {
    const config = ConfigManager.get();
    const targetDir = path.join(this.templatesDir, templateName);

    if (fs.existsSync(targetDir)) {
      return { success: false, message: `"${templateName}" template already exists.` };
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

        for (const filePath of files) {
          const content = fs.readFileSync(filePath, 'utf-8');
          validateModuleTags(content, filePath);

          const fileLevelModule = getFileLevelModuleTag(content);
          let extracted = '';
          if (fileLevelModule) {
            extracted = content;
          } else {
            extracted = extractBlockedContent(content);
          }

          if (extracted.trim().length > 0) {
            const relativePath = path.relative(sourceDir, filePath);
            const targetPath = folder.name
              ? path.join(targetDir, folder.name, relativePath)
              : path.join(targetDir, relativePath);

            fs.mkdirSync(path.dirname(targetPath), { recursive: true });
            fs.writeFileSync(targetPath, extracted, 'utf-8');
            copiedFilesCount++;
          }
        }
      }

      if (copiedFilesCount === 0) {
        return { 
          success: false, 
          message: 'No files containing module tags(@<module> <block>) found in the project.' 
        };
      }

      return { 
        success: true, 
        message: `"${templateName}" template created successfully! ${copiedFilesCount} files copied.` 
      };
    } catch (err: any) {
      if (fs.existsSync(targetDir)) {
        fs.rmSync(targetDir, { recursive: true, force: true });
      }
      return { success: false, message: `Error occurred: ${err.message}` };
    }
  }

  static list(): string[] {
    if (!fs.existsSync(this.templatesDir)) {
      return [];
    }
    return fs.readdirSync(this.templatesDir).filter((file) => {
      const fullPath = path.join(this.templatesDir, file);
      return fs.statSync(fullPath).isDirectory();
    });
  }

  static listWithDates(): { name: string; birthtime: Date }[] {
    if (!fs.existsSync(this.templatesDir)) {
      return [];
    }
    return fs.readdirSync(this.templatesDir)
      .filter((file) => {
        const fullPath = path.join(this.templatesDir, file);
        return fs.statSync(fullPath).isDirectory();
      })
      .map((file) => {
        const fullPath = path.join(this.templatesDir, file);
        const stats = fs.statSync(fullPath);
        return {
          name: file,
          birthtime: stats.birthtime,
        };
      });
  }

  static remove(templateNames: string[]): { successCount: number; failed: string[] } {
    let successCount = 0;
    const failed: string[] = [];

    for (const name of templateNames) {
      const targetPath = path.join(this.templatesDir, name);
      try {
        if (fs.existsSync(targetPath)) {
          fs.rmSync(targetPath, { recursive: true, force: true });
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
}
