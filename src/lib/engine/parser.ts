// src/lib/engine/parser.ts
import * as XLSX from 'xlsx';
import type { ParsedSheet, ColumnDefinition, SqlType } from './types';

// --- UTILIDADES DE TEXTO ---

function toSnakeCase(str: string): string {
  return str
    .trim()
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Quitar tildes
    .replace(/[\s\-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

// --- LÓGICA DE INFERENCIA (TIPOS) ---

function inferType(values: any[]): { type: SqlType; length?: number } {
  let isInt = true;
  let isDecimal = false;
  let isDate = true;
  let isBool = true;
  let maxLength = 0;

  if (values.length === 0) return { type: 'VARCHAR', length: 255 };

  for (const val of values) {
    if (val === null || val === undefined || val === '') continue;

    const strVal = String(val);
    if (strVal.length > maxLength) maxLength = strVal.length;

    const lower = strVal.toLowerCase();
    
    // 1. Chequeo Booleano
    if (!['true', 'false', '1', '0', 'yes', 'no', 's', 'n'].includes(lower)) {
      isBool = false;
    }

    // 2. Chequeo Numérico
    const isNumber = !isNaN(Number(val)) && strVal.trim() !== '';
    
    if (isNumber) {
      if (!Number.isInteger(Number(val))) isDecimal = true;
      // IMPORTANTE: Si es un número puro, NO es una fecha (corrección del bug)
      isDate = false; 
    } else {
      isInt = false;
      isDecimal = false;
    }

    // 3. Chequeo Fecha (Más estricto)
    // Solo aceptamos fechas si NO es un número puro y el string parece fecha
    if (isNumber || (!(val instanceof Date) && isNaN(Date.parse(val)))) {
        isDate = false;
    }
    // Parche extra: Si el string es algo como "A123", Date.parse a veces falla silenciosamente,
    // pero ya lo cubrimos con isNumber=false.
  }

  // Jerarquía de decisión
  if (isBool) return { type: 'BOOLEAN' };
  if (isDate && maxLength > 0 && maxLength < 25) return { type: 'DATE' }; 
  
  if (isInt && !isDecimal) {
      // IDs largos (seriales) a VARCHAR para no romper INT limits
      if (maxLength > 15) return { type: 'VARCHAR', length: Math.max(50, maxLength + 5) };
      return { type: 'INT' };
  }
  
  if (isInt || isDecimal) return { type: 'DECIMAL' };
  if (maxLength > 255) return { type: 'TEXT' };
  
  const calculatedLength = Math.ceil(maxLength * 1.3);
  const finalLength = Math.max(50, Math.ceil(calculatedLength / 10) * 10);
  
  return { type: 'VARCHAR', length: finalLength };
}

// --- LÓGICA DE DETECCIÓN DE TABLAS MÚLTIPLES ---

interface ColumnRange {
    start: number;
    end: number;
    headers: string[];
}

/**
 * Analiza la fila de cabeceras y busca "islas" de datos separadas por vacíos.
 * Ejemplo: ["id", "nombre", null, "otro_id", "valor"] 
 * Detecta: Rango 1 [0,1] y Rango 2 [3,4]
 */
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

// --- FUNCIÓN PRINCIPAL ---

export async function parseExcelFile(file: File): Promise<ParsedSheet[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });
        const allDetectedTables: ParsedSheet[] = [];

        // 1. ITERAMOS CADA HOJA FÍSICA (Pestaña de abajo)
        workbook.SheetNames.forEach(sheetName => {
            const worksheet = workbook.Sheets[sheetName];
            
            // Convertimos toda la hoja a una matriz gigante (incluyendo vacíos)
            // defval: null asegura que los huecos sean null y no undefined
            const jsonData = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: null });

            if (jsonData.length < 1) return;

            const headerRow = jsonData[0];
            
            // 2. DETECTAMOS SI HAY VARIAS TABLAS EN LA MISMA HOJA
            const tableRanges = detectTableRanges(headerRow);

            // 3. PROCESAMOS CADA SUB-TABLA ENCONTRADA
            tableRanges.forEach((range, tableIndex) => {
                const rows = jsonData.slice(1); // Filas de datos (sin cabecera)
                
                // Si esta "sub-tabla" no tiene filas de datos, la ignoramos
                if (rows.length === 0 && range.headers.length === 0) return;

                const columns: ColumnDefinition[] = range.headers.map((header, localIndex) => {
                    // Índice real en la matriz gigante
                    const globalIndex = range.start + localIndex;
                    
                    // Extraemos datos solo de esta columna específica
                    const columnData = rows.slice(0, 100).map(row => row[globalIndex]);
                    const inference = inferType(columnData);
                    
                    const finalHeader = header ? header.toString() : `col_${localIndex}`;

                    return {
                        id: crypto.randomUUID(),
                        originalName: finalHeader,
                        sqlName: toSnakeCase(finalHeader),
                        type: inference.type,
                        length: inference.length,
                        nullable: rows.some(row => row[globalIndex] === null || row[globalIndex] === ''),
                        sampleData: columnData.slice(0, 3)
                    };
                });

                // Generamos un nombre único: "Hoja1" o "Hoja1 (Tabla 2)"
                let uniqueName = sheetName;
                if (tableRanges.length > 1) {
                    uniqueName = `${sheetName} (Tabla ${tableIndex + 1})`;
                }

                allDetectedTables.push({
                    sheetName: uniqueName,
                    columns,
                    totalRows: rows.length,
                    data: [] // Ya no guardamos la data cruda completa para ahorrar RAM
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