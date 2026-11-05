/* =========================================================
   INSANITY · Panel de inventario  (panel.gs + panel_ins.html)

   Archivo NUEVO en el mismo Apps Script donde ya están apartados.gs y ventas.gs.
   No reemplaza nada. Pasos completos en el README, sección 5.

   Qué hace:
   - Página para el celular con la foto de cada producto.
   - Compré  → suma piezas al stock.
   - Vendí   → resta del stock y agrega la venta a la pestaña Ventas (igual que marcar ✓).
   - Contar  → pone el número exacto que tienes (para cuando cuentas tu inventario).
   - Nuevo   → foto con la cámara del cel y el producto queda dado de alta en la tienda.
   - Todo queda anotado en la pestaña Movimientos y se puede deshacer.
   ========================================================= */

const PANEL = {
  hojaProductos: "plantilla-productos",
  hojaVentas: "Ventas",
  hojaMovimientos: "Movimientos",
  hojaCostos: "Costos",
  carpetaFotos: "INSANITY fotos",   // carpeta de Google Drive donde se guardan las fotos nuevas
  prefijo: "INS-B",                 // los códigos nuevos siguen después del más alto: INS-B0117…
  fotos: "https://diegomo-ux.github.io/insanityshopmx/img/productos/", // carpeta de fotos en GitHub Pages
  sitio: "https://diegomo-ux.github.io/insanityshopmx/",
  zona: "America/Mexico_City",
  pocas: 2,                 // el stock sale en naranja cuando quedan esta cantidad o menos
  // Categorías que pasan a "sobre pedido" al llegar a 0 (igual que en apartados.gs)
  sobrePedido: /\bpin(es)?\b|aroma|perfum|bolsillo|lapiz/
};


/* ============ INSTALAR (una sola vez) ============ */

// Crea tu clave secreta y la pestaña Movimientos. Mira la clave en "Registro de ejecución".
function instalarPanel() {
  const props = PropertiesService.getScriptProperties();
  let clave = props.getProperty("PANEL_CLAVE");
  if (!clave) {
    clave = Utilities.getUuid().replace(/-/g, "").slice(0, 16);
    props.setProperty("PANEL_CLAVE", clave);
  }
  panelHojaMov_();
  Logger.log("Tu clave del panel: " + clave);
  Logger.log("Tu panel: tu link que termina en /exec + ?panel=" + clave);
}

// Si alguien más vio tu link, corre esta función: el link viejo deja de funcionar.
function nuevaClavePanel() {
  PropertiesService.getScriptProperties().deleteProperty("PANEL_CLAVE");
  instalarPanel();
}


/* ============ PÁGINA ============ */

// Se llama desde doGet en apartados.gs cuando el link trae ?panel=
function panelPagina(e) {
  const clave = PropertiesService.getScriptProperties().getProperty("PANEL_CLAVE");
  if (!clave || e.parameter.panel !== clave) {
    return HtmlService.createHtmlOutput('<p style="font:16px sans-serif;padding:24px">Link incorrecto. Revisa tu clave del panel.</p>')
      .setTitle("INSANITY");
  }
  const t = HtmlService.createTemplateFromFile("panel_ins");
  t.clave = clave;
  return t.evaluate()
    .setTitle("Inventario · INSANITY")
    .addMetaTag("viewport", "width=device-width, initial-scale=1, viewport-fit=cover");
}


/* ============ LO QUE LLAMA EL PANEL ============ */

function panelDatos(clave) {
  panelClave_(clave);
  const p = panelLeer_();
  const productos = [];
  for (let k = 1; k < p.datos.length; k++) {
    if (String(p.datos[k][p.col.codigo]).trim()) productos.push(panelProducto_(p, k));
  }
  return { productos: productos, hoy: panelHoy_(), pocas: PANEL.pocas };
}

