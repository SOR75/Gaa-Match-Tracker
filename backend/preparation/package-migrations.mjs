import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Fixed CLI versions are identifiers, independent of the date this package is built.
export const ledger = [
  ['20261118000001', '001_commercial_foundation.sql', 'c07a7bbaaf110ec55fe57c1794b38d7165ec147a55eb39f19ac64f63f56b6de5'],
  ['20261118000002', '002_subscription_lifecycle.sql', '62f8cefe8d97b4e3b247cd8cecbd334796a2a75abd73dd9d39017805e60e2c69'],
  ['20261118000003', '003_pilot_licensing_and_security.sql', '32f2e25fca6cb79a7c61887fcd6699ff1ce9f20c787493e45698034775f08c49'],
  ['20261118000004', '004_irish_subscription_boundaries.sql', '3b7f81b18e9a25587d57ab3ad839599d6d183c81a1766b1cb9ee1709db54fb15'],
  ['20261118000005', '005_accounts_and_administration.sql', '86eb82006c0a4a8f48d44bba97eded9e6ca1d487a905a2a5b0453cd3d2e74051'],
].map(([version, source, sha256]) => ({version, source, sha256, target: version + '_' + source.slice(4)}));

const sourceDir = fileURLToPath(new URL('../migrations/', import.meta.url));
const config = `project_id = "sideline-local-preparation"

[api]
enabled = false
schemas = []
extra_search_path = []

[db.seed]
enabled = false
`;

async function verifiedFiles(dir, field) {
  const entries = await readdir(dir, {withFileTypes: true});
  const names = new Set(ledger.map(row => row[field]));
  if (entries.length !== names.size || entries.some(e => !e.isFile() || !names.has(e.name)))
    throw Error('Migration inventory differs from the approved ledger.');
  return Promise.all(ledger.map(async row => {
    const bytes = await readFile(join(dir, row[field]));
    if (createHash('sha256').update(bytes).digest('hex') !== row.sha256)
      throw Error('SHA-256 mismatch for ' + row[field]);
    return bytes;
  }));
}

export async function verifyPackage(workdir) {
  await verifiedFiles(sourceDir, 'source');
  const project = join(workdir, 'supabase');
  if (await readFile(join(project, 'config.toml'), 'utf8') !== config)
    throw Error('Unexpected CLI configuration.');
  await verifiedFiles(join(project, 'migrations'), 'target');
}

export async function preparePackage(parent = tmpdir()) {
  const files = await verifiedFiles(sourceDir, 'source');
  const workdir = await mkdtemp(join(parent, 'sideline-cli-'));
  const project = join(workdir, 'supabase');
  await mkdir(join(project, 'migrations'), {recursive:true});
  await writeFile(join(project, 'config.toml'), config, {flag:'wx'});
  for (const [i, row] of ledger.entries())
    await writeFile(join(project, 'migrations', row.target), files[i], {flag:'wx'});
  await verifyPackage(workdir);
  return workdir;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (!args.length) console.log(await preparePackage());
  else if (args.length === 2 && args[0] === '--check') {
    await verifyPackage(resolve(args[1]));
    console.log('Verified configuration and all five migration checksums.');
  } else throw Error('Usage: node package-migrations.mjs [--check WORKDIR]');
}
