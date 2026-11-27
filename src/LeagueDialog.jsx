import React, { useEffect, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';

const colors = ['#166D54', '#475CB0', '#AB3F53', '#9058AF', '#167DA1', '#C36427', '#394757', '#69833C'];
const today = () => {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
};

export default function LeagueDialog({ type, match, model, onClose, onFinish, onAddTeam }) {
  const ref = useRef(null);
  const submitLock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [stale, setStale] = useState(false);
  const [home, setHome] = useState('');
  const [away, setAway] = useState('');
  const [color, setColor] = useState(colors[0]);
  const [recordId] = useState(() => globalThis.crypto?.randomUUID?.());
  const { teams } = model.league;
  const title = {
    club: 'Cadastrar clube',
    match: 'Registrar partida',
    edit: 'Corrigir placar',
    remove: 'Excluir partida?',
  }[type];
  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  async function submit(e) {
    e.preventDefault();
    if (submitLock.current || stale) return;
    const fields = Object.fromEntries(new FormData(e.currentTarget));
    submitLock.current = true;
    setBusy(true);
    setError('');
    try {
      if (type === 'club') await model.addTeam({ ...fields, color, id: recordId });
      if (type === 'match') await model.addMatch({ ...fields, home_id: home, away_id: away, id: recordId });
      if (type === 'edit') await model.updateScore(match, fields.home_score, fields.away_score);
      if (type === 'remove') await model.removeMatch(match.id);
      onFinish(
        {
          club: 'Clube cadastrado.',
          match: 'Resultado registrado.',
          edit: 'Placar atualizado.',
          remove: 'Partida excluída.',
        }[type],
      );
    } catch (err) {
      setStale(type === 'edit' && (err.status === 409 || err.status === 404));
      setError(err.message || 'Falha ao salvar. Tente novamente.');
    } finally {
      submitLock.current = false;
      setBusy(false);
    }
  }
  return (
    <dialog
      className="editor-dialog"
      ref={ref}
      aria-labelledby="edit-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="dialog-heading">
        <h2 id="edit-title">{title}</h2>
        <button type="button" className="icon-button" aria-label="Fechar" disabled={busy} onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      {type === 'match' && teams.length < 2 ? (
        <div className="dialog-form">
          <p>
            Uma partida precisa de dois clubes. Sua liga tem {teams.length}{' '}
            {teams.length === 1 ? 'clube cadastrado' : 'clubes cadastrados'}.
          </p>
          <button className="primary" onClick={onAddTeam}>
            <Plus size={16} />
            Cadastrar clube
          </button>
        </div>
      ) : (
        <form className="dialog-form" onSubmit={submit}>
          {type === 'club' && (
            <>
              <label>
                Nome do clube
                <input
                  name="name"
                  placeholder="Ex. União do Vale"
                  minLength={2}
                  maxLength={60}
                  required
                  autoFocus
                />
              </label>
              <label>
                Sigla
                <input
                  name="code"
                  placeholder="UDV"
                  pattern="[A-Za-z0-9]{2,4}"
                  minLength={2}
                  maxLength={4}
                  required
                  style={{ textTransform: 'uppercase' }}
                />
              </label>
              <fieldset>
                <legend>Cor do escudo</legend>
                <div className="color-choices">
                  {colors.map((c, i) => (
                    <label key={c} style={{ '--club': c }}>
                      <input
                        type="radio"
                        name="chosenColor"
                        checked={color === c}
                        onChange={() => setColor(c)}
                        aria-label={
                          ['Verde', 'Azul', 'Vermelho', 'Roxo', 'Turquesa', 'Laranja', 'Grafite', 'Oliva'][i]
                        }
                      />
                      <span />
                    </label>
                  ))}
                </div>
              </fieldset>
            </>
          )}
          {type === 'match' && (
            <>
              {[
                [home, setHome, away, 'Mandante', 'home_score'],
                [away, setAway, home, 'Visitante', 'away_score'],
              ].map(([v, set, other, label, key]) => (
                <div className="score-input" key={key}>
                  <label>
                    {label}
                    <select value={v} onChange={(e) => set(e.target.value)} required>
                      <option value="">Selecione o clube</option>
                      {teams
                        .filter((t) => t.id !== other)
                        .map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    Gols
                    <input
                      aria-label={'Gols do ' + label.toLowerCase()}
                      type="number"
                      name={key}
                      placeholder="0"
                      min="0"
                      max="99"
                      step="1"
                      required
                    />
                  </label>
                </div>
              ))}
              <label>
                Data da partida
                <input type="date" name="played_on" defaultValue={today()} required />
              </label>
            </>
          )}
          {type === 'edit' && (
            <div className="edit-scores">
              {[
                ['Mandante', 'home_id', 'home_score'],
                ['Visitante', 'away_id', 'away_score'],
              ].map(([label, id, score]) => (
                <label key={score}>
                  <span>
                    {label}
                    <strong>{teams.find((team) => team.id === match[id])?.name}</strong>
                  </span>
                  <input
                    type="number"
                    aria-label={'Gols do ' + label.toLowerCase()}
                    name={score}
                    defaultValue={match[score]}
                    step="1"
                    min="0"
                    max="99"
                    required
                  />
                </label>
              ))}
            </div>
          )}
          {type === 'remove' && (
            <p>
              Excluir o resultado de{' '}
              <strong>
                {teams.find((t) => t.id === match.home_id)?.name} {match.home_score} × {match.away_score}{' '}
                {teams.find((t) => t.id === match.away_id)?.name}
              </strong>
              ? A classificação será recalculada.
            </p>
          )}
          {error && (
            <p role="alert" className="error-message">
              {error}
            </p>
          )}
          {stale && <p>Volte ao histórico para conferir a versão mais recente da partida.</p>}
          <div className="dialog-actions">
            <button type="button" className="secondary" onClick={onClose} disabled={busy}>
              {stale ? 'Voltar ao histórico' : 'Cancelar'}
            </button>
            {!stale && (
              <button type="submit" disabled={busy} className={type === 'remove' ? 'danger' : 'primary'}>
                {busy
                  ? 'Salvando…'
                  : {
                      club: 'Salvar clube',
                      match: 'Salvar resultado',
                      edit: 'Salvar placar',
                      remove: 'Excluir partida',
                    }[type]}
              </button>
            )}
          </div>
        </form>
      )}
    </dialog>
  );
}
