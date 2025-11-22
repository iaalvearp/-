// src/components/ui/FileDropzone.tsx
import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, FileSpreadsheet, AlertCircle } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Helper para combinar clases tailwind limpiamente
function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

interface FileDropzoneProps {
  onFileAccepted: (file: File) => void;
  disabled?: boolean;
}

export default function FileDropzone({ onFileAccepted, disabled }: FileDropzoneProps) {
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback((acceptedFiles: File[], fileRejections: any[]) => {
    setError(null);

    // 1. Manejo de Errores (Archivo incorrecto)
    if (fileRejections.length > 0) {
      const errorMsg = fileRejections[0].errors[0].message;
      // Check for file type error (case insensitive)
      if (errorMsg.toLowerCase().includes('file type')) {
        setError('Solo aceptamos archivos Excel (.xlsx, .xls) o CSV.');
      } else {
        setError(errorMsg);
      }
      return;
    }

    // 2. Éxito
    if (acceptedFiles.length > 0) {
      const file = acceptedFiles[0];
      onFileAccepted(file);
    }
  }, [onFileAccepted]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'text/csv': ['.csv']
    },
    maxFiles: 1,
    disabled
  });

  return (
    <div className="w-full max-w-2xl mx-auto mt-10">
      <div
        {...getRootProps()}
        className={cn(
          "relative flex flex-col items-center justify-center w-full h-64 rounded-2xl border-2 border-dashed transition-all duration-300 cursor-pointer overflow-hidden group",
          // Estado Normal (Light / Dark)
          "border-gray-300 bg-gray-50 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-gray-800",
          // Estado Dragging (Cuando arrastras algo encima)
          isDragActive && "border-blue-500 bg-blue-50 dark:bg-blue-900/20 ring-4 ring-blue-500/20",
          // Estado Error
          error && "border-red-500 bg-red-50 dark:bg-red-900/20",
          // Estado Deshabilitado
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        <input {...getInputProps()} />
        
        {/* Contenido Visual */}
        <div className="flex flex-col items-center text-center p-6 space-y-4 z-10">
          
          {/* Icono Dinámico */}
          <div className={cn(
            "p-4 rounded-full transition-colors duration-300",
            isDragActive ? "bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-400" : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
            error && "bg-red-100 text-red-600 dark:bg-red-900 dark:text-red-400"
          )}>
            {error ? <AlertCircle className="w-8 h-8" /> : <UploadCloud className="w-8 h-8" />}
          </div>

          <div className="space-y-1">
            <p className="text-lg font-semibold text-gray-700 dark:text-gray-200">
              {isDragActive ? "¡Suelta el archivo aquí!" : "Sube tu tabla de Excel o CSV"}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {error ? (
                <span className="text-red-500 font-medium">{error}</span>
              ) : (
                "Arrastra y suelta, o haz clic para explorar"
              )}
            </p>
          </div>

          {/* Badges de formatos */}
          {!error && (
            <div className="flex gap-2 pt-2">
              <Badge text="XLSX" />
              <Badge text="CSV" />
              <Badge text="XLS" />
            </div>
          )}
        </div>

        {/* Decoración de fondo (Opcional, le da un toque 'Pro') */}
        <div className="absolute inset-0 bg-grid-slate-200/50 dark:bg-grid-slate-800/50 [mask-image:linear-gradient(to_bottom,white,transparent)] pointer-events-none" />
      </div>
    </div>
  );
}

// Componente pequeño interno para las etiquetas
function Badge({ text }: { text: string }) {
  return (
    <span className="px-2 py-1 text-xs font-medium bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md text-gray-500 dark:text-gray-400 shadow-sm">
      {text}
    </span>
  );
}