// ABOUTME: File format version checking and forward migration pipeline.
// ABOUTME: Runs ordered migrations to bring old files up to the current version.

import type { MindMapFileFormat } from "./schema";

/** Current file format version. Increment when the schema changes. */
export const CURRENT_FORMAT_VERSION = 1;

/**
 * Ordered list of migration functions.
 * Each migrates from version N to version N+1.
 * Index 0 = migrate from v1 to v2, etc.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const migrations: Array<(data: any) => any> = [
  // No migrations yet (we're at version 1)
];

/**
 * Migrate a file format object to the latest version.
 * - Missing version defaults to 1.
 * - Future versions (> CURRENT_FORMAT_VERSION) throw an error.
 * - Returns the data with version set to CURRENT_FORMAT_VERSION.
 */
export function migrateToLatest(data: MindMapFileFormat): MindMapFileFormat {
  const version = data.version ?? 1;

  if (version > CURRENT_FORMAT_VERSION) {
    throw new Error(
      `Unsupported file format version ${version}. ` +
      `This app supports up to version ${CURRENT_FORMAT_VERSION}.`,
    );
  }

  // Run migrations sequentially from the file's version to current
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let migrated: any = { ...data, version };
  for (let v = version; v < CURRENT_FORMAT_VERSION; v++) {
    const migrate = migrations[v - 1];
    if (!migrate) throw new Error(`Missing migration for version ${v}`);
    migrated = migrate(migrated);
    migrated.version = v + 1;
  }

  return migrated as MindMapFileFormat;
}
