/**
 * Copies non-TypeScript assets into dist/ after compilation.
 *
 * tsc only emits .js. The migration reads schema.sql and admin_schema.sql from
 * its own directory at runtime, so without this the compiled `db/migrate.js`
 * throws ENOENT on the very first production deploy — a failure that never
 * shows up locally, where everything runs through tsx from src/.
 */
import { copyFile, mkdir, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

async function copySql(fromDir, toDir, { required }) {
  let files;
  try {
    files = (await readdir(fromDir)).filter((f) => f.endsWith('.sql'));
  } catch {
    if (required) throw new Error(`${fromDir} is missing`);
    return 0;
  }
  if (required && files.length === 0) {
    console.error(`No .sql files found in ${fromDir} — the migration would fail at runtime.`);
    process.exit(1);
  }
  await mkdir(toDir, { recursive: true });
  for (const file of files) {
    await copyFile(join(fromDir, file), join(toDir, file));
    console.log(`  copied ${file}`);
  }
  return files.length;
}

await copySql(join(root, 'src', 'db'), join(root, 'dist', 'db'), { required: true });
// Numbered migrations live in their own directory and are just as necessary at
// runtime — forgetting them would silently skip every schema change.
const n = await copySql(join(root, 'src', 'db', 'migrations'), join(root, 'dist', 'db', 'migrations'), {
  required: false,
});
console.log(`  ${n} versioned migration(s) copied`);