// m = { codigo, talla, tipo: "venta" | "compra" | "conteo", cant, precio, pago, canal, nota }
function panelMover(clave, m) {
  panelClave_(clave);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const tipo = String(m.tipo);
    if (["venta", "compra", "conteo"].indexOf(tipo) < 0) throw new Error("Movimiento desconocido.");
    const cant = Math.floor(Number(m.cant));
    if (tipo === "conteo" ? !(cant >= 0) : !(cant > 0)) throw new Error("Revisa la cantidad.");
    if (cant > 999) throw new Error("La cantidad es demasiado grande.");

    const p = panelLeer_();
    const codigo = String(m.codigo || "").trim().toUpperCase();
    const k = panelFila_(p, codigo);
    if (k < 0) throw new Error("No encuentro el código " + codigo + ".");
    const prod = panelProducto_(p, k);
    const est = panelEstado_(p, k);

    let talla = String(m.talla || "").trim().toUpperCase();
    let antes;
    if (est.tallas) {
      if (!talla) throw new Error("Elige la talla.");
      const t = est.tallas.find(function (x) { return x[0].toUpperCase() === talla; });
      if (!t && tipo === "venta") throw new Error("No hay talla " + talla + ".");
      antes = t ? t[1] : 0;
    } else {
      talla = "";
      antes = est.stock; // null = sin stock capturado
    }
    const base = antes === null ? 0 : antes;
    const conTalla = talla ? " talla " + talla : "";

    let despues = antes, estadoVenta = "", mensaje = "", ventaFila = 0;

    if (tipo === "compra") {
      despues = base + cant;
      mensaje = "Agregaste " + cant + " · " + prod.nombre + conTalla + ". Ahora hay " + despues + ".";
    } else if (tipo === "conteo") {
      despues = cant;
      mensaje = prod.nombre + conTalla + ": ahora hay " + despues + (antes === null ? "." : " (antes " + antes + ").");
    } else {
      if (antes !== null && base >= cant) {
        despues = base - cant;
        estadoVenta = "✓ restado";
        mensaje = "Vendiste " + cant + " · " + prod.nombre + conTalla + ". Quedan " + despues + ".";
      } else if (antes === null) {
        estadoVenta = prod.siemprePedido ? "✓ sobre pedido" : "✓ sin stock que restar";
        mensaje = "Venta registrada · " + prod.nombre + " (no tenía stock capturado).";
      } else if (base === 0 && prod.pedido) {
        estadoVenta = "✓ sobre pedido";
        mensaje = "Venta registrada · " + prod.nombre + " (sobre pedido, no se restó stock).";
      } else {
        throw new Error("Solo hay " + base + (talla ? " en talla " + talla : "") + ".");
      }
    }

    if (despues !== antes) panelGuardar_(p, k, est, talla, despues);

    if (tipo === "venta") {
      const precio = m.precio === "" || m.precio === null || m.precio === undefined ? prod.precio : Number(m.precio);
      if (!(precio >= 0)) throw new Error("Revisa el precio.");
      ventaFila = panelAgregarVenta_({
        codigo: codigo, talla: talla, cant: cant, precio: precio,
        pago: String(m.pago || ""), canal: String(m.canal || "Directa"),
        nota: String(m.nota || "").trim().slice(0, 200), estado: estadoVenta
      });
    }

    const nombres = { venta: "Venta", compra: "Compra", conteo: "Conteo" };
    const signo = tipo === "venta" ? -cant : tipo === "compra" ? cant : "";
    panelLog_(nombres[tipo], prod, talla, signo, antes, despues,
      ventaFila ? "Ventas fila " + ventaFila + (m.nota ? " · " + m.nota : "") : String(m.nota || ""));

    return {
      producto: panelProducto_(p, k),
      hoy: panelHoy_(),
      mensaje: mensaje,
      deshacer: { tipo: tipo, codigo: codigo, talla: talla, cant: cant, antes: antes, ventaFila: ventaFila }
    };
  } finally {
    lock.releaseLock();
  }
}

