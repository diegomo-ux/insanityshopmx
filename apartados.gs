/* =========================================================
   INSANITY · Apartados
   Pega este código en tu Google Sheet de productos:
   Extensiones → Apps Script. Instrucciones completas en el README.
   ========================================================= */
const AJUSTES = {
  GID_PRODUCTOS: 2031985658,     // número "gid=" del link de tu pestaña de productos
  PESTANA_APARTADOS: "Apartados",
  CORREO: "",                    // vacío = te llega a tu propio Gmail
  TELEGRAM_TOKEN: "",            // opcional: token de tu bot de Telegram
  TELEGRAM_CHAT: "",             // opcional: tu chat id
  MAX_PIEZAS: 60,                // freno para pedidos falsos
  // Categorías que pasan a "sobre pedido" al llegar a 0 (igual que alAgotarse en la web)
  AL_AGOTARSE: /\bpin(es)?\b|aroma|perfum|bolsillo|lapiz/
};

/* Cómo funciona:
   1. El cliente aparta en la web → llega una fila "pendiente" aquí y un correo. NO se resta stock.
   2. Te manda la captura del anticipo → cambias Estado a "pagado" → se resta del stock.
   3. Si se cae la venta → "cancelado" → las piezas regresan al stock.
   Las piezas sobre pedido (pines y perfumes en 0, o sobrepedido = si) nunca restan stock. */
const ESTADOS = ["pendiente", "pagado", "entregado", "cancelado"];
const COLS = ["Folio", "Fecha", "Nombre", "Zona", "Piezas", "Total", "Anticipo", "Estado", "Stock", "Items"];
const C = Object.fromEntries(COLS.map((c, i) => [c, i + 1]));   // número de columna por nombre
const ZONA = "America/Mexico_City";
const STOCK = { sin: "sin restar", restado: "restado ✓", regresado: "regresado" };

/* ---------- 1. Corre esta función UNA vez (botón ▶ Ejecutar) ---------- */
function instalar() {
  const ss = SpreadsheetApp.getActive();
  let h = ss.getSheetByName(AJUSTES.PESTANA_APARTADOS);
  if (!h) h = ss.insertSheet(AJUSTES.PESTANA_APARTADOS);
  h.getRange(1, 1, 1, COLS.length).setValues([COLS]).setFontWeight("bold");
  h.setFrozenRows(1);
  h.getRange(2, C.Estado, 999, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(ESTADOS, true).build());
  h.getRange(2, C.Piezas, 999, 1).setWrap(true);
  h.setColumnWidth(C.Piezas, 320);
  h.hideColumns(C.Items);
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger("alEditar").forSpreadsheet(ss).onEdit().create();
  Logger.log("Listo. Ahora: Implementar → Nueva implementación → App web.");
}

/* ---------- 2. La web manda aquí cada pedido (no resta stock) ---------- */
function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const pedido = JSON.parse(e.postData.contents);
    const items = agrupar(pedido.items || []);
    const piezas = items.reduce((s, i) => s + i.cant, 0);
    if (!items.length) return json({ ok: false, error: "El carrito está vacío." });
    if (piezas > AJUSTES.MAX_PIEZAS) return json({ ok: false, error: "Para pedidos tan grandes escríbenos por WhatsApp." });
    if (!String(pedido.nombre || "").trim()) return json({ ok: false, error: "Falta tu nombre." });

    // Revisa que haya stock ahorita (la web puede traer datos de hace unos minutos)
    const prod = leerProductos();
    items.forEach(i => { i.pedido = esSobrePedido(prod, i); });
    const faltantes = revisarStock(prod, items);
    if (faltantes.length) return json({ ok: false, faltantes });

    const h = hojaApartados();
    const fila = h.getLastRow() + 1;
    const folio = "A" + String(fila - 1).padStart(4, "0");
    const texto = items.map(i => `${i.cant}x ${i.nombre || i.codigo} (${i.codigo})${i.talla ? " " + i.talla : ""}${i.pedido ? " · SOBRE PEDIDO" : ""}`).join("\n");
    h.getRange(fila, 1, 1, COLS.length).setValues([[
      folio, new Date(), pedido.nombre, pedido.zona || "", texto,
      Number(pedido.total) || 0, Number(pedido.anticipo) || 0, "pendiente", STOCK.sin, JSON.stringify(items)
    ]]);
    h.getRange(fila, C.Fecha).setNumberFormat("dd/mm hh:mm");
    h.getRange(fila, C.Total, 1, 2).setNumberFormat("$#,##0");

    avisar(`🔥 Nuevo pedido ${folio}`,
      `${pedido.nombre} · ${pedido.zona || "sin zona"}\n\n${texto}\n\nTotal: $${pedido.total} · Anticipo: $${pedido.anticipo}\n\n` +
      `Cuando te mande la captura del anticipo, cambia el estado a "pagado" y se resta del stock.\n` +
      SpreadsheetApp.getActive().getUrl());

    return json({ ok: true, folio });
  } catch (err) {
    return json({ ok: false, error: "Error: " + err.message });
  } finally {
    lock.releaseLock();
  }
}

