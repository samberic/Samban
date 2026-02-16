const express = require('express');
const { engine } = require('express-handlebars');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = 4567;

app.engine('handlebars', engine({
  defaultLayout: 'main',
  layoutsDir: path.join(__dirname, '..', 'views', 'layouts'),
  partialsDir: path.join(__dirname, '..', 'views', 'partials'),
  helpers: {
    json: (context) => JSON.stringify(context),
    eq: (a, b) => a === b,
    formatDate: (date) => {
      const d = new Date(date);
      return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    }
  }
}));
app.set('view engine', 'handlebars');
app.set('views', path.join(__dirname, '..', 'views'));

app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(express.json());

// --- Page routes ---

app.get('/', (req, res) => {
  const tickets = db.prepare(`
    SELECT t.*, GROUP_CONCAT(tg.name, '||') as tag_names, GROUP_CONCAT(tg.id, '||') as tag_ids, GROUP_CONCAT(tg.color, '||') as tag_colors
    FROM tickets t
    LEFT JOIN ticket_tags tt ON t.id = tt.ticket_id
    LEFT JOIN tags tg ON tt.tag_id = tg.id
    GROUP BY t.id
    ORDER BY t.position ASC
  `).all();

  const todo = [];
  const doing = [];
  const done = [];

  for (const ticket of tickets) {
    ticket.tags = [];
    if (ticket.tag_names) {
      const names = ticket.tag_names.split('||');
      const ids = ticket.tag_ids.split('||');
      const colors = ticket.tag_colors.split('||');
      for (let i = 0; i < names.length; i++) {
        ticket.tags.push({ id: ids[i], name: names[i], color: colors[i] });
      }
    }
    delete ticket.tag_names;
    delete ticket.tag_ids;
    delete ticket.tag_colors;

    if (ticket.column_name === 'todo') todo.push(ticket);
    else if (ticket.column_name === 'doing') doing.push(ticket);
    else done.push(ticket);
  }

  const allTags = db.prepare('SELECT * FROM tags ORDER BY name ASC').all();

  res.render('board', { todo, doing, done, allTags, doneCount: done.length });
});

app.get('/ticket/:id', (req, res) => {
  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(req.params.id);
  if (!ticket) return res.status(404).send('Not found');

  const tags = db.prepare(`
    SELECT tg.* FROM tags tg
    JOIN ticket_tags tt ON tg.id = tt.tag_id
    WHERE tt.ticket_id = ?
  `).all(req.params.id);

  const allTags = db.prepare('SELECT * FROM tags ORDER BY name ASC').all();

  const comments = db.prepare('SELECT * FROM comments WHERE ticket_id = ? ORDER BY created_at DESC').all(req.params.id);

  res.render('ticket', { ticket, tags, allTags, comments });
});

// --- API routes: Tickets ---

app.post('/api/tickets', (req, res) => {
  const { title, column_name } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: 'Title is required' });
  const col = column_name || 'todo';

  const maxPos = db.prepare('SELECT COALESCE(MAX(position), -1) as max FROM tickets WHERE column_name = ?').get(col);
  const position = maxPos.max + 1;

  const result = db.prepare('INSERT INTO tickets (title, column_name, position) VALUES (?, ?, ?)').run(title.trim(), col, position);
  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(result.lastInsertRowid);
  res.json(ticket);
});

app.put('/api/tickets/:id', (req, res) => {
  const { title, description } = req.body;
  const updates = [];
  const params = [];

  if (title !== undefined) { updates.push('title = ?'); params.push(title.trim()); }
  if (description !== undefined) { updates.push('description = ?'); params.push(description); }

  if (updates.length === 0) return res.status(400).json({ error: 'Nothing to update' });
  params.push(req.params.id);

  db.prepare(`UPDATE tickets SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(req.params.id);
  res.json(ticket);
});

app.delete('/api/tickets/:id', (req, res) => {
  db.prepare('DELETE FROM tickets WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.post('/api/tickets/move', (req, res) => {
  const { ticketId, targetColumn, newPosition } = req.body;

  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(ticketId);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

  const move = db.transaction(() => {
    // Remove from old position
    db.prepare('UPDATE tickets SET position = position - 1 WHERE column_name = ? AND position > ?')
      .run(ticket.column_name, ticket.position);

    // Make room in target column
    db.prepare('UPDATE tickets SET position = position + 1 WHERE column_name = ? AND position >= ?')
      .run(targetColumn, newPosition);

    // Place ticket
    db.prepare('UPDATE tickets SET column_name = ?, position = ? WHERE id = ?')
      .run(targetColumn, newPosition, ticketId);
  });

  move();
  res.json({ ok: true });
});

app.post('/api/tickets/reorder', (req, res) => {
  const { column_name, ticketIds } = req.body;

  const reorder = db.transaction(() => {
    for (let i = 0; i < ticketIds.length; i++) {
      db.prepare('UPDATE tickets SET position = ?, column_name = ? WHERE id = ?').run(i, column_name, ticketIds[i]);
    }
  });

  reorder();
  res.json({ ok: true });
});

// --- API routes: Clear done ---

app.delete('/api/tickets/done/clear', (req, res) => {
  db.prepare("DELETE FROM tickets WHERE column_name = 'done'").run();
  res.json({ ok: true });
});

// --- API routes: Tags ---

app.get('/api/tags', (req, res) => {
  const tags = db.prepare('SELECT * FROM tags ORDER BY name ASC').all();
  res.json(tags);
});

app.post('/api/tags', (req, res) => {
  const { name, color } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });

  try {
    const result = db.prepare('INSERT INTO tags (name, color) VALUES (?, ?)').run(name.trim(), color || '#f179af');
    const tag = db.prepare('SELECT * FROM tags WHERE id = ?').get(result.lastInsertRowid);
    res.json(tag);
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Tag already exists' });
    throw e;
  }
});

app.delete('/api/tags/:id', (req, res) => {
  db.prepare('DELETE FROM tags WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// --- API routes: Ticket tags ---

app.post('/api/tickets/:id/tags', (req, res) => {
  const { tagId } = req.body;
  try {
    db.prepare('INSERT INTO ticket_tags (ticket_id, tag_id) VALUES (?, ?)').run(req.params.id, tagId);
  } catch (e) {
    // ignore duplicate
  }
  res.json({ ok: true });
});

app.delete('/api/tickets/:id/tags/:tagId', (req, res) => {
  db.prepare('DELETE FROM ticket_tags WHERE ticket_id = ? AND tag_id = ?').run(req.params.id, req.params.tagId);
  res.json({ ok: true });
});

// --- API routes: Comments ---

app.get('/api/tickets/:id/comments', (req, res) => {
  const comments = db.prepare('SELECT * FROM comments WHERE ticket_id = ? ORDER BY created_at DESC').all(req.params.id);
  res.json(comments);
});

app.post('/api/tickets/:id/comments', (req, res) => {
  const { body } = req.body;
  if (!body || !body.trim()) return res.status(400).json({ error: 'Comment body is required' });

  const result = db.prepare('INSERT INTO comments (ticket_id, body) VALUES (?, ?)').run(req.params.id, body.trim());
  const comment = db.prepare('SELECT * FROM comments WHERE id = ?').get(result.lastInsertRowid);
  res.json(comment);
});

app.delete('/api/comments/:id', (req, res) => {
  db.prepare('DELETE FROM comments WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Kanban board running at http://localhost:${PORT}`);
});
