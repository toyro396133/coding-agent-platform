/**
 * Shared helpers for classifying files (language, binary, image) based on their
 * filename extension. Used by the file diff viewer, the sandbox local-diff
 * route, and the external agent API diff contract.
 */

export function getLanguageFromFilename(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase()
  const langMap: { [key: string]: string } = {
    js: 'javascript',
    jsx: 'javascript',
    mjs: 'javascript',
    cjs: 'javascript',
    ts: 'typescript',
    tsx: 'typescript',
    py: 'python',
    java: 'java',
    cpp: 'cpp',
    c: 'c',
    cs: 'csharp',
    php: 'php',
    rb: 'ruby',
    go: 'go',
    rs: 'rust',
    swift: 'swift',
    kt: 'kotlin',
    scala: 'scala',
    sh: 'bash',
    yaml: 'yaml',
    yml: 'yaml',
    json: 'json',
    xml: 'xml',
    html: 'html',
    css: 'css',
    scss: 'scss',
    less: 'less',
    md: 'markdown',
    sql: 'sql',
  }
  return langMap[ext || ''] || 'text'
}

export function isImageFile(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase()
  const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'svg', 'webp', 'ico', 'tiff', 'tif']
  return imageExtensions.includes(ext || '')
}

export function isBinaryFile(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase()
  const binaryExtensions = [
    // Archives
    'zip',
    'tar',
    'gz',
    'rar',
    '7z',
    'bz2',
    // Executables
    'exe',
    'dll',
    'so',
    'dylib',
    // Databases
    'db',
    'sqlite',
    'sqlite3',
    // Media (non-image)
    'mp3',
    'mp4',
    'avi',
    'mov',
    'wav',
    'flac',
    // Documents
    'pdf',
    'doc',
    'docx',
    'xls',
    'xlsx',
    'ppt',
    'pptx',
    // Fonts
    'ttf',
    'otf',
    'woff',
    'woff2',
    'eot',
    // Other binary
    'bin',
    'dat',
    'dmg',
    'iso',
    'img',
  ]
  return binaryExtensions.includes(ext || '') || isImageFile(filename)
}
