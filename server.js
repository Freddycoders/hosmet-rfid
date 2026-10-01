const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// Base de datos en memoria para la maqueta
let activos = [
  { id: 'ACT-001', tipo: 'Bomba Volumétrica BBraun', serie: 'BB-88341', epc: 'E28011700000020241000377', ubicacion: 'UCI 2C', custodio: 'María Paz Herreros', categoria: 'MOVIBLE_CRITICO', valorUtm: 45.2, estadoConservacion: 'BUENO', estadoOperativo: 'EN_SERVICIO', fechaAlta: '2023-03-15', ultimoLatido: Date.now() },
  { id: 'ACT-002', tipo: 'Bomba de Jeringa Terumo', serie: 'TE-44102', epc: 'E28011700000020241000378', ubicacion: 'UTI 3N', custodio: 'Nelly Gálvez', categoria: 'MOVIBLE_CRITICO', valorUtm: 38.0, estadoConservacion: 'BUENO', estadoOperativo: 'EN_SERVICIO', fechaAlta: '2023-03-15', ultimoLatido: Date.now() },
  { id: 'ACT-003', tipo: 'Monitor Multiparámetro', serie: 'MP-99012', epc: 'E28011700000020241000379', ubicacion: 'UCM 5N', custodio: 'Verónica Fuenzalida', categoria: 'MOVIBLE_CRITICO', valorUtm: 52.1, estadoConservacion: 'REGULAR', estadoOperativo: 'EN_SERVICIO', fechaAlta: '2022-11-20', ultimoLatido: Date.now() },
  { id: 'ACT-004', tipo: 'Autoclave de Esterilización', serie: 'AC-11002', epc: 'E28011700000020241000380', ubicacion: 'Pabellón Central', custodio: 'EEMM', categoria: 'INMUEBLE_OPERACIONAL', valorUtm: 120.0, estadoConservacion: 'BUENO', estadoOperativo: 'EN_SERVICIO', fechaAlta: '2021-08-10', ultimoLatido: Date.now() },
  { id: 'ACT-005', tipo: 'Bomba de Infusión Terumo (Dañada)', serie: 'TE-10022', epc: 'E28011700000020241000381', ubicacion: 'Bodega Baja EEMM', custodio: 'Jefe EEMM', categoria: 'MOVIBLE_CRITICO', valorUtm: 38.0, estadoConservacion: 'MALO', estadoOperativo: 'DADO_DE_BAJA', fechaAlta: '2020-05-12', ultimoLatido: Date.now() }
];

let traslados = [
  { ordenId: 'OT-2026-001', epc: 'E28011700000020241000378', activoId: 'ACT-002', origen: 'UTI 3N', destino: 'Taller EEMM', motivo: 'Calibración técnica', solicitante: 'Nelly Gálvez', receptor: 'Técnico EEMM', fecha: '2026-10-01', estado: 'EN_TRANSITO' }
];

let eventosLectura = [];

// Rutas de datos
app.get('/api/v1/activos', (req, res) => res.json(activos));
app.get('/api/v1/traslados', (req, res) => res.json(traslados));
app.get('/api/v1/eventos', (req, res) => res.json(eventosLectura.slice(0, 10)));

// Plancheta mural
app.get('/api/v1/reportes/plancheta-mural', (req, res) => {
  const { ubicacion } = req.query;
  const bienesDependencia = activos.filter(a => a.ubicacion === ubicacion && a.estadoOperativo !== 'DADO_DE_BAJA');
  res.json({
    establecimiento: 'HOSPITAL METROPOLITANO DE SANTIAGO',
    dependencia: ubicacion || 'TODAS',
    fechaEmision: new Date().toLocaleDateString('es-CL'),
    responsableDependencia: bienesDependencia[0]?.custodio || 'Sin Asignar',
    totalBienes: bienesDependencia.length,
    bienes: bienesDependencia
  });
});

// Conciliación Handheld
app.post('/api/v1/inventario/conciliacion-toma-fisica', (req, res) => {
  const { ubicacion, tagsLeidos } = req.body;
  const bienesEsperados = activos.filter(a => a.ubicacion === ubicacion && a.estadoOperativo !== 'DADO_DE_BAJA');
  const presentes = bienesEsperados.filter(b => tagsLeidos.includes(b.epc));
  const faltantes = bienesEsperados.filter(b => !tagsLeidos.includes(b.epc));
  const sobrantes = activos.filter(a => tagsLeidos.includes(a.epc) && a.ubicacion !== ubicacion);
  res.json({
    ubicacionAuditada: ubicacion,
    fechaToma: new Date().toLocaleString('es-CL'),
    resumen: { presentesCount: presentes.length, faltantesCount: faltantes.length, sobrantesCount: sobrantes.length },
    detalle: { presentes, faltantes, sobrantes }
  });
});

// Altas
app.post('/api/v1/activos/alta', (req, res) => {
  const nuevoId = `ACT-${String(activos.length + 1).padStart(3, '0')}`;
  const nuevoActivo = { id: nuevoId, ...req.body, estadoOperativo: 'EN_SERVICIO', fechaAlta: new Date().toISOString().split('T')[0], ultimoLatido: Date.now() };
  activos.push(nuevoActivo);
  res.status(201).json({ activo: nuevoActivo });
});

// Traslados
app.post('/api/v1/activos/traslado', (req, res) => {
  const activo = activos.find(a => a.id === req.body.activoId);
  if (!activo) return res.status(404).json({ error: 'No encontrado' });
  activo.estadoOperativo = 'EN_TRANSITO';
  const nuevoTraslado = { ordenId: `OT-2026-${String(traslados.length + 1).padStart(3, '0')}`, epc: activo.epc, ...req.body, fecha: new Date().toISOString().split('T')[0], estado: 'EN_TRANSITO' };
  traslados.push(nuevoTraslado);
  res.json({ traslado: nuevoTraslado });
});

// Telemetría de Portales RFID
app.post('/api/v1/telemetria/rfid-event', (req, res) => {
  const { device_id, tag_data } = req.body;
  const epc = tag_data.epc;
  const activo = activos.find(a => a.epc === epc);
  const hora = new Date().toLocaleTimeString();

  if (!activo) {
    eventosLectura.unshift({ hora, portal: device_id, detalle: `Tag no catalogado: ${epc}`, nivel: 'CRITICO' });
    return res.status(404).json({ status: 'DESCONOCIDO' });
  }

  activo.ultimoLatido = Date.now();

  if (tag_data.tamper_status?.tamper_alarm) {
    activo.estadoOperativo = 'VULNERADO';
    eventosLectura.unshift({ hora, portal: device_id, detalle: `¡ALERTA TAMPER! Adhesivo despegado en ${activo.tipo}`, nivel: 'CRITICO' });
    return res.json({ status: 'TAMPER_ALARM' });
  }

  const enTransito = traslados.find(t => t.epc === epc && t.estado === 'EN_TRANSITO');
  if (enTransito) {
    eventosLectura.unshift({ hora, portal: device_id, detalle: `Paso Autorizado: ${activo.tipo} en tránsito a ${enTransito.destino}`, nivel: 'OK' });
    return res.json({ status: 'AUTORIZADO' });
  } else {
    activo.estadoOperativo = 'SALIDA_NO_AUTORIZADA';
    eventosLectura.unshift({ hora, portal: device_id, detalle: `¡SALIDA NO AUTORIZADA! ${activo.tipo} (${activo.serie})`, nivel: 'CRITICO' });
    return res.json({ status: 'NO_AUTORIZADO', alarma: true });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`HOSMET RFID corriendo en puerto ${PORT}`));