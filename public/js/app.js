// --- Drag and Drop ---

let draggedTicket = null;

document.addEventListener('DOMContentLoaded', () => {
  initDragAndDrop();
  initTagAutocomplete();
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
  if (e.target === this) {
    this.classList.remove('drag-over');
  }
}

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';

  const list = this;
  const afterElement = getDragAfterElement(list, e.clientY);

  document.querySelectorAll('.drop-indicator').forEach(el => el.remove());

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

  const ticketIds = Array.from(this.querySelectorAll('.ticket')).map(t => parseInt(t.dataset.id));

  fetch('/api/tickets/reorder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ column_name: targetColumn, ticketIds })
  }).then(() => {
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

// --- Tag Autocomplete for Add Modal ---

let selectedTagIds = [];

function initTagAutocomplete() {
  const input = document.getElementById('add-tag-input');
  const dropdown = document.getElementById('add-tag-dropdown');
  if (!input || !dropdown) return;

  input.addEventListener('input', () => {
    const query = input.value.trim().toLowerCase();
    const allTags = window.__allTags || [];

    if (!query) {
      dropdown.classList.add('hidden');
      return;
    }

    const filtered = allTags.filter(tag =>
      tag.name.toLowerCase().includes(query) && !selectedTagIds.includes(tag.id)
    );

    if (filtered.length === 0) {
      dropdown.classList.add('hidden');
      return;
    }

    dropdown.innerHTML = '';
    filtered.forEach(tag => {
      const option = document.createElement('div');
      option.className = 'tag-autocomplete-option';
      option.innerHTML = `<span class="tag-color-dot" style="background:${tag.color}"></span>${tag.name}`;
      option.addEventListener('click', () => {
        selectTagForNewTicket(tag);
        input.value = '';
        dropdown.classList.add('hidden');
      });
      dropdown.appendChild(option);
    });
    dropdown.classList.remove('hidden');
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      dropdown.classList.add('hidden');
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const firstOption = dropdown.querySelector('.tag-autocomplete-option');
      if (firstOption && !dropdown.classList.contains('hidden')) {
        firstOption.click();
      }
    }
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.tag-autocomplete-wrapper')) {
      dropdown.classList.add('hidden');
    }
  });
}

function selectTagForNewTicket(tag) {
  if (selectedTagIds.includes(tag.id)) return;
  selectedTagIds.push(tag.id);

  const container = document.getElementById('add-selected-tags');
  const span = document.createElement('span');
  span.className = 'tag';
  span.style.backgroundColor = tag.color;
  span.dataset.tagId = tag.id;
  span.innerHTML = `${tag.name}<button type="button" class="tag-remove-btn" onclick="deselectTagForNewTicket(${tag.id})">&times;</button>`;
  container.appendChild(span);
}

function deselectTagForNewTicket(tagId) {
  selectedTagIds = selectedTagIds.filter(id => id !== tagId);
  const container = document.getElementById('add-selected-tags');
  const el = container.querySelector(`[data-tag-id="${tagId}"]`);
  if (el) el.remove();
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
  document.getElementById('add-tag-input').value = '';
  document.getElementById('add-tag-dropdown').classList.add('hidden');
  document.getElementById('add-selected-tags').innerHTML = '';
  selectedTagIds = [];
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
  }).then(res => res.json()).then(ticket => {
    if (selectedTagIds.length === 0) {
      location.reload();
      return;
    }
    // Add tags sequentially
    const addTagsSequentially = selectedTagIds.reduce((promise, tagId) => {
      return promise.then(() =>
        fetch(`/api/tickets/${ticket.id}/tags`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tagId })
        })
      );
    }, Promise.resolve());

    addTagsSequentially.then(() => location.reload());
  });
}

// --- Clear Done ---

function clearDone() {
  if (!confirm('Remove all done tickets? This cannot be undone.')) return;

  fetch('/api/tickets/done/clear', { method: 'DELETE' })
    .then(() => location.reload());
}

// --- Ticket Detail Side Panel ---

function openTicketPanel(ticketId) {
  const panel = document.getElementById('ticket-panel');
  const inner = document.getElementById('ticket-panel-inner');

  inner.innerHTML = '<p style="color:#6b6b6b;padding:20px;">Loading...</p>';
  panel.classList.add('open');

  fetch(`/api/tickets/${ticketId}`)
    .then(res => res.json())
    .then(data => {
      renderTicketPanel(data);
    });
}

function closeTicketPanel() {
  const panel = document.getElementById('ticket-panel');
  panel.classList.remove('open');
}

