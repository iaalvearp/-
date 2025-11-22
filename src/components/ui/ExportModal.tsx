import React, { useState } from 'react';
import { Database, X, Check, Server, HardDrive } from 'lucide-react';
import { clsx } from 'clsx';
import type { SqlDialect } from '../../lib/engine/types';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (dialect: SqlDialect) => void;
}

const DIALECTS: { id: SqlDialect; name: string; color: string }[] = [
  { id: 'mysql', name: 'MySQL', color: 'text-blue-600 bg-blue-50 border-blue-200' },
  { id: 'postgresql', name: 'PostgreSQL', color: 'text-indigo-600 bg-indigo-50 border-indigo-200' },
  { id: 'mariadb', name: 'MariaDB', color: 'text-amber-700 bg-amber-50 border-amber-200' },
  { id: 'sqlserver', name: 'SQL Server', color: 'text-red-600 bg-red-50 border-red-200' },
  { id: 'sqlite', name: 'SQLite', color: 'text-sky-600 bg-sky-50 border-sky-200' },
  { id: 'oracle', name: 'Oracle', color: 'text-red-700 bg-red-50 border-red-200' },
];

export default function ExportModal({ isOpen, onClose, onConfirm }: ExportModalProps) {
  const [selected, setSelected] = useState<SqlDialect | null>(null);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex justify-between items-start">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">¿Cuál es tu Base de Datos?</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Elige el motor de base de datos para generar el código SQL optimizado.
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto">
          {/* Tabs Dummy */}
          <div className="flex justify-center mb-8">
            <div className="bg-gray-100 dark:bg-gray-800 p-1 rounded-lg inline-flex">
                <button className="px-6 py-1.5 bg-white dark:bg-gray-700 shadow-sm rounded-md text-sm font-bold text-gray-900 dark:text-white">
                    Transactional
                </button>
                <button className="px-6 py-1.5 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200">
                    Analytical
                </button>
            </div>
          </div>

          {/* Grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {DIALECTS.map((dialect) => (
              <button
                key={dialect.id}
                onClick={() => setSelected(dialect.id)}
                className={clsx(
                  "relative flex flex-col items-center justify-center p-6 rounded-xl border-2 transition-all duration-200 group hover:scale-[1.02]",
                  selected === dialect.id 
                    ? "border-blue-600 bg-blue-50/50 dark:bg-blue-900/20 shadow-lg ring-1 ring-blue-600" 
                    : "border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-md bg-white dark:bg-gray-800"
                )}
              >
                {selected === dialect.id && (
                    <div className="absolute top-2 right-2 bg-blue-600 text-white rounded-full p-0.5">
                        <Check className="w-3 h-3" />
                    </div>
                )}
                
                <div className={clsx("w-12 h-12 rounded-lg flex items-center justify-center mb-3 transition-colors", dialect.color)}>
                    <Database className="w-6 h-6" />
                </div>
                
                <span className={clsx(
                    "font-bold text-sm",
                    selected === dialect.id ? "text-blue-700 dark:text-blue-300" : "text-gray-700 dark:text-gray-300"
                )}>
                    {dialect.name}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 flex justify-between items-center">
            <button 
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-lg transition-colors"
            >
                Cancelar
            </button>
            <button 
                disabled={!selected}
                onClick={() => selected && onConfirm(selected)}
                className={clsx(
                    "px-6 py-2 text-sm font-bold text-white rounded-lg shadow-lg transition-all flex items-center gap-2",
                    selected 
                        ? "bg-pink-600 hover:bg-pink-700 hover:shadow-pink-600/30 active:scale-95" 
                        : "bg-gray-300 dark:bg-gray-700 cursor-not-allowed"
                )}
            >
                Continuar
            </button>
        </div>
      </div>
    </div>
  );
}
