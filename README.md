# Panel de Afiliados — Leadtion v5

## 🌐 Demo en GitHub Pages
El archivo `public/index.html` funciona directamente en GitHub Pages con datos de ejemplo guardados en el navegador (localStorage).

## 🖥️ Producción local (recomendado)
Para uso real con base de datos persistente:

```
npm install
node server.js
```
Abre http://localhost:3000

## Diferencias por modo
| Característica | GitHub Pages | Servidor local |
|---|---|---|
| Datos | localStorage (por navegador) | SQLite (permanente) |
| Comprobantes | No disponible | Archivos en disco |
| Multi-usuario | No | Sí (red local) |
| Datos compartidos | No | Sí |
