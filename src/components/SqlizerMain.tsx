import React from 'react';
import FileDropzone from './ui/FileDropzone';

export default function SqlizerMain() {
  const handleFileAccepted = (file: File) => {
    console.log("¡Archivo recibido!", file.name, file.size);
    alert(`Archivo recibido: ${file.name} (${(file.size / 1024).toFixed(2)} KB)`);
    // TODO: Implementar la subida al API aquí
  };

  return (
    <div className="flex flex-col items-center justify-center w-full">
      <FileDropzone onFileAccepted={handleFileAccepted} />
    </div>
  );
}
