import React, { useState } from 'react';
import { HiPlus, HiEnvelope, HiChatBubbleLeftRight, HiTrash, HiExclamationTriangle } from 'react-icons/hi2';
import { Header } from '../../Components/Header';
import { Modal } from '../../Components/Modal';
import { Spinner } from '../../Components/Spinner';
import { ConfirmModal } from '../../Components/ConfirmModal';
import MyButton from '../../Components/MyButton';
import { useFetch } from '../../hooks/useFetch';
import { useToast } from '../../context/ToastContext';
import { mensajeDeError } from '../../lib/apiError';
import {
  listarComunicados, crearComunicado, eliminarComunicado,
  contarDestinatarios, estadoCanales, fechaLarga, resumenEnvio,
} from '../../api/comunicados';
import '../main.css';
import '../../styles/layout.css';
import '../../styles/table.css';
import '../../styles/comunicados.css';

const FORM_VACIO = { titulo: '', cuerpo: '', email: true, whatsapp: false };

function Comunicados() {
  const toast = useToast();

  const { datos, cargando, error, recargar } = useFetch(() => listarComunicados({ limit: 100 }), []);
  const { datos: destinatarios } = useFetch(contarDestinatarios, []);
  const { datos: canales } = useFetch(estadoCanales, []);

  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(FORM_VACIO);
  const [enviando, setEnviando] = useState(false);
  const [errorForm, setErrorForm] = useState('');
  const [porEliminar, setPorEliminar] = useState(null);

  const handleEnviar = async (e) => {
    e.preventDefault();
    if (!form.email && !form.whatsapp) {
      setErrorForm('Selecciona al menos un canal de envío');
      return;
    }
    setEnviando(true);
    setErrorForm('');
    try {
      const r = await crearComunicado({
        titulo: form.titulo,
        cuerpo: form.cuerpo,
        canales: { email: form.email, whatsapp: form.whatsapp },
      });

      // El envío puede tener éxito parcial: el comunicado se guarda igual y el
      // resultado dice qué llegó y qué no.
      const fallidos = Object.values(r.resultado).reduce((n, c) => n + (c.fallidos ?? 0), 0);
      const enviados = Object.values(r.resultado).reduce((n, c) => n + (c.enviados ?? 0), 0);

      if (fallidos > 0 && enviados === 0) {
        toast.error(`El comunicado se guardó pero no se pudo enviar (${fallidos} fallidos)`);
      } else if (fallidos > 0) {
        toast.info(`Enviado a ${enviados}, con ${fallidos} fallidos`);
      } else {
        toast.exito(`Comunicado enviado a ${enviados} destinatario(s)`);
      }

      setModal(false);
      setForm(FORM_VACIO);
      recargar();
    } catch (err) {
      setErrorForm(mensajeDeError(err));
    } finally {
      setEnviando(false);
    }
  };

  const handleEliminar = async () => {
    try {
      await eliminarComunicado(porEliminar.id);
      toast.exito('Comunicado eliminado');
      setPorEliminar(null);
      recargar();
    } catch (err) {
      toast.error(mensajeDeError(err));
      setPorEliminar(null);
    }
  };

  return (
    <div className="dashboard-page">
      <Header />

      <div className="page-head">
        <h1 className="section-title">Comunicados</h1>
        {datos && <span className="page-contador">{datos.total} enviados</span>}
      </div>

      <div className="page-actions">
        <button className="access-btn-dark" onClick={() => setModal(true)}>
          <HiPlus size={16} /> Nuevo
        </button>
        {destinatarios && (
          <span className="campo-ayuda">
            {destinatarios.total} propietarios · {destinatarios.con_email} con correo ·{' '}
            {destinatarios.con_whatsapp} con WhatsApp
          </span>
        )}
      </div>

      {/* Se avisa antes de escribir, no después de intentar enviar. */}
      {canales && (!canales.email || !canales.whatsapp) && (
        <div className="aviso-config">
          <HiExclamationTriangle size={18} />
          <div>
            {!canales.email && <p>El correo no está configurado (faltan <code>SMTP_HOST</code> y <code>SMTP_USER</code>).</p>}
            {!canales.whatsapp && <p>WhatsApp no está configurado (faltan <code>META_PHONE_NUMBER_ID</code> y <code>META_ACCESS_TOKEN</code>).</p>}
            {canales.whatsapp && !canales.whatsapp_plantilla && (
              <p>
                <strong>Atención:</strong> sin <code>META_TEMPLATE_NAME</code>, WhatsApp solo entrega a
                quien haya escrito al número en las últimas 24 h. Un envío masivo responderá
                correctamente pero no llegará.
              </p>
            )}
          </div>
        </div>
      )}

      <div className="page-body">
        {cargando && <Spinner />}
        {error && <p className="table-error">{error}</p>}
        {datos && datos.items.length === 0 && (
          <p className="access-empty">Aún no se ha enviado ningún comunicado</p>
        )}

        <ul className="comunicado-lista">
          {(datos?.items ?? []).map(c => {
            const resumen = resumenEnvio(c.resultado_envio);
            return (
              <li key={c.id} className="comunicado-item">
                <div className="comunicado-cabecera">
                  <h2 className="comunicado-titulo">{c.titulo}</h2>
                  <button
                    className="icon-btn icon-btn--peligro"
                    onClick={() => setPorEliminar(c)}
                    aria-label={`Eliminar ${c.titulo}`}
                  >
                    <HiTrash size={15} />
                  </button>
                </div>

                <p className="comunicado-cuerpo">{c.cuerpo}</p>

                <div className="comunicado-meta">
                  <span>{fechaLarga(c.enviado_at)}</span>
                  <span>por {c.autor_nombre}</span>
                </div>

                {resumen && (
                  <div className="comunicado-resultado">
                    {resumen.map(r => (
                      <span
                        key={r.canal}
                        className={`badge ${r.fallidos > 0 ? 'badge--rojo' : 'badge--verde'}`}
                        title={r.errores.map(e => `${e.to}: ${e.error}`).join('\n')}
                      >
                        {r.canal === 'email' ? 'Correo' : 'WhatsApp'}: {r.enviados}/{r.intentados}
                      </span>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <Modal isOpen={modal} onClose={() => setModal(false)} title="Nuevo comunicado">
        <form className="new-access-form" onSubmit={handleEnviar}>
          {errorForm && <p className="form-error">{errorForm}</p>}

          <label className="new-access-field">
            Título
            <input className="new-access-input" value={form.titulo}
              onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))}
              placeholder="Corte de agua programado" required />
          </label>

          <label className="new-access-field">
            Mensaje
            <textarea className="new-access-input ticket-textarea" rows={5} value={form.cuerpo}
              onChange={e => setForm(f => ({ ...f, cuerpo: e.target.value }))}
              placeholder="El martes de 9 a 14 h habrá corte por mantenimiento de la red." required />
          </label>

          <fieldset className="canales-grupo">
            <legend>Canales de envío</legend>

            <label className="canal-opcion">
              <input type="checkbox" checked={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.checked }))} />
              <HiEnvelope size={18} />
              Correo electrónico
              <span className="canal-conteo">{destinatarios?.con_email ?? 0}</span>
            </label>

            <label className="canal-opcion">
              <input type="checkbox" checked={form.whatsapp}
                onChange={e => setForm(f => ({ ...f, whatsapp: e.target.checked }))} />
              <HiChatBubbleLeftRight size={18} />
              WhatsApp
              <span className="canal-conteo">{destinatarios?.con_whatsapp ?? 0}</span>
            </label>
          </fieldset>

          <MyButton type="submit" disabled={enviando}>
            {enviando ? 'Enviando…' : `Enviar a ${destinatarios?.total ?? 0} propietarios`}
          </MyButton>
        </form>
      </Modal>

      <ConfirmModal
        isOpen={!!porEliminar}
        onClose={() => setPorEliminar(null)}
        onConfirm={handleEliminar}
        title="Eliminar comunicado"
        mensaje="Se borra del historial y del tablón de avisos de los residentes. Los mensajes ya enviados no se pueden retirar."
        textoConfirmar="Eliminar"
        peligro
      />
    </div>
  );
}

export default Comunicados;
