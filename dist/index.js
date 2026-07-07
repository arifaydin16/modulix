// src/config.ts
import fs from "fs";
import path from "path";
import os from "os";
var ConfigManager = class {
  static getPaths() {
    const localDir = path.join(process.cwd(), ".modularization");
    const localFile = path.join(localDir, "config.json");
    if (fs.existsSync(localFile)) {
      return { configDir: localDir, configFile: localFile, isLocal: true };
    }
    const globalDir = path.join(os.homedir(), ".modularization");
    const globalFile = path.join(globalDir, "config.json");
    return { configDir: globalDir, configFile: globalFile, isLocal: false };
  }
  static initLocal() {
    const localDir = path.join(process.cwd(), ".modularization");
    const localFile = path.join(localDir, "config.json");
    if (fs.existsSync(localFile)) {
      return { success: false, message: "Local configuration already initialized." };
    }
    try {
      fs.mkdirSync(localDir, { recursive: true });
      const defaultConfig = {
        cwd: ".",
        includes: [],
        excludes: ["node_modules", ".git", "dist", ".modularization", "backups"],
        modules: [],
        active_modules: []
      };
      fs.writeFileSync(localFile, JSON.stringify(defaultConfig, null, 2), "utf-8");
      return { success: true, message: `Local configuration initialized at ${localFile}` };
    } catch (err) {
      return { success: false, message: `Failed to initialize local config: ${err.message}` };
    }
  }
  static get() {
    try {
      const { configFile } = this.getPaths();
      if (!fs.existsSync(configFile)) {
        return {};
      }
      const data = fs.readFileSync(configFile, "utf-8");
      return JSON.parse(data);
    } catch (err) {
      return {};
    }
  }
  static setModules(modules) {
    const currentConfig = this.get();
    this.set({ ...currentConfig, modules });
  }
  static addModules(modules) {
    const currentConfig = this.get();
    this.set({ ...currentConfig, modules: Array.isArray(modules) ? [...currentConfig.modules || [], ...modules] : [...currentConfig.modules || [], modules] });
  }
  static addFolders(folders) {
    const currentConfig = this.get();
    this.set({ ...currentConfig, folders: Array.isArray(folders) ? [...currentConfig.folders || [], ...folders] : [...currentConfig.folders || [], folders] });
  }
  static setFolders(folders) {
    const currentConfig = this.get();
    this.set({ ...currentConfig, folders });
  }
  static enableModule(moduleName) {
    const currentConfig = this.get();
    const active = currentConfig.active_modules || [];
    if (!active.includes(moduleName)) {
      this.set({ ...currentConfig, active_modules: [...active, moduleName] });
    }
  }
  static disableModule(moduleName) {
    const currentConfig = this.get();
    const active = currentConfig.active_modules || [];
    this.set({ ...currentConfig, active_modules: active.filter((m) => m !== moduleName) });
  }
  static addIncludes(includes) {
    const currentConfig = this.get();
    const currentIncludes = currentConfig.includes || [];
    const newItems = Array.isArray(includes) ? includes : [includes];
    const updated = Array.from(/* @__PURE__ */ new Set([...currentIncludes, ...newItems]));
    this.set({ ...currentConfig, includes: updated });
  }
  static removeIncludes(includes) {
    const currentConfig = this.get();
    const currentIncludes = currentConfig.includes || [];
    const itemsToRemove = Array.isArray(includes) ? includes : [includes];
    const updated = currentIncludes.filter((item) => !itemsToRemove.includes(item));
    this.set({ ...currentConfig, includes: updated });
  }
  static addExcludes(excludes) {
    const currentConfig = this.get();
    const currentExcludes = currentConfig.excludes || [];
    const newItems = Array.isArray(excludes) ? excludes : [excludes];
    const updated = Array.from(/* @__PURE__ */ new Set([...currentExcludes, ...newItems]));
    this.set({ ...currentConfig, excludes: updated });
  }
  static removeExcludes(excludes) {
    const currentConfig = this.get();
    const currentExcludes = currentConfig.excludes || [];
    const itemsToRemove = Array.isArray(excludes) ? excludes : [excludes];
    const updated = currentExcludes.filter((item) => !itemsToRemove.includes(item));
    this.set({ ...currentConfig, excludes: updated });
  }
  static set(newConfig) {
    try {
      const { configDir, configFile } = this.getPaths();
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }
      const currentConfig = this.get();
      const mergedDb = newConfig.db ? { ...currentConfig.db, ...newConfig.db } : currentConfig.db;
      const updated = {
        ...currentConfig,
        ...newConfig
      };
      if (mergedDb) {
        updated.db = mergedDb;
      }
      fs.writeFileSync(configFile, JSON.stringify(updated, null, 2), "utf-8");
    } catch (err) {
      console.error("An error occurred while writing to the configuration file:", err);
    }
  }
  static getFilePath() {
    return this.getPaths().configFile;
  }
};

