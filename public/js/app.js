// --- Drag and Drop ---

let draggedTicket = null;

document.addEventListener('DOMContentLoaded', () => {
  initDragAndDrop();
});

function initDragAndDrop() {
  const tickets = document.querySelectorAll('.ticket[draggable]');
  const lists = document.querySelectorAll('.ticket-list');

  tickets.forEach(ticket => {
    ticket.addEventListener('dragstart', handleDragStart);
    ticket.addEventListener('dragend', handleDragEnd);
  });

  lists.forEach(list => {
    list.addEventListener('dragover', handleDragOver);
    list.addEventListener('dragenter', handleDragEnter);
    list.addEventListener('dragleave', handleDragLeave);
    list.addEventListener('drop', handleDrop);
  });
}

function handleDragStart(e) {
  draggedTicket = this;
  this.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', this.dataset.id);
}

function handleDragEnd() {
  this.classList.remove('dragging');
  document.querySelectorAll('.ticket-list').forEach(l => l.classList.remove('drag-over'));
  document.querySelectorAll('.drop-indicator').forEach(el => el.remove());
  draggedTicket = null;
}

function handleDragEnter(e) {
  e.preventDefault();
  this.classList.add('drag-over');
}

function handleDragLeave(e) {
  // Only remove if leaving the list itself, not a child
  if (e.target === this) {
    this.classList.remove('drag-over');
  }
}

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';

  const list = this;
  const afterElement = getDragAfterElement(list, e.clientY);

  // Remove old indicators
  document.querySelectorAll('.drop-indicator').forEach(el => el.remove());

  // Add indicator
  const indicator = document.createElement('div');
  indicator.classList.add('drop-indicator');

  if (afterElement) {
    list.insertBefore(indicator, afterElement);
  } else {
    list.appendChild(indicator);
  }
}

function handleDrop(e) {
  e.preventDefault();
  this.classList.remove('drag-over');
  document.querySelectorAll('.drop-indicator').forEach(el => el.remove());

  if (!draggedTicket) return;

  const targetColumn = this.dataset.column;
  const afterElement = getDragAfterElement(this, e.clientY);

  if (afterElement) {
    this.insertBefore(draggedTicket, afterElement);
  } else {
    this.appendChild(draggedTicket);
  }

  // Collect new order for this column
  const ticketIds = Array.from(this.querySelectorAll('.ticket')).map(t => parseInt(t.dataset.id));

  // Also update the source column if different
  const sourceList = document.querySelector(`.ticket-list[data-column="${draggedTicket.closest ? '' : ''}"]`);

  fetch('/api/tickets/reorder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ column_name: targetColumn, ticketIds })
  }).then(() => {
    // Update all columns to fix counts, reload
    location.reload();
  });
}

function getDragAfterElement(list, y) {
  const draggableElements = [...list.querySelectorAll('.ticket:not(.dragging)')];

  return draggableElements.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) {
      return { offset, element: child };
    }
    return closest;
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

// --- Add Ticket ---

function openAddModal(column) {
  document.getElementById('add-column').value = column;
  document.getElementById('add-modal').classList.remove('hidden');
  document.getElementById('add-title').focus();
}

function closeAddModal() {
  document.getElementById('add-modal').classList.add('hidden');
  document.getElementById('add-title').value = '';
}

function addTicket(e) {
  e.preventDefault();
  const title = document.getElementById('add-title').value.trim();
  const column_name = document.getElementById('add-column').value;
  if (!title) return;

  fetch('/api/tickets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, column_name })
  }).then(res => res.json()).then(() => {
    location.reload();
  });
}

// --- Clear Done ---

function clearDone() {
  if (!confirm('Remove all done tickets? This cannot be undone.')) return;

  fetch('/api/tickets/done/clear', { method: 'DELETE' })
    .then(() => location.reload());
}

// --- Ticket Detail Page ---

function saveDescription() {
  const textarea = document.getElementById('ticket-description');
  const id = textarea.dataset.id;

  fetch(`/api/tickets/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ description: textarea.value })
  }).then(() => {
    showFlash('Description saved');
  });
}

// Save title on blur
document.addEventListener('DOMContentLoaded', () => {
  const titleEl = document.getElementById('ticket-title');
  if (titleEl) {
    titleEl.addEventListener('blur', () => {
      const id = titleEl.dataset.id;
      const title = titleEl.textContent.trim();
      if (!title) return;

      fetch(`/api/tickets/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title })
      });
    });

    titleEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        titleEl.blur();
      }
    });
  }
});

// --- Tags ---

function addTagToTicket(ticketId) {
  const select = document.getElementById('tag-select');
  const tagId = select.value;
  if (!tagId) return;

  fetch(`/api/tickets/${ticketId}/tags`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tagId: parseInt(tagId) })
  }).then(() => location.reload());
}

function removeTag(ticketId, tagId) {
  fetch(`/api/tickets/${ticketId}/tags/${tagId}`, { method: 'DELETE' })
    .then(() => location.reload());
}

function openTagModal() {
  document.getElementById('tag-modal').classList.remove('hidden');
}

function closeTagModal() {
  document.getElementById('tag-modal').classList.add('hidden');
}

function addTag(e) {
  e.preventDefault();
  const name = document.getElementById('tag-name').value.trim();
  const color = document.getElementById('tag-color').value;
  if (!name) return;

  fetch('/api/tags', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, color })
  }).then(() => location.reload());
}

function deleteTag(tagId) {
  if (!confirm('Delete this tag from all tickets?')) return;
  fetch(`/api/tags/${tagId}`, { method: 'DELETE' })
    .then(() => location.reload());
}

// --- Comments ---

function addComment(e, ticketId) {
  e.preventDefault();
  const body = document.getElementById('comment-body').value.trim();
  if (!body) return;

  fetch(`/api/tickets/${ticketId}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body })
  }).then(() => location.reload());
}

function deleteComment(commentId) {
  if (!confirm('Delete this comment?')) return;
  fetch(`/api/comments/${commentId}`, { method: 'DELETE' })
    .then(() => location.reload());
}

// --- Delete Ticket ---

function deleteTicket(ticketId) {
  if (!confirm('Delete this ticket? This cannot be undone.')) return;
  fetch(`/api/tickets/${ticketId}`, { method: 'DELETE' })
    .then(() => { window.location.href = '/'; });
}

// --- Flash messages ---

function showFlash(msg) {
  let flash = document.getElementById('flash');
  if (!flash) {
    flash = document.createElement('div');
    flash.id = 'flash';
    document.body.appendChild(flash);
  }
  flash.textContent = msg;
  flash.classList.add('show');
  setTimeout(() => flash.classList.remove('show'), 2000);
}