function formatDateStr(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function renderTicketPanel(data) {
  const { ticket, tags, allTags, comments } = data;
  const inner = document.getElementById('ticket-panel-inner');

  const badgeClass = `badge-${ticket.column_name}`;

  const tagsHtml = tags.map(t =>
    `<span class="tag" style="background-color:${t.color}" data-tag-id="${t.id}">
      ${t.name}
      <button class="tag-remove" onclick="panelRemoveTag(${ticket.id}, ${t.id})">&times;</button>
    </span>`
  ).join('');

  const tagOptions = allTags.map(t =>
    `<option value="${t.id}">${t.name}</option>`
  ).join('');

  const commentsHtml = comments.map(c =>
    `<div class="comment" data-comment-id="${c.id}">
      <div class="comment-body">${escapeHtml(c.body)}</div>
      <div class="comment-meta">
        ${formatDateStr(c.created_at)}
        <button class="btn-link btn-danger" onclick="panelDeleteComment(${c.id}, ${ticket.id})">Delete</button>
      </div>
    </div>`
  ).join('');

  inner.innerHTML = `
    <div class="ticket-detail-header">
      <h2 id="panel-ticket-title" contenteditable="true" data-id="${ticket.id}">${escapeHtml(ticket.title)}</h2>
      <span class="ticket-column-badge ${badgeClass}">${ticket.column_name}</span>
    </div>

    <div class="ticket-detail-meta">
      Created ${formatDateStr(ticket.created_at)}
    </div>

    <div class="ticket-section">
      <h3>Description</h3>
      <textarea id="panel-ticket-description" data-id="${ticket.id}" placeholder="Add a description..." rows="4">${escapeHtml(ticket.description || '')}</textarea>
      <button class="btn btn-primary btn-sm" onclick="panelSaveDescription()">Save</button>
    </div>

    <div class="ticket-section">
      <h3>Tags</h3>
      <div id="panel-ticket-tags" class="ticket-tags">
        ${tagsHtml}
      </div>
      <div class="tag-add-row">
        <select id="panel-tag-select">
          <option value="">Add a tag...</option>
          ${tagOptions}
        </select>
        <button class="btn btn-sm btn-primary" onclick="panelAddTag(${ticket.id})">Add</button>
        <button class="btn btn-sm btn-secondary" onclick="openTagModal()">Manage Tags</button>
      </div>
    </div>

    <div class="ticket-section">
      <h3>Comments</h3>
      <form onsubmit="panelAddComment(event, ${ticket.id})">
        <textarea id="panel-comment-body" placeholder="Write a comment..." rows="3" required></textarea>
        <button type="submit" class="btn btn-primary btn-sm">Add Comment</button>
      </form>
      <div id="panel-comments-list" class="comments-list">
        ${commentsHtml}
      </div>
    </div>

    <div class="ticket-section ticket-danger-zone">
      <button class="btn btn-danger" onclick="panelDeleteTicket(${ticket.id})">Delete Ticket</button>
    </div>
  `;

  // Set up title auto-save
  const titleEl = document.getElementById('panel-ticket-title');
  titleEl.addEventListener('blur', () => {
    const id = titleEl.dataset.id;
    const title = titleEl.textContent.trim();
    if (!title) return;
    fetch(`/api/tickets/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title })
    }).then(() => {
      // Update the card title on the board
      const card = document.querySelector(`.ticket[data-id="${id}"] .ticket-title a`);
      if (card) card.textContent = title;
      showFlash('Title saved');
    });
  });

  titleEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      titleEl.blur();
    }
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function panelSaveDescription() {
  const textarea = document.getElementById('panel-ticket-description');
  const id = textarea.dataset.id;

  fetch(`/api/tickets/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ description: textarea.value })
  }).then(() => {
    showFlash('Description saved');
  });
}

function panelAddTag(ticketId) {
  const select = document.getElementById('panel-tag-select');
  const tagId = select.value;
  if (!tagId) return;

  fetch(`/api/tickets/${ticketId}/tags`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tagId: parseInt(tagId) })
  }).then(() => {
    openTicketPanel(ticketId);
    location.reload();
  });
}

function panelRemoveTag(ticketId, tagId) {
  fetch(`/api/tickets/${ticketId}/tags/${tagId}`, { method: 'DELETE' })
    .then(() => {
      openTicketPanel(ticketId);
      location.reload();
    });
}

function panelAddComment(e, ticketId) {
  e.preventDefault();
  const body = document.getElementById('panel-comment-body').value.trim();
  if (!body) return;

  fetch(`/api/tickets/${ticketId}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body })
  }).then(() => {
    openTicketPanel(ticketId);
  });
}

function panelDeleteComment(commentId, ticketId) {
  if (!confirm('Delete this comment?')) return;
  fetch(`/api/comments/${commentId}`, { method: 'DELETE' })
    .then(() => {
      openTicketPanel(ticketId);
    });
}

function panelDeleteTicket(ticketId) {
  if (!confirm('Delete this ticket? This cannot be undone.')) return;
  fetch(`/api/tickets/${ticketId}`, { method: 'DELETE' })
    .then(() => {
      closeTicketPanel();
      location.reload();
    });
}

// --- Ticket Detail Page (for direct URL access) ---

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

// Save title on blur (ticket detail page)
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

// --- Tags (ticket detail page) ---

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

// --- Comments (ticket detail page) ---

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

// --- Delete Ticket (ticket detail page) ---

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
