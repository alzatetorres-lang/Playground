const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;
const rooms = new Map();
const dataFile = path.join(__dirname, 'data', 'quizzes.json');
const demoQuiz = {
  id: 'demo-cultura', title: 'Cultura general', description: 'Una ronda rápida para empezar la fiesta.', isPublic: true,
  questions: [
    { text: '¿Cuál es el planeta más grande del sistema solar?', options: ['Marte', 'Júpiter', 'Saturno', 'Venus'], correct: 1 },
    { text: '¿En qué ciudad está la Torre Eiffel?', options: ['Roma', 'Londres', 'París', 'Lisboa'], correct: 2 },
    { text: '¿Cuántos lados tiene un hexágono?', options: ['Cinco', 'Seis', 'Siete', 'Ocho'], correct: 1 },
    { text: '¿Qué instrumento tiene normalmente 88 teclas?', options: ['Violín', 'Piano', 'Flauta', 'Guitarra'], correct: 1 },
    { text: '¿Cuál es el océano más grande?', options: ['Atlántico', 'Índico', 'Ártico', 'Pacífico'], correct: 3 }
  ]
};
function loadQuizzes() { try { return JSON.parse(fs.readFileSync(dataFile, 'utf8')); } catch { return [demoQuiz]; } }
let quizzes = loadQuizzes();
function saveQuizzes() { fs.mkdirSync(path.dirname(dataFile), { recursive: true }); fs.writeFileSync(dataFile, JSON.stringify(quizzes, null, 2)); }
function code() { let c; do c = Math.random().toString(36).slice(2, 7).toUpperCase(); while (rooms.has(c)); return c; }
function publicRoom(room) { return { code: room.code, hostId: room.hostId, status: room.status, title: room.quiz.title, players: [...room.players.values()].map(p => ({ id:p.id, name:p.name, score:p.score, connected:p.connected, powers:p.powers })), questionIndex: room.questionIndex, total: room.quiz.questions.length, settings: room.settings }; }
function emitRoom(room) { io.to(room.code).emit('room:update', publicRoom(room)); }
function emitQuestion(room) { const q = room.quiz.questions[room.questionIndex]; room.answers.clear(); room.roundEndsAt = Date.now() + room.settings.seconds * 1000; io.to(room.code).emit('game:question', { index: room.questionIndex, total: room.quiz.questions.length, text:q.text, options:q.options, endsAt:room.roundEndsAt }); clearTimeout(room.timer); room.timer=setTimeout(()=>finishRound(room), room.settings.seconds*1000); }
function startQuestion(room) { if (room.questionIndex >= room.quiz.questions.length) return finishGame(room); room.status='question'; emitRoom(room); emitQuestion(room); }
function finishRound(room) { if (room.status !== 'question') return; clearTimeout(room.timer); const q=room.quiz.questions[room.questionIndex]; const result=[]; for (const p of room.players.values()) { const a=room.answers.get(p.id); let points=0; if (a && a.answer === q.correct) { points=100 + Math.max(0, Math.round((room.roundEndsAt-a.at)/100)); if (a.double) points*=2; p.score+=points; } result.push({id:p.id,name:p.name,answer:a?.answer ?? null,points,score:p.score,double:a?.double??false}); } room.status='result'; io.to(room.code).emit('game:result',{correct:q.correct, results:result.sort((a,b)=>b.score-a.score), next:room.questionIndex+1<room.quiz.questions.length}); emitRoom(room); }
function finishGame(room) { room.status='finished'; clearTimeout(room.timer); const ranking=[...room.players.values()].sort((a,b)=>b.score-a.score).map((p,i)=>({ ...p, place:i+1 })); io.to(room.code).emit('game:finished',{ranking}); emitRoom(room); }
app.use(express.json()); app.use(express.static(path.join(__dirname,'public')));
app.get('/api/quizzes', (_req,res)=>res.json(quizzes.filter(q=>q.isPublic).map(({questions,...q})=>({...q, questionCount:questions.length}))));
app.post('/api/quizzes', (req,res)=>{ const {title,description='',questions,isPublic=false}=req.body; if(!title?.trim() || !Array.isArray(questions) || questions.length<1 || questions.some(q=>!q.text || !Array.isArray(q.options) || q.options.length<2 || !Number.isInteger(q.correct))) return res.status(400).json({error:'Revisa el título y las preguntas.'}); const quiz={id:Date.now().toString(36),title:title.trim(),description,questions,isPublic:!!isPublic}; quizzes.push(quiz); saveQuizzes(); res.status(201).json(quiz); });
app.get('*', (_req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
io.on('connection', socket=>{
 socket.on('room:create', ({quizId,settings},done)=>{ const quiz=quizzes.find(q=>q.id===quizId); if(!quiz) return done({error:'Quiz no encontrado'}); const room={code:code(),hostId:socket.id,quiz,settings:{seconds:Math.min(60,Math.max(10,Number(settings?.seconds)||20))},players:new Map(),status:'lobby',questionIndex:0,answers:new Map()}; rooms.set(room.code,room); socket.join(room.code); done({room:publicRoom(room)}); });
 socket.on('room:join', ({code:roomCode,name},done)=>{ const room=rooms.get(String(roomCode).toUpperCase()); if(!room) return done({error:'No existe esa sala.'}); if(room.status!=='lobby') return done({error:'La partida ya ha empezado.'}); if(room.players.size>=10) return done({error:'La sala está completa.'}); const clean=String(name||'').trim().slice(0,20); if(!clean) return done({error:'Escribe un nombre.'}); room.players.set(socket.id,{id:socket.id,name:clean,score:0,connected:true,powers:{double:true,shield:true,time:true}}); socket.join(room.code); emitRoom(room); done({room:publicRoom(room)}); });
 socket.on('game:start', ({code:roomCode},done)=>{ const room=rooms.get(roomCode); if(!room || room.hostId!==socket.id) return done?.({error:'Solo el anfitrión puede empezar.'}); if(room.players.size<1) return done?.({error:'Hace falta al menos un jugador.'}); startQuestion(room); });
 socket.on('game:answer', ({code:roomCode,answer,double},done)=>{ const room=rooms.get(roomCode), p=room?.players.get(socket.id); if(!room||!p||room.status!=='question'||room.answers.has(socket.id)) return; const usesDouble=!!double&&p.powers.double; if(usesDouble)p.powers.double=false; room.answers.set(socket.id,{answer:Number(answer),double:usesDouble,at:Date.now()}); done?.({ok:true}); if(room.answers.size===room.players.size) finishRound(room); });
 socket.on('game:next', ({code:roomCode})=>{ const room=rooms.get(roomCode); if(room?.hostId!==socket.id||room.status!=='result')return; room.questionIndex++; startQuestion(room); });
 socket.on('disconnect',()=>{ for(const room of rooms.values()) { const p=room.players.get(socket.id); if(p){p.connected=false;emitRoom(room);} } });
});
server.listen(PORT,()=>console.log(`Quiz Party listo en http://localhost:${PORT}`));
