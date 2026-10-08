# INSANITY · Tienda

Sitio de una sola página para GitHub Pages. Los productos se leen de una Google Sheet.

## Archivos

- `index.html` → todo el sitio. Arriba del `<script>` está `CONFIG`, lo único que vas a editar.
- `apartados.gs` → código del Apps Script que aparta y resta el stock (va dentro de la Google Sheet, no en GitHub).
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

El orden no importa; lo que importa es el nombre de la columna.

| Columna | Qué poner |
|---|---|
| codigo | INS-B002 (igual que la etiqueta y el nombre de la foto) |
| nombre | Nombre visible |
| categoria | Ver lista abajo |
| precio | Solo el número: 450 |
| tallas | Con stock por talla: `S:1, M:2, L:0` (deja *stock* vacío). Sin talla: vacío |
| stock | Piezas disponibles cuando no hay tallas. 0 = Agotado, 1 = Última pieza |
| descripcion | Datos importantes: material, medidas, cómo queda, duración del aroma. Puedes usar saltos de línea (Alt + Enter) |
| top | "si" para que salga en Lo más pesado |
| activo | "no" para ocultarlo sin borrarlo |
| sobrepedido | "si" = no lo tienes en stock pero lo consigues. Sale en la pestaña *Sobre pedido* y se entrega en 15 días (`CONFIG.diasPedido`) |
| foto | Opcional. Vacío = usa `img/productos/CODIGO.jpg` |

### Categorías

| Escribe en la Sheet | Pestaña en la web |
|---|---|
| Playeras Hombre | Playeras Hombre |
| Crop Top | Crop Tops |
| Pantalones Hombre | Pantalones Hombre |
| Pantalones Mujer | Pantalones Mujer |
| Streetwear | Streetwear (gorras, conjuntos, calcetas, pulseras y todo lo demás) |
| Bandoleras | Bandoleras |
| Bolsas | Bolsas |
| Pines | Pines (con stock 0 siguen visibles como sobre pedido, 10 días: `CONFIG.diasPin`) |
| Aromas Dama · Aromas Caballero · Aromas Unisex | Aromas (perfumes de 30 ml) |
| Bolsillo Dama · Bolsillo Caballero | Aromas (de bolsillo / tipo lápiz) |

Las pestañas vacías no se muestran. Para cambiar el orden o el nombre de una pestaña, edita `CATEGORIAS` en `index.html`.

Los cambios en la Sheet tardan unos 5 minutos en verse (Google guarda caché).

## 3. Apartados (restar stock automático)

Cuando un cliente da clic en **Apartar**, las piezas se restan de la Sheet, se guardan en la pestaña *Apartados* y te llega un correo. Tú decides si se venden o se regresan.

### Instalar (una sola vez)

1. En tu Google Sheet de productos: Extensiones → Apps Script.
2. Borra lo que haya y pega todo `apartados.gs`. Guarda.
3. Revisa `GID_PRODUCTOS`: es el número después de `gid=` en el link de tu pestaña de productos.
4. Elige la función `instalar` arriba y da ▶ Ejecutar. Acepta los permisos (te dirá "app no verificada": Avanzado → Ir al proyecto).
5. Implementar → Nueva implementación → tipo **App web** → Ejecutar como: *Yo* → Quién tiene acceso: *Cualquier usuario* → Implementar.
6. Copia el link que termina en `/exec` y pégalo en `CONFIG.apartadosURL` en `index.html`.

Si después cambias el código del script: Implementar → Administrar implementaciones → editar → Versión: *Nueva versión*. Así el link no cambia.

### Cómo se usa

| Estado | Qué pasa con el stock |
|---|---|
| pendiente | Las piezas ya están restadas; nadie más las puede apartar |
| pagado | Te transfirió: la venta queda confirmada |
| cancelado | Las piezas regresan al stock |
| vencido | El script lo pone solo si pasan las horas sin pago, y regresa las piezas |

- Solo cambia la columna **Estado** con el menú. La columna *Stock* la llena el script.
- No regreses un apartado de *cancelado* a *pendiente*: el stock ya se devolvió. Pide al cliente que aparte de nuevo.
- El tiempo de apartado se cambia en `HORAS` del script y en `CONFIG.horasApartado` de la web (pon el mismo número en los dos).
- Avisos por Telegram (opcional): crea un bot con @BotFather y llena `TELEGRAM_TOKEN` y `TELEGRAM_CHAT`.

## Paquetes de mayoreo (aromas)

Se editan en `CONFIG.paquetes` dentro de `index.html`:

```js
paquetes: [
  { nombre: "Pack Bolsillo", linea: "bolsillo", cantidad: 10, precio: 250 },
  { nombre: "Pack Hustle",   linea: "clasico",  cantidad: 10, descuento: 5 },
  { nombre: "Pack Familia",  linea: "clasico",  cantidad: 15, descuento: 7 },
  { nombre: "Pack Arsenal",  linea: "clasico",  cantidad: 30, descuento: 10 }
]
```

- `linea: "clasico"` = perfumes de 30 ml (categoría *Aromas Dama / Caballero*).
- `linea: "bolsillo"` = tipo lápiz o de bolsillo (categoría *Bolsillo Dama / Caballero*).
- `descuento` = pesos menos por pieza. `precio` = precio fijo del paquete completo.
- Las dos líneas no se mezclan: los de bolsillo no cuentan para los packs de 30 ml.
- Al llegar a la cantidad, el precio especial se aplica a todas las piezas de esa línea en el carrito.
