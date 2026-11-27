import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { clubCatalog, catalogClubForTeam } from './clubCatalog.js';

test('todos os clubes têm identificação própria, nota e escudo incluído no app', async () => {
  assert.equal(clubCatalog.length, 50);
  assert.equal(new Set(clubCatalog.map(club => club.id)).size, 50);
  for (const club of clubCatalog) {
    assert.match(club.code, /^[A-Z0-9]{2,4}$/);
    assert.ok(Number.isInteger(club.rating) && club.rating >= 0 && club.rating <= 100);
    assert.match(club.logo, /^\/clubs\/[a-z0-9-]+\.(?:svg|png)$/);
  }
  for (const logo of new Set(clubCatalog.map(club => club.logo))) {
    const file = await readFile(new URL('../public' + logo, import.meta.url));
    if (logo.endsWith('.svg')) assert.match(file.toString(), /<svg\b/, logo);
    else assert.equal(file.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', logo);
  }
});

test('clubes anteriores ao catálogo recebem o escudo pelo nome preservando a categoria', () => {
  assert.equal(catalogClubForTeam({ name: 'Atletico de Madrid' }).rating, 83);
  assert.equal(catalogClubForTeam({ name: 'Atlético de Madrid (W)' }).rating, 79);
  assert.equal(catalogClubForTeam({ name: 'Clube do bairro' }), undefined);
  assert.equal(catalogClubForTeam({ name: 'Meu clube', catalog_id: 'real-madrid' }).name, 'Real Madrid');
});