function doGet() { return json({ ok: true, mensaje: "Apartados INSANITY funcionando" }); }

/* ---------- 3. Cuando cambias el Estado a mano ---------- */
function alEditar(e) {
  const r = e.range, h = r.getSheet();
  if (h.getName() !== AJUSTES.PESTANA_APARTADOS || r.getRow() < 2) return;
  if (r.getColumn() > C.Estado || r.getLastColumn() < C.Estado) return;
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    for (let f = r.getRow(); f <= r.getLastRow(); f++) aplicarEstado(h, f);
  } finally { lock.releaseLock(); }
}

/* pagado/entregado → resta del stock · cancelado → lo regresa */
function aplicarEstado(h, f) {
  const estado = norm(h.getRange(f, C.Estado).getValue());
  const restado = String(h.getRange(f, C.Stock).getValue()).trim() === STOCK.restado;
  const items = JSON.parse(h.getRange(f, C.Items).getValue() || "[]").filter(i => !i.pedido);

  if ((estado === "pagado" || estado === "entregado") && !restado) {
    const prod = leerProductos();
    const faltantes = revisarStock(prod, items);
    if (faltantes.length) {
      h.getRange(f, C.Stock).setValue("⚠ falta stock: " + faltantes.map(x => x.codigo + (x.talla ? " " + x.talla : "") + " (hay " + x.disponible + ")").join(", "));
      return;
    }
    items.forEach(i => mover(prod, i, -i.cant));
    escribirProductos(prod);
    h.getRange(f, C.Stock).setValue(STOCK.restado);
  }
  if (estado === "cancelado" && restado) {
    const prod = leerProductos();
    items.forEach(i => mover(prod, i, +i.cant));
    escribirProductos(prod);
    h.getRange(f, C.Stock).setValue(STOCK.regresado);
  }
}

function revisarStock(prod, items) {
  return items.filter(i => !i.pedido).map(i => ({ codigo: i.codigo, talla: i.talla, disponible: Math.max(0, disponible(prod, i)), cant: i.cant }))
    .filter(x => x.disponible < x.cant).map(({ cant, ...x }) => x);
}

/* ---------- productos ---------- */
const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

function leerProductos() {
  const h = SpreadsheetApp.getActive().getSheets().find(s => s.getSheetId() === AJUSTES.GID_PRODUCTOS);
  if (!h) throw new Error("No encuentro la pestaña de productos (revisa GID_PRODUCTOS).");
  const datos = h.getDataRange().getValues();
  const cab = datos[0].map(norm);
  const col = { codigo: cab.indexOf("codigo"), tallas: cab.indexOf("tallas"), stock: cab.indexOf("stock"),
                categoria: cab.indexOf("categoria"), sobrepedido: cab.indexOf("sobrepedido") };
  if (col.codigo < 0 || col.stock < 0) throw new Error("La hoja de productos necesita columnas codigo y stock.");
  return { h, datos, col, cambiadas: new Set() };
}

function filaDe(prod, codigo) {
  return prod.datos.findIndex((f, k) => k > 0 && String(f[prod.col.codigo]).trim().toUpperCase() === codigo);
}

