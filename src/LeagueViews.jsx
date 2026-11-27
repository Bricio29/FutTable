import React, { useState } from 'react';
import { isPlayed, matchTeam } from './league.js';
import { catalogClubForTeam, normalizeSearch } from './clubCatalog.js';
import './catalog.css';
import {
  ArrowRight,
  Anchor,
  CalendarDays,
  ChevronRight,
  Crown,
  Flag,
  Mountain,
  Pencil,
  Search,
  Shield,
  Star,
  Sun,
  Table2,
  Trash2,
  TreePine,
  Waves,
  Zap,
} from 'lucide-react';

const emblems = [Sun, Mountain, Star, Waves, Crown, Zap, Anchor, TreePine];
export function Crest({ team, catalogClub = catalogClubForTeam(team) }) {
  const [failedLogo, setFailedLogo] = useState('');
  if (catalogClub?.logo && failedLogo !== catalogClub.logo) {
    return (
      <span aria-hidden="true" className="crest crest-logo">
        <img src={catalogClub.logo} alt="" loading="lazy" decoding="async" onError={() => setFailedLogo(catalogClub.logo)} />
      </span>
    );
  }
  const last = parseInt(team.id.slice(-4), 16) || 1;
  const Emblem = emblems[(last - 1) % emblems.length];
  return (
    <span aria-hidden="true" className={'crest shape-' + (last % 3)} style={{ '--club': team.color }}>
      {catalogClub ? <span className="crest-code">{catalogClub.code}</span> : <Emblem strokeWidth={2.4} />}
    </span>
  );
}

export function Empty({ children, action, onAction }) {
  return (
    <div className="empty">
      <Flag size={27} />
      <p>{children}</p>
      {action && (
        <button className="text-button" onClick={onAction}>
          {action}
          <ArrowRight size={15} />
        </button>
      )}
    </div>
  );
}

function SectionHead({ Icon, title, description, action, onAction }) {
  return (
    <header className="section-head">
      <div className="section-titling">
        <span className="section-icon">
          <Icon size={20} />
        </span>
        <div>
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
      </div>
      {action && (
        <button className="text-button" onClick={onAction}>
          {action}
          <ChevronRight size={15} />
        </button>
      )}
    </header>
  );
}

const labels = { V: 'Vitória', E: 'Empate', D: 'Derrota' };
function FormDots({ form }) {
  return (
    <span className="form-dots" aria-label={form.map((v) => labels[v]).join(', ') || 'Sem jogos'}>
      {form.map((value, i) => (
        <span key={i} className={'form-dot ' + value} title={labels[value]}>
          {value}
        </span>
      ))}
      {Array.from({ length: 5 - form.length }, (_, i) => (
        <span key={'blank' + i} className="form-dot blank">
          ·
        </span>
      ))}
    </span>
  );
}

export function Rankings({ rows, compact, navigate, addTeam }) {
  return (
    <section className="panel standings">
      <SectionHead
        title="Classificação"
        description="Desempenho dos clubes na liga"
        Icon={Table2}
        action={compact ? 'Ver tabela' : null}
        onAction={() => navigate('classificacao')}
      />
      {rows.length ? (
        <>
          <div className="table-scroll" tabIndex="0" role="region" aria-label="Tabela de classificação">
            <table>
              <thead>
                <tr>
                  <th scope="col" className="rank-cell">
                    #
                  </th>
                  <th scope="col" className="team-cell">
                    Clube
                  </th>
                  {['PTS', 'J', 'V', 'E', 'D', ...(!compact ? ['GP', 'GC'] : []), 'SG'].map((value, i) => (
                    <th
                      key={value}
                      scope="col"
                      title={
                        [
                          'Pontos',
                          'Jogos',
                          'Vitórias',
                          'Empates',
                          'Derrotas',
                          ...(!compact ? ['Gols pró', 'Gols contra'] : []),
                          'Saldo de gols',
                        ][i]
                      }
                    >
                      {value}
                    </th>
                  ))}
                  <th scope="col" className="form-col">
                    Últimos 5
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ team, points, played, wins, draws, losses, gf, ga, gd, form }, i) => (
                  <tr key={team.id} className={i === 0 && played ? 'leading' : ''}>
                    <td className="rank-cell">
                      <span>{i + 1}</span>
                    </td>
                    <th className="team-cell" scope="row">
                      <div>
                        <Crest team={team} />
                        {team.name}
                      </div>
                    </th>
                    <td className="points">{points}</td>
                    <td>{played}</td>
                    <td>{wins}</td>
                    <td>{draws}</td>
                    <td>{losses}</td>
                    {!compact && (
                      <>
                        <td>{gf}</td>
                        <td>{ga}</td>
                      </>
                    )}
                    <td>
                      {gd > 0 ? '+' : ''}
                      {gd}
                    </td>
                    <td className="form-col">
                      <FormDots form={form} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="legend">
            <span>
              <i className="legend-line" />
              Líder
            </span>
            <div>
              {Object.entries(labels).map(([v, label]) => (
                <span key={v}>
                  <i className={'legend-dot ' + v} />
                  {label}
                </span>
              ))}
            </div>
          </div>
        </>
      ) : (
        <Empty action="Cadastrar clube" onAction={addTeam}>
          Cadastre o primeiro clube para iniciar a classificação.
        </Empty>
      )}
    </section>
  );
}

const shortDate = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
export function Results({ league, compact, navigate, newMatch, onEdit, onRemove }) {
  const [club, setClub] = useState('');
  const teamsById = new Map(league.teams.map((team) => [team.id, team]));
  const games = league.matches.filter(isPlayed)
    .filter((m) => compact || !club || m.home_id === club || m.away_id === club)
    .sort((a, b) => b.played_on.localeCompare(a.played_on) || b.id.localeCompare(a.id));
  const shown = compact ? games.slice(0, 3) : games;
  return (
    <section className={'panel results ' + (compact ? 'compact' : '')}>
      <SectionHead
        title={compact ? 'Últimos resultados' : 'Histórico de partidas'}
        description={compact ? 'Partidas mais recentes' : undefined}
        Icon={CalendarDays}
        action={compact ? 'Ver todos' : null}
        onAction={() => navigate('partidas')}
      />
      {!compact && (
        <label className="filter-field">
          Filtrar por clube
          <select value={club} onChange={(e) => setClub(e.target.value)}>
            <option value="">Todos os clubes</option>
            {league.teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {shown.length ? (
        <div className="result-list">
          {shown.map((match) => (
            <article className="result-game" key={match.id}>
              <div className="game-meta">
                <time dateTime={match.played_on}>
                  {shortDate.format(new Date(match.played_on + 'T12:00:00')).replaceAll(' de ', ' ')}
                </time>
                <span>
                  <i />
                  Encerrada
                </span>
              </div>
              {['home', 'away'].map((side) => {
                const team = matchTeam(match, side, teamsById);
                if (!team) return null;
                const goals = match[side + '_score'];
                const won = goals > match[side === 'home' ? 'away_score' : 'home_score'];
                return (
                  <div key={side} className={'result-team' + (won ? ' won' : '')}>
                    <Crest team={team} />
                    <span>
                      {team.name}
                      {match.draw_id && <small className="result-player-name">{team.player_name}</small>}
                    </span>
                    <b>{goals}</b>
                  </div>
                );
              })}
              {!compact && (
                <div className="game-actions">
                  <button
                    onClick={() => onEdit(match)}
                    aria-label={
                      'Corrigir placar de ' +
                      teamsById.get(match.home_id)?.name +
                      ' e ' +
                      teamsById.get(match.away_id)?.name
                    }
                  >
                    <Pencil size={14} />
                    Corrigir placar
                  </button>
                  <button
                    className="remove-game"
                    onClick={() => onRemove(match)}
                    aria-label={
                      'Excluir partida entre ' +
                      teamsById.get(match.home_id)?.name +
                      ' e ' +
                      teamsById.get(match.away_id)?.name
                    }
                  >
                    <Trash2 size={14} />
                    Excluir
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      ) : (
        <Empty action="Registrar partida" onAction={newMatch}>
          {club
            ? 'Este clube ainda não tem resultados.'
            : 'Os resultados aparecem aqui após a primeira partida.'}
        </Empty>
      )}
    </section>
  );
}

export function Clubs({ rows, matches, addTeam, onEdit, onRemove }) {
  const [query, setQuery] = useState('');
  const search = normalizeSearch(query);
  const clubs = rows.filter(({ team }) =>
    normalizeSearch([team.name, team.code, team.player_name].filter(Boolean).join(' ')).includes(search)
  );
  function confirmRemove(team) {
    const fixtures = matches.filter(match => match.home_id === team.id || match.away_id === team.id);
    onRemove(team, fixtures.length, fixtures.filter(match => match.home_score === null).length);
  }
  return (
    <section className="panel">
      <SectionHead title="Clubes participantes" Icon={Shield} />
      <div className="search-field">
        <Search size={16} />
        <input
          aria-label="Buscar clube"
          type="search"
          placeholder="Buscar por clube, sigla ou jogador"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {clubs.length ? (
        <div className="club-grid">
          {clubs.map(({ team, points, played }) => (
            <article className="club-card" key={team.id}>
              <Crest team={team} />
              <div>
                <small>{team.code}</small>
                <h3>{team.name}</h3>
                {team.player_name && <p className="club-player">Jogador · {team.player_name}</p>}
                <p>
                  {played} {played === 1 ? 'jogo' : 'jogos'} · {points} {points === 1 ? 'ponto' : 'pontos'}
                </p>
              </div>
              <div className="club-actions">
                <button type="button" onClick={() => onEdit(team)} aria-label={'Editar ' + team.name}>
                  <Pencil size={15} aria-hidden="true" /> Editar
                </button>
                <button
                  type="button"
                  className="remove-club"
                  onClick={() => confirmRemove(team)}
                  aria-label={'Excluir ' + team.name}
                >
                  <Trash2 size={15} aria-hidden="true" /> Excluir
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty action={!rows.length ? 'Cadastrar clube' : null} onAction={addTeam}>
          {rows.length ? 'Nenhum clube encontrado.' : 'Sua liga ainda não tem clubes.'}
        </Empty>
      )}
    </section>
  );
}
