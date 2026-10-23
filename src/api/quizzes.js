function parseOptions(raw) {
  try { return JSON.parse(raw); } catch { return []; }
}

// Valida y limpia un quiz recibido del cliente. Devuelve { error } o { quiz }.
function validateQuiz(body) {
  const title = String(body?.title || '').trim();
  if (!title || title.length > 80) return { error: 'El título es obligatorio (máximo 80 caracteres).' };
  const description = String(body?.description || '').trim().slice(0, 200);
  const category = String(body?.category || 'General').trim().slice(0, 40) || 'General';
  const list = body?.questions;
  if (!Array.isArray(list) || list.length < 1 || list.length > 50) return { error: 'Un quiz necesita entre 1 y 50 preguntas.' };
  const questions = [];
  for (const [i, q] of list.entries()) {
    const text = String(q?.text || '').trim();
    const options = Array.isArray(q?.options) ? q.options.map(o => String(o || '').trim()) : [];
    if (!text || text.length > 200) return { error: `La pregunta ${i + 1} necesita texto (máximo 200 caracteres).` };
    if (options.length < 2 || options.length > 4 || options.some(o => !o || o.length > 80)) return { error: `La pregunta ${i + 1} necesita de 2 a 4 opciones con texto.` };
    if (new Set(options.map(o => o.toLowerCase())).size !== options.length) return { error: `La pregunta ${i + 1} tiene opciones repetidas.` };
    if (!Number.isInteger(q.correct) || q.correct < 0 || q.correct >= options.length) return { error: `La pregunta ${i + 1} necesita una respuesta correcta.` };
    questions.push({ text, options, correct: q.correct });
  }
  return { quiz: { title, description, category, isPublic: !!body.isPublic, questions } };
}

function createQuizStore(db) {
  const q = {
    insertQuiz: db.prepare('INSERT INTO quizzes (owner_id, title, description, category, is_public, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'),
    insertQuestion: db.prepare('INSERT INTO questions (quiz_id, pos, text, options, correct, category) VALUES (?, ?, ?, ?, ?, ?)'),
    deleteQuestions: db.prepare('DELETE FROM questions WHERE quiz_id = ?'),
    update: db.prepare('UPDATE quizzes SET title = ?, description = ?, category = ?, is_public = ? WHERE id = ?'),
    remove: db.prepare('DELETE FROM quizzes WHERE id = ?'),
    byId: db.prepare('SELECT * FROM quizzes WHERE id = ?'),
    questions: db.prepare('SELECT text, options, correct FROM questions WHERE quiz_id = ? ORDER BY pos'),
  };

  const withTx = fn => (...args) => {
    db.exec('BEGIN');
    try { const out = fn(...args); db.exec('COMMIT'); return out; } catch (e) { db.exec('ROLLBACK'); throw e; }
  };

  const writeQuestions = (id, quiz) => quiz.questions.forEach((x, i) => q.insertQuestion.run(id, i, x.text, JSON.stringify(x.options), x.correct, quiz.category));

  const create = withTx((ownerId, quiz, source = 'user') => {
    const { lastInsertRowid } = q.insertQuiz.run(ownerId, quiz.title, quiz.description, quiz.category, quiz.isPublic ? 1 : 0, source, Date.now());
    writeQuestions(lastInsertRowid, quiz);
    return Number(lastInsertRowid);
  });

  const replace = withTx((id, quiz) => {
    q.update.run(quiz.title, quiz.description, quiz.category, quiz.isPublic ? 1 : 0, id);
    q.deleteQuestions.run(id);
    writeQuestions(id, quiz);
  });

  function load(id) {
    const row = q.byId.get(id);
    if (!row) return null;
    const questions = q.questions.all(id).map(x => ({ text: x.text, options: parseOptions(x.options), correct: x.correct }));
    return { id: row.id, ownerId: row.owner_id, title: row.title, description: row.description, category: row.category, isPublic: !!row.is_public, source: row.source, questions };
  }

  // Lista con filtros. mine: solo los del usuario; si no, solo los públicos.
  function list({ userId = null, mine = false, text = '', category = '', limit = 60, offset = 0 }) {
    const where = [];
    const params = [];
    if (mine) { where.push('q.owner_id = ?'); params.push(userId); } else { where.push('q.is_public = 1'); }
    if (text) { where.push("(q.title LIKE ? ESCAPE '\\' OR q.description LIKE ? ESCAPE '\\')"); const t = `%${text.replace(/[\\%_]/g, m => '\\' + m)}%`; params.push(t, t); }
    if (category) { where.push('q.category = ?'); params.push(category); }
    const sql = `SELECT q.id, q.owner_id, q.title, q.description, q.category, q.is_public, q.source,
      (SELECT COUNT(*) FROM questions WHERE quiz_id = q.id) AS question_count, u.username AS author
      FROM quizzes q LEFT JOIN users u ON u.id = q.owner_id WHERE ${where.join(' AND ')} ORDER BY q.created_at DESC, q.id DESC LIMIT ? OFFSET ?`;
    return db.prepare(sql).all(...params, Math.min(100, limit), Math.max(0, offset)).map(r => ({
      id: r.id, title: r.title, description: r.description, category: r.category, isPublic: !!r.is_public, source: r.source,
      questionCount: r.question_count, author: r.author || (r.source === 'user' ? 'Anónimo' : 'Playground'), mine: userId != null && r.owner_id === userId,
    }));
  }

  const categories = () => db.prepare('SELECT category, COUNT(*) AS n FROM quizzes WHERE is_public = 1 GROUP BY category ORDER BY category').all().map(r => ({ name: r.category, count: r.n }));

  return { create, replace, load, list, categories, remove: id => q.remove.run(id) };
}

module.exports = { createQuizStore, validateQuiz };
