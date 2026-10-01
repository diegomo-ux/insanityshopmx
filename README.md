# INSANITY · Tienda

Sitio de una sola página para GitHub Pages. Los productos se leen de una Google Sheet.

## Archivos

- `index.html` → todo el sitio. Arriba del `<script>` está `CONFIG`, lo único que vas a editar.
- `img/familia/` → fotos lifestyle (hero y La Familia). 1080 × 1350 px.
- `img/productos/` → fotos de producto, nombradas con el código: `INS-B002.jpg`. 1080 × 1350 px, menos de 300 KB.
- `plantilla-productos.csv` → importa este archivo a Google Sheets para empezar.

## 1. Subir a GitHub

1. Crea un repositorio público, por ejemplo `insanity`.
2. "Add file → Upload files" y arrastra todo el contenido de esta carpeta.
3. Settings → Pages → Branch: `main`, carpeta `/ (root)` → Save.
4. En 1-2 minutos queda en `https://TU-USUARIO.github.io/insanity/`.

## 2. Conectar la Google Sheet

1. Crea una hoja nueva (solo para la web, sin costos ni ganancias) e importa `plantilla-productos.csv`.
2. Archivo → Compartir → Publicar en la web → elige esa pestaña → formato **CSV** → Publicar.
3. Copia el link y pégalo en `CONFIG.sheetCSV` dentro de `index.html`.

### Columnas

| Columna | Qué poner |
|---|---|
| codigo | INS-B002 (igual que la etiqueta y el nombre de la foto) |
| nombre | Nombre visible |
| categoria | Streetwear / Equipaje Urbano / Aromas |
| precio | Solo el número: 450 |
| tallas | S,M,L — vacío si no aplica |
| stock | Piezas disponibles. 0 = Agotado, 1 = Última pieza |
| top | "si" para que salga en Lo más pesado |
| activo | "no" para ocultarlo sin borrarlo |
| foto | Opcional. Vacío = usa `img/productos/CODIGO.jpg` |

Los cambios en la Sheet tardan unos 5 minutos en verse (Google guarda caché).