// src/templates.ts
import fs2 from "fs";
import path3 from "path";
import os2 from "os";

// src/utils.ts
import { readdir, stat } from "fs/promises";
import path2 from "path";
async function readAllFiles(dirPath, includes = [], excludes = []) {
  let files = await readdir(dirPath, { withFileTypes: true });
  let fileList = [];
  if (includes.length > 0) {
    files = files.filter((file) => includes.includes(file.name) || includes.includes(path2.extname(file.name)));
  }
  if (excludes.length > 0) {
    files = files.filter((file) => !excludes.includes(file.name) && !excludes.includes(path2.extname(file.name)));
  }
  await Promise.all(files.map(async (file) => {
    const filePath = path2.join(dirPath, file.name);
    const fileStat = await stat(filePath);
    if (fileStat.isDirectory()) {
      const nestedFiles = await readAllFiles(filePath, includes, excludes);
      fileList.push(...nestedFiles);
    } else {
      fileList.push(filePath);
    }
  }));
  return fileList;
}
function validateModuleTags(content, filePath) {
  const tagRegex = /@(!?)([\w-]+)\s+([\w-]+)/g;
  const stack = [];
  let match;
  while ((match = tagRegex.exec(content)) !== null) {
    const [fullTag, isClosing, moduleName, blockName] = match;
    const tagKey = `${moduleName}:${blockName}`;
    if (!isClosing) {
      stack.push({ tagKey, fullTag, index: match.index });
    } else {
      if (stack.length === 0) {
        throw new Error(`No opening tag found for closing tag: "${fullTag}" -> File: ${filePath}`);
      }
      const lastOpen = stack.pop();
      if (lastOpen && lastOpen.tagKey !== tagKey) {
        throw new Error(`Tag match error! Tag "${lastOpen.fullTag}" cannot be closed with "${fullTag}". -> File: ${filePath}`);
      }
    }
  }
  if (stack.length > 0) {
    const unclosed = stack.map((s) => s.fullTag).join(", ");
    throw new Error(`Unclosed module blocks found: [${unclosed}] -> File: ${filePath}`);
  }
}
function extractBlockedContent(content) {
  const tagRegex = /@(!?)([\w-]+)\s+([\w-]+)/g;
  const stack = [];
  const blocks = [];
  let match;
  while ((match = tagRegex.exec(content)) !== null) {
    const [fullTag, isClosing, moduleName, blockName] = match;
    const tagKey = `${moduleName}:${blockName}`;
    if (!isClosing) {
      stack.push({ tagKey, index: match.index, fullTag });
    } else {
      if (stack.length === 0) {
        continue;
      }
      const lastOpen = stack.pop();
      if (lastOpen && lastOpen.tagKey === tagKey) {
        if (stack.length === 0) {
          let blockStart = lastOpen.index;
          let blockEnd = match.index + fullTag.length;
          let i = blockStart - 1;
          while (i >= 0 && (content[i] === " " || content[i] === "	")) {
            i--;
          }
          if (i >= 1 && content[i] === "/" && content[i - 1] === "/") {
            blockStart = i - 1;
          } else if (i >= 1 && content[i] === "*" && content[i - 1] === "/") {
            blockStart = i - 1;
          }
          let j = blockEnd;
          while (j < content.length && (content[j] === " " || content[j] === "	")) {
            j++;
          }
          if (j + 1 < content.length && content[j] === "*" && content[j + 1] === "/") {
            blockEnd = j + 2;
          }
          blocks.push({ start: blockStart, end: blockEnd });
        }
      }
    }
  }
  if (blocks.length === 0) {
    return "";
  }
  return blocks.map((b) => content.substring(b.start, b.end)).join("\n\n");
}
function parseBlocks(content) {
  const tagRegex = /@(!?)([\w-]+)\s+([\w-]+)/g;
  const stack = [];
  const blocksMap = /* @__PURE__ */ new Map();
  let match;
  while ((match = tagRegex.exec(content)) !== null) {
    const [fullTag, isClosing, moduleName, blockName] = match;
    const tagKey = `${moduleName}:${blockName}`;
    if (!isClosing) {
      stack.push({ tagKey, contentStartIndex: match.index + fullTag.length });
    } else {
      const lastOpen = stack.pop();
      if (lastOpen && lastOpen.tagKey === tagKey) {
        let closingCommentStart = match.index;
        let i = closingCommentStart - 1;
        while (i >= 0 && (content[i] === " " || content[i] === "	")) {
          i--;
        }
        if (i >= 1 && content[i] === "/" && content[i - 1] === "/") {
          closingCommentStart = i - 1;
        } else if (i >= 1 && content[i] === "*" && content[i - 1] === "/") {
          closingCommentStart = i - 1;
        }
        let indentStart = closingCommentStart;
        while (indentStart > 0 && (content[indentStart - 1] === " " || content[indentStart - 1] === "	")) {
          indentStart--;
        }
        if (indentStart > 0 && content[indentStart - 1] === "\n") {
          closingCommentStart = indentStart;
        }
        const blockContent = content.substring(lastOpen.contentStartIndex, closingCommentStart);
        blocksMap.set(tagKey, blockContent);
      }
    }
  }
  return blocksMap;
}
function syncBlocksInContent(content, templateBlocks, activeModules) {
  const tagRegex = /@(!?)([\w-]+)\s+([\w-]+)/g;
  const stack = [];
  const replacements = [];
  let match;
  while ((match = tagRegex.exec(content)) !== null) {
    const [fullTag, isClosing, moduleName, blockName] = match;
    const tagKey = `${moduleName}:${blockName}`;
    if (!isClosing) {
      stack.push({
        tagKey,
        moduleName,
        contentStartIndex: match.index + fullTag.length
      });
    } else {
      const lastOpen = stack.pop();
      if (lastOpen && lastOpen.tagKey === tagKey) {
        if (stack.length === 0) {
          let closingCommentStart = match.index;
          let i = closingCommentStart - 1;
          while (i >= 0 && (content[i] === " " || content[i] === "	")) {
            i--;
          }
          if (i >= 1 && content[i] === "/" && content[i - 1] === "/") {
            closingCommentStart = i - 1;
          } else if (i >= 1 && content[i] === "*" && content[i - 1] === "/") {
            closingCommentStart = i - 1;
          }
          let indentStart = closingCommentStart;
          while (indentStart > 0 && (content[indentStart - 1] === " " || content[indentStart - 1] === "	")) {
            indentStart--;
          }
          if (indentStart > 0 && content[indentStart - 1] === "\n") {
            closingCommentStart = indentStart;
          }
          const isActive = activeModules.includes(lastOpen.moduleName);
          let newInnerContent = "";
          if (isActive) {
            if (templateBlocks.has(tagKey)) {
              newInnerContent = templateBlocks.get(tagKey);
            } else {
              newInnerContent = content.substring(lastOpen.contentStartIndex, closingCommentStart);
            }
          } else {
            const originalInner = content.substring(lastOpen.contentStartIndex, closingCommentStart);
            if (originalInner.includes("\n")) {
              newInnerContent = "\n";
            } else {
              newInnerContent = "";
            }
          }
          replacements.push({
            start: lastOpen.contentStartIndex,
            end: closingCommentStart,
            newContent: newInnerContent
          });
        }
      }
    }
  }
  replacements.sort((a, b) => b.start - a.start);
  let updatedContent = content;
  for (const rep of replacements) {
    updatedContent = updatedContent.substring(0, rep.start) + rep.newContent + updatedContent.substring(rep.end);
  }
  return updatedContent;
}

// src/templates.ts
var TemplateManager = class {
  static getTemplatesDir() {
    const localDir = path3.join(process.cwd(), ".modularization");
    const localFile = path3.join(localDir, "config.json");
    if (fs2.existsSync(localFile)) {
      return path3.join(localDir, "templates");
    }
    return path3.join(os2.homedir(), ".modularization", "templates");
  }
  static get templatesDir() {
    return this.getTemplatesDir();
  }
  static async add(templateName) {
    const config = ConfigManager.get();
    const sourceDir = config.cwd || process.cwd();
    const targetDir = path3.join(this.templatesDir, templateName);
    if (!fs2.existsSync(sourceDir)) {
      return { success: false, message: `Resource directory does not exist: ${sourceDir}` };
    }
    if (fs2.existsSync(targetDir)) {
      return { success: false, message: `"${templateName}" template already exists.` };
    }
    const includes = config.includes || [];
    const excludes = config.excludes && config.excludes.length > 0 ? config.excludes : ["node_modules", ".git", "dist", ".modularization", "backups"];
    try {
      const files = await readAllFiles(sourceDir, includes, excludes);
      const fileContents = [];
      for (const filePath of files) {
        const content = fs2.readFileSync(filePath, "utf-8");
        validateModuleTags(content, filePath);
        fileContents.push({ filePath, content });
      }
      let copiedFilesCount = 0;
      for (const { filePath, content } of fileContents) {
        const extracted = extractBlockedContent(content);
        if (extracted.trim().length > 0) {
          const relativePath = path3.relative(sourceDir, filePath);
          const targetPath = path3.join(targetDir, relativePath);
          fs2.mkdirSync(path3.dirname(targetPath), { recursive: true });
          fs2.writeFileSync(targetPath, extracted, "utf-8");
          copiedFilesCount++;
        }
      }
      if (copiedFilesCount === 0) {
        return {
          success: false,
          message: "No files containing module tags(@<module> <block>) found in the project."
        };
      }
      return {
        success: true,
        message: `"${templateName}" template created successfully! ${copiedFilesCount} files copied.`
      };
    } catch (err) {
      if (fs2.existsSync(targetDir)) {
        fs2.rmSync(targetDir, { recursive: true, force: true });
      }
      return { success: false, message: `Error occurred: ${err.message}` };
    }
  }
  static list() {
    if (!fs2.existsSync(this.templatesDir)) {
      return [];
    }
    return fs2.readdirSync(this.templatesDir).filter((file) => {
      const fullPath = path3.join(this.templatesDir, file);
      return fs2.statSync(fullPath).isDirectory();
    });
  }
  static listWithDates() {
    if (!fs2.existsSync(this.templatesDir)) {
      return [];
    }
    return fs2.readdirSync(this.templatesDir).filter((file) => {
      const fullPath = path3.join(this.templatesDir, file);
      return fs2.statSync(fullPath).isDirectory();
    }).map((file) => {
      const fullPath = path3.join(this.templatesDir, file);
      const stats = fs2.statSync(fullPath);
      return {
        name: file,
        birthtime: stats.birthtime
      };
    });
  }
  static remove(templateNames) {
    let successCount = 0;
    const failed = [];
    for (const name of templateNames) {
      const targetPath = path3.join(this.templatesDir, name);
      try {
        if (fs2.existsSync(targetPath)) {
          fs2.rmSync(targetPath, { recursive: true, force: true });
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
};

// src/index.ts
function modulerize(options) {
  return {
    success: true,
    message: `Module "${options.name}" has been processed.`,
    options
  };
}
export {
  ConfigManager,
  TemplateManager,
  extractBlockedContent,
  modulerize,
  parseBlocks,
  readAllFiles,
  syncBlocksInContent,
  validateModuleTags
};
//# sourceMappingURL=index.js.map