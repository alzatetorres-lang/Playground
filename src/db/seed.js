const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');

// Baraja determinista para que las opciones no queden siempre en la misma posición.
function shuffle(list, rand = Math.random) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// preguntas_trivia.json guarda la respuesta como texto; el motor usa el índice.
function fromTrivia(item) {
  const correct = item.opciones.indexOf(item.respuesta_correcta);
  if (correct < 0) return null;
  return { text: item.pregunta, options: item.opciones, correct, category: item.categoria, difficulty: null };
}

// El banco de 1500 conceptos asume una imagen. Se juega como texto con la pista de la imagen.
function fromBank(item, rand) {
  const k = item.kahoot;
  const options = shuffle(k.opciones, rand);
  const correct = options.indexOf(k.respuesta_correcta);
  if (correct < 0) return null;
  return { text: `${k.imagen_pista} ¿De qué se trata?`, options, correct, category: item.tema, difficulty: item.dificultad };
}

function insertQuiz(db, { title, description, category, source, questions }) {
  if (!questions.length) return;
  const now = Date.now();
  const { lastInsertRowid: quizId } = db
    .prepare('INSERT INTO quizzes (owner_id, title, description, category, is_public, source, created_at) VALUES (NULL, ?, ?, ?, 1, ?, ?)')
    .run(title, description, category, source, now);
  const ins = db.prepare('INSERT INTO questions (quiz_id, pos, text, options, correct, category, difficulty) VALUES (?, ?, ?, ?, ?, ?, ?)');
  questions.forEach((q, i) => ins.run(quizId, i, q.text, JSON.stringify(q.options), q.correct, q.category, q.difficulty));
}

function seed(db, { rand = Math.random } = {}) {
  const count = db.prepare('SELECT COUNT(*) AS n FROM quizzes').get().n;
  if (count > 0) return { seeded: false };

  db.exec('BEGIN');
  try {
    const triviaFile = path.join(root, 'data', 'seed', 'preguntas_trivia.json');
    if (fs.existsSync(triviaFile)) {
      const items = JSON.parse(fs.readFileSync(triviaFile, 'utf8'));
      const byCategory = new Map();
      for (const it of items) {
        // Las preguntas con imagen se saltan hasta que existan los archivos.
        if (it.tiene_imagen) continue;
        const q = fromTrivia(it);
        if (!q) continue;
        if (!byCategory.has(it.categoria)) byCategory.set(it.categoria, []);
        byCategory.get(it.categoria).push(q);
      }
      for (const [category, questions] of byCategory) {
        insertQuiz(db, { title: `Trivia: ${category}`, description: `${questions.length} preguntas de ${category}.`, category, source: 'trivia', questions });
      }
    }

    const bankFile = path.join(root, 'banco-preguntas', 'questions_1500.json');
    if (fs.existsSync(bankFile)) {
      const bank = JSON.parse(fs.readFileSync(bankFile, 'utf8')).questions;
      const byTheme = new Map();
      const insWord = db.prepare('INSERT INTO words (word, hint, theme, difficulty) VALUES (?, ?, ?, ?)');
      for (const it of bank) {
        const q = fromBank(it, rand);
        if (q) {
          if (!byTheme.has(it.tema)) byTheme.set(it.tema, []);
          byTheme.get(it.tema).push(q);
        }
        insWord.run(it.pictionary.solucion, it.pictionary.pista_referencia, it.tema, it.dificultad);
      }
      for (const [theme, questions] of byTheme) {
        insertQuiz(db, { title: `Banco: ${theme}`, description: `${questions.length} preguntas de ${theme}.`, category: theme, source: 'banco', questions });
      }
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return { seeded: true };
}

module.exports = { seed, fromTrivia, fromBank, shuffle };
