import React, { useState } from 'react';
import FileDropzone from './ui/FileDropzone';
import { parseExcelFile } from '../lib/engine/parser';
import { generateGlobalSQL } from '../lib/engine/sql-generator';
import type { ParsedSheet } from '../lib/engine/types';
import { Loader2, Table, Layers, Code, AlertTriangle, Lock, Link as LinkIcon, Key } from 'lucide-react';
import { clsx } from 'clsx';

export default function SqlizerMain() {
  const [status, setStatus] = useState<'idle' | 'parsing' | 'review'>('idle');
  const [sheets, setSheets] = useState<ParsedSheet[]>([]); 
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // --- LÓGICA DE NEGOCIO ---

  // Helper para pluralizar/singularizar
  const inferTargetTable = (colName: string, potentialTable: string) => {
    if (!colName.startsWith('id_')) return false;
    const singular = colName.replace('id_', '').toLowerCase();
    const target = potentialTable.toLowerCase();
    
    // Coincidencias: id_rol -> roles, id_rol -> rol
    return target === singular || target === singular + 's' || target === singular + 'es';
  };

  const handleFileAccepted = async (file: File) => {
    setStatus('parsing');
    setError(null);
    try {
      const result = await parseExcelFile(file);
      const tableNames = result.map(s => s.sheetName.toLowerCase().trim());

      const sheetsWithFKs = result.map(sheet => ({
        ...sheet,
        columns: sheet.columns.map((col, idx) => {
            const baseCol = { ...col, nullable: false };
            
            // Regla: El primer campo (idx 0) nunca es FK automática, es PK
            if (idx === 0) return baseCol;

            // 1. INTENTO DE LINKEO EXACTO (Por nombre de PK)
            // Buscamos si alguna OTRA tabla tiene como PK (col 0) este mismo nombre
            const exactMatchSheet = result.find(s => 
                s.sheetName !== sheet.sheetName && 
                s.columns[0].sqlName === col.sqlName
            );

            if (exactMatchSheet) {
                return {
                    ...baseCol,
                    foreignKey: {
                        targetTable: exactMatchSheet.sheetName,
                        targetColumn: exactMatchSheet.columns[0].sqlName
                    }
                };
            }

            // 2. INTENTO DE LINKEO POR NOMBRE DE TABLA (Inferencia)
            // Si no hubo match exacto, intentamos inferir por nombre de tabla (id_rol -> roles)
            const inferredTable = tableNames.find(t => inferTargetTable(col.sqlName, t));
            if (inferredTable && inferredTable !== sheet.sheetName.toLowerCase()) {
                 // Buscamos el nombre real (case sensitive) de la tabla encontrada
                 const realTargetSheet = result.find(s => s.sheetName.toLowerCase() === inferredTable);
                 if (realTargetSheet) {
                    return {
                        ...baseCol,
                        foreignKey: {
                            targetTable: realTargetSheet.sheetName,
                            targetColumn: realTargetSheet.columns[0].sqlName
                        }
                    };
                 }
            }

            // 3. SI EMPIEZA CON "id_", PERO NO ENCONTRAMOS MATCH
            // Lo marcamos como FK pero vacía (naranja)
            if (col.sqlName.startsWith('id_')) {
                return {
                    ...baseCol,
                    foreignKey: {
                        targetTable: '',
                        targetColumn: ''
                    }
                };
            }
            return baseCol;
        })
      }));

      setSheets(sheetsWithFKs);
      setActiveSheetIndex(0);
      setStatus('review');
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Error desconocido");
      setStatus('idle');
    }
  };

  // --- NUEVA LÓGICA DE RENOMBRADO REACTIVO ---
  const updateTableName = (newName: string) => {
    let newSheets = [...sheets];
    
    // 2. MAGIA: Escanear otras tablas para ver si ahora coinciden con este nuevo nombre
    // Si cambias "Tabla 1" a "roles", buscamos campos "id_rol" en otras tablas
    newSheets = newSheets.map((sheet, sIdx) => {
        if (sIdx === activeSheetIndex) return sheet; // No auto-referenciarse

        return {
            ...sheet,
            columns: sheet.columns.map((col, cIdx) => {
                // Si es PK (índice 0), no tocamos
                if (cIdx === 0) return col;

                // Si ya tiene FK asignada, revisamos si apuntaba a la tabla antigua (por índice o nombre anterior)
                // Pero aquí es difícil saber el nombre anterior. 
                // Mejor estrategia: Si tiene FK y apunta a la tabla que estamos editando (por referencia de índice o si coincide), actualizamos.
                // Como no tenemos ID de tabla, usamos el hecho de que estamos en un contexto reactivo.
                
                // LÓGICA DE ACTUALIZACIÓN:
                // A. Si el campo se llama IGUAL a la PK de la tabla renombrada -> Linkear
                const targetPK = newSheets[activeSheetIndex].columns[0].sqlName;
                if (col.sqlName === targetPK) {
                     return {
                        ...col,
                        foreignKey: {
                            targetTable: newName,
                            targetColumn: targetPK
                        }
                    };
                }

                // B. Si inferencia coincide (id_rol -> roles) -> Linkear
                if (inferTargetTable(col.sqlName, newName)) {
                    return {
                        ...col,
                        foreignKey: {
                            targetTable: newName,
                            targetColumn: targetPK 
                        }
                    };
                }

                // C. Si ya estaba apuntando a la tabla (por nombre anterior), actualizar nombre
                // Esto es tricky porque "newName" ya es el nuevo. 
                // Pero si el usuario está escribiendo, el estado anterior ya se perdió en el paso 1.
                // Sin embargo, si el usuario cambia "Tabla 1" a "Tabla 2", los FKs que decían "Tabla 1" se rompen.
                // DEBERÍAMOS haber guardado el nombre anterior.
                
                return col;
            })
        };
    });
    
    // FIX: Para actualizar referencias rotas, necesitamos saber el nombre viejo.
    // Como no lo tenemos fácil aquí, iteramos buscando FKs que apunten al nombre viejo... 
    // ESPERA, al hacer `newSheets[activeSheetIndex].sheetName = newName`, perdimos el viejo.
    // Vamos a recuperar el viejo antes de modificar.
    const oldName = sheets[activeSheetIndex].sheetName;
    
    // Ahora sí aplicamos el cambio de nombre
    newSheets[activeSheetIndex].sheetName = newName;

    // Y ahora recorremos para actualizar referencias
    newSheets = newSheets.map((sheet, sIdx) => {
        if (sIdx === activeSheetIndex) return sheet; 

        return {
            ...sheet,
            columns: sheet.columns.map((col, cIdx) => {
                if (cIdx === 0) return col;

                // 1. Actualizar referencias existentes (Si apuntaba a OldName, ahora apunta a NewName)
                if (col.foreignKey && col.foreignKey.targetTable === oldName) {
                    return {
                        ...col,
                        foreignKey: {
                            ...col.foreignKey,
                            targetTable: newName
                        }
                    };
                }

                // 2. Si NO tiene FK válida (o está vacía), intentamos linkear con las reglas de inferencia/exactitud
                const hasValidFK = col.foreignKey && col.foreignKey.targetTable;
                if (!hasValidFK) {
                     const targetPK = newSheets[activeSheetIndex].columns[0].sqlName;
                     
                     // A. Match Exacto de PK
                     if (col.sqlName === targetPK) {
                        return {
                            ...col,
                            foreignKey: {
                                targetTable: newName,
                                targetColumn: targetPK
                            }
                        };
                     }
                     
                     // B. Inferencia (id_rol -> roles)
                     if (inferTargetTable(col.sqlName, newName)) {
                        return {
                            ...col,
                            foreignKey: {
                                targetTable: newName,
                                targetColumn: targetPK
                            }
                        };
                     }
                }

                return col;
            })
        };
    });

    setSheets(newSheets);
  };

  const updateColumn = (colIndex: number, field: keyof typeof currentSheet.columns[0], value: any) => {
    const newSheets = [...sheets];
    const currentCols = newSheets[activeSheetIndex].columns;
    
    // @ts-ignore
    currentCols[colIndex][field] = value;

    if (field === 'type') {
        if (value === 'VARCHAR' && !currentCols[colIndex].length) {
            currentCols[colIndex].length = 50; 
        }
    }
    setSheets(newSheets);
  };

  const updateForeignKey = (colIndex: number, fkData: { targetTable: string, targetColumn: string } | null) => {
    const newSheets = [...sheets];
    newSheets[activeSheetIndex].columns[colIndex].foreignKey = fkData;
    setSheets(newSheets);
  };

  const cleanTableName = (name: string) => {
    return name
        .trim()
        .toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "") 
        .replace(/[^a-z0-9_]/g, '_') 
        .replace(/_+/g, '_') 
        .replace(/^_|_$/g, ''); 
  };

  const handleGenerateSQL = () => {
    if(hasGenericNames) {
        alert("Por favor, asigna nombres válidos a las tablas marcadas en naranja antes de exportar.");
        return;
    }

    const hasMissingTypes = sheets.some(s => s.columns.some(c => c.type === null));
    if (hasMissingTypes) {
        alert("Algunas columnas no tienen tipo asignado (null). Por favor asígnales un tipo antes de exportar.");
        return;
    }

    const sanitizedSheets = sheets.map(sheet => ({
        ...sheet,
        sheetName: cleanTableName(sheet.sheetName) || `tabla_${Math.floor(Math.random()*1000)}`
    }));

    const dialect = 'mysql'; 
    const sql = generateGlobalSQL(sanitizedSheets, dialect);
    
    const blob = new Blob([sql], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'database_sqlizer.sql';
    a.click();
  };

  const currentSheet = sheets[activeSheetIndex];
  
  const isGenericName = (name: string) => 
    !name || name.includes('(') || name.toLowerCase().includes('hoja') || name.toLowerCase().includes('tabla');

  const hasGenericNames = sheets.some(s => isGenericName(s.sheetName));

  const getColumnsForTable = (tableName: string) => {
    const targetSheet = sheets.find(s => s.sheetName === tableName || cleanTableName(s.sheetName) === tableName);
    return targetSheet ? targetSheet.columns : [];
  };


  // --- VISTAS ---

  if (status === 'parsing') {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <Loader2 className="w-12 h-12 animate-spin text-blue-600" />
        <p className="text-lg font-medium text-gray-600 dark:text-gray-300 animate-pulse">
          Analizando relaciones y estructura...
        </p>
      </div>
    );
  }

  // 2. REVIEW (Editor Principal)
  if (status === 'review' && currentSheet) {
    return (
      <div className="w-full max-w-[95%] mx-auto animate-fade-in pb-40">
        
        {/* HEADER FIJO */}
        <div className="sticky top-0 z-50 bg-white/95 dark:bg-gray-950/95 backdrop-blur-sm border-b border-gray-200 dark:border-gray-800 shadow-sm transition-all pb-2 pt-2">
            <div className="container mx-auto px-4">
                <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                    <h1 
                        className="text-2xl font-extrabold tracking-tight bg-gradient-to-r from-blue-600 to-cyan-500 bg-clip-text text-transparent cursor-pointer hover:opacity-80 shrink-0" 
                        onClick={() => setStatus('idle')}
                    >
                        SQLizer
                    </h1>

                    <div className="flex flex-1 w-full md:w-auto items-center justify-between md:justify-end gap-4">
                        <div className="flex flex-wrap gap-2 justify-center md:justify-end">
                            {sheets.map((sheet, idx) => {
                                const isGeneric = isGenericName(sheet.sheetName);
                                return (
                                    <button
                                        key={idx}
                                        onClick={() => setActiveSheetIndex(idx)}
                                        className={clsx(
                                            "flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-bold transition-all border relative",
                                            activeSheetIndex === idx 
                                                ? "bg-blue-600 text-white border-blue-600 shadow-md" 
                                                : isGeneric 
                                                    ? "bg-orange-50 text-orange-600 border-orange-300 hover:bg-orange-100 animate-pulse"
                                                    : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300"
                                        )}
                                    >
                                        {activeSheetIndex === idx ? <Layers className="w-3 h-3" /> : null}
                                        {isGeneric && <AlertTriangle className="w-3 h-3 mr-1" />}
                                        {sheet.sheetName}
                                    </button>
                                )
                            })}
                        </div>

                        <div className="flex gap-2 shrink-0 border-l pl-4 border-gray-200 dark:border-gray-700">
                            <button 
                                onClick={() => { setStatus('idle'); setSheets([]); }}
                                className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                title="Cancelar"
                            >
                                <span className="sr-only">Cancelar</span>
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                            </button>
                            
                            <button 
                                onClick={handleGenerateSQL}
                                disabled={hasGenericNames}
                                className={clsx(
                                    "font-bold py-1.5 px-4 rounded-lg shadow-md transition-all flex items-center gap-2 text-sm",
                                    hasGenericNames 
                                        ? "bg-gray-300 text-gray-500 cursor-not-allowed dark:bg-gray-800 dark:text-gray-600"
                                        : "bg-green-600 hover:bg-green-700 text-white active:scale-95"
                                )}
                            >
                                {hasGenericNames ? <Lock className="w-4 h-4" /> : <Code className="w-4 h-4" />}
                                Exportar
                            </button>
                        </div>
                    </div>
                </div>
                {hasGenericNames && (
                    <div className="text-center py-1">
                        <span className="text-[10px] font-bold text-orange-600 uppercase tracking-wider animate-pulse">
                            ⚠ Debes renombrar las tablas marcadas en naranja
                        </span>
                    </div>
                )}
            </div>
        </div>

        {/* CONTENEDOR PRINCIPAL */}
        <div className="mt-6 px-4">
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
            
            {/* Header de Edición de Nombre */}
            <div className={clsx(
                "p-6 border-b border-gray-200 dark:border-gray-800 flex flex-col md:flex-row md:items-center gap-6 transition-colors duration-500",
                isGenericName(currentSheet.sheetName) ? "bg-orange-50 dark:bg-orange-900/20" : "bg-gray-50 dark:bg-gray-900/50"
            )}>
                <div className={clsx(
                    "p-3 rounded-xl shadow-inner shrink-0 transition-colors duration-500",
                    isGenericName(currentSheet.sheetName) ? "bg-orange-200 text-orange-700" : "bg-blue-100 dark:bg-blue-900/30 text-blue-600"
                )}>
                    <Table className="w-6 h-6" />
                </div>
                
                <div className="flex-1 space-y-1">
                    <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider transition-colors">
                        {isGenericName(currentSheet.sheetName) ? (
                            <span className="text-orange-600 flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" /> Nombre inválido / Genérico
                            </span>
                        ) : (
                            <span className="text-green-600 flex items-center gap-1">
                                <div className="w-2 h-2 bg-green-500 rounded-full"></div> Nombre Válido
                            </span>
                        )}
                    </label>
                    
                    <div className="relative">
                        <input 
                            type="text"
                            value={currentSheet.sheetName}
                            onChange={(e) => updateTableName(e.target.value)}
                            onFocus={(e) => e.target.select()}
                            className={clsx(
                                "block w-full md:w-1/2 bg-transparent text-2xl font-black border-b-2 focus:outline-none transition-all placeholder-gray-400/50",
                                isGenericName(currentSheet.sheetName) 
                                    ? "text-orange-900 border-orange-300 focus:border-orange-500 dark:text-orange-100 placeholder-orange-300" 
                                    : "text-gray-900 border-transparent hover:border-gray-300 focus:border-blue-500 dark:text-white"
                            )}
                            placeholder="Ej: tabla_clientes"
                            autoFocus={isGenericName(currentSheet.sheetName)}
                        />
                        <p className="text-xs text-gray-500 mt-1 font-medium">
                            {currentSheet.columns.length} columnas detectadas
                        </p>
                    </div>
                </div>
            </div>

            {/* TABLA DE CAMPOS */}
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left border-collapse">
                <thead className="bg-gray-100 dark:bg-gray-950 text-gray-500 dark:text-gray-400 text-xs uppercase font-bold tracking-wider">
                    <tr>
                    <th className="px-6 py-4 border-b dark:border-gray-800 w-[20%]">Excel Original</th>
                    <th className="px-6 py-4 border-b dark:border-gray-800 w-[45%]">Campo SQL + Relaciones (FK)</th>
                    <th className="px-6 py-4 border-b dark:border-gray-800 w-[25%]">Tipo</th>
                    <th className="px-6 py-4 border-b dark:border-gray-800 text-center w-[10%]">Null</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {currentSheet.columns.map((col, idx) => (
                    <tr key={col.id} className="bg-white dark:bg-gray-900 hover:bg-blue-50/40 dark:hover:bg-blue-900/10 transition-colors group">
                        
                        {/* 1. Original */}
                        <td className="px-6 py-3 align-middle">
                            <div className="font-bold text-gray-700 dark:text-gray-200 text-sm break-words max-w-[200px]">{col.originalName}</div>
                            <div className="text-[10px] text-gray-400 mt-1 font-mono truncate max-w-[180px]">
                                {String(col.sampleData[0] || '')}
                            </div>
                        </td>

                        {/* 2. Campo SQL + FK Widget (HORIZONTAL) */}
                        <td className="px-6 py-3 align-middle">
                            <div className="flex items-center gap-3">
                                
                                {/* BOTÓN FK (O LLAVE PK SI ES EL PRIMERO) */}
                                {idx === 0 ? (
                                    <div className="w-8 h-8 flex items-center justify-center bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-700 text-yellow-600 dark:text-yellow-400" title="Primary Key (Automática)">
                                        <Key className="w-4 h-4" />
                                    </div>
                                ) : (
                                    <button 
                                        onClick={() => {
                                            if (col.foreignKey) {
                                                updateForeignKey(idx, null);
                                            } else {
                                                updateForeignKey(idx, { targetTable: '', targetColumn: '' });
                                            }
                                        }}
                                        className={clsx(
                                            "w-8 h-8 flex items-center justify-center rounded-lg border transition-all cursor-pointer font-bold text-[10px]",
                                            col.foreignKey 
                                                ? "bg-blue-100 text-blue-600 border-blue-300 dark:bg-blue-900/50 dark:text-blue-300 dark:border-blue-700 shadow-sm"
                                                : "bg-gray-100 text-gray-400 border-gray-200 hover:bg-gray-200 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-500"
                                        )}
                                        title="Definir Foreign Key"
                                    >
                                        FK
                                    </button>
                                )}

                                {/* Input Nombre */}
                                <div className="relative group/input">
                                    <input 
                                        type="text" 
                                        value={col.sqlName}
                                        onChange={(e) => updateColumn(idx, 'sqlName', e.target.value)}
                                        onFocus={(e) => e.target.select()}
                                        className="w-full max-w-[200px] bg-transparent border-b border-gray-300 dark:border-gray-700 hover:border-blue-400 focus:border-blue-600 rounded-none px-0 py-1 text-blue-700 dark:text-blue-400 font-mono font-bold focus:outline-none transition-all"
                                        placeholder="nombre_campo"
                                    />
                                </div>

                                {/* WIDGET DROPDOWNS FK (EN LÍNEA A LA DERECHA) */}
                                {col.foreignKey && (
                                    <div className="flex items-center gap-2 animate-in slide-in-from-left-2 duration-200 bg-gray-50 dark:bg-gray-800/50 p-1 rounded-lg border border-gray-200 dark:border-gray-700 ml-2">
                                        <div className="flex items-center gap-1 px-1">
                                            <LinkIcon className="w-3 h-3 text-blue-500" />
                                        </div>
                                        
                                        {/* Select Tabla */}
                                        <select 
                                            className={clsx(
                                                "border text-[10px] rounded px-2 py-1 w-24 outline-none focus:border-blue-500 transition-all",
                                                !col.foreignKey.targetTable 
                                                    ? "bg-orange-50 border-orange-300 text-orange-600 animate-pulse font-bold"
                                                    : "bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600"
                                            )}
                                            value={col.foreignKey.targetTable}
                                            onChange={(e) => {
                                                const targetT = e.target.value;
                                                // LÓGICA SMART: Pre-seleccionar la primera columna (id) de la tabla destino
                                                const targetTCols = getColumnsForTable(targetT);
                                                const defaultCol = targetTCols.length > 0 ? targetTCols[0].sqlName : '';

                                                updateForeignKey(idx, { 
                                                    targetTable: targetT, 
                                                    targetColumn: defaultCol // <--- AQUI ESTA LA AUTO-SELECCIÓN
                                                })
                                            }}
                                        >
                                            <option value="" disabled>Tabla...</option>
                                            {sheets
                                                .filter(s => s.sheetName !== currentSheet.sheetName)
                                                .map(s => (
                                                    <option key={s.sheetName} value={s.sheetName}>{s.sheetName}</option>
                                            ))}
                                        </select>

                                        <span className="text-gray-400">.</span>

                                        {/* Select Columna */}
                                        <select 
                                            className={clsx(
                                                "border text-[10px] rounded px-2 py-1 w-24 outline-none focus:border-blue-500 disabled:opacity-50 transition-all",
                                                !col.foreignKey.targetColumn
                                                    ? "bg-orange-50 border-orange-300 text-orange-600 animate-pulse font-bold"
                                                    : "bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600"
                                            )}
                                            value={col.foreignKey.targetColumn}
                                            disabled={!col.foreignKey.targetTable}
                                            onChange={(e) => updateForeignKey(idx, { 
                                                ...col.foreignKey!, 
                                                targetColumn: e.target.value 
                                            })}
                                        >
                                            <option value="" disabled>Columna...</option>
                                            {col.foreignKey.targetTable && getColumnsForTable(col.foreignKey.targetTable).map(c => (
                                                <option key={c.id} value={c.sqlName}>{c.sqlName}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                            </div>
                        </td>

                        {/* 3. Tipo */}
                        <td className="px-6 py-3 align-middle">
                        <div className="flex gap-2 items-center">
                            <select 
                                value={col.type || ''}
                                onChange={(e) => updateColumn(idx, 'type', e.target.value)}
                                className={clsx(
                                    "border rounded px-2 py-1.5 text-xs font-medium focus:ring-1 focus:ring-blue-500 outline-none cursor-pointer shadow-sm transition-colors",
                                    !col.type 
                                        ? "bg-orange-50 border-orange-300 text-orange-600 animate-pulse font-bold"
                                        : "bg-transparent border-gray-200 dark:border-gray-700 text-blue-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-800"
                                )}
                            >
                                <option value="" disabled>Tipo...</option>
                                <option value="INT">INT</option>
                                <option value="VARCHAR">VARCHAR</option>
                                <option value="TEXT">TEXT</option>
                                <option value="DATE">DATE</option>
                                <option value="DECIMAL">DECIMAL</option>
                                <option value="BOOLEAN">BOOLEAN</option>
                            </select>
                            
                            {col.type === 'VARCHAR' && (
                                <div className="flex items-center animate-in fade-in zoom-in duration-200">
                                    <input 
                                        type="number" 
                                        value={col.length || 50}
                                        onChange={(e) => updateColumn(idx, 'length', parseInt(e.target.value))}
                                        onFocus={(e) => e.target.select()}
                                        className="w-14 bg-white dark:bg-gray-800 border border-blue-200 dark:border-blue-800 rounded px-1 py-1.5 text-center text-xs font-mono focus:ring-1 focus:ring-blue-500 outline-none dark:text-white text-blue-900"
                                    />
                                </div>
                            )}
                        </div>
                        </td>

                        {/* 4. Opciones (SWITCH) */}
                        <td className="px-6 py-3 align-middle text-center">
                            <label className="inline-flex items-center cursor-pointer">
                                <input 
                                    type="checkbox" 
                                    className="sr-only peer" 
                                    checked={col.nullable} 
                                    onChange={(e) => updateColumn(idx, 'nullable', e.target.checked)}
                                />
                                <div className="relative w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                            </label>
                        </td>
                    </tr>
                    ))}
                </tbody>
                </table>
            </div>
            </div>
        </div>
      </div>
    );
  }

  // 3. IDLE
  return (
    <div className="flex flex-col items-center justify-center w-full animate-fade-in">
      <div className="text-center mb-12 space-y-4">
            <h1 className="text-5xl font-extrabold tracking-tight bg-gradient-to-r from-blue-600 to-cyan-500 bg-clip-text text-transparent">
                SQLizer
            </h1>
            <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
                Convierte tus hojas de cálculo en sentencias SQL listas para producción.
                <br/>
                <span className="text-sm text-gray-500">Privacidad total: Tus archivos se procesan localmente.</span>
            </p>
      </div>
      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 border border-red-200 rounded-lg mb-4 w-full max-w-2xl text-center flex items-center justify-center gap-2">
          <AlertTriangle className="w-5 h-5" /> {error}
        </div>
      )}
      <FileDropzone onFileAccepted={handleFileAccepted} />
    </div>
  );
}