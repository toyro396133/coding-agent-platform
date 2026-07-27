import { tool } from 'ai'
import { z } from 'zod'
import type { ToolContext } from './types'
import { SandboxBridge } from '../runtime/sandbox-bridge'

export function createLspTools(ctx: ToolContext) {
  const bridge = new SandboxBridge(ctx.taskId)

  const getScriptPath = '.lsp-helper.mjs'

  async function runLspScript(script: string): Promise<string> {
    await bridge.writeFile(getScriptPath, script)
    const result = await bridge.runInProject('node', [getScriptPath])
    await bridge.runInProject('rm', [getScriptPath])
    if (!result.success) return `LSP error: ${result.error || 'Script failed'}`
    return result.output || '{}'
  }

  return {
    goToDefinition: tool({
      description: 'Find the definition of a symbol at a given position in a file. Uses TypeScript language server.',
      inputSchema: z.object({
        filePath: z.string().describe('Path to the file (relative to project root)'),
        line: z.number().min(0).describe('Line number (0-indexed)'),
        character: z.number().min(0).describe('Character position in the line (0-indexed)'),
      }),
      execute: async ({ filePath, line, character }) => {
        if (!bridge.isAvailable()) return 'No active sandbox — cannot query LSP'
        try {
          const script = `
import ts from 'typescript';
import fs from 'fs';
import path from 'path';
const filename = '${filePath.replace(/'/g, "\\'")}';
const line = ${line};
const character = ${character};
let configPath = process.cwd();
while (configPath !== '/') {
  if (fs.existsSync(path.join(configPath, 'tsconfig.json'))) break;
  configPath = path.dirname(configPath);
}
const tsconfigPath = path.join(configPath, 'tsconfig.json');
const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
const parsedConfig = ts.parseJsonConfigFileContent(configFile.config, ts.sys, configPath);
const host = {
  getScriptFileNames: () => parsedConfig.fileNames,
  getScriptVersion: () => '0',
  getScriptSnapshot: (fn) => { if (!fs.existsSync(fn)) return undefined; return ts.ScriptSnapshot.fromString(fs.readFileSync(fn, 'utf8')); },
  getCurrentDirectory: () => configPath,
  getCompilationSettings: () => parsedConfig.options,
  getDefaultLibFileName: (o) => ts.getDefaultLibFilePath(o),
  fileExists: ts.sys.fileExists,
  readFile: ts.sys.readFile,
  readDirectory: ts.sys.readDirectory,
  directoryExists: ts.sys.directoryExists,
  getDirectories: ts.sys.getDirectories,
};
const service = ts.createLanguageService(host, ts.createDocumentRegistry());
const fullPath = path.resolve(configPath, filename.replace(/^\\/+/, ''));
const program = service.getProgram();
if (!program) { console.log(JSON.stringify({ error: 'No program' })); process.exit(1); }
const sourceFile = program.getSourceFile(fullPath);
if (!sourceFile) { console.log(JSON.stringify({ error: 'File not found', file: fullPath })); process.exit(1); }
const offset = ts.getPositionOfLineAndCharacter(sourceFile, line, character);
const definitions = service.getDefinitionAtPosition(fullPath, offset);
if (definitions && definitions.length > 0) {
  const results = definitions.map(d => {
    const sf = program.getSourceFile(d.fileName);
    if (!sf) return null;
    const s = ts.getLineAndCharacterOfPosition(sf, d.textSpan.start);
    const e = ts.getLineAndCharacterOfPosition(sf, d.textSpan.start + d.textSpan.length);
    return { uri: 'file://' + d.fileName, range: { start: s, end: e } };
  }).filter(Boolean);
  console.log(JSON.stringify({ definitions: results }));
} else {
  console.log(JSON.stringify({ definitions: [] }));
}`
          const output = await runLspScript(script)
          return `Definition result:\n${output}`
        } catch (error) {
          return `LSP error: ${error instanceof Error ? error.message : 'Unknown error'}`
        }
      },
    }),

    getHover: tool({
      description: 'Get hover information (type, documentation) for a symbol at a position.',
      inputSchema: z.object({
        filePath: z.string().describe('Path to the file (relative to project root)'),
        line: z.number().min(0).describe('Line number (0-indexed)'),
        character: z.number().min(0).describe('Character position (0-indexed)'),
      }),
      execute: async ({ filePath, line, character }) => {
        if (!bridge.isAvailable()) return 'No active sandbox — cannot query LSP'
        try {
          const script = `
import ts from 'typescript';
import fs from 'fs';
import path from 'path';
const filename = '${filePath.replace(/'/g, "\\'")}';
const line = ${line};
const character = ${character};
let configPath = process.cwd();
while (configPath !== '/') {
  if (fs.existsSync(path.join(configPath, 'tsconfig.json'))) break;
  configPath = path.dirname(configPath);
}
const tsconfigPath = path.join(configPath, 'tsconfig.json');
const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
const parsedConfig = ts.parseJsonConfigFileContent(configFile.config, ts.sys, configPath);
const host = {
  getScriptFileNames: () => parsedConfig.fileNames,
  getScriptVersion: () => '0',
  getScriptSnapshot: (fn) => { if (!fs.existsSync(fn)) return undefined; return ts.ScriptSnapshot.fromString(fs.readFileSync(fn, 'utf8')); },
  getCurrentDirectory: () => configPath,
  getCompilationSettings: () => parsedConfig.options,
  getDefaultLibFileName: (o) => ts.getDefaultLibFilePath(o),
  fileExists: ts.sys.fileExists,
  readFile: ts.sys.readFile,
  readDirectory: ts.sys.readDirectory,
  directoryExists: ts.sys.directoryExists,
  getDirectories: ts.sys.getDirectories,
};
const service = ts.createLanguageService(host, ts.createDocumentRegistry());
const fullPath = path.resolve(configPath, filename.replace(/^\\/+/, ''));
const program = service.getProgram();
if (!program) { console.log(JSON.stringify({ error: 'No program' })); process.exit(1); }
const sourceFile = program.getSourceFile(fullPath);
if (!sourceFile) { console.log(JSON.stringify({ error: 'File not found' })); process.exit(1); }
const offset = ts.getPositionOfLineAndCharacter(sourceFile, line, character);
const info = service.getQuickInfoAtPosition(fullPath, offset);
if (info) {
  const parts = info.displayParts ? info.displayParts.map(p => p.text).join('') : '';
  const docs = info.documentation ? info.documentation.map(d => d.text).join('\\n') : '';
  console.log(JSON.stringify({ type: parts, documentation: docs }));
} else {
  console.log(JSON.stringify({ type: null }));
}`
          const output = await runLspScript(script)
          return `Hover info:\n${output}`
        } catch (error) {
          return `LSP error: ${error instanceof Error ? error.message : 'Unknown error'}`
        }
      },
    }),

    getCompletions: tool({
      description: 'Get code completion suggestions at a position in a file.',
      inputSchema: z.object({
        filePath: z.string().describe('Path to the file (relative to project root)'),
        line: z.number().min(0).describe('Line number (0-indexed)'),
        character: z.number().min(0).describe('Character position (0-indexed)'),
      }),
      execute: async ({ filePath, line, character }) => {
        if (!bridge.isAvailable()) return 'No active sandbox — cannot query LSP'
        try {
          const script = `
import ts from 'typescript';
import fs from 'fs';
import path from 'path';
const filename = '${filePath.replace(/'/g, "\\'")}';
const line = ${line};
const character = ${character};
let configPath = process.cwd();
while (configPath !== '/') {
  if (fs.existsSync(path.join(configPath, 'tsconfig.json'))) break;
  configPath = path.dirname(configPath);
}
const tsconfigPath = path.join(configPath, 'tsconfig.json');
const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
const parsedConfig = ts.parseJsonConfigFileContent(configFile.config, ts.sys, configPath);
const host = {
  getScriptFileNames: () => parsedConfig.fileNames,
  getScriptVersion: () => '0',
  getScriptSnapshot: (fn) => { if (!fs.existsSync(fn)) return undefined; return ts.ScriptSnapshot.fromString(fs.readFileSync(fn, 'utf8')); },
  getCurrentDirectory: () => configPath,
  getCompilationSettings: () => parsedConfig.options,
  getDefaultLibFileName: (o) => ts.getDefaultLibFilePath(o),
  fileExists: ts.sys.fileExists,
  readFile: ts.sys.readFile,
  readDirectory: ts.sys.readDirectory,
  directoryExists: ts.sys.directoryExists,
  getDirectories: ts.sys.getDirectories,
};
const service = ts.createLanguageService(host, ts.createDocumentRegistry());
const fullPath = path.resolve(configPath, filename.replace(/^\\/+/, ''));
const program = service.getProgram();
if (!program) { console.log(JSON.stringify({ error: 'No program' })); process.exit(1); }
const sourceFile = program.getSourceFile(fullPath);
if (!sourceFile) { console.log(JSON.stringify({ error: 'File not found' })); process.exit(1); }
const offset = ts.getPositionOfLineAndCharacter(sourceFile, line, character);
const completions = service.getCompletionsAtPosition(fullPath, offset, {});
if (completions && completions.entries.length > 0) {
  const results = completions.entries.slice(0, 20).map(e => ({ name: e.name, kind: e.kind }));
  console.log(JSON.stringify({ completions: results }));
} else {
  console.log(JSON.stringify({ completions: [] }));
}`
          const output = await runLspScript(script)
          return `Completions:\n${output}`
        } catch (error) {
          return `LSP error: ${error instanceof Error ? error.message : 'Unknown error'}`
        }
      },
    }),
  }
}
