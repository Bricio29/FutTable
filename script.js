// Inicializa o objeto que armazenará as informações dos times
let teams = {};

document.getElementById('match-form').addEventListener('submit', function(event) {
    event.preventDefault();

    // Pega os valores do formulário
    const team1 = document.getElementById('team1').value;
    const team2 = document.getElementById('team2').value;
    const score1 = parseInt(document.getElementById('score1').value);
    const score2 = parseInt(document.getElementById('score2').value);

    // Atualiza as estatísticas dos times
    updateTeamStats(team1, score1, score2);
    updateTeamStats(team2, score2, score1);

    // Limpa os campos do formulário
    document.getElementById('match-form').reset();

    // Atualiza a tabela de classificação
    updateStandings();
});

// Função para atualizar as estatísticas de um time
function updateTeamStats(team, goalsFor, goalsAgainst) {
    if (!teams[team]) {
        teams[team] = {
            wins: 0,
            draws: 0,
            losses: 0,
            points: 0,
            goalDifference: 0
        };
    }

    // Atualiza o saldo de gols
    teams[team].goalDifference += goalsFor - goalsAgainst;

    // Verifica o resultado do jogo
    if (goalsFor > goalsAgainst) {
        teams[team].wins++;
        teams[team].points += 3;
    } else if (goalsFor < goalsAgainst) {
        teams[team].losses++;
    } else {
        teams[team].draws++;
        teams[team].points++;
    }
}

// Função para atualizar a tabela de classificação
function updateStandings() {
    const standingsTable = document.getElementById('standings').getElementsByTagName('tbody')[0];
    
    // Limpa a tabela
    standingsTable.innerHTML = '';

    // Converte o objeto teams em uma lista para ordenar
    const sortedTeams = Object.entries(teams).sort((a, b) => {
        return b[1].points - a[1].points || b[1].goalDifference - a[1].goalDifference;
    });

    // Preenche a tabela com os dados dos times
    sortedTeams.forEach(([teamName, stats]) => {
        const row = standingsTable.insertRow();
        row.insertCell(0).textContent = teamName;
        row.insertCell(1).textContent = stats.wins;
        row.insertCell(2).textContent = stats.draws;
        row.insertCell(3).textContent = stats.losses;
        row.insertCell(4).textContent = stats.points;
        row.insertCell(5).textContent = stats.goalDifference;
    });
}
