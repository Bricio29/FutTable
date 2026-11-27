import React, { useEffect, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';

const colors = [
  ['#166D54', 'Verde'],
  ['#475CB0', 'Azul'],
  ['#AB3F53', 'Vermelho'],
  ['#9058AF', 'Roxo'],
  ['#167DA1', 'Turquesa'],
  ['#C36427', 'Laranja'],
  ['#394757', 'Grafite'],
  ['#69833C', 'Oliva'],
];
const today = () => {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
};

export default function LeagueDialog({ type, match, team, matchCount, model, onClose, onFinish, onAddTeam }) {
  const ref = useRef(null);
  const submitLock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [conflictStatus, setConflictStatus] = useState(null);
  const [home, setHome] = useState('');
  const [away, setAway] = useState('');
  const [color, setColor] = useState(team?.color ?? colors[0][0]);
  const [recordId] = useState(() => globalThis.crypto?.randomUUID?.());
  const { teams } = model.league;
  const clubForm = type === 'club' || type === 'editClub';
  const deleting = type === 'remove' || type === 'removeClub';
  const choices =
    team && !colors.some(([hex]) => hex === team.color.toUpperCase())
      ? [...colors, [team.color, 'Cor atual ' + team.color]]
      : colors;
  const currentTeam = team && teams.find((item) => item.id === team.id);
  const teamChanged =
    team &&
    (!currentTeam ||
      currentTeam.name !== team.name ||
      currentTeam.code !== team.code ||
      currentTeam.color !== team.color);
  const affectsExistingRecord = type === 'edit' || type === 'editClub' || type === 'removeClub';
  const stale =
    affectsExistingRecord &&
    (conflictStatus === 404 || (conflictStatus === 409 && (type !== 'editClub' || teamChanged)));
  const title = {
    club: 'Cadastrar clube',
    editClub: 'Editar clube',
    removeClub: 'Excluir clube?',
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
      if (type === 'editClub') await model.updateTeam(team, { name: fields.name, code: fields.code, color });
      if (type === 'removeClub') await model.removeTeam(team, matchCount);
      if (type === 'match') await model.addMatch({ ...fields, home_id: home, away_id: away, id: recordId });
      if (type === 'edit') await model.updateScore(match, fields.home_score, fields.away_score);
      if (type === 'remove') await model.removeMatch(match.id);
      onFinish(
        {
          club: 'Clube cadastrado.',
          editClub: 'Clube atualizado.',
          removeClub: 'Clube excluído.',
          match: 'Resultado registrado.',
          edit: 'Placar atualizado.',
          remove: 'Partida excluída.',
        }[type],
      );
    } catch (err) {
      setConflictStatus(err.status);
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
          {clubForm && (
            <>
              <label>
                Nome do clube
                <input
                  name="name"
                  defaultValue={team?.name}
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
                  defaultValue={team?.code}
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
                  {choices.map(([c, label]) => (
                    <label key={c} style={{ '--club': c }}>
                      <input
                        type="radio"
                        name="chosenColor"
                        checked={color.toUpperCase() === c.toUpperCase()}
                        onChange={() => setColor(c)}
                        aria-label={label}
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
          {type === 'removeClub' && (
            <p>
              <strong>{team.name}</strong> será excluído da liga.{' '}
              {matchCount === 0
                ? 'O clube tem 0 partidas registradas.'
                : matchCount === 1
                  ? '1 partida desse clube também será excluída.'
                  : 'As ' + matchCount + ' partidas desse clube também serão excluídas.'}{' '}
              A classificação será recalculada.
            </p>
          )}
          {error && (
            <p role="alert" className="error-message">
              {error}
            </p>
          )}
          {stale && (
            <p>
              {team
                ? 'Volte à lista de clubes para conferir os dados atuais.'
                : 'Volte ao histórico para conferir a versão mais recente da partida.'}
            </p>
          )}
          <div className="dialog-actions">
            <button type="button" className="secondary" onClick={onClose} disabled={busy}>
              {stale ? (team ? 'Voltar aos clubes' : 'Voltar ao histórico') : 'Cancelar'}
            </button>
            {!stale && (
              <button type="submit" disabled={busy} className={deleting ? 'danger' : 'primary'}>
                {busy
                  ? 'Salvando…'
                  : {
                      club: 'Salvar clube',
                      editClub: 'Salvar alterações',
                      removeClub: 'Excluir clube',
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
