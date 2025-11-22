// src/lib/engine/types.ts

export type SqlDialect = 'mysql' | 'postgresql' | 'sqlite' | 'sqlserver' | 'mariadb';

export type SqlType = 'INT' | 'DECIMAL' | 'VARCHAR' | 'TEXT' | 'DATE' | 'BOOLEAN';

export interface ColumnDefinition {
  id: string;           // Un ID único interno
  originalName: string; // El header tal cual viene del Excel ("Fecha de Compra")
  sqlName: string;      // Nuestra sugerencia snake_case ("fecha_de_compra")
  type: SqlType;        // El tipo inferido
  length?: number;      // Para VARCHAR (ej: 255)
  nullable: boolean;    // Si detectamos celdas vacías
  sampleData: any[];    // Primeros 3-5 valores para mostrar preview
}

export interface ParsedSheet {
  sheetName: string;
  columns: ColumnDefinition[];
  totalRows: number;
  data: any[][]; // Datos crudos (para procesar después)
}