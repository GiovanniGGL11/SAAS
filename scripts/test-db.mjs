#!/usr/bin/env node
/*
  Roda os testes um arquivo por vez (eles usam o banco remoto do Supabase) e repete um arquivo
  UMA vez quando a falha foi queda de conexão com o banco, não erro de verdade. Falha de
  verificação (o código fez a conta errada) nunca é repetida: aparece como falha.

  Uso:
    npm run test:db                          todos os arquivos de tests/
    npm run test:db -- sales checkout        só esses (nome do arquivo, sem .test.ts)
*/
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// fileURLToPath: a pasta tem espaços ("Saas - Meu Negocio"), que viram %20 na URL.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const testsDir = path.join(root, 'tests');

/** Sinais de que o banco caiu no meio do teste (não de erro no código). */
const CONNECTION_DROP = [
  /Server has closed the connection/i,
  /Connection terminated unexpectedly/i,
  /Can't reach database server/i,
  /\bP1001\b/,
  /\bP1017\b/,
  /ECONNRESET/,
  /ETIMEDOUT/,
  /Unable to start a transaction in the given time/i,
  /Hook timed out in \d+ms/i,
];
/**
 * Sinais de erro de verdade (resultado diferente do esperado): com eles, não repete. Um TypeError
 * sozinho não conta: quando o banco cai na preparação do teste, o "depois" do teste costuma dar
 * TypeError por consequência.
 */
const REAL_FAILURE = [/AssertionError/, /^\s*[-+] Expected/m, /ReferenceError/, /SyntaxError/];

const wanted = process.argv.slice(2).map((a) => a.replace(/\.test\.ts$/, ''));
const files = readdirSync(testsDir)
  .filter((f) => f.endsWith('.test.ts'))
  .filter((f) => wanted.length === 0 || wanted.includes(f.replace(/\.test\.ts$/, '')))
  .sort();

if (files.length === 0) {
  console.error('Nenhum arquivo de teste encontrado com esse nome.');
  process.exit(1);
}

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
function runOnce(file) {
  const result = spawnSync(npx, ['--no-install', 'vitest', 'run', path.join('tests', file)], {
    cwd: root,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    maxBuffer: 64 * 1024 * 1024,
    timeout: 10 * 60_000,
  });
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  const summary =
    output
      .match(/Tests\s+[^\n]+/)?.[0]
      ?.replace(/\s+/g, ' ')
      .trim() ?? 'sem resumo';
  return { ok: result.status === 0, output, summary };
}

const onlyConnectionDrops = (output) =>
  CONNECTION_DROP.some((re) => re.test(output)) && !REAL_FAILURE.some((re) => re.test(output));

const results = [];
for (const file of files) {
  const name = file.replace(/\.test\.ts$/, '');
  let attempt = runOnce(file);
  let retried = false;
  if (!attempt.ok && onlyConnectionDrops(attempt.output)) {
    retried = true;
    console.log(`↻ ${name}: queda de conexão com o banco — repetindo uma vez...`);
    await new Promise((r) => setTimeout(r, 5_000));
    attempt = runOnce(file);
  }
  const status = attempt.ok ? 'ok' : onlyConnectionDrops(attempt.output) ? 'queda' : 'FALHOU';
  results.push({ name, status, retried, summary: attempt.summary });
  console.log(
    `${status === 'ok' ? '✓' : '✗'} ${name}: ${attempt.summary}${retried ? ' (repetido)' : ''}`,
  );
  if (status === 'FALHOU') {
    // Mostra o trecho do erro para não precisar rodar de novo.
    const lines = attempt.output.split('\n');
    const start = lines.findIndex((l) => /FAIL|AssertionError|Error:/.test(l));
    console.log(lines.slice(Math.max(0, start), start + 25).join('\n'));
  }
}

const failed = results.filter((r) => r.status === 'FALHOU');
const drops = results.filter((r) => r.status === 'queda');
console.log(
  `\n${results.length} arquivos · ${results.filter((r) => r.status === 'ok').length} ok · ` +
    `${failed.length} com falha de verdade · ${drops.length} só com queda de conexão (mesmo repetindo) · ` +
    `${results.filter((r) => r.retried).length} repetidos`,
);
if (failed.length) console.log(`Falharam: ${failed.map((r) => r.name).join(', ')}`);
if (drops.length) console.log(`Banco instável em: ${drops.map((r) => r.name).join(', ')}`);
process.exit(failed.length || drops.length ? 1 : 0);
