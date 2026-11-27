import React, { useEffect, useId, useRef, useState } from 'react';
import { ArrowRight, Search, Shuffle } from 'lucide-react';
import { clubCatalog, getCatalogClub, normalizeSearch } from './clubCatalog.js';
import { Crest } from './LeagueViews.jsx';
import './clubDraw.css';

const counts = Array.from({ length: clubCatalog.length - 1 }, (_, index) => index + 2);
const namesInCatalog = new Map(clubCatalog.map((club) => [club.name.toLowerCase(), club.id]));

function cleanName(name) {
  return name.trim().replace(/\s+/gu, ' ');
}

export default function ClubDraw({ teams, onDraw, onMatches }) {
  const prefix = useId();
  const submitting = useRef(false);
  const heading = useRef(null);
  const [names, setNames] = useState(['', '']);
  const [selected, setSelected] = useState([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [onlySelected, setOnlySelected] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (result) heading.current?.focus();
  }, [result]);

  const count = names.length;
  const players = names.map(cleanName);
  const playerKeys = new Set(players.filter(Boolean).map((name) => name.toLowerCase()));
  const filled = players.filter(Boolean).length;
  const selectedSet = new Set(selected);
  const teamsByCatalog = new Map();
  const registeredIds = new Set(teams.map((team) => team.catalog_id).filter(Boolean));
  const playerTeams = teams.filter((team) => team.player_name);
  const conflicts = [];
  let updatesAssignments = false;

  for (const team of teams) {
    const legacyId = namesInCatalog.get(team.name.toLowerCase());
    const catalogId =
      getCatalogClub(team.catalog_id)?.id ??
      (!team.catalog_id && !registeredIds.has(legacyId) ? legacyId : null);
    if (catalogId) teamsByCatalog.set(catalogId, team);
    if (!team.player_name) continue;
    const inGroup = playerKeys.has(team.player_name.toLowerCase());
    const clubSelected = selectedSet.has(catalogId);
    if (inGroup && clubSelected) updatesAssignments = true;
    if (inGroup && !clubSelected) {
      conflicts.push({
        neededClub: catalogId,
        message: catalogId
          ? 'Inclua ' + team.name + ' nos clubes ou retire ' + team.player_name + ' do grupo.'
          : team.player_name +
            ' já joga pelo clube personalizado ' +
            team.name +
            '. Você pode editar esse vínculo em Clubes.',
      });
    } else if (!inGroup && clubSelected) {
      conflicts.push({
        message: 'Inclua ' + team.player_name + ' nos jogadores ou retire ' + team.name + ' da seleção.',
      });
    }
  }

  const query = normalizeSearch(search);
  const visible = clubCatalog.filter(
    (club) =>
      (!onlySelected || selectedSet.has(club.id)) &&
      (!category || (club.name.endsWith('(W)') ? 'f' : 'm') === category) &&
      normalizeSearch(club.name + ' ' + club.code).includes(query),
  );
  const duplicate = filled > playerKeys.size;
  const ready = filled === count && !duplicate && selected.length === count && conflicts.length === 0;

  function resize(next) {
    if (next < filled || next < selected.length) {
      setError(
        'Para escolher ' +
          next +
          ' jogadores, deixe no máximo ' +
          next +
          ' nomes preenchidos e ' +
          next +
          ' clubes marcados.',
      );
      return;
    }
    setError('');
    if (next >= count) setNames([...names, ...Array(next - count).fill('')]);
    else {
      const kept = names.filter((name) => cleanName(name));
      setNames([...kept, ...Array(next - kept.length).fill('')]);
    }
  }

  function toggleClub(id) {
    setError('');
    setSelected((previous) =>
      previous.includes(id) ? previous.filter((item) => item !== id) : [...previous, id],
    );
  }

  function completeSelection() {
    const blocked = conflicts.find((conflict) => !conflict.neededClub);
    if (blocked) {
      setError(blocked.message);
      return;
    }
    const pool = new Set([...selected, ...conflicts.map((conflict) => conflict.neededClub)]);
    if (pool.size > count) {
      setError('Libere espaço na seleção para incluir os clubes atuais dos jogadores.');
      return;
    }
    const available = clubCatalog.filter(
      (club) => !pool.has(club.id) && !teamsByCatalog.get(club.id)?.player_name,
    );
    if (available.length < count - pool.size) {
      setError(
        'Há ' +
          (pool.size + available.length) +
          ' clubes disponíveis para este grupo. Reduza a quantidade ou inclua jogadores que já têm clube.',
      );
      return;
    }
    while (pool.size < count) {
      const index = Math.floor(Math.random() * available.length);
      const [club] = available.splice(index, 1);
      pool.add(club.id);
    }
    setSelected([...pool]);
    setError('');
  }

  async function submit(event) {
    event.preventDefault();
    if (submitting.current || !ready) return;
    submitting.current = true;
    setBusy(true);
    setError('');
    try {
      const saved = await onDraw(players, selected);
      setResult(saved);
    } catch (cause) {
      setError(cause?.message || 'Falha ao salvar o sorteio. Tente novamente.');
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <section className="panel club-draw" aria-labelledby={prefix + '-title'}>
      <header className="club-draw-heading">
        <span className="section-icon">
          <Shuffle size={20} aria-hidden="true" />
        </span>
        <div>
          <h2 id={prefix + '-title'} tabIndex={-1} ref={heading}>
            {result ? 'Clubes dos jogadores' : 'Escolha dos participantes'}
          </h2>
          <p>
            {result
              ? 'Os vínculos abaixo já estão salvos na sua liga.'
              : 'Escolha os jogadores e os clubes. Cada jogador receberá um time por sorteio.'}
          </p>
        </div>
      </header>
      {result ? (
        <div className="club-draw-result">
          <ul>
            {result.map((team) => (
              <li key={team.id}>
                <Crest team={team} />
                <span>
                  <strong>{team.player_name}</strong>
                  <small>{team.name}</small>
                </span>
              </li>
            ))}
          </ul>
          <div className="club-draw-actions">
            <button type="button" className="secondary" onClick={() => setResult(null)}>
              Voltar à seleção
            </button>
            <button
              type="button"
              className="primary"
              onClick={() => onMatches(result.map((team) => team.id))}
            >
              Ir para o sorteio de partidas <ArrowRight size={16} />
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} aria-busy={busy}>
          <fieldset disabled={busy} className="club-draw-form" aria-label="Configurar jogadores e clubes">
            <label className="club-draw-count">
              Quantidade de jogadores
              <select value={count} onChange={(event) => resize(Number(event.target.value))}>
                {counts.map((number) => (
                  <option key={number} value={number}>
                    {number}
                  </option>
                ))}
              </select>
            </label>
            <div className="club-draw-names">
              {names.map((value, index) => (
                <label key={index}>
                  Jogador {index + 1}
                  <input
                    type="text"
                    value={value}
                    list={prefix + '-players'}
                    required
                    maxLength={60}
                    placeholder="Nome ou apelido"
                    autoComplete="off"
                    onChange={(event) => {
                      const name = event.target.value;
                      setError('');
                      setNames((previous) => previous.map((item, i) => (i === index ? name : item)));
                    }}
                  />
                </label>
              ))}
            </div>
            <datalist id={prefix + '-players'}>
              {playerTeams.map((team) => (
                <option key={team.id} value={team.player_name}>
                  {team.name}
                </option>
              ))}
            </datalist>
            {duplicate && (
              <p className="error-message" role="alert">
                Cada jogador precisa de um nome ou apelido diferente.
              </p>
            )}
            <div className="club-draw-pool">
              <h3>Clubes para sortear</h3>
              <span aria-live="polite">
                {selected.length} de {count} selecionados
              </span>
            </div>
            <div className="club-draw-auto">
              <button
                type="button"
                className="secondary"
                disabled={selected.length >= count || duplicate}
                onClick={completeSelection}
              >
                <Shuffle size={15} /> Completar com clubes aleatórios
              </button>
              <span>Usa todo o catálogo e mantém os clubes que você marcou.</span>
            </div>
            <div className="club-draw-filters">
              <label className="club-draw-search">
                <Search size={16} aria-hidden="true" />
                <input
                  type="search"
                  aria-label="Buscar clube por nome ou sigla"
                  placeholder="Buscar clube por nome ou sigla"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>
              <select
                aria-label="Categoria das equipes"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
              >
                <option value="">Todas as equipes</option>
                <option value="m">Masculinas</option>
                <option value="f">Femininas</option>
              </select>
              <label className="club-draw-filter-checked">
                <input
                  type="checkbox"
                  checked={onlySelected}
                  onChange={(event) => setOnlySelected(event.target.checked)}
                />
                Só selecionados
              </label>
            </div>
            <div className="club-draw-options" role="group" aria-label="Clubes do catálogo">
              {visible.map((club) => {
                const checked = selectedSet.has(club.id);
                const owner = teamsByCatalog.get(club.id)?.player_name;
                return (
                  <label key={club.id} className="club-draw-option">
                    <input
                      type="checkbox"
                      value={club.id}
                      checked={checked}
                      disabled={!checked && selected.length >= count}
                      onChange={() => toggleClub(club.id)}
                    />
                    <Crest team={club} catalogClub={club} />
                    <span>
                      <strong>{club.name}</strong>
                      <small>
                        {owner
                          ? 'Jogador atual · ' + owner
                          : club.name.endsWith('(W)')
                            ? 'Feminina'
                            : 'Masculina'}
                      </small>
                    </span>
                  </label>
                );
              })}
              {visible.length === 0 && <p>Nenhum clube corresponde a esses filtros.</p>}
            </div>
            {conflicts.length > 0 && conflicts[0].message !== error && (
              <p className="club-draw-note" role="status">
                {conflicts[0].message}
              </p>
            )}
            {updatesAssignments && (
              <p className="club-draw-note">
                Os clubes selecionados serão redistribuídos entre estes jogadores. As rodadas anteriores
                mantêm os vínculos da época.
              </p>
            )}
            {error && (
              <p className="error-message" role="alert">
                {error}
              </p>
            )}
            <div className="club-draw-actions">
              <button type="submit" className="primary" disabled={!ready || busy}>
                <Shuffle size={16} /> {busy ? 'Sorteando…' : 'Sortear clubes'}
              </button>
            </div>
          </fieldset>
        </form>
      )}
    </section>
  );
}
