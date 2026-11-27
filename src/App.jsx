import React, { useEffect, useMemo, useState } from 'react';
import {
  ChartNoAxesColumnIncreasing,
  Check,
  ChevronRight,
  Flag,
  Goal,
  LayoutDashboard,
  ListOrdered,
  Plus,
  Shield,
  Swords,
  Trophy,
  UserRound,
} from 'lucide-react';
import { AuthDialog, AuthScreen, useAuth } from './auth.jsx';
import { standings } from './league.js';
import { useLeague } from './useLeague.js';
import { Clubs, Rankings, Results } from './LeagueViews.jsx';
import LeagueDialog from './LeagueDialog.jsx';

const pages = [
  { id: 'geral', label: 'Visão geral', Icon: LayoutDashboard },
  { id: 'classificacao', label: 'Classificação', Icon: ListOrdered },
  { id: 'partidas', label: 'Partidas', Icon: Swords },
  { id: 'clubes', label: 'Clubes', Icon: Shield },
];
const pageFromUrl = () => pages.find((page) => '#/' + page.id === window.location.hash)?.id || 'geral';

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
  const gols = league.matches.reduce((sum, m) => sum + m.home_score + m.away_score, 0);
  const average = league.matches.length ? gols / league.matches.length : 0;
  const stats = [
    [Shield, league.teams.length, 'Clubes participantes', 'green'],
    [Swords, league.matches.length, 'Partidas disputadas', 'blue'],
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

function Dashboard({ token, page, navigate }) {
  const model = useLeague(token);
  const [dialog, setDialog] = useState(null);
  const [toast, setToast] = useState('');
  const overview = page === 'geral';
  const { league, error, loading } = model;
  const rows = useMemo(() => standings(league), [league]);
  const label = pages.find((p) => p.id === page).label;
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(''), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  const addingClub = page === 'clubes' || (!loading && !error && league.teams.length < 2);
  const newMatch = () => setDialog({ type: 'match' });
  const addTeam = () => setDialog({ type: 'club' });
  const title = 'Minha liga';
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
            <h1>{title}</h1>
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
            <button
              className="hero-button"
              onClick={addingClub ? addTeam : newMatch}
              disabled={loading || Boolean(error)}
            >
              <Plus size={17} />
              {addingClub ? 'Cadastrar clube' : 'Registrar partida'}
            </button>
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
          <button
            className="primary"
            disabled={loading || Boolean(error)}
            onClick={addingClub ? addTeam : newMatch}
          >
            <Plus size={16} />
            {addingClub ? 'Cadastrar clube' : 'Registrar partida'}
          </button>
        </div>
      )}
      {loading ? (
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
                addTeam={addTeam}
                onEdit={(team) => setDialog({ type: 'editClub', team })}
                onRemove={(team, matchCount) => setDialog({ type: 'removeClub', team, matchCount })}
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
  const [page, setPage] = useState(pageFromUrl);
  const [authOpen, setAuthOpen] = useState(false);
  useEffect(() => {
    const onHash = () => setPage(pageFromUrl());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  useEffect(() => {
    document.title = pages.find((p) => p.id === page).label + ' · FutTable';
  }, [page]);
  const navigate = (next) => {
    window.location.hash = '/' + next;
  };
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
              <a key={id} href={'#/' + id} aria-current={page === id ? 'page' : undefined}>
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
      <Dashboard token={auth.session.access_token} page={page} navigate={navigate} />
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