function panelDeshacer(clave, d) {
  panelClave_(clave);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const p = panelLeer_();
    const k = panelFila_(p, String(d.codigo).toUpperCase());
    if (k < 0) throw new Error("Ese producto ya no existe.");
    const prod = panelProducto_(p, k);
    const est = panelEstado_(p, k);
    const talla = String(d.talla || "");
    const t = est.tallas ? est.tallas.find(function (x) { return x[0].toUpperCase() === talla; }) : null;
    const actual = est.tallas ? (t ? t[1] : 0) : est.stock;
    const cant = Number(d.cant);
    let despues = actual;

    if (d.tipo === "venta") {
      const h = SpreadsheetApp.getActive().getSheetByName(PANEL.hojaVentas);
      const c = panelColsVentas_(h);
      const fila = Number(d.ventaFila);
      const cod = String(h.getRange(fila, c.codigo).getValue()).trim().toUpperCase();
      const estado = String(h.getRange(fila, c.estado).getValue());
      if (cod !== prod.codigo || estado.indexOf("✓") !== 0) {
        throw new Error("Esa venta ya cambió en la hoja. Corrígela en Ventas desmarcando su ✓.");
      }
      h.getRange(fila, c.ok).setValue(false);
      if (estado === "✓ restado") {
        despues = (actual || 0) + cant;
        panelGuardar_(p, k, est, talla, despues);
        h.getRange(fila, c.estado).setValue("↩ devuelta (stock regresado)");
      } else {
        h.getRange(fila, c.estado).setValue("↩ cancelada");
      }
    } else if (d.tipo === "compra") {
      despues = (actual || 0) - cant;
      if (despues < 0) throw new Error("Ya no hay suficientes piezas para quitar. Corrige con Contar.");
      panelGuardar_(p, k, est, talla, despues);
    } else {
      despues = d.antes === null ? "" : Number(d.antes);
      panelGuardar_(p, k, est, talla, despues);
    }

    panelLog_("Deshacer " + d.tipo, prod, talla, "", actual, despues === "" ? null : despues, "");
    return { producto: panelProducto_(p, k), hoy: panelHoy_(), mensaje: "Listo, se deshizo. " + prod.nombre + ": " + (despues === "" ? "sin stock" : despues) + "." };
  } finally {
    lock.releaseLock();
  }
}

// Mostrar u ocultar en la tienda web (columna activo)
function panelVisible(clave, codigo, visible) {
  panelClave_(clave);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const p = panelLeer_();
    if (p.col.activo < 0) throw new Error("Agrega una columna llamada activo en la hoja de productos.");
    const k = panelFila_(p, String(codigo).toUpperCase());
    if (k < 0) throw new Error("No encuentro el código " + codigo + ".");
    const valor = visible ? "si" : "no";
    p.h.getRange(k + 1, p.col.activo + 1).setValue(valor);
    p.datos[k][p.col.activo] = valor;
    const prod = panelProducto_(p, k);
    panelLog_(visible ? "Mostrar en web" : "Ocultar en web", prod, "", "", "", "", "");
    return { producto: prod, mensaje: prod.nombre + (visible ? " ya se ve en la web." : " quedó oculto en la web.") };
  } finally {
    lock.releaseLock();
  }
}


/* ============ NUEVO PRODUCTO (cámara) ============ */

// d = { nombre, categoria, precio, stock, talla, costo, descripcion, activo, foto (JPG en base64) }
function panelNuevo(clave, d) {
  panelClave_(clave);
  const nombre = String(d.nombre || "").trim().slice(0, 80);
  const categoria = String(d.categoria || "").trim().slice(0, 60);
  const precio = Number(d.precio);
  const stock = Math.floor(Number(d.stock));
  const talla = String(d.talla || "").trim().toUpperCase().replace(/[:,]/g, "").slice(0, 10);
  const costo = d.costo === "" || d.costo === null || d.costo === undefined ? "" : Number(d.costo);
  const foto = String(d.foto || "");
  if (!nombre) throw new Error("Ponle nombre.");
  if (!categoria) throw new Error("Elige la categoría.");
  if (!(precio > 0)) throw new Error("Revisa el precio.");
  if (!(stock >= 0) || stock > 999) throw new Error("Revisa el stock.");
  if (costo !== "" && !(costo >= 0)) throw new Error("Revisa el costo.");
  if (!foto) throw new Error("Falta la foto.");
  if (foto.length > 6000000) throw new Error("La foto es demasiado pesada.");

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const p = panelLeer_();
    if (p.col.foto < 0) throw new Error("Agrega una columna llamada foto en la hoja de productos.");
    const codigo = panelSiguienteCodigo_(p);
    const url = panelGuardarFoto_(codigo, foto);

    const fila = p.datos[0].map(function () { return ""; });
    const poner = function (n, v) { if (p.col[n] > -1) fila[p.col[n]] = v; };
    poner("codigo", codigo);
    poner("nombre", nombre);
    poner("categoria", categoria);
    poner("precio", precio);
    if (talla && p.col.tallas > -1) poner("tallas", talla + ":" + stock); else poner("stock", stock);
    poner("descripcion", String(d.descripcion || "").trim().slice(0, 500));
    poner("activo", d.activo ? "si" : "no");
    poner("foto", url);
    p.h.appendRow(fila);
    p.datos.push(fila);

    if (costo !== "") panelCosto_(codigo, costo);
    const prod = panelProducto_(p, p.datos.length - 1);
    panelLog_("Nuevo producto", prod, talla, stock, null, stock, d.activo ? "visible en la web" : "oculto en la web");
    return {
      producto: prod,
      mensaje: "Listo: " + nombre + " quedó como " + codigo + (d.activo ? ". Sale en la tienda en unos 5 minutos." : ".")
    };
  } finally {
    lock.releaseLock();
  }
}

