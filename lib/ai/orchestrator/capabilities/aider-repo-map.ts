/**
 * Aider-style Repo Map — compressed file hierarchy with AST symbol summaries.
 *
 * Inspired by Aider's `repomap` (tree-sitter tags → token-budgeted tree):
 * instead of dumping every file, we extract a compact signature per symbol
 * (functions, classes + methods, interfaces, types, enums, exported consts)
 * and render them as a compressed directory/file tree that fits a token
 * budget. The rendered map is injected into the agent's system prompt so it
 * understands the codebase structure without reading every file — a major
 * token saving (Aider's default budget is ~1024 tokens).
 *
 * This module is PURE (no sandbox/DB access) so it is unit-testable. The
 * bridge-driven file listing and map assembly live in repo-map.ts (buildRepoMap).
 */

import * as ts from 'typescript'

export interface RepoMapSymbol {
  /** function | class | method | interface | type | enum | const */
  kind: RepoMapSymbolKind
  /** Bare symbol name, e.g. "createSandbox" */
  name: string
  /** Compact one-line signature, e.g. "export function createSandbox(...): SandboxResult" */
  signature: string
  /** For classes: method signatures (compact) */
  methods?: string[]
}

export type RepoMapSymbolKind = 'function' | 'class' | 'method' | 'interface' | 'type' | 'enum' | 'const'

export interface RepoMapFile {
  /** Relative path from repo root, forward slashes, e.g. "lib/ai/router.ts" */
  relPath: string
  symbols: RepoMapSymbol[]
}

export interface AiderRepoMapOptions {
  /** Token budget for the whole rendered map (Aider map_max_tokens, default 1024) */
  maxTokens?: number
  /** Max symbols shown per file (extra symbols truncated per file) */
  maxSymbolsPerFile?: number
}

export interface AiderRepoMapResult {
  text: string
  filesIncluded: number
  totalFiles: number
  truncated: boolean
}

// ─── Token estimation ──────────────────────────────────────────────────────
// Mirrors lib/sandbox/cost-estimator.ts: code tends to be ~3.5 chars/token.
export function estimateTokens(text: string): number {
  if (!text) return 0
  const codePatterns = text.match(/[a-zA-Z0-9_]+|[{}()[\]<>;:=+\-*/%&|^~!@#$%^&*(),.?":{}|<>]/g)
  if (!codePatterns) return Math.ceil(text.length / 4)
  const codeTokenRatio = text.includes('\n') || /[{}()[\] ;]/.test(text) ? 3.5 : 4
  return Math.ceil(text.length / codeTokenRatio)
}

// ─── AST symbol extraction (TypeScript compiler API) ──────────────────────
const TS_SCRIPT_KIND: Record<string, ts.ScriptKind> = {
  '.ts': ts.ScriptKind.TS,
  '.tsx': ts.ScriptKind.TSX,
  '.js': ts.ScriptKind.JS,
  '.jsx': ts.ScriptKind.JSX,
  '.mjs': ts.ScriptKind.JS,
  '.cjs': ts.ScriptKind.JS,
}

const isTsFile = (filePath: string): boolean => {
  const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase()
  return ext in TS_SCRIPT_KIND
}

/** Compact signature for a function/method — params + return type, no body. */
function functionSignature(fn: ts.FunctionLikeDeclaration, sourceFile: ts.SourceFile): string {
  const name = fn.name ? fn.name.getText(sourceFile) : '(anonymous)'
  const params = fn.parameters
    .map((p) => {
      const nameText = p.name.getText(sourceFile)
      const optional = p.questionToken ? '?' : ''
      const typeText = p.type ? `: ${p.type.getText(sourceFile)}` : ''
      return `${nameText}${optional}${typeText}`
    })
    .join(', ')
  const returnType = fn.type ? `: ${fn.type.getText(sourceFile)}` : ''
  const isAsync = (ts.getCombinedModifierFlags(fn) & ts.ModifierFlags.Async) !== 0 ? 'async ' : ''
  const exportKw = (ts.getCombinedModifierFlags(fn) & ts.ModifierFlags.Export) !== 0 ? 'export ' : ''
  return `${exportKw}${isAsync}function ${name}(${params})${returnType}`
}

/** Compact signature for a class — name + heritage, no body. */
function classSignature(cls: ts.ClassDeclaration, sourceFile: ts.SourceFile): string {
  const exportKw = (ts.getCombinedModifierFlags(cls) & ts.ModifierFlags.Export) !== 0 ? 'export ' : ''
  const name = cls.name ? cls.name.getText(sourceFile) : '(anonymous)'
  const heritage = cls.heritageClauses?.map((h) => h.getText(sourceFile)).join(' ') || ''
  return `${exportKw}class ${name}${heritage ? ` ${heritage}` : ''}`
}

/** Compact method signature — name + params + return type, no body. */
function methodSignature(method: ts.ClassElement, sourceFile: ts.SourceFile): string | null {
  if (!ts.isMethodDeclaration(method) && !ts.isGetAccessorDeclaration(method) && !ts.isSetAccessorDeclaration(method)) {
    return null
  }
  const name = method.name?.getText(sourceFile)
  if (!name) return null
  const params =
    'parameters' in method
      ? method.parameters
          .map((p) => {
            const nameText = p.name.getText(sourceFile)
            const optional = p.questionToken ? '?' : ''
            const typeText = p.type ? `: ${p.type.getText(sourceFile)}` : ''
            return `${nameText}${optional}${typeText}`
          })
          .join(', ')
      : ''
  const returnType = 'type' in method && method.type ? `: ${method.type.getText(sourceFile)}` : ''
  return `${name}(${params})${returnType}`
}

/** Extract a compact symbol list from TypeScript/JavaScript source. */
export function extractSymbols(content: string, filePath: string): RepoMapSymbol[] {
  const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase()
  const scriptKind = TS_SCRIPT_KIND[ext] ?? ts.ScriptKind.TS
  const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true, scriptKind)
  const symbols: RepoMapSymbol[] = []

  for (const stmt of sourceFile.statements) {
    if (ts.isFunctionDeclaration(stmt) && stmt.name) {
      symbols.push({ kind: 'function', name: stmt.name.text, signature: functionSignature(stmt, sourceFile) })
    } else if (ts.isClassDeclaration(stmt) && stmt.name) {
      const methods: string[] = []
      for (const member of stmt.members) {
        const sig = methodSignature(member, sourceFile)
        if (sig) methods.push(sig)
      }
      symbols.push({
        kind: 'class',
        name: stmt.name.text,
        signature: classSignature(stmt, sourceFile),
        methods: methods.length > 0 ? methods : undefined,
      })
    } else if (ts.isInterfaceDeclaration(stmt) && stmt.name) {
      const exportKw = (ts.getCombinedModifierFlags(stmt) & ts.ModifierFlags.Export) !== 0 ? 'export ' : ''
      symbols.push({ kind: 'interface', name: stmt.name.text, signature: `${exportKw}interface ${stmt.name.text}` })
    } else if (ts.isTypeAliasDeclaration(stmt) && stmt.name) {
      const exportKw = (ts.getCombinedModifierFlags(stmt) & ts.ModifierFlags.Export) !== 0 ? 'export ' : ''
      symbols.push({ kind: 'type', name: stmt.name.text, signature: `${exportKw}type ${stmt.name.text}` })
    } else if (ts.isEnumDeclaration(stmt) && stmt.name) {
      const exportKw = (ts.getCombinedModifierFlags(stmt) & ts.ModifierFlags.Export) !== 0 ? 'export ' : ''
      symbols.push({ kind: 'enum', name: stmt.name.text, signature: `${exportKw}enum ${stmt.name.text}` })
    } else if (ts.isVariableStatement(stmt)) {
      // Only exported variable declarations (const/let/var) — keep map compact
      const isExported =
        ts.canHaveModifiers(stmt) && ts.getModifiers(stmt)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
      if (isExported) {
        for (const decl of stmt.declarationList.declarations) {
          const name = ts.isIdentifier(decl.name) ? decl.name.text : decl.name.getText(sourceFile)
          const typeText = decl.type ? `: ${decl.type.getText(sourceFile)}` : ''
          symbols.push({
            kind: 'const',
            name,
            signature: `export ${stmt.declarationList.flags & ts.NodeFlags.Const ? 'const' : 'let'} ${name}${typeText}`,
          })
        }
      }
    }
  }

  return symbols
}

// ─── Fallback extraction for non-TS languages (regex, best-effort) ────────
const PY_DEF_RE = /^\s*(?:async\s+)?def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*(?:->\s*([^:]+))?\s*:/
const PY_CLASS_RE = /^\s*class\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:\(([^)]*)\))?\s*:/
const GO_FUNC_RE = /^\s*func\s+(?:\([^)]*\)\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)(?:\s*([^(]*))?/

export function extractSymbolsFallback(content: string, filePath: string): RepoMapSymbol[] {
  const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase()
  const symbols: RepoMapSymbol[] = []
  const lines = content.split('\n')

  if (ext === '.py' || ext === '.pyw') {
    for (const line of lines) {
      const defMatch = line.match(PY_DEF_RE)
      if (defMatch) {
        symbols.push({
          kind: 'function',
          name: defMatch[1],
          signature: `def ${defMatch[1]}(${defMatch[2].trim()})${defMatch[3] ? ` -> ${defMatch[3].trim()}` : ''}`,
        })
        continue
      }
      const classMatch = line.match(PY_CLASS_RE)
      if (classMatch) {
        symbols.push({
          kind: 'class',
          name: classMatch[1],
          signature: `class ${classMatch[1]}${classMatch[2] ? `(${classMatch[2].trim()})` : ''}`,
        })
      }
    }
  } else if (ext === '.go') {
    for (const line of lines) {
      const match = line.match(GO_FUNC_RE)
      if (match) {
        const returnType = match[3]?.trim().replace(/[{]/g, '').trim()
        symbols.push({
          kind: 'function',
          name: match[1],
          signature: `func ${match[1]}(${match[2].trim()})${returnType ? ` ${returnType}` : ''}`,
        })
      }
    }
  }

  return symbols
}

/** Extract symbols for any supported file (TS/JS via AST, others via regex). */
export function extractFileSymbols(content: string, filePath: string): RepoMapSymbol[] {
  if (isTsFile(filePath)) return extractSymbols(content, filePath)
  return extractSymbolsFallback(content, filePath)
}

// ─── Compressed hierarchy rendering (Aider-style tree) ────────────────────
interface TreeNode {
  name: string
  isDir: boolean
  symbols?: RepoMapSymbol[]
  children: Map<string, TreeNode>
}

function buildTree(files: RepoMapFile[]): TreeNode {
  const root: TreeNode = { name: '.', isDir: true, children: new Map() }

  for (const file of files) {
    const parts = file.relPath.split('/')
    let node = root
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      const isLast = i === parts.length - 1
      if (!node.children.has(part)) {
        node.children.set(part, { name: part, isDir: !isLast, children: new Map() })
      }
      node = node.children.get(part)!
    }
    node.isDir = false
    node.symbols = file.symbols
  }

  return root
}

interface Budget {
  maxTokens: number
  used: number
  exceeded: boolean
}

/** Render the tree with tree-graphics and enforce the token budget. */
function renderTree(
  node: TreeNode,
  prefix: string,
  isLast: boolean,
  maxSymbolsPerFile: number,
  budget: Budget,
  lines: string[],
  filesIncluded: { count: number },
): void {
  if (budget.exceeded) return

  const connector = isLast ? '└── ' : '├── '
  const childPrefix = prefix + (isLast ? '    ' : '│   ')
  const label = node.isDir ? `${node.name}/` : node.name

  const line = `${prefix}${connector}${label}`
  lines.push(line)
  budget.used += estimateTokens(line)
  if (budget.used > budget.maxTokens) {
    budget.exceeded = true
    return
  }

  if (!node.isDir && node.symbols && node.symbols.length > 0) {
    filesIncluded.count++
    const symbolLines = node.symbols.slice(0, maxSymbolsPerFile)
    for (let i = 0; i < symbolLines.length; i++) {
      const sym = symbolLines[i]
      const symIsLast = i === symbolLines.length - 1
      const symLine = `${childPrefix}${symIsLast ? '└── ' : '├── '}${sym.signature}`
      lines.push(symLine)
      budget.used += estimateTokens(symLine)
      if (budget.used > budget.maxTokens) {
        budget.exceeded = true
        return
      }

      if (sym.methods && sym.methods.length > 0) {
        const methodLines = sym.methods.slice(0, maxSymbolsPerFile)
        for (let j = 0; j < methodLines.length; j++) {
          const mIsLast = j === methodLines.length - 1
          const mLine = `${childPrefix}${symIsLast ? '    ' : '│   '}${mIsLast ? '└── ' : '├── '}${methodLines[j]}`
          lines.push(mLine)
          budget.used += estimateTokens(mLine)
          if (budget.used > budget.maxTokens) {
            budget.exceeded = true
            return
          }
        }
      }
    }
  }

  const children = [...node.children.entries()]
  children.forEach(([, child], index) => {
    renderTree(child, childPrefix, index === children.length - 1, maxSymbolsPerFile, budget, lines, filesIncluded)
  })
}

/**
 * Render a compressed Aider-style repo map from extracted file symbols.
 *
 * Files should already be sorted by importance (repo-map.ts ranks them by
 * directory depth / file count); the tree renders depth-first so the most
 * relevant files appear first within the token budget.
 */
export function buildAiderRepoMapText(files: RepoMapFile[], options: AiderRepoMapOptions = {}): AiderRepoMapResult {
  const maxTokens = options.maxTokens ?? 1024
  const maxSymbolsPerFile = options.maxSymbolsPerFile ?? 12

  // No source files → no map. Returning an empty string (instead of a
  // bare header) lets callers treat it as "nothing to show".
  if (files.length === 0) {
    return { text: '', filesIncluded: 0, totalFiles: 0, truncated: false }
  }

  const root = buildTree(files)
  const budget: Budget = { maxTokens, used: 0, exceeded: false }
  const lines: string[] = ['# Repo Map (Aider-style — compressed)']
  budget.used += estimateTokens(lines[0])

  const filesIncluded = { count: 0 }
  const children = [...root.children.entries()]
  children.forEach(([, child], index) => {
    renderTree(child, '', index === children.length - 1, maxSymbolsPerFile, budget, lines, filesIncluded)
  })

  const truncated = budget.exceeded
  if (truncated) {
    lines.push('… (repo map truncated to fit token budget — run generateRepoMap for more)')
  }

  return {
    text: lines.join('\n'),
    filesIncluded: filesIncluded.count,
    totalFiles: files.length,
    truncated,
  }
}
