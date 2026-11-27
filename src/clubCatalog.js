const entries = [
  ['real-madrid', 'Real Madrid', 'RMA', '#59499E', '/clubs/real-madrid.svg'],
  ['barcelona', 'FC Barcelona', 'BAR', '#A50044', '/clubs/barcelona.svg'],
  ['arsenal', 'Arsenal', 'ARS', '#B91C35', '/clubs/arsenal.svg'],
  ['psg', 'Paris Saint-Germain', 'PSG', '#12376D', '/clubs/psg.svg'],
  ['bayern-munchen', 'Bayern München', 'FCB', '#B71936', '/clubs/bayern-munchen.svg'],
  ['manchester-city', 'Manchester City', 'MCI', '#377BA3', '/clubs/manchester-city.svg'],
  ['arsenal-w', 'Arsenal (W)', 'ARSW', '#B91C35', '/clubs/arsenal.svg'],
  ['chelsea-w', 'Chelsea (W)', 'CHEW', '#124294', '/clubs/chelsea.svg'],
  ['ol-lyonnes-w', 'OL Lyonnes (W)', 'OLW', '#23478A', '/clubs/ol-lyonnes-w.png'],
  ['atletico-madrid', 'Atlético de Madrid', 'ATM', '#AF233B', '/clubs/atletico-madrid.svg'],
  ['liverpool', 'Liverpool', 'LIV', '#AE132E', '/clubs/liverpool.svg'],
  ['barcelona-w', 'FC Barcelona (W)', 'BARW', '#A50044', '/clubs/barcelona.svg'],
  ['manchester-city-w', 'Manchester City (W)', 'MCIW', '#377BA3', '/clubs/manchester-city.svg'],
  ['bayern-munchen-w', 'Bayern München (W)', 'FCBW', '#B71936', '/clubs/bayern-munchen.svg'],
  ['manchester-united', 'Manchester United', 'MUN', '#AE1D2A', '/clubs/manchester-united.svg'],
  ['inter', 'Inter', 'INT', '#2048A0', '/clubs/inter.svg'],
  ['borussia-dortmund', 'Borussia Dortmund', 'BVB', '#806600', '/clubs/borussia-dortmund.svg'],
  ['napoli', 'Napoli', 'NAP', '#197B9B', '/clubs/napoli.svg'],
  ['manchester-united-w', 'Manchester United (W)', 'MUNW', '#AE1D2A', '/clubs/manchester-united.svg'],
  ['chelsea', 'Chelsea', 'CHE', '#124294', '/clubs/chelsea.svg'],
  ['london-city-lionesses-w', 'London City Lionesses (W)', 'LCL', '#336D82', '/clubs/london-city-lionesses-w.svg'],
  ['real-madrid-w', 'Real Madrid (W)', 'RMAW', '#59499E', '/clubs/real-madrid.svg'],
  ['tottenham', 'Tottenham Hotspur', 'TOT', '#253254', '/clubs/tottenham.svg'],
  ['milano-fc', 'Milano FC', 'MIL', '#9C243D', '/clubs/milano-fc.png'],
  ['gotham-fc-w', 'Gotham FC (W)', 'GFC', '#397690', '/clubs/gotham-fc-w.svg'],
  ['roma', 'Roma', 'ROM', '#882839', '/clubs/roma.svg'],
  ['juventus', 'Juventus', 'JUV', '#333542', '/clubs/juventus.svg'],
  ['psg-w', 'Paris Saint-Germain (W)', 'PSGW', '#12376D', '/clubs/psg.svg'],
  ['bayer-leverkusen', 'Bayer 04 Leverkusen', 'B04', '#AF1D34', '/clubs/bayer-leverkusen.svg'],
  ['fenerbahce', 'Fenerbahçe', 'FEN', '#203F6B', '/clubs/fenerbahce.svg'],
  ['atletico-madrid-w', 'Atlético de Madrid (W)', 'ATMW', '#AF233B', '/clubs/atletico-madrid.svg'],
  ['galatasaray', 'Galatasaray', 'GAL', '#9E293B', '/clubs/galatasaray.svg'],
  ['athletic-bilbao', 'Athletic Club de Bilbao', 'ATH', '#A42D40', '/clubs/athletic-bilbao.svg'],
  ['villarreal', 'Villarreal CF', 'VIL', '#80641F', '/clubs/villarreal.svg'],
  ['porto', 'FC Porto', 'FCP', '#28518B', '/clubs/porto.svg'],
  ['kansas-city-current-w', 'Kansas City Current (W)', 'KCC', '#13716F', '/clubs/kansas-city-current-w.svg'],
  ['real-betis', 'Real Betis Balompié', 'BET', '#147247', '/clubs/real-betis.svg'],
  ['newcastle', 'Newcastle United', 'NEW', '#343C48', '/clubs/newcastle.svg'],
  ['rb-leipzig', 'RB Leipzig', 'RBL', '#AA2845', '/clubs/rb-leipzig.svg'],
  ['sunderland', 'Sunderland', 'SUN', '#A6283B', '/clubs/sunderland.svg'],
  ['crystal-palace', 'Crystal Palace', 'CRY', '#244C8F', '/clubs/crystal-palace.svg'],
  ['washington-spirit-w', 'Washington Spirit (W)', 'WAS', '#363943', '/clubs/washington-spirit-w.svg'],
  ['nottingham-forest', 'Nottingham Forest', 'NFO', '#AC273D', '/clubs/nottingham-forest.svg'],
  ['aston-villa', 'Aston Villa', 'AVL', '#752B4D', '/clubs/aston-villa.svg'],
  ['atalanta', 'Atalanta', 'ATA', '#255192', '/clubs/atalanta.svg'],
  ['wolfsburg-w', 'VfL Wolfsburg (W)', 'WOBW', '#397A35', '/clubs/wolfsburg-w.svg'],
  ['real-sociedad', 'Real Sociedad', 'RSO', '#275F96', '/clubs/real-sociedad.svg'],
  ['portland-thorns-w', 'Portland Thorns FC (W)', 'PTFC', '#9C2937', '/clubs/portland-thorns-w.svg'],
  ['benfica', 'Benfica', 'SLB', '#A82539', '/clubs/benfica.svg'],
  ['san-diego-wave-w', 'San Diego Wave FC (W)', 'SDW', '#8F3B70', '/clubs/san-diego-wave-w.svg'],
];

export const clubCatalog = entries.map(([id, name, code, color, logo]) => ({
  id, name, code, color, logo,
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