// Sigue después del código más alto que empiece con el prefijo: INS-B0116 → INS-B0117
function panelSiguienteCodigo_(p) {
  const re = new RegExp("^" + PANEL.prefijo.replace(/[-]/g, "\\-") + "(\\d+)$");
  let max = 0;
  for (let k = 1; k < p.datos.length; k++) {
    const m = String(p.datos[k][p.col.codigo]).trim().toUpperCase().match(re);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return PANEL.prefijo + String(max + 1).padStart(4, "0");
}

// Guarda la foto en la carpeta de Drive y regresa un link que la tienda puede mostrar
function panelGuardarFoto_(codigo, base64) {
  const props = PropertiesService.getScriptProperties();
  let carpeta = null;
  const id = props.getProperty("PANEL_CARPETA");
  if (id) {
    try { carpeta = DriveApp.getFolderById(id); if (carpeta.isTrashed()) carpeta = null; } catch (e) { carpeta = null; }
  }
  if (!carpeta) {
    carpeta = DriveApp.createFolder(PANEL.carpetaFotos);
    props.setProperty("PANEL_CARPETA", carpeta.getId());
  }
  const archivo = carpeta.createFile(Utilities.newBlob(Utilities.base64Decode(base64), "image/jpeg", codigo + ".jpg"));
  archivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return "https://lh3.googleusercontent.com/d/" + archivo.getId() + "=w1080";
}

// Agrega el código y su costo al final de la pestaña Costos
function panelCosto_(codigo, costo) {
  const h = SpreadsheetApp.getActive().getSheetByName(PANEL.hojaCostos);
  if (!h) return;
  const cab = h.getRange(1, 1, 1, h.getLastColumn()).getValues()[0].map(panelNorm_);
  const cCod = cab.indexOf("codigo") + 1, cCosto = cab.indexOf("costo x pieza") + 1;
  if (!cCod || !cCosto) return;
  const v = h.getRange(1, cCod, h.getMaxRows(), 1).getValues();
  let ultima = 1;
  for (let i = v.length - 1; i > 0; i--) { if (String(v[i][0]).trim() !== "") { ultima = i + 1; break; } }
  if (ultima + 1 > h.getMaxRows()) h.insertRowsAfter(h.getMaxRows(), 50);
  h.getRange(ultima + 1, cCod).setValue(codigo);
  h.getRange(ultima + 1, cCosto).setValue(costo);
}


/* ============ PRODUCTOS ============ */

function panelLeer_() {
  const h = SpreadsheetApp.getActive().getSheetByName(PANEL.hojaProductos);
  if (!h) throw new Error('No encuentro la pestaña "' + PANEL.hojaProductos + '".');
  const datos = h.getDataRange().getValues();
  const cab = datos[0].map(panelNorm_);
  const col = {};
  ["codigo", "nombre", "categoria", "precio", "tallas", "stock", "descripcion", "activo", "sobrepedido", "foto"].forEach(function (n) {
    col[n] = cab.indexOf(n);
  });
  if (col.codigo < 0 || col.stock < 0) throw new Error("La hoja de productos necesita las columnas codigo y stock.");
  return { h: h, datos: datos, col: col };
}

function panelFila_(p, codigo) {
  for (let k = 1; k < p.datos.length; k++) {
    if (String(p.datos[k][p.col.codigo]).trim().toUpperCase() === codigo) return k;
  }
  return -1;
}

// "S:1, M:2" → [["S",1],["M",2]] · "S,M,L" o vacío → null (igual que apartados.gs)
function panelTallas_(txt) {
  const partes = String(txt || "").split(",").map(function (t) { return t.trim(); }).filter(String);
  if (!partes.some(function (t) { return t.indexOf(":") > -1; })) return null;
  return partes.map(function (t) {
    const kv = t.split(":");
    return [kv[0].trim(), Math.max(0, parseInt(kv[1], 10) || 0)];
  });
}

function panelEstado_(p, k) {
  const f = p.datos[k];
  const s = String(f[p.col.stock]).trim();
  return {
    tallas: p.col.tallas > -1 ? panelTallas_(f[p.col.tallas]) : null,
    stock: s === "" ? null : (parseInt(s, 10) || 0)
  };
}

function panelGuardar_(p, k, est, talla, nuevo) {
  if (est.tallas) {
    const t = est.tallas.find(function (x) { return x[0].toUpperCase() === talla; });
    if (t) t[1] = Number(nuevo) || 0; else est.tallas.push([talla, Number(nuevo) || 0]);
    const txt = est.tallas.map(function (x) { return x[0] + ":" + x[1]; }).join(", ");
    p.h.getRange(k + 1, p.col.tallas + 1).setValue(txt);
    p.datos[k][p.col.tallas] = txt;
  } else {
    p.h.getRange(k + 1, p.col.stock + 1).setValue(nuevo);
    p.datos[k][p.col.stock] = nuevo;
  }
}

function panelProducto_(p, k) {
  const f = p.datos[k], c = p.col;
  const v = function (n) { return c[n] > -1 ? f[c[n]] : ""; };
  const codigo = String(v("codigo")).trim().toUpperCase();
  const est = panelEstado_(p, k);
  const total = est.tallas ? est.tallas.reduce(function (s, t) { return s + t[1]; }, 0) : est.stock;
  const activo = panelNorm_(v("activo"));
  const siempre = ["si", "x", "1", "true"].indexOf(panelNorm_(v("sobrepedido"))) > -1;
  const categoria = String(v("categoria")).trim();

  let fotos;
  const foto = String(v("foto")).trim();
  if (foto) {
    fotos = [/^https?:/i.test(foto) ? foto : /^\/|^img\//i.test(foto) ? PANEL.sitio + foto.replace(/^\//, "") : PANEL.fotos + foto];
  } else {
    fotos = ["jpg", "jpeg", "png", "webp", "JPG"].map(function (e) { return PANEL.fotos + codigo + "." + e; });
  }

  return {
    codigo: codigo,
    nombre: String(v("nombre") || codigo).trim(),
    categoria: categoria || "Sin categoría",
    precio: Number(String(v("precio")).replace(/[^0-9.]/g, "")) || 0,
    stock: est.stock,
    tallas: est.tallas,
    total: total,
    activo: activo === "" || ["si", "x", "1", "true", "yes"].indexOf(activo) > -1,
    siemprePedido: siempre,
    pedido: siempre || (PANEL.sobrePedido.test(panelNorm_(categoria)) && (total || 0) <= 0),
    fotos: fotos
  };
}


/* ============ VENTAS ============ */

function panelColsVentas_(h) {
  const cab = h.getRange(1, 1, 1, h.getLastColumn()).getValues()[0].map(panelNorm_);
  const col = function (n, def) { const i = cab.indexOf(n); return i > -1 ? i + 1 : def; };
  return {
    ok: col("✓", 1), fecha: col("fecha", 2), codigo: col("codigo", 3), talla: col("talla", 4),
    cant: col("cant", 5), precio: col("precio", 6), pago: col("pago", 7), canal: col("canal", 8),
    nota: col("nota", 9), estado: col("estado", 14)
  };
}

function panelUltimaVenta_(h, c) {
  const max = h.getMaxRows();
  if (max < 2) return 1;
  const v = h.getRange(2, c.codigo, max - 1, 1).getValues();
  for (let i = v.length - 1; i >= 0; i--) {
    if (String(v[i][0]).trim() !== "") return i + 2;
  }
  return 1;
}

function panelAgregarVenta_(v) {
  const h = SpreadsheetApp.getActive().getSheetByName(PANEL.hojaVentas);
  if (!h) throw new Error('No encuentro la pestaña "' + PANEL.hojaVentas + '".');
  const c = panelColsVentas_(h);
  const fila = panelUltimaVenta_(h, c) + 1;
  if (fila > h.getMaxRows()) h.insertRowsAfter(h.getMaxRows(), 100);
  const caja = h.getRange(fila, c.ok);
  if (!caja.getDataValidation()) caja.insertCheckboxes();
  caja.setValue(true);
  h.getRange(fila, c.fecha).setValue(new Date());
  h.getRange(fila, c.codigo).setValue(v.codigo);
  h.getRange(fila, c.talla).setValue(v.talla);
  h.getRange(fila, c.cant).setValue(v.cant);
  h.getRange(fila, c.precio).setValue(v.precio);
  h.getRange(fila, c.pago).setValue(v.pago);
  h.getRange(fila, c.canal).setValue(v.canal);
  h.getRange(fila, c.nota).setValue(v.nota);
  h.getRange(fila, c.estado).setValue(v.estado);
  return fila;
}

// Piezas y dinero vendidos hoy (filas de Ventas con ✓)
function panelHoy_() {
  const h = SpreadsheetApp.getActive().getSheetByName(PANEL.hojaVentas);
  if (!h) return { piezas: 0, total: 0 };
  const c = panelColsVentas_(h);
  const ultima = panelUltimaVenta_(h, c);
  if (ultima < 2) return { piezas: 0, total: 0 };
  const ancho = Math.max(c.ok, c.fecha, c.cant, c.precio, c.estado);
  const datos = h.getRange(2, 1, ultima - 1, ancho).getValues();
  const hoy = Utilities.formatDate(new Date(), PANEL.zona, "yyyy-MM-dd");
  let piezas = 0, total = 0;
  datos.forEach(function (f) {
    const fecha = f[c.fecha - 1];
    if (!(fecha instanceof Date)) return;
    if (Utilities.formatDate(fecha, PANEL.zona, "yyyy-MM-dd") !== hoy) return;
    if (String(f[c.estado - 1]).indexOf("✓") !== 0) return;
    const n = Number(f[c.cant - 1]) || 0;
    piezas += n;
    total += n * (Number(f[c.precio - 1]) || 0);
  });
  return { piezas: piezas, total: total };
}


/* ============ MOVIMIENTOS ============ */

function panelHojaMov_() {
  const ss = SpreadsheetApp.getActive();
  let h = ss.getSheetByName(PANEL.hojaMovimientos);
  if (!h) {
    h = ss.insertSheet(PANEL.hojaMovimientos);
    h.appendRow(["Fecha", "Movimiento", "Código", "Producto", "Talla", "Cant", "Antes", "Después", "Nota"]);
    h.setFrozenRows(1);
    h.getRange(1, 1, 1, 9).setFontWeight("bold");
    h.getRange("A:A").setNumberFormat("dd/mm/yyyy hh:mm");
  }
  return h;
}

function panelLog_(movimiento, prod, talla, cant, antes, despues, nota) {
  panelHojaMov_().appendRow([
    new Date(), movimiento, prod.codigo, prod.nombre, talla, cant,
    antes === null ? "" : antes, despues === null ? "" : despues, nota
  ]);
}


/* ============ AYUDANTES ============ */

function panelClave_(clave) {
  const ok = PropertiesService.getScriptProperties().getProperty("PANEL_CLAVE");
  if (!ok || String(clave) !== ok) throw new Error("Clave incorrecta. Abre el panel con tu link completo.");
}

function panelNorm_(s) {
  return String(s === null || s === undefined ? "" : s).toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}
