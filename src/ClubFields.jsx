import React, { useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { clubCatalog, getCatalogClub, normalizeSearch } from './clubCatalog.js';
import { Crest } from './LeagueViews.jsx';

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

function categoryOf(club) {
  return club.name.endsWith('(W)') ? 'Feminina' : 'Masculina';
}

export default function ClubFields({ team, teams }) {
  const originalClub = getCatalogClub(team?.catalog_id);
  const [mode, setMode] = useState(team && !originalClub ? 'custom' : 'catalog');
  const [selectedId, setSelectedId] = useState(originalClub?.id ?? '');
  const [choosing, setChoosing] = useState(!originalClub);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [name, setName] = useState(team?.name ?? '');
  const [code, setCode] = useState(team?.code ?? '');
  const [color, setColor] = useState(team?.color ?? colors[0][0]);
  const playerInput = useRef(null);
  const catalogMode = mode === 'catalog';
  const selected = getCatalogClub(selectedId);
  const needsPlayer = catalogMode && (!team || (selected && selected.id !== team.catalog_id));
  const search = normalizeSearch(query);
  const options = clubCatalog.filter(
    (club) =>
      (!category || categoryOf(club) === category) &&
      normalizeSearch(club.name + ' ' + club.code).includes(search),
  );
  const otherTeams = teams.filter((item) => item.id !== team?.id);
  const choices =
    team && !colors.some(([hex]) => hex === team.color.toUpperCase())
      ? [...colors, [team.color, 'Cor atual ' + team.color]]
      : colors;
  const choose = (club) => {
    setSelectedId(club.id);
    setChoosing(false);
    playerInput.current?.focus();
  };

  return (
    <>
      <div className="club-source" role="group" aria-label="Tipo de clube">
        <button type="button" aria-pressed={catalogMode} onClick={() => setMode('catalog')}>
          Catálogo
        </button>
        <button type="button" aria-pressed={!catalogMode} onClick={() => setMode('custom')}>
          Personalizado
        </button>
      </div>
      <input type="hidden" name="club_type" value={mode} />
      {catalogMode ? (
        <>
          <input type="hidden" name="catalog_id" value={selected?.id ?? ''} />
          <input type="hidden" name="name" value={selected?.name ?? ''} />
          <input type="hidden" name="code" value={selected?.code ?? ''} />
          <input type="hidden" name="color" value={selected?.color ?? ''} />
          {choosing || !selected ? (
            <fieldset className="club-catalog">
              <legend>Escolha o clube</legend>
              <div className="catalog-filters">
                <label className="catalog-search">
                  <Search size={15} aria-hidden="true" />
                  <input
                    type="search"
                    placeholder="Buscar clube"
                    aria-label="Buscar no catálogo"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    autoFocus
                  />
                </label>
                <select
                  aria-label="Categoria da equipe"
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                >
                  <option value="">Todas</option>
                  <option value="Masculina">Masculinas</option>
                  <option value="Feminina">Femininas</option>
                </select>
              </div>
              <ul className="catalog-options" aria-label="Clubes do catálogo">
                {options.map((club) => {
                  const registeredTeam = otherTeams.find(
                    (other) =>
                      other.catalog_id === club.id ||
                      normalizeSearch(other.name) === normalizeSearch(club.name),
                  );
                  return (
                    <li key={club.id}>
                      <button
                        type="button"
                        className="catalog-option"
                        disabled={Boolean(registeredTeam)}
                        aria-pressed={selectedId === club.id}
                        onClick={() => choose(club)}
                      >
                        <Crest team={club} catalogClub={club} />
                        <span>
                          {club.name}
                          {registeredTeam && (
                            <small>
                              {registeredTeam.player_name ? 'Jogador · ' + registeredTeam.player_name : 'Já cadastrado'}
                            </small>
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
                {!options.length && <li className="catalog-none">Nenhum clube encontrado.</li>}
              </ul>
            </fieldset>
          ) : (
            <div className="catalog-selection">
              <Crest team={selected} catalogClub={selected} />
              <div>
                <strong>{selected.name}</strong>
                <small>
                  {categoryOf(selected)} · {selected.code}
                </small>
              </div>
              <button type="button" className="text-button" onClick={() => setChoosing(true)}>
                Trocar
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          <label>
            Nome do clube
            <input
              name="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
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
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              placeholder="UDV"
              pattern="[A-Za-z0-9]{2,4}"
              minLength={2}
              maxLength={4}
              required
            />
          </label>
          <fieldset>
            <legend>Cor do escudo</legend>
            <div className="color-choices">
              {choices.map(([hex, label]) => (
                <label key={hex} style={{ '--club': hex }}>
                  <input
                    type="radio"
                    name="color"
                    value={hex}
                    checked={color.toUpperCase() === hex.toUpperCase()}
                    onChange={() => setColor(hex)}
                    aria-label={label}
                  />
                  <span />
                </label>
              ))}
            </div>
          </fieldset>
        </>
      )}
      <label>
        Nome do jogador{!needsPlayer && ' (opcional)'}
        <input
          ref={playerInput}
          name="player_name"
          defaultValue={team?.player_name ?? ''}
          maxLength={60}
          required={!!selected && !!needsPlayer}
          pattern={needsPlayer ? '.*\\S.*' : undefined}
          placeholder="Nome ou apelido"
          autoComplete="off"
        />
      </label>
    </>
  );
}