/* "S:1, M:2" → [["S",1],["M",2]]  ·  "S,M,L" → null */
function tallasConStock(txt) {
  const partes = String(txt || "").split(",").map(t => t.trim()).filter(Boolean);
  if (!partes.some(t => t.includes(":"))) return null;
  return partes.map(t => { const [k, v] = t.split(":"); return [k.trim(), Math.max(0, parseInt(v, 10) || 0)]; });
}

/* Sobre pedido: columna sobrepedido = si, o pin/perfume con stock en 0 */
function esSobrePedido(prod, i) {
  const k = filaDe(prod, i.codigo); if (k < 0) return false;
  const fila = prod.datos[k];
  if (prod.col.sobrepedido >= 0 && ["si", "sí", "x", "1", "true"].includes(norm(fila[prod.col.sobrepedido]))) return true;
  const auto = prod.col.categoria >= 0 && AJUSTES.AL_AGOTARSE.test(norm(fila[prod.col.categoria]));
  return auto && disponible(prod, { codigo: i.codigo, talla: "" }) <= 0;
}

function disponible(prod, i) {
  const k = filaDe(prod, i.codigo); if (k < 0) return 0;
  const fila = prod.datos[k];
  const porTalla = prod.col.tallas >= 0 ? tallasConStock(fila[prod.col.tallas]) : null;
  if (porTalla && i.talla) { const t = porTalla.find(([n]) => n.toUpperCase() === i.talla); return t ? t[1] : 0; }
  if (porTalla) return porTalla.reduce((s, [, v]) => s + v, 0);
  return parseInt(fila[prod.col.stock], 10) || 0;
}

/* Suma (+) o resta (−) piezas de un producto */
function mover(prod, i, delta) {
  const k = filaDe(prod, i.codigo); if (k < 0) return;
  const fila = prod.datos[k];
  const porTalla = prod.col.tallas >= 0 ? tallasConStock(fila[prod.col.tallas]) : null;
  if (porTalla && i.talla) {
    const t = porTalla.find(([n]) => n.toUpperCase() === i.talla);
    if (t) t[1] = Math.max(0, t[1] + delta);
    fila[prod.col.tallas] = porTalla.map(([n, v]) => `${n}:${v}`).join(", ");
  } else {
    fila[prod.col.stock] = Math.max(0, (parseInt(fila[prod.col.stock], 10) || 0) + delta);
  }
  prod.cambiadas.add(k);
}

function escribirProductos(prod) {
  prod.cambiadas.forEach(k => {
    if (prod.col.tallas >= 0) prod.h.getRange(k + 1, prod.col.tallas + 1).setValue(prod.datos[k][prod.col.tallas]);
    prod.h.getRange(k + 1, prod.col.stock + 1).setValue(prod.datos[k][prod.col.stock]);
  });
  SpreadsheetApp.flush();
}

/* ---------- utilidades ---------- */
function agrupar(lista) {
  const m = {};
  lista.forEach(i => {
    const codigo = String(i.codigo || "").trim().toUpperCase(), talla = String(i.talla || "").trim().toUpperCase();
    const cant = Math.max(0, parseInt(i.cant, 10) || 0);
    if (!codigo || !cant) return;
    const llave = codigo + "|" + talla;
    m[llave] = m[llave] || { codigo, talla, cant: 0, nombre: String(i.nombre || "").slice(0, 80) };
    m[llave].cant += cant;
  });
  return Object.values(m);
}

function hojaApartados() {
  const h = SpreadsheetApp.getActive().getSheetByName(AJUSTES.PESTANA_APARTADOS);
  if (!h) throw new Error('Falta la pestaña "Apartados". Corre instalar().');
  return h;
}

function avisar(asunto, cuerpo) {
  try { MailApp.sendEmail(AJUSTES.CORREO || Session.getEffectiveUser().getEmail(), asunto, cuerpo); } catch (e) {}
  if (AJUSTES.TELEGRAM_TOKEN && AJUSTES.TELEGRAM_CHAT) {
    try {
      UrlFetchApp.fetch(`https://api.telegram.org/bot${AJUSTES.TELEGRAM_TOKEN}/sendMessage`, {
        method: "post", payload: { chat_id: AJUSTES.TELEGRAM_CHAT, text: asunto + "\n\n" + cuerpo }
      });
    } catch (e) {}
  }
}

function json(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
