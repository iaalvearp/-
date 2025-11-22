// src/components/conversion/ConversionFlow.tsx
import React, { useState } from 'react';
import FileDropzone from '../ui/FileDropzone';
import { parseExcelFile } from '../../lib/engine/parser';
import type { ParsedSheet } from '../../lib/engine/types';
import { Loader2 } from 'lucide-react';

export default function ConversionFlow() {
  const [status, setStatus] = useState<'idle' | 'parsing' | 'review'>('idle');
  const [parsedData, setParsedData] = useState<ParsedSheet[] | null>(null);

  const handleFile = async (file: File) => {
    setStatus('parsing');
    try {
      // 1. Ejecutamos el motor
      const result = await parseExcelFile(file);
      
      // 2. Guardamos el resultado y cambiamos de pantalla
      setParsedData(result);
      setStatus('review');
      
      console.log("--- ANÁLISIS COMPLETADO ---");
      result.forEach(sheet => {
        console.log(`Hoja: ${sheet.sheetName}`);
        console.log(`Filas: ${sheet.totalRows}`);
        console.table(sheet.columns);
      });
      
    } catch (error) {
      console.error(error);
      alert("Error al leer el archivo. Revisa la consola.");
      setStatus('idle');
    }
  };

  if (status === 'parsing') {
    return (
      <div className="flex flex-col items-center justify-center p-12">
        <Loader2 className="w-10 h-10 animate-spin text-blue-600 mb-4" />
        <p className="text-gray-600 dark:text-gray-300">Analizando tu archivo...</p>
      </div>
    );
  }

  if (status === 'review' && parsedData) {
    return (
      <div className="w-full max-w-4xl mx-auto bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg">
        <h2 className="text-2xl font-bold mb-4 dark:text-white">¡Archivo Leído!</h2>
        <div className="mb-4 dark:text-gray-300">
           <p className="mb-2">Detectamos <strong>{parsedData.length}</strong> hojas:</p>
           <ul className="list-disc pl-5 space-y-1">
             {parsedData.map((sheet, idx) => (
               <li key={idx}>
                 <strong>{sheet.sheetName}</strong>: {sheet.totalRows} filas, {sheet.columns.length} columnas.
               </li>
             ))}
           </ul>
           <p className="mt-4 text-sm text-gray-500">
             Mira la consola del navegador (F12) para ver la estructura detallada.
           </p>
        </div>
        <button 
            onClick={() => setStatus('idle')}
            className="bg-gray-200 hover:bg-gray-300 px-4 py-2 rounded text-gray-800"
        >
            Subir otro archivo
        </button>
      </div>
    );
  }

  // Estado por defecto: Mostrar Dropzone
  return <FileDropzone onFileAccepted={handleFile} />;
}