import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ChartNoAxesColumnIncreasing,
  Check,
  ChevronRight,
  Dices,
  Flag,
  Goal,
  LayoutDashboard,
  ListOrdered,
  Plus,
  Pencil,
  Shield,
  Swords,
  Trophy,
  UserRound,
} from 'lucide-react';
import { AuthDialog, AuthScreen, useAuth } from './auth.jsx';
import { isPlayed, standings } from './league.js';
import { useLeague } from './useLeague.js';
import { Clubs, Rankings, Results } from './LeagueViews.jsx';
import LeagueDialog from './LeagueDialog.jsx';
import Draws from './Draws.jsx';
import ClubDraw from './ClubDraw.jsx';
import Leagues from './Leagues.jsx';

const pages = [
  { id: 'geral', label: 'Visão geral', Icon: LayoutDashboard },
  { id: 'classificacao', label: 'Classificação', Icon: ListOrdered },
  { id: 'partidas', label: 'Partidas', Icon: Swords },
  { id: 'clubes', label: 'Clubes', Icon: Shield },
  { id: 'ligas', label: 'Ligas', Icon: Trophy },
];
const clubDrawPage = 'sorteio-de-clubes';
function routeFromUrl() {
  const [path, search] = window.location.hash.slice(2).split('?');
  const page = path === clubDrawPage || pages.some((item) => item.id === path) ? path : 'geral';
  return { page, params: new URLSearchParams(search) };
}

function Brand() {
  return (
    <span className="brand">
      <img src="/campo.svg" alt="" width="36" height="36" />
      <span>
        Fut<b>Table</b>
      </span>
    </span>
  );
}

function Metrics({ league }) {
  const completed = league.matches.filter(isPlayed);
  const gols = completed.reduce((sum, m) => sum + m.home_score + m.away_score, 0);
  const average = completed.length ? gols / completed.length : 0;
  const stats = [
    [Shield, league.teams.length, 'Clubes participantes', 'green'],
    [Swords, completed.length, 'Partidas disputadas', 'blue'],
    [Goal, gols, 'Gols marcados', 'amber'],
    [
      ChartNoAxesColumnIncreasing,
      average.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
      'Gols por partida',
      'violet',
    ],
  ];
  return (
    <section className="metrics" aria-label="Estatísticas do campeonato">
      {stats.map(([Icon, value, title, palette]) => (
        <article className={'metric ' + palette} key={title}>
          <span className="metric-icon">
            <Icon size={22} strokeWidth={1.8} />
          </span>
          <div>
            <strong>{value}</strong>
            <span>{title}</span>
          </div>
        </article>
      ))}
    </section>
  );
}

function Dashboard({ token, leagueScope, activeId, onOpenLeague, route, navigate }) {
  const { page, params } = route;
  const model = useLeague(token, leagueScope);
  const [dialog, setDialog] = useState(null);
  const [toast, setToast] = useState('');
  const overview = page === 'geral';
  const { league, error, loading } = model;
  const rows = useMemo(() => standings(league), [league]);
  const label = page === clubDrawPage ? 'Sorteio de clubes' : pages.find((p) => p.id === page).label;
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(''), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  const addingClub = page === 'clubes' || (!loading && !error && league.teams.length < 2);
  const newMatch = () => setDialog({ type: 'match' });
  const addTeam = () => setDialog({ type: 'club' });
  const title = league.league_name || 'Minha liga';
  const selectedClubs = params.get('clubes');
  return (
    <main id="conteudo" tabIndex={-1} className="shell main">
      <div className="context-line">
        <div className="breadcrumb">
          <Trophy size={15} />
          <span>Campeonato</span>
          <ChevronRight size={13} />
          <strong>{label}</strong>
        </div>
        <span className="league-status">
          <i />
          Liga privada
        </span>
      </div>
      {overview ? (
        <section className="hero">
          <div className="hero-image" aria-hidden="true" />
          <div className="hero-shade" aria-hidden="true" />
          <div className="hero-stripes" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
          <div className="hero-content">
            <div className="hero-tag">
              <span /> CENTRAL DO CAMPEONATO
            </div>
            <div className="league-title">
              <h1>{title}</h1>
              <button
                type="button"
                className="league-title-edit"
                aria-label="Alterar nome da liga"
                title="Alterar nome da liga"
                onClick={() => navigate('ligas?editar=atual')}
              >
                <Pencil size={17} aria-hidden="true" />
              </button>
            </div>
            <div className="hero-meta">
              <span>
                <Trophy />
                Pontos corridos
              </span>
              <i />
              <span>
                <Flag />
                Campeonato particular
              </span>
            </div>
            <div className="hero-buttons">
              <button
                className="hero-button"
                onClick={addingClub ? addTeam : newMatch}
                disabled={loading || Boolean(error)}
              >
                <Plus size={17} />
                {addingClub ? 'Cadastrar clube' : 'Registrar partida'}
              </button>
              <button
                type="button"
                className="hero-button hero-alternate"
                onClick={() => navigate('partidas')}
              >
                <Dices size={17} /> Sorteio de partidas
              </button>
            </div>
          </div>
        </section>
      ) : (
        <div className="page-title">
          <div>
            <div className="page-kicker">
              <Trophy size={13} />
              {title}
            </div>
            <h1>{label}</h1>
          </div>
          {page === clubDrawPage ? (
            <button type="button" className="secondary" onClick={() => navigate('clubes')}>
              <ArrowLeft size={16} /> Voltar aos clubes
            </button>
          ) : (
            page !== 'ligas' && (
              <div className="page-actions">
                {(page === 'clubes' || page === 'partidas') && (
                  <button type="button" className="secondary" onClick={() => navigate(clubDrawPage)}>
                    <Dices size={16} /> Sortear clubes
                  </button>
                )}
                <button
                  className="primary"
                  disabled={loading || Boolean(error)}
                  onClick={addingClub ? addTeam : newMatch}
                >
                  <Plus size={16} /> {addingClub ? 'Cadastrar clube' : 'Registrar partida'}
                </button>
              </div>
            )
          )}
        </div>
      )}
      {page === 'ligas' ? (
        <Leagues
          model={model}
          activeId={activeId}
          editActive={params.get('editar') === 'atual'}
          onOpen={onOpenLeague}
        />
      ) : loading ? (
        <div className="panel loading" role="status">
          Carregando a liga…
        </div>
      ) : error ? (
        <div className="panel loading" role="alert">
          <p>{error}</p>
          <button className="secondary" onClick={model.reload}>
            Tentar novamente
          </button>
        </div>
      ) : (
        <>
          {overview && <Metrics league={league} />}
          {page === clubDrawPage && (
            <ClubDraw
              teams={league.teams}
              onDraw={model.drawClubs}
              onMatches={(ids) => navigate('partidas?clubes=' + ids.join(','))}
            />
          )}
          {page === 'partidas' && (
            <Draws
              key={selectedClubs ?? 'todos'}
              model={model}
              initialTeams={selectedClubs?.split(',')}
              openClubs={() => navigate('clubes')}
            />
          )}
          <div className={overview ? 'dashboard-grid' : 'page-body'}>
            {(overview || page === 'classificacao') && (
              <Rankings rows={rows} compact={overview} navigate={navigate} addTeam={addTeam} />
            )}
            {(overview || page === 'partidas') && (
              <Results
                league={league}
                compact={overview}
                navigate={navigate}
                newMatch={newMatch}
                onEdit={(match) => setDialog({ type: 'edit', match })}
                onRemove={(match) => setDialog({ type: 'remove', match })}
              />
            )}
            {page === 'clubes' && (
              <Clubs
                rows={rows}
                matches={league.matches}
                addTeam={addTeam}
                onEdit={(team) => setDialog({ type: 'editClub', team })}
                onRemove={(team, matchCount, pendingCount) =>
                  setDialog({ type: 'removeClub', team, matchCount, pendingCount })
                }
              />
            )}
          </div>
        </>
      )}
      {dialog && (
        <LeagueDialog
          key={dialog.type}
          {...dialog}
          model={model}
          onClose={() => setDialog(null)}
          onAddTeam={addTeam}
          onFinish={(message) => {
            setDialog(null);
            setToast(message);
          }}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={18} />
          {toast}
        </div>
      )}
    </main>
  );
}

function PrivateLeague({ auth }) {
  const [route, setRoute] = useState(routeFromUrl);
  const { page } = route;
  const userId = auth.session.user.id;
  const preferenceKey = 'futtable.liga.' + userId;
  const [activeId, setActiveId] = useState(() => {
    try {
      const saved = localStorage.getItem(preferenceKey);
      return /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(saved) ? saved : userId;
    } catch {
      return userId;
    }
  });
  const [authOpen, setAuthOpen] = useState(false);
  useEffect(() => {
    const onHash = () => setRoute(routeFromUrl());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  useEffect(() => {
    const title = page === clubDrawPage ? 'Sorteio de clubes' : pages.find((p) => p.id === page).label;
    document.title = title + ' · FutTable';
  }, [page]);
  const navigate = (next) => {
    window.location.hash = '/' + next;
  };
  function openLeague(id) {
    setActiveId(id);
    try {
      localStorage.setItem(preferenceKey, id);
    } catch {
      // A escolha continua válida nesta sessão quando o navegador restringe o armazenamento.
    }
    navigate('geral');
  }
  return (
    <>
      <a
        className="skip"
        href="#conteudo"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById('conteudo')?.focus();
        }}
      >
        Ir para o conteúdo
      </a>
      <header className="site-header">
        <div className="shell header-inner">
          <a className="brand-link" aria-label="FutTable, visão geral" href="#/geral">
            <Brand />
          </a>
          <nav aria-label="Navegação principal">
            {pages.map(({ id, label, Icon }) => (
              <a
                key={id}
                href={'#/' + id}
                aria-current={(page === clubDrawPage ? 'clubes' : page) === id ? 'page' : undefined}
              >
                <Icon size={16} strokeWidth={1.8} />
                {label}
              </a>
            ))}
          </nav>
          <button className="account-button" onClick={() => setAuthOpen(true)}>
            <UserRound size={16} />
            Minha conta
          </button>
        </div>
      </header>
      <Dashboard
        key={activeId}
        token={auth.session.access_token}
        leagueScope={activeId === userId ? null : activeId}
        activeId={activeId}
        onOpenLeague={openLeague}
        route={route}
        navigate={navigate}
      />
      <footer className="shell footer">
        <a aria-label="FutTable, início" href="#/geral">
          <Brand />
        </a>
        <span>Gestão de campeonatos</span>
      </footer>
      <AuthDialog auth={auth} open={authOpen} onClose={() => setAuthOpen(false)} />
    </>
  );
}

export default function App() {
  const auth = useAuth();
  if (!auth.ready || !auth.session?.access_token || auth.recovery || auth.linkError) {
    return <AuthScreen auth={auth} />;
  }
  return <PrivateLeague key={auth.session.user.id} auth={auth} />;
}
