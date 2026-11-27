import React, { useEffect, useRef, useState } from 'react';
import { Check, Clock3, Dices, Gamepad2, Plus, X } from 'lucide-react';
import { Crest } from './LeagueViews.jsx';
import { isPlayed, matchTeam, today } from './league.js';
import './draws.css';

function DrawScore({ match, teamsById, onClose, finishMatch }) {
  const ref = useRef(null);
  const submitting = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  async function save(event) {
    event.preventDefault();
    if (submitting.current) return;
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    submitting.current = true;
    setBusy(true);
    setError('');
    try {
      await finishMatch(match, fields);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      submitting.current = false;
    }
  }
  return (
    <dialog
      ref={ref}
      className="editor-dialog"
      aria-labelledby="draw-score-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="dialog-heading">
        <h2 id="draw-score-title">Lançar placar</h2>
        <button type="button" aria-label="Fechar" className="icon-button" disabled={busy} onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      <form onSubmit={save} className="dialog-form">
        {['home', 'away'].map((side) => {
          const team = matchTeam(match, side, teamsById);
          return (
            <label className="draw-score-input" key={side}>
              <span>
                <Crest team={team} />
                <span>
                  <strong>{team.player_name}</strong>
                  <small>{team.name}</small>
                </span>
              </span>
              <input
                type="number"
                name={side + '_score'}
                min="0"
                max="99"
                step="1"
                required
                placeholder="0"
                aria-label={'Gols de ' + team.player_name}
              />
            </label>
          );
        })}
        <label>
          Data da partida
          <input type="date" name="played_on" defaultValue={today()} required />
        </label>
        {error && (
          <p role="alert" className="error-message">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" className="secondary" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button type="submit" className="primary" disabled={busy}>
            {busy ? 'Salvando…' : 'Salvar resultado'}
          </button>
        </div>
      </form>
    </dialog>
  );
}

export default function Draws({ model, openClubs, initialTeams }) {
  const { league, drawRound, finishMatch } = model;
  const [selected, setSelected] = useState(null);
  const [absent, setAbsent] = useState(() =>
    initialTeams ? league.teams.filter((team) => !initialTeams.includes(team.id)).map((team) => team.id) : [],
  );
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submitting = useRef(false);
  const teamsById = new Map(league.teams.map((team) => [team.id, team]));
  const players = league.teams.filter((team) => team.player_name);
  const participants = players.filter((team) => !absent.includes(team.id));
  const draws = [...league.draws].sort((a, b) => b.number - a.number);
  const draw = draws.find((item) => item.id === selected) ?? draws[0];
  const games = draw
    ? league.matches.filter((match) => match.draw_id === draw.id).sort((a, b) => a.id.localeCompare(b.id))
    : [];
  const bye = draw?.bye_player_name && {
    id: draw.bye_team_id ?? draw.id,
    name: draw.bye_team_name,
    player_name: draw.bye_player_name,
    catalog_id: draw.bye_catalog_id,
    color: teamsById.get(draw.bye_team_id)?.color ?? '#166d54',
  };
  const editMatch = league.matches.find((match) => match.id === editing && !isPlayed(match));
  async function create() {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError('');
    try {
      const created = await drawRound(participants.map((team) => team.id));
      setSelected(created.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      submitting.current = false;
    }
  }

  return (
    <section className="panel draw-panel" aria-labelledby="draw-title">
      <div className="draw-head">
        <div>
          <div className="draw-kicker">
            <Gamepad2 size={15} /> FIFA 27
          </div>
          <h2 id="draw-title">Sorteio de partidas</h2>
        </div>
        <button type="button" className="primary" disabled={busy || participants.length < 2} onClick={create}>
          <Dices size={17} />
          {busy ? 'Sorteando…' : 'Sortear rodada'}
        </button>
      </div>
      <div className="draw-roster">
        <span>
          <strong>{participants.length}</strong>{' '}
          {participants.length === 1 ? 'jogador selecionado' : 'jogadores selecionados'}
        </span>
        <p>
          {players.length < 2
            ? 'Associe pelo menos dois jogadores aos seus clubes para sortear.'
            : participants.length < 2
              ? 'Selecione pelo menos dois jogadores para sortear.'
              : 'Cada jogador participa com o clube escolhido.'}
        </p>
        <button type="button" className="text-button" onClick={openClubs}>
          Gerenciar jogadores
        </button>
      </div>
      {players.length > 0 && (
        <details className="draw-selection" open={Boolean(initialTeams) || draws.length === 0}>
          <summary>Selecionar quem vai jogar</summary>
          <fieldset disabled={busy}>
            <legend>Participantes da próxima rodada</legend>
            {players.map((team) => (
              <label key={team.id}>
                <input
                  type="checkbox"
                  checked={!absent.includes(team.id)}
                  onChange={() =>
                    setAbsent((previous) =>
                      previous.includes(team.id)
                        ? previous.filter((id) => id !== team.id)
                        : [...previous, team.id],
                    )
                  }
                />
                <Crest team={team} />
                <span>
                  <strong>{team.player_name}</strong>
                  <small>{team.name}</small>
                </span>
              </label>
            ))}
          </fieldset>
        </details>
      )}
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      {draw && (
        <div className="draw-round">
          <div className="draw-round-heading">
            <h3>Rodada {draw.number}</h3>
            {draws.length > 1 && (
              <label>
                Exibir rodada{' '}
                <select value={draw.id} onChange={(event) => setSelected(event.target.value)}>
                  {draws.map((item) => (
                    <option key={item.id} value={item.id}>
                      Rodada {item.number}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          {games.length === 0 && <p className="draw-hint">Os confrontos desta rodada foram excluídos.</p>}
          <div className="draw-games">
            {games.map((match) => {
              const done = isPlayed(match);
              return (
                <article key={match.id} className="draw-game">
                  <div className={'draw-status ' + (done ? 'done' : '')}>
                    {done ? <Check size={13} /> : <Clock3 size={13} />} {done ? 'Encerrada' : 'A jogar'}
                  </div>
                  {['home', 'away'].map((side) => {
                    const team = matchTeam(match, side, teamsById);
                    if (!team) return null;
                    return (
                      <div className="draw-player" key={side}>
                        <Crest team={team} />
                        <span>
                          <strong>{team.player_name}</strong>
                          <small>{team.name}</small>
                        </span>
                        <b aria-label={done ? 'Gols: ' + match[side + '_score'] : 'Sem placar'}>
                          {done ? match[side + '_score'] : '–'}
                        </b>
                      </div>
                    );
                  })}
                  {!done && (
                    <button type="button" className="text-button" onClick={() => setEditing(match.id)}>
                      <Plus size={14} />
                      Lançar placar
                    </button>
                  )}
                </article>
              );
            })}
          </div>
          {bye && (
            <p className="draw-bye">
              <Crest team={bye} />{' '}
              <span>
                <strong>{bye.player_name}</strong> fica de folga nesta rodada ({bye.name}).
              </span>
            </p>
          )}
        </div>
      )}
      {editMatch && (
        <DrawScore
          match={editMatch}
          teamsById={teamsById}
          onClose={() => setEditing(null)}
          finishMatch={finishMatch}
        />
      )}
    </section>
  );
}
