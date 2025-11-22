/**
 * Generates SQL statements from parsed data.
 * @param data - The parsed data (e.g., array of objects).
 * @param tableName - The name of the table to insert into.
 * @returns A string containing the SQL statements.
 */
export function generateSQL(data: Record<string, any>[], tableName: string = 'my_table'): string {
  if (!data || data.length === 0) {
    return '-- No data to generate SQL from.';
  }

  const columns = Object.keys(data[0]);
  const statements: string[] = [];

  // Create Table Statement (Optional, but useful)
  const createTable = `CREATE TABLE IF NOT EXISTS ${tableName} (\n  ${columns.map(col => `${col} TEXT`).join(',\n  ')}\n);`;
  statements.push(createTable);

  // Insert Statements
  for (const row of data) {
    const values = columns.map(col => {
      const val = row[col];
      if (val === null || val === undefined) return 'NULL';
      if (typeof val === 'number') return val;
      return `'${String(val).replace(/'/g, "''")}'`; // Escape single quotes
    });
    statements.push(`INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${values.join(', ')});`);
  }

  return statements.join('\n');
}
