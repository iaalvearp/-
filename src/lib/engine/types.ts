// src/lib/engine/types.ts

export type SqlDialect = 'mysql' | 'postgresql' | 'sqlite' | 'sqlserver' | 'mariadb';

export type SqlType = 'INT' | 'DECIMAL' | 'VARCHAR' | 'TEXT' | 'DATE' | 'BOOLEAN';

export interface ColumnDefinition {
  id: string;
  originalName: string;
  sqlName: string;
  
  // AHORA ACEPTA NULL PARA EL ESTADO DE ADVERTENCIA
  type: SqlType | null; 
  
  length?: number;
  nullable: boolean;
  sampleData: any[];
  
  foreignKey?: {
    targetTable: string;
    targetColumn: string;
  } | null;
}

export interface ParsedSheet {
  sheetName: string;
  columns: ColumnDefinition[];
  totalRows: number;
  data: any[][];
}