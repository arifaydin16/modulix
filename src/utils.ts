import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';


export async function readAllFiles(dirPath: string, includes: string[] = [], excludes: string[] = []): Promise<string[]> {
    let files = await readdir(dirPath, { withFileTypes: true });
    let fileList: string[] = [];
    if (includes.length > 0) {
        files = files.filter(file => includes.includes(file.name) || includes.includes(path.extname(file.name)));
    }
    if (excludes.length > 0) {
        files = files.filter(file => !excludes.includes(file.name) && !excludes.includes(path.extname(file.name)));
    }
    await Promise.all(files.map(async (file) => {
        const filePath = path.join(dirPath, file.name);
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

interface Stack {
    tagKey: string;
    fullTag: string;
    index: number;
}

export function validateModuleTags(content:string, filePath:string) {
    const tagRegex = /@(!?)([\w-]+)\s+([\w-]+)/g;
    const stack: Stack[] = [];
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
        const unclosed = stack.map(s => s.fullTag).join(', ');
        throw new Error(`Unclosed module blocks found: [${unclosed}] -> File: ${filePath}`);
    }
}

export function extractBlockedContent(content: string): string {
    const tagRegex = /@(!?)([\w-]+)\s+([\w-]+)/g;
    const stack: { tagKey: string; index: number; fullTag: string }[] = [];
    const blocks: { start: number; end: number }[] = [];
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
                    while (i >= 0 && (content[i] === ' ' || content[i] === '\t')) {
                        i--;
                    }
                    if (i >= 1 && content[i] === '/' && content[i - 1] === '/') {
                        blockStart = i - 1;
                    } else if (i >= 1 && content[i] === '*' && content[i - 1] === '/') {
                        blockStart = i - 1;
                    }

                    let j = blockEnd;
                    while (j < content.length && (content[j] === ' ' || content[j] === '\t')) {
                        j++;
                    }
                    if (j + 1 < content.length && content[j] === '*' && content[j + 1] === '/') {
                        blockEnd = j + 2;
                    }

                    blocks.push({ start: blockStart, end: blockEnd });
                }
            }
        }
    }

    if (blocks.length === 0) {
        return '';
    }

    return blocks.map(b => content.substring(b.start, b.end)).join('\n\n');
}

export function parseBlocks(content: string): Map<string, string> {
    const tagRegex = /@(!?)([\w-]+)\s+([\w-]+)/g;
    const stack: { tagKey: string; contentStartIndex: number }[] = [];
    const blocksMap = new Map<string, string>();
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
                while (i >= 0 && (content[i] === ' ' || content[i] === '\t')) {
                    i--;
                }
                if (i >= 1 && content[i] === '/' && content[i - 1] === '/') {
                    closingCommentStart = i - 1;
                } else if (i >= 1 && content[i] === '*' && content[i - 1] === '/') {
                    closingCommentStart = i - 1;
                }

                let indentStart = closingCommentStart;
                while (indentStart > 0 && (content[indentStart - 1] === ' ' || content[indentStart - 1] === '\t')) {
                    indentStart--;
                }
                if (indentStart > 0 && content[indentStart - 1] === '\n') {
                    closingCommentStart = indentStart;
                }

                const blockContent = content.substring(lastOpen.contentStartIndex, closingCommentStart);
                blocksMap.set(tagKey, blockContent);
            }
        }
    }

    return blocksMap;
}

export function syncBlocksInContent(
    content: string,
    templateBlocks: Map<string, string>,
    activeModules: string[]
): string {
    const tagRegex = /@(!?)([\w-]+)\s+([\w-]+)/g;
    const stack: { tagKey: string; moduleName: string; contentStartIndex: number }[] = [];
    const replacements: { start: number; end: number; newContent: string }[] = [];
    let match;

    while ((match = tagRegex.exec(content)) !== null) {
        const [fullTag, isClosing, moduleName, blockName] = match;
        const tagKey = `${moduleName}:${blockName}`;

        if (!isClosing) {
            stack.push({
                tagKey,
                moduleName,
                contentStartIndex: match.index + fullTag.length,
            });
        } else {
            const lastOpen = stack.pop();
            if (lastOpen && lastOpen.tagKey === tagKey) {
                if (stack.length === 0) {
                    let closingCommentStart = match.index;
                    let i = closingCommentStart - 1;
                    while (i >= 0 && (content[i] === ' ' || content[i] === '\t')) {
                        i--;
                    }
                    if (i >= 1 && content[i] === '/' && content[i - 1] === '/') {
                        closingCommentStart = i - 1;
                    } else if (i >= 1 && content[i] === '*' && content[i - 1] === '/') {
                        closingCommentStart = i - 1;
                    }

                    let indentStart = closingCommentStart;
                    while (indentStart > 0 && (content[indentStart - 1] === ' ' || content[indentStart - 1] === '\t')) {
                        indentStart--;
                    }
                    if (indentStart > 0 && content[indentStart - 1] === '\n') {
                        closingCommentStart = indentStart;
                    }

                    const isActive = activeModules.includes(lastOpen.moduleName);
                    let newInnerContent = '';

                    if (isActive) {
                        if (templateBlocks.has(tagKey)) {
                            newInnerContent = templateBlocks.get(tagKey)!;
                        } else {
                            newInnerContent = content.substring(lastOpen.contentStartIndex, closingCommentStart);
                        }
                    } else {
                        const originalInner = content.substring(lastOpen.contentStartIndex, closingCommentStart);
                        if (originalInner.includes('\n')) {
                            newInnerContent = '\n';
                        } else {
                            newInnerContent = '';
                        }
                    }

                    replacements.push({
                        start: lastOpen.contentStartIndex,
                        end: closingCommentStart,
                        newContent: newInnerContent,
                    });
                }
            }
        }
    }

    replacements.sort((a, b) => b.start - a.start);

    let updatedContent = content;
    for (const rep of replacements) {
        updatedContent =
            updatedContent.substring(0, rep.start) +
            rep.newContent +
            updatedContent.substring(rep.end);
    }

    return updatedContent;
}