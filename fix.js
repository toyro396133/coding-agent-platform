const fs = require('fs');
const path = require('path');

// 1. Schema fix
let schema = fs.readFileSync('lib/db/schema.ts', 'utf8');
if (!schema.includes("proposalsBank")) {
    schema = schema.replace("import { z } from 'zod'", "import { z } from 'zod'\nimport { nanoid } from 'nanoid'");
    const memoriesRegex = /(export const memories = pgTable\(\s*'memories',\s*\{\s*id:\s*text\('id'\)\.primaryKey\(\)),/;
    const beforeReplace = schema;
    schema = schema.replace(memoriesRegex, "$1.$defaultFn(() => nanoid()),");
    if (schema === beforeReplace) {
        throw new Error("Failed to inject $defaultFn(() => nanoid()) into memories table - regex did not match");
    }
    schema += `

export const proposalsBank = pgTable('proposals_bank', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  title: text('title').notNull(),
  description: text('description').notNull(),
  tags: text('tags').array(),
  status: text('status', {
    enum: ['pending', 'accepted', 'rejected'],
  }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const insertProposalSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1, 'Title is required'),
  description: z.string().min(1, 'Description is required'),
  tags: z.array(z.string()).optional(),
  status: z.enum(['pending', 'accepted', 'rejected']).optional(),
  createdAt: z.date().optional(),
})

export const selectProposalSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  tags: z.array(z.string()).nullable(),
  status: z.enum(['pending', 'accepted', 'rejected']).nullable(),
  createdAt: z.date(),
})

export type Proposal = z.infer<typeof selectProposalSchema>
export type InsertProposal = z.infer<typeof insertProposalSchema>

export const backgroundTestsBank = pgTable('background_tests_bank', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  name: text('name').notNull(),
  description: text('description'),
  tags: text('tags').array(),
  isEnabled: boolean('is_enabled').default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const insertBackgroundTestSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  isEnabled: z.boolean().optional(),
  createdAt: z.date().optional(),
})

export const selectBackgroundTestSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  tags: z.array(z.string()).nullable(),
  isEnabled: z.boolean().nullable(),
  createdAt: z.date(),
})

export type BackgroundTest = z.infer<typeof selectBackgroundTestSchema>
export type InsertBackgroundTest = z.infer<typeof insertBackgroundTestSchema>
`;
    fs.writeFileSync('lib/db/schema.ts', schema);
}

// 2. Exact Logs Replace - avoiding regex to prevent syntax errors

function replaceLine(filePath, matchStr, replaceStr) {
    if (fs.existsSync(filePath)) {
        let content = fs.readFileSync(filePath, 'utf8');
        content = content.replace(matchStr, replaceStr);
        fs.writeFileSync(filePath, content);
    }
}

function replaceGlobal(filePath, regex, replaceStr) {
    if (fs.existsSync(filePath)) {
        let content = fs.readFileSync(filePath, 'utf8');
        content = content.replace(regex, replaceStr);
        fs.writeFileSync(filePath, content);
    }
}

// Replace common logs carefully
replaceGlobal('components/file-editor.tsx', /console\.log\(\s*`\[Save Command\] Cmd\/Ctrl \+ S pressed in editor.*`\n\s*\)/g, "console.log('Action logged')");
replaceGlobal('components/file-editor.tsx', /console\.log\(\s*`\[Save Command\] Cmd\/Ctrl \+ S pressed globally.*`\n\s*\)/g, "console.log('Action logged')");
replaceGlobal('components/file-editor.tsx', /console\.log\(\n\s*`\[Save Command\] Cmd\/Ctrl \+ S pressed in editor: \$\{key\}`\n\s*\)/g, "console.log('Action logged')");
replaceGlobal('components/file-editor.tsx', /console\.log\(\n\s*`\[Save Command\] Cmd\/Ctrl \+ S pressed globally: \$\{e\.key\}`\n\s*\)/g, "console.log('Action logged')");
replaceGlobal('components/file-editor.tsx', /console\.log\(\s*'\[Unsaved Changes\] Tracked:',\s*\{[\s\S]*?\}\s*\)/g, "console.log('[Unsaved Changes] Tracked')");
replaceGlobal('components/file-editor.tsx', /console\.log\(\s*'\[Save\] Current state:',\s*\{[\s\S]*?\}\s*\)/g, "console.log('[Save] Current state')");
replaceGlobal('components/file-editor.tsx', /console\.log\(\s*'\[Save\] Skipping save:',\s*\{[\s\S]*?\}\s*\)/g, "console.log('[Save] Skipping save')");
replaceGlobal('components/file-editor.tsx', /console\.log\(\s*'\[Save\] Post-save check:',\s*\{[\s\S]*?\}\s*\)/g, "console.log('[Save] Post-save check')");
replaceGlobal('components/file-editor.tsx', /console\.log\(\s*'\[F12\] Definition found:',\s*\{[\s\S]*?\}\s*\)/g, "console.log('[F12] Definition found')");
replaceGlobal('components/file-editor.tsx', /console\.log\(\s*'\[Mouse Click\] Mouse down event:',\s*\{[\s\S]*?\}\s*\)/g, "console.log('[Mouse Click] Mouse down event')");
replaceGlobal('components/file-editor.tsx', /console\.log\(\s*'\[Mouse Click\] Definition found:',\s*\{[\s\S]*?\}\s*\)/g, "console.log('[Mouse Click] Definition found')");
replaceGlobal('components/file-editor.tsx', /console\.log\(\s*'\[Unsaved Changes\] Calling callback with hasChanges:',\s*hasChanges\s*\)/g, "console.log('[Unsaved Changes] Calling callback')");
replaceGlobal('components/file-editor.tsx', /console\.log\(\s*'\[Content Change\] Content changed, length:',\s*newContent\.length\s*\)/g, "console.log('[Content Change] Content changed')");
replaceGlobal('components/file-editor.tsx', /console\.log\(\n\s*'\[Save\] Setting isSaving to true, calling callback:',\n\s*!!onSavingStateChangeRef\.current\n\s*\)/g, "console.log('[Save] Setting isSaving to true')");
replaceGlobal('components/file-editor.tsx', /console\.log\(\s*'\[Save\] Response:',\s*\{\s*ok: response\.ok,\s*data\s*\}\s*\)/g, "console.log('[Save] Response')");
replaceGlobal('components/file-editor.tsx', /console\.log\(\n\s*'\[Save\] Setting isSaving to false, calling callback:',\n\s*!!onSavingStateChangeRef\.current\n\s*\)/g, "console.log('[Save] Setting isSaving to false')");
replaceGlobal('components/file-editor.tsx', /console\.log\(\s*'\[Editor Mount\] URI mismatch! Expected:',\s*expectedUri,\s*'Got:',\s*currentUri\s*\)/g, "console.log('[Editor Mount] URI mismatch')");
replaceGlobal('components/file-editor.tsx', /console\.log\(\s*'\[Editor Mount\] New model created with URI:',\s*newModel\.uri\.toString\(\)\s*\)/g, "console.log('[Editor Mount] New model created')");
replaceGlobal('components/file-editor.tsx', /console\.log\(\s*'\[Go to Definition\] LSP API response status:',\s*response\.status\s*\)/g, "console.log('[Go to Definition] LSP API response')");
replaceGlobal('components/file-editor.tsx', /console\.log\(\n\s*'\[Go to Definition\] LSP API response data:',\n\s*JSON\.stringify\(data, null, 2\)\n\s*\)/g, "console.log('[Go to Definition] LSP API data')");
replaceGlobal('components/file-editor.tsx', /console\.log\(\s*'\[Go to Definition\] Processing definition:',\s*JSON\.stringify\(def\)\s*\)/g, "console.log('[Go to Definition] Processing definition')");
replaceGlobal('components/file-editor.tsx', /console\.log\(\s*'\[Go to Definition\] Converted definition:',\s*JSON\.stringify\(result\)\s*\)/g, "console.log('[Go to Definition] Converted definition')");
replaceGlobal('components/file-editor.tsx', /console\.log\(\n\s*'\[Go to Definition\] All definitions converted:',\n\s*JSON\.stringify\(convertedDefinitions\)\n\s*\)/g, "console.log('[Go to Definition] All definitions converted')");
replaceGlobal('components/file-editor.tsx', /console\.log\(\s*'\[F12\] Opening file in new tab:',\s*filePath\s*\)/g, "console.log('[F12] Opening file in new tab')");
replaceGlobal('components/file-editor.tsx', /console\.log\(\s*'\[Mouse Click\] Opening file in new tab:',\s*filePath\s*\)/g, "console.log('[Mouse Click] Opening file in new tab')");
replaceGlobal('components/file-editor.tsx', /console\.log\(\n\s*'\[Save Command\] Setting up global Ctrl\+S handler',\n\s*!!onSave\n\s*\)/g, "console.log('[Save Command] Setting up global Ctrl+S handler')");

replaceGlobal('components/task-details.tsx', /console\.log\(\s*'\[Update\] prUrl changed:',\s*task\.prUrl\s*\)/g, "console.log('[Update] prUrl changed')");
replaceGlobal('components/task-details.tsx', /console\.log\(\s*'\[Update\] prNumber changed:',\s*task\.prNumber\s*\)/g, "console.log('[Update] prNumber changed')");
replaceGlobal('components/task-details.tsx', /console\.log\(\s*'\[Update\] prStatus changing from',\s*prStatus,\s*'to',\s*task\.prStatus\s*\)/g, "console.log('[Update] prStatus changing')");
replaceGlobal('components/task-details.tsx', /console\.log\(\s*'\[Reopen\] Starting reopen - isReopeningPR:',\s*true,\s*'prStatus:',\s*prStatus\s*\)/g, "console.log('[Reopen] Starting reopen')");
replaceGlobal('components/task-details.tsx', /console\.log\(\s*'\[Close\] Starting close - isClosingPR:',\s*true,\s*'prStatus:',\s*prStatus\s*\)/g, "console.log('[Close] Starting close')");
replaceGlobal('components/task-details.tsx', /console\.log\(\n\s*`\[Clear\] Handling terminal PR state - current state: \$\{JSON\.stringify\(\{\n\s*prStatus,\n\s*isClosingPR,\n\s*isReopeningPR,\n\s*isMergingPR,\n\s*\}\)\}`\n\s*\)/g, "console.log('[Clear] Handling terminal PR state')");
replaceGlobal('components/task-details.tsx', /console\.log\(\n\s*`\[Render\] Close PR button - prStatus: \$\{prStatus\}, isClosingPR: \$\{isClosingPR\}, canClose: \$\{canClose\}`\n\s*\)/g, "console.log('[Render] Close PR button state')");
replaceGlobal('components/task-details.tsx', /console\.log\(\s*'\[Render\] Reopen button - prStatus:',\s*prStatus,\s*'isReopeningPR:',\s*isReopeningPR\s*\)/g, "console.log('[Render] Reopen button')");

replaceGlobal('components/file-diff-viewer.tsx', /console\.log\(\s*'\[FileDiffViewer\] Render:',\s*\{[\s\S]*?\}\s*\)/g, "console.log('[FileDiffViewer] Render')");

replaceGlobal('lib/session/create-github.ts', /console\.log\(\s*'Created GitHub session with internal user ID:',\s*session\.user\.id\s*\)/g, "console.log('Created GitHub session')");
replaceGlobal('lib/session/create.ts', /console\.log\(\s*'Created session with internal user ID:',\s*session\.user\.id\s*\)/g, "console.log('Created session')");

replaceGlobal('scripts/migrate-production.ts', /console\.log\(\s*`\s*Current environment:\s*\$\{process\.env\.VERCEL_ENV \|\| 'local'\}`\s*\)/g, "console.log('Current environment checked')");

replaceGlobal('app/api/tasks/[taskId]/continue/route.ts', /console\.log\(\s*'Checking for existing sandbox:',\s*\{\s*hasSandboxId: !!currentTask\.sandboxId,\s*keepAlive: currentTask\.keepAlive,\s*\}\s*\)/g, "console.log('Checking for existing sandbox')");


// Replace template strings dynamically
function walkSync(dir, callback) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    if (file === 'node_modules' || file === '.git' || file === '.next') continue;
    const filepath = path.join(dir, file);
    const stats = fs.statSync(filepath);
    if (stats.isDirectory()) {
      walkSync(filepath, callback);
    } else if (stats.isFile() && (filepath.endsWith('.ts') || filepath.endsWith('.tsx') || filepath.endsWith('.js') || filepath.endsWith('.jsx'))) {
      callback(filepath);
    }
  }
}

walkSync('.', (filePath) => {
    let content = fs.readFileSync(filePath, 'utf8');
    const originalContent = content;

    // Convert template literals to static strings inside log methods
    content = content.replace(/(logger\.[a-z]+|console\.[a-z]+)\(\s*`[^`]*`\s*\)/g, "$1('Action logged')");

    // Revert the string concatenation
    content = content.replace(/(logger\.[a-z]+|console\.[a-z]+)\(\s*(['"][^'"]*['"])\s*\+[^)]+\)/g, "$1($2)");

    if (content !== originalContent) {
        fs.writeFileSync(filePath, content);
    }
});


console.log("Fixes applied");
