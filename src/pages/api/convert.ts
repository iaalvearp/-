// src/pages/api/convert.ts
import type { APIRoute } from 'astro';
import { generateSQL } from '../../lib/engine/sql-generator';
import { parseFileContent } from '../../lib/engine/parser';

export const POST: APIRoute = async ({ request }) => {
  // 1. Recibimos el archivo del usuario
  const formData = await request.formData();
  const file = formData.get('file') as File;
  
  if (!file) {
    return new Response('No se ha subido ningún archivo', { status: 400 });
  }
  
  // 2. Validamos tamaño (Seguridad)
  if (file.size > 500 * 1024) { // 500KB
     return new Response('Archivo muy grande para versión Free', { status: 400 });
  }

  // 3. Procesamos (usando la misma función que el PRO, pero en servidor)
  const content = await file.text();
  const type = file.name.endsWith('.csv') ? 'csv' : 'json';
  
  const dataParsed = parseFileContent(content, type);
  const sql = generateSQL(dataParsed);

  // 4. Devolvemos solo el texto SQL
  return new Response(sql);
};