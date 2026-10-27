const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
// Sube este número cuando cambie el banco de preguntas: se reimporta sin tocar los quizzes de usuarios.
const SEED_VERSION = 3;
// Palabras para dibujar: una sola palabra, de 4 a 14 letras.
const isDrawableWord = w => /^[\p{L}]{4,14}$/u.test(w);

// Baraja las opciones para que la correcta no caiga siempre en la misma posición.
function shuffle(list, rand = Math.random) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const imageUrl = file => (file ? `/img/questions/${path.basename(file)}` : null);

// Una entrada del banco, ya sea una pregunta de trivia (sin bloque pictionary) o un concepto de Kahoot/Pictionary.
function fromBank(item, rand) {
  const k = item.kahoot;
  const options = shuffle(k.opciones, rand);
  const correct = options.indexOf(k.respuesta_correcta);
  if (correct < 0) return null;
  const isTrivia = !item.pictionary;
  return {
    // Los conceptos de Kahoot asumían una imagen; se juegan como texto con la pista de la imagen.
    text: isTrivia ? k.pregunta : `${k.imagen_pista} ¿De qué se trata?`,
    options, correct,
    category: isTrivia ? (k.categoria_origen || item.tema) : item.tema,
    difficulty: item.dificultad,
    image: isTrivia ? imageUrl(k.url_imagen) : null,
    isTrivia,
  };
}

function insertQuiz(db, { title, description, category, source, questions }) {
  if (!questions.length) return;
  const { lastInsertRowid: quizId } = db
    .prepare('INSERT INTO quizzes (owner_id, title, description, category, is_public, source, created_at) VALUES (NULL, ?, ?, ?, 1, ?, ?)')
    .run(title, description, category, source, Date.now());
  const ins = db.prepare('INSERT INTO questions (quiz_id, pos, text, options, correct, category, difficulty, image) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  questions.forEach((q, i) => ins.run(quizId, i, q.text, JSON.stringify(q.options), q.correct, q.category, q.difficulty, q.image));
}

function seed(db, { rand = Math.random } = {}) {
  const version = db.prepare('PRAGMA user_version').get().user_version;
  if (version >= SEED_VERSION) return { seeded: false };

  const bankFile = path.join(root, 'banco-preguntas', 'questions_1500.json');
  if (!fs.existsSync(bankFile)) return { seeded: false };
  const bank = JSON.parse(fs.readFileSync(bankFile, 'utf8')).questions;

  db.exec('BEGIN');
  try {
    // Solo se reemplaza lo que viene del banco; los quizzes de usuarios se conservan.
    db.exec("DELETE FROM quizzes WHERE source IN ('trivia', 'banco')");
    db.exec('DELETE FROM words');

    const groups = new Map();
    const seenConcepts = new Set();
    const seenWords = new Set();
    const insWord = db.prepare('INSERT INTO words (word, hint, theme, difficulty) VALUES (?, ?, ?, ?)');

    for (const item of bank) {
      const q = fromBank(item, rand);
      if (!q) continue;
      if (!q.isTrivia) {
        // El banco repite cada concepto con distintas opciones: se juega una sola vez.
        const key = item.concepto.trim().toLowerCase();
        if (seenConcepts.has(key)) continue;
        seenConcepts.add(key);
        const w = item.pictionary.solucion.trim();
        if (isDrawableWord(w) && !seenWords.has(w.toLowerCase())) {
          seenWords.add(w.toLowerCase());
          insWord.run(w, item.pictionary.pista_referencia, item.tema, item.dificultad);
        }
      }
      const groupKey = `${q.isTrivia ? 'trivia' : 'banco'}|${q.category}`;
      if (!groups.has(groupKey)) groups.set(groupKey, []);
      groups.get(groupKey).push(q);
    }

    for (const [groupKey, questions] of groups) {
      const [source, category] = groupKey.split('|');
      insertQuiz(db, {
        title: `${source === 'trivia' ? 'Trivia' : 'Banco'}: ${category}`,
        description: `${questions.length} preguntas de ${category}.`,
        category, source, questions,
      });
    }
    db.exec(`PRAGMA user_version = ${SEED_VERSION}`);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return { seeded: true };
}

module.exports = { seed, fromBank, shuffle };
