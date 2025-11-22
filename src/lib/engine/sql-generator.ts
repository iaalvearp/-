// src/lib/engine/sql-generator.ts
import type { ParsedSheet, SqlDialect } from './types';

export function generateGlobalSQL(sheets: ParsedSheet[], dialect: SqlDialect): string {
    let sql = `-- Generado por SQLizer\n-- Dialecto: ${dialect.toUpperCase()}\n\n`;

    // 1. CREATE TABLES
    sheets.forEach(sheet => {
        const tableName = sheet.sheetName.replace(/\s+/g, '_').toLowerCase(); // Limpieza básica del nombre
        sql += `CREATE TABLE IF NOT EXISTS ${tableName} (\n`;
        
        const colDefs = sheet.columns.map(col => {
            let line = `  ${col.sqlName} ${col.type}`;
            if (col.type === 'VARCHAR') line += `(${col.length})`;
            if (!col.nullable) line += ` NOT NULL`;
            // Heurística simple de Primary Key: Si se llama "id" o "id_TABLA"
            if (col.sqlName === 'id' || col.sqlName === `id_${tableName}`) {
                line += ` PRIMARY KEY`;
                // Auto-increment según dialecto
                if (col.type === 'INT') {
                     if (dialect === 'postgresql') line = `  ${col.sqlName} SERIAL PRIMARY KEY`;
                     else if (dialect === 'sqlite') line += ` AUTOINCREMENT`;
                     else line += ` AUTO_INCREMENT`;
                }
            }
            return line;
        });

        sql += colDefs.join(',\n');
        sql += `\n);\n\n`;
    });

    // 2. INSERTS (Iteramos los datos guardados)
    // NOTA: Como en el parser optimizamos y borramos .data para ahorrar memoria,
    // aquí asumimos que si queremos inserts reales, deberíamos haber guardado la data.
    // Para este ejemplo, generamos un comentario.
    sql += `-- SECCIÓN DE INSERTS (Pendiente de implementación de carga completa de datos)\n`;
    
    return sql;
}