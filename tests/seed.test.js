const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { open } = require('../src/db');
const { seed } = require('../src/db/seed');

test('el banco se importa sin repetir conceptos y con imágenes', () => {
  const db = open(':memory:');
  assert.equal(seed(db).seeded, true);
  const concepts = new Set(JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'banco-preguntas', 'questions_1500.json'), 'utf8')).questions.filter(x => x.pictionary).map(x => x.concepto.trim().toLowerCase()));
  const bank = db.prepare("SELECT COUNT(*) AS n FROM questions q JOIN quizzes z ON z.id = q.quiz_id WHERE z.source = 'banco'").get().n;
  assert.equal(bank, concepts.size, 'una pregunta por concepto');
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM questions q JOIN quizzes z ON z.id = q.quiz_id WHERE z.source = 'trivia'").get().n, 60);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM questions WHERE image IS NOT NULL').get().n, 8);
  const words = db.prepare('SELECT word FROM words').all().map(w => w.word);
  assert.ok(words.length >= 80, 'quedan palabras suficientes');
  assert.ok(words.every(w => /^[\p{L}]{4,14}$/u.test(w)), 'todas son una sola palabra');
  for (const { image } of db.prepare('SELECT image FROM questions WHERE image IS NOT NULL').all()) {
    assert.ok(fs.existsSync(path.join(__dirname, '..', 'public', image)), `existe ${image}`);
  }
  // Una opción correcta existe siempre.
  for (const q of db.prepare('SELECT options, correct FROM questions').all()) assert.ok(JSON.parse(q.options)[q.correct] !== undefined);
});

test('reimportar conserva los quizzes de usuarios y migra bases antiguas', () => {
  const db = open(':memory:');
  seed(db);
  db.prepare("INSERT INTO quizzes (title, is_public, source, created_at) VALUES ('Mío', 0, 'user', 1)").run();
  db.exec('PRAGMA user_version = 1');
  assert.equal(seed(db).seeded, true);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM quizzes WHERE source = 'user'").get().n, 1);
  assert.equal(seed(db).seeded, false, 'no repite si ya está al día');
});
