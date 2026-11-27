const entries = [
  ['real-madrid', 'Real Madrid', 85, 'RMA', '#59499E', '/clubs/real-madrid.svg'],
  ['barcelona', 'FC Barcelona', 85, 'BAR', '#A50044', '/clubs/barcelona.svg'],
  ['arsenal', 'Arsenal', 85, 'ARS', '#B91C35', '/clubs/arsenal.svg'],
  ['psg', 'Paris Saint-Germain', 85, 'PSG', '#12376D', '/clubs/psg.svg'],
  ['bayern-munchen', 'Bayern München', 84, 'FCB', '#B71936', '/clubs/bayern-munchen.svg'],
  ['manchester-city', 'Manchester City', 84, 'MCI', '#377BA3', '/clubs/manchester-city.svg'],
  ['arsenal-w', 'Arsenal (W)', 84, 'ARSW', '#B91C35', '/clubs/arsenal.svg'],
  ['chelsea-w', 'Chelsea (W)', 84, 'CHEW', '#124294', '/clubs/chelsea.svg'],
  ['ol-lyonnes-w', 'OL Lyonnes (W)', 84, 'OLW', '#23478A', '/clubs/ol-lyonnes-w.png'],
  ['atletico-madrid', 'Atlético de Madrid', 83, 'ATM', '#AF233B', '/clubs/atletico-madrid.svg'],
  ['liverpool', 'Liverpool', 83, 'LIV', '#AE132E', '/clubs/liverpool.svg'],
  ['barcelona-w', 'FC Barcelona (W)', 83, 'BARW', '#A50044', '/clubs/barcelona.svg'],
  ['manchester-city-w', 'Manchester City (W)', 83, 'MCIW', '#377BA3', '/clubs/manchester-city.svg'],
  ['bayern-munchen-w', 'Bayern München (W)', 82, 'FCBW', '#B71936', '/clubs/bayern-munchen.svg'],
  ['manchester-united', 'Manchester United', 82, 'MUN', '#AE1D2A', '/clubs/manchester-united.svg'],
  ['inter', 'Inter', 82, 'INT', '#2048A0', '/clubs/inter.svg'],
  ['borussia-dortmund', 'Borussia Dortmund', 81, 'BVB', '#806600', '/clubs/borussia-dortmund.svg'],
  ['napoli', 'Napoli', 81, 'NAP', '#197B9B', '/clubs/napoli.svg'],
  ['manchester-united-w', 'Manchester United (W)', 81, 'MUNW', '#AE1D2A', '/clubs/manchester-united.svg'],
  ['chelsea', 'Chelsea', 81, 'CHE', '#124294', '/clubs/chelsea.svg'],
  ['london-city-lionesses-w', 'London City Lionesses (W)', 81, 'LCL', '#336D82', '/clubs/london-city-lionesses-w.svg'],
  ['real-madrid-w', 'Real Madrid (W)', 81, 'RMAW', '#59499E', '/clubs/real-madrid.svg'],
  ['tottenham', 'Tottenham Hotspur', 81, 'TOT', '#253254', '/clubs/tottenham.svg'],
  ['milano-fc', 'Milano FC', 80, 'MIL', '#9C243D', '/clubs/milano-fc.png'],
  ['gotham-fc-w', 'Gotham FC (W)', 80, 'GFC', '#397690', '/clubs/gotham-fc-w.svg'],
  ['roma', 'Roma', 80, 'ROM', '#882839', '/clubs/roma.svg'],
  ['juventus', 'Juventus', 80, 'JUV', '#333542', '/clubs/juventus.svg'],
  ['psg-w', 'Paris Saint-Germain (W)', 80, 'PSGW', '#12376D', '/clubs/psg.svg'],
  ['bayer-leverkusen', 'Bayer 04 Leverkusen', 79, 'B04', '#AF1D34', '/clubs/bayer-leverkusen.svg'],
  ['fenerbahce', 'Fenerbahçe', 79, 'FEN', '#203F6B', '/clubs/fenerbahce.svg'],
  ['atletico-madrid-w', 'Atlético de Madrid (W)', 79, 'ATMW', '#AF233B', '/clubs/atletico-madrid.svg'],
  ['galatasaray', 'Galatasaray', 79, 'GAL', '#9E293B', '/clubs/galatasaray.svg'],
  ['athletic-bilbao', 'Athletic Club de Bilbao', 79, 'ATH', '#A42D40', '/clubs/athletic-bilbao.svg'],
  ['villarreal', 'Villarreal CF', 79, 'VIL', '#80641F', '/clubs/villarreal.svg'],
  ['porto', 'FC Porto', 79, 'FCP', '#28518B', '/clubs/porto.svg'],
  ['kansas-city-current-w', 'Kansas City Current (W)', 79, 'KCC', '#13716F', '/clubs/kansas-city-current-w.svg'],
  ['real-betis', 'Real Betis Balompié', 79, 'BET', '#147247', '/clubs/real-betis.svg'],
  ['newcastle', 'Newcastle United', 79, 'NEW', '#343C48', '/clubs/newcastle.svg'],
  ['rb-leipzig', 'RB Leipzig', 79, 'RBL', '#AA2845', '/clubs/rb-leipzig.svg'],
  ['sunderland', 'Sunderland', 79, 'SUN', '#A6283B', '/clubs/sunderland.svg'],
  ['crystal-palace', 'Crystal Palace', 79, 'CRY', '#244C8F', '/clubs/crystal-palace.svg'],
  ['washington-spirit-w', 'Washington Spirit (W)', 79, 'WAS', '#363943', '/clubs/washington-spirit-w.svg'],
  ['nottingham-forest', 'Nottingham Forest', 79, 'NFO', '#AC273D', '/clubs/nottingham-forest.svg'],
  ['aston-villa', 'Aston Villa', 79, 'AVL', '#752B4D', '/clubs/aston-villa.svg'],
  ['atalanta', 'Atalanta', 79, 'ATA', '#255192', '/clubs/atalanta.svg'],
  ['wolfsburg-w', 'VfL Wolfsburg (W)', 79, 'WOBW', '#397A35', '/clubs/wolfsburg-w.svg'],
  ['real-sociedad', 'Real Sociedad', 78, 'RSO', '#275F96', '/clubs/real-sociedad.svg'],
  ['portland-thorns-w', 'Portland Thorns FC (W)', 78, 'PTFC', '#9C2937', '/clubs/portland-thorns-w.svg'],
  ['benfica', 'Benfica', 78, 'SLB', '#A82539', '/clubs/benfica.svg'],
  ['san-diego-wave-w', 'San Diego Wave FC (W)', 78, 'SDW', '#8F3B70', '/clubs/san-diego-wave-w.svg'],
];

export const clubCatalog = entries.map(([id, name, rating, code, color, logo]) => ({
  id, name, rating, code, color, logo,
}));

const clubsById = new Map(clubCatalog.map(club => [club.id, club]));

export function getCatalogClub(id) {
  return clubsById.get(id);
}

export function normalizeSearch(value) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

const clubsByName = new Map(clubCatalog.map(club => [normalizeSearch(club.name), club]));

export function catalogClubForTeam(team) {
  return getCatalogClub(team.catalog_id) ?? clubsByName.get(normalizeSearch(team.name));
}
