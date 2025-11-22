// src/lib/engine/parser.ts
import * as XLSX from 'xlsx';
import type { ParsedSheet, ColumnDefinition, SqlType } from './types';

function toSnakeCase(str: string): string {
  return str
    .trim()
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") 
    .replace(/[\s\-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

// MODIFICADO: Ahora recibe el nombre de la columna para ayudar a decidir
function inferType(values: any[], colName: string): { type: SqlType | null; length?: number } {
  // 1. Si no hay datos, devolvemos NULL para que la UI parpadee en naranja
  if (values.length === 0) return { type: null };

  let isInt = true;
  let isDecimal = false;
  let isDate = true;
  let isBool = true;
  let maxLength = 0;

  const isIdColumn = colName.startsWith('id_') || colName === 'id';

  for (const val of values) {
    if (val === null || val === undefined || val === '') continue;

    const strVal = String(val);
    if (strVal.length > maxLength) maxLength = strVal.length;

    const lower = strVal.toLowerCase();
    if (!['true', 'false', '1', '0', 'yes', 'no', 's', 'n'].includes(lower)) {
      isBool = false;
    }

    const isNumber = !isNaN(Number(val)) && strVal.trim() !== '';
    
    if (isNumber) {
      if (!Number.isInteger(Number(val))) isDecimal = true;
      isDate = false; 
    } else {
      isInt = false;
      isDecimal = false;
    }

    if (isNumber || (!(val instanceof Date) && isNaN(Date.parse(val)))) {
        isDate = false;
    }
  }

  // LÓGICA DE IDs
  if (isIdColumn) {
      // Si encontramos letras en un ID, forzamos VARCHAR
      if (!isInt) {
          return { type: 'VARCHAR', length: Math.max(50, maxLength + 10) };
      }
      // Si son solo números, preferimos INT (a menos que sean gigantes)
      if (maxLength > 15) return { type: 'VARCHAR', length: Math.max(50, maxLength + 5) };
      return { type: 'INT' };
  }

  if (isBool) return { type: 'BOOLEAN' };
  if (isDate && maxLength > 0 && maxLength < 25) return { type: 'DATE' }; 
  
  if (isInt && !isDecimal) {
      if (maxLength > 15) return { type: 'VARCHAR', length: Math.max(50, maxLength + 5) };
      return { type: 'INT' };
  }
  if (isInt || isDecimal) return { type: 'DECIMAL' };
  if (maxLength > 255) return { type: 'TEXT' };
  
  const calculatedLength = Math.ceil(maxLength * 1.3);
  const finalLength = Math.max(50, Math.ceil(calculatedLength / 10) * 10);
  
  return { type: 'VARCHAR', length: finalLength };
}

/**
 * Analiza la fila de cabeceras y busca "islas" de datos separadas por vacíos.
 * Ejemplo: ["id", "nombre", null, "otro_id", "valor"] 
 * Detecta: Rango 1 [0,1] y Rango 2 [3,4]
 */
interface ColumnRange {
    start: number;
    end: number;
    headers: string[];
}

function detectTableRanges(headerRow: any[]): ColumnRange[] {
    const ranges: ColumnRange[] = [];
    let currentStart: number | null = null;
    
    // Recorremos una casilla extra para cerrar el último grupo si llega al final
    for (let i = 0; i <= headerRow.length; i++) {
        const cell = headerRow[i];
        // Consideramos "Vacío" si es null, undefined o string vacío
        const isEmpty = cell === null || cell === undefined || (typeof cell === 'string' && cell.trim() === '');

        if (!isEmpty) {
            // Si encontramos datos y no hemos empezado grupo, empezamos uno
            if (currentStart === null) {
                currentStart = i;
            }
        } else {
            // Si encontramos vacío y teníamos un grupo abierto, lo cerramos
            if (currentStart !== null) {
                ranges.push({
                    start: currentStart,
                    end: i - 1, // El anterior fue el último válido
                    headers: headerRow.slice(currentStart, i)
                });
                currentStart = null; // Reseteamos
            }
        }
    }
    return ranges;
}



export async function parseExcelFile(file: File): Promise<ParsedSheet[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });
        const allDetectedTables: ParsedSheet[] = [];

        workbook.SheetNames.forEach(sheetName => {
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: null });

            if (jsonData.length < 1) return;

            const headerRow = jsonData[0];
            const tableRanges = detectTableRanges(headerRow);

            tableRanges.forEach((range, tableIndex) => {
                const rows = jsonData.slice(1); 
                if (rows.length === 0 && range.headers.length === 0) return;

                const columns: ColumnDefinition[] = range.headers.map((header, localIndex) => {
                    const globalIndex = range.start + localIndex;
                    const columnData = rows.slice(0, 100).map(row => row[globalIndex]);
                    
                    const finalHeader = header ? header.toString() : `col_${localIndex}`;
                    const sqlName = toSnakeCase(finalHeader);
                    
                    // Pasamos el nombre para la lógica de IDs
                    const inference = inferType(columnData, sqlName);

                    return {
                        id: crypto.randomUUID(),
                        originalName: finalHeader,
                        sqlName: sqlName,
                        type: inference.type,
                        length: inference.length,
                        nullable: rows.some(row => row[globalIndex] === null || row[globalIndex] === ''),
                        sampleData: columnData.slice(0, 3)
                    };
                });

                const tableData = rows.map(row => row.slice(range.start, range.end + 1))
                                      .filter(row => row.some(val => val !== null && val !== ''));

                let uniqueName = sheetName;
                if (tableRanges.length > 1) {
                    uniqueName = `${sheetName} (Tabla ${tableIndex + 1})`;
                }

                allDetectedTables.push({
                    sheetName: uniqueName,
                    columns,
                    totalRows: tableData.length,
                    data: tableData
                });
            });
        });

        if (allDetectedTables.length === 0) {
            reject(new Error("No se encontraron tablas válidas."));
        } else {
            resolve(allDetectedTables);
        }

      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = (error) => reject(error);
    reader.readAsArrayBuffer(file);
  });
}