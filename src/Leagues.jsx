import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Pencil, Plus } from 'lucide-react';
import { recordId } from './league.js';
import './leagues.css';

const dateFormat = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' });

export default function Leagues({ model, activeId, editActive, onOpen }) {
  const { listLeagues, createLeague, renameLeague } = model;
  const [leagues, setLeagues] = useState(null);
  const [revision, setRevision] = useState(0);
  const [listError, setListError] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(false);
  const saving = useRef(false);
  const createAttempt = useRef(null);
  const openedEditor = useRef(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let current = true;
    setListError('');
    listLeagues()
      .then(({ leagues: rows }) => {
        if (!Array.isArray(rows)) throw new Error('O servidor retornou uma lista de ligas incompleta.');
        if (current) setLeagues(rows);
      })
      .catch((err) => {
        if (current) setListError(err.message);
      });
    return () => {
      current = false;
    };
  }, [listLeagues, revision]);

  useEffect(() => {
    if (!editActive) {
      openedEditor.current = null;
      return;
    }
    const active = leagues?.find((league) => league.id === activeId);
    if (active && openedEditor.current !== active.id) {
      openedEditor.current = active.id;
      setEditing(active);
    }
  }, [editActive, activeId, leagues]);

  async function save(event, original) {
    event.preventDefault();
    if (saving.current) return;
    const name = event.currentTarget.elements.league_name.value.trim().replace(/\s+/gu, ' ');
    setMessage('');
    if (!name || [...name].length > 60) {
      setError('Use entre 1 e 60 caracteres no nome da liga.');
      return;
    }
    setError('');
    saving.current = true;
    setBusy(true);
    try {
      if (original) {
        const updated = await renameLeague(original.id, name, original.name);
        if (mounted.current) {
          setLeagues((rows) =>
            rows.map((row) => (row.id === original.id ? { ...row, name: updated.name } : row)),
          );
          setEditing(null);
          setMessage('Nome da liga atualizado.');
        }
      } else {
        if (createAttempt.current?.name !== name) createAttempt.current = { id: recordId(), name };
        const created = await createLeague(createAttempt.current.id, name);
        if (mounted.current) {
          createAttempt.current = null;
          setLeagues((rows) => [...(rows ?? []).filter((row) => row.id !== created.id), created]);
          onOpen(created.id);
        }
      }
    } catch (err) {
      if (mounted.current) {
        setError(err.message);
        if (err.status === 404 || err.status === 409) {
          setEditing(null);
          setLeagues(null);
          setRevision((value) => value + 1);
        }
      }
    } finally {
      saving.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <div className="leagues-page">
      <section className="panel leagues-new" aria-labelledby="new-league-title">
        <h2 id="new-league-title">Nova liga</h2>
        <form className="leagues-form" aria-label="Nova liga" onSubmit={(event) => save(event)}>
          <label>
            Nome da nova liga
            <input name="league_name" placeholder="Ex. Copa de Sexta" required disabled={busy} />
          </label>
          <button type="submit" className="primary" disabled={busy}>
            <Plus size={16} />
            Criar liga
          </button>
        </form>
      </section>
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="leagues-message" role="status">
          {message}
        </p>
      )}
      <section className="panel leagues-list" aria-labelledby="my-leagues-title">
        <h2 id="my-leagues-title">Minhas ligas</h2>
        {listError ? (
          <div className="leagues-notice">
            <p className="error-message" role="alert">
              {listError}
            </p>
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={() => setRevision((value) => value + 1)}
            >
              Tentar novamente
            </button>
          </div>
        ) : leagues === null ? (
          <p className="leagues-notice" role="status">
            Carregando ligas…
          </p>
        ) : leagues.length === 0 ? (
          <p className="leagues-notice">Você ainda não criou uma liga.</p>
        ) : (
          <ul>
            {leagues.map((league) => {
              const date = Date.parse(league.created_at);
              const isActive = league.id === activeId;
              return (
                <li key={league.id}>
                  <div className="league-details">
                    <div className="league-row-title">
                      <h3>{league.name}</h3>
                      {isActive && (
                        <span className="league-current">
                          <Check size={13} />
                          Liga atual
                        </span>
                      )}
                    </div>
                    {Number.isFinite(date) && (
                      <small>
                        Criada em <time dateTime={league.created_at}>{dateFormat.format(date)}</time>
                      </small>
                    )}
                  </div>
                  {editing?.id === league.id ? (
                    <form className="leagues-form league-rename" onSubmit={(event) => save(event, editing)}>
                      <label>
                        Novo nome da liga
                        <input
                          name="league_name"
                          defaultValue={editing.name}
                          autoFocus
                          required
                          disabled={busy}
                        />
                      </label>
                      <button type="submit" className="primary" disabled={busy}>
                        Salvar nome
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        disabled={busy}
                        onClick={() => setEditing(null)}
                      >
                        Cancelar
                      </button>
                    </form>
                  ) : (
                    <div className="league-actions">
                      <button
                        type="button"
                        className="text-button"
                        disabled={busy}
                        aria-label={'Renomear ' + league.name}
                        onClick={() => {
                          setError('');
                          setMessage('');
                          setEditing(league);
                        }}
                      >
                        <Pencil size={15} /> Renomear
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        disabled={busy}
                        aria-label={'Abrir ' + league.name}
                        onClick={() => onOpen(league.id)}
                      >
                        Abrir <ArrowRight size={15} />
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
