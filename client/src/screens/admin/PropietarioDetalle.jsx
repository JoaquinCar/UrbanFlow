import React, { useState, useCallback, useRef } from 'react';
import { HiArrowDownTray, HiTrash, HiArrowPath, HiPaperClip } from 'react-icons/hi2';
import { Spinner } from '../../Components/Spinner';
import { Tabs } from '../../Components/Tabs';
import { useFetch } from '../../hooks/useFetch';
import { useToast } from '../../context/ToastContext';
import { mensajeDeError } from '../../lib/apiError';
import {
  obtenerPropietario, obtenerQr, rotarQr,
  listarDocumentos, subirDocumento, descargarDocumento, eliminarDocumento,
  TIPOS_DOCUMENTO, formatearTamano,
} from '../../api/propietarios';
import '../main.css';
import '../../styles/table.css';

function Fila({ etiqueta, children }) {
  return (
    <div className="mapa-detalle-fila">
      <span className="mapa-detalle-etiqueta">{etiqueta}</span>
      <span className="mapa-detalle-valor">{children || '—'}</span>
    </div>
  );
}

function Datos({ propietarioId }) {
  const cargar = useCallback(() => obtenerPropietario(propietarioId), [propietarioId]);
  const { datos, cargando, error } = useFetch(cargar, [propietarioId]);

  if (cargando) return <Spinner />;
  if (error) return <p className="table-error">{error}</p>;
  if (!datos) return null;

  return (
    <div>
      <Fila etiqueta="Nombre">{datos.nombre_completo}</Fila>
      <Fila etiqueta="Correo">{datos.email}</Fila>
      <Fila etiqueta="Teléfono">{datos.telefono}</Fila>
      <Fila etiqueta="WhatsApp">{datos.whatsapp}</Fila>
      <Fila etiqueta="CURP">{datos.curp}</Fila>
      <Fila etiqueta="Escritura">{datos.num_escritura}</Fila>
      <Fila etiqueta="Lotes">
        {datos.lotes?.length ? datos.lotes.map(l => l.numero).join(', ') : null}
      </Fila>
    </div>
  );
}

function CodigoQr({ propietarioId }) {
  const toast = useToast();
  const cargar = useCallback(() => obtenerQr(propietarioId), [propietarioId]);
  const { datos, cargando, error, setDatos } = useFetch(cargar, [propietarioId]);
  const [rotando, setRotando] = useState(false);

  const handleRotar = async () => {
    setRotando(true);
    try {
      const nuevo = await rotarQr(propietarioId);
      setDatos(prev => ({ ...prev, ...nuevo }));
      toast.exito('Código QR regenerado. El anterior dejó de funcionar.');
    } catch (err) {
      toast.error(mensajeDeError(err));
    } finally {
      setRotando(false);
    }
  };

  if (cargando) return <Spinner />;
  if (error) return <p className="table-error">{error}</p>;

  return (
    <div className="qr-modal-content">
      <img src={datos.data_url} alt="Código QR del residente" className="qr-imagen" />
      <p className="qr-desc">
        Este código no caduca. Si se pierde o se comparte por error, regenéralo:
        el anterior deja de servir en la caseta al instante.
      </p>
      <div className="qr-actions">
        <a className="qr-btn qr-btn-dark" href={datos.data_url} download={`qr-${propietarioId}.png`}>
          <HiArrowDownTray size={16} /> Descargar
        </a>
        <button className="qr-btn qr-btn-cyan" onClick={handleRotar} disabled={rotando}>
          <HiArrowPath size={16} /> {rotando ? 'Regenerando…' : 'Regenerar'}
        </button>
      </div>
    </div>
  );
}

function Documentos({ propietarioId }) {
  const toast = useToast();
  const inputRef = useRef(null);
  const cargar = useCallback(() => listarDocumentos(propietarioId), [propietarioId]);
  const { datos, cargando, error, recargar } = useFetch(cargar, [propietarioId]);

  const [tipo, setTipo] = useState('ine');
  const [subiendo, setSubiendo] = useState(false);

  const handleArchivo = async (e) => {
    const archivo = e.target.files?.[0];
    if (!archivo) return;

    setSubiendo(true);
    try {
      await subirDocumento(propietarioId, tipo, archivo);
      toast.exito(`${archivo.name} subido`);
      recargar();
    } catch (err) {
      toast.error(mensajeDeError(err));
    } finally {
      setSubiendo(false);
      // Se limpia para poder volver a elegir el mismo archivo si hizo falta.
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleDescargar = async (doc) => {
    try {
      await descargarDocumento(doc.id, doc.nombre_archivo);
    } catch (err) {
      toast.error(mensajeDeError(err));
    }
  };

  const handleEliminar = async (doc) => {
    try {
      await eliminarDocumento(doc.id);
      toast.exito('Documento eliminado');
      recargar();
    } catch (err) {
      toast.error(mensajeDeError(err));
    }
  };

  return (
    <div>
      <div className="doc-subir">
        <select className="page-select" value={tipo} onChange={e => setTipo(e.target.value)}>
          {TIPOS_DOCUMENTO.map(t => <option key={t.valor} value={t.valor}>{t.etiqueta}</option>)}
        </select>
        <label className="access-btn-dark doc-subir-btn">
          <HiPaperClip size={16} /> {subiendo ? 'Subiendo…' : 'Adjuntar'}
          <input
            ref={inputRef}
            type="file"
            hidden
            accept="application/pdf,image/jpeg,image/png,image/webp"
            onChange={handleArchivo}
            disabled={subiendo}
          />
        </label>
      </div>
      <p className="campo-ayuda">PDF, JPG, PNG o WEBP. Máximo 5 MB.</p>

      {cargando && <Spinner />}
      {error && <p className="table-error">{error}</p>}

      {datos && datos.length === 0 && <p className="access-empty">Sin documentos adjuntos</p>}

      {datos && datos.length > 0 && (
        <ul className="doc-lista">
          {datos.map(doc => (
            <li key={doc.id} className="doc-item">
              <div className="doc-info">
                <span className="doc-nombre">{doc.nombre_archivo}</span>
                <span className="doc-meta">
                  {TIPOS_DOCUMENTO.find(t => t.valor === doc.tipo)?.etiqueta ?? doc.tipo}
                  {' · '}{formatearTamano(doc.tamano_bytes)}
                </span>
              </div>
              <span className="tabla-acciones">
                <button className="icon-btn" onClick={() => handleDescargar(doc)} aria-label={`Descargar ${doc.nombre_archivo}`}>
                  <HiArrowDownTray size={16} />
                </button>
                <button className="icon-btn icon-btn--peligro" onClick={() => handleEliminar(doc)} aria-label={`Eliminar ${doc.nombre_archivo}`}>
                  <HiTrash size={16} />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function PropietarioDetalle({ propietarioId }) {
  return (
    <Tabs tabs={['Datos', 'Código QR', 'Documentos']}>
      <Datos propietarioId={propietarioId} />
      <CodigoQr propietarioId={propietarioId} />
      <Documentos propietarioId={propietarioId} />
    </Tabs>
  );
}
