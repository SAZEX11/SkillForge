// Prevent double submits on every form and show a loading state.
document.querySelectorAll('form').forEach(function (form) {
  form.addEventListener('submit', function () {
    var btn = form.querySelector('button[type="submit"]');
    if (btn) { btn.disabled = true; btn.classList.add('is-loading'); }
  });
});

// Confirmation dialogs for destructive buttons: <button data-confirm="Are you sure?">
document.addEventListener('click', function (e) {
  var el = e.target.closest('[data-confirm]');
  if (el && !window.confirm(el.getAttribute('data-confirm'))) e.preventDefault();
});

// Responsive application sidebar: open/close on small screens.
(function () {
  var toggle = document.getElementById('sidebarToggle');
  var scrim = document.getElementById('sidebarScrim');
  var sidebar = document.getElementById('appSidebar');
  if (!toggle || !sidebar) return;

  function closeSidebar() {
    document.body.classList.remove('sidebar-open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Open navigation');
  }
  toggle.addEventListener('click', function () {
    var isOpen = document.body.classList.toggle('sidebar-open');
    toggle.setAttribute('aria-expanded', String(isOpen));
    toggle.setAttribute('aria-label', isOpen ? 'Close navigation' : 'Open navigation');
  });
  if (scrim) scrim.addEventListener('click', closeSidebar);
  sidebar.querySelectorAll('a').forEach(function (link) {
    link.addEventListener('click', closeSidebar);
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') closeSidebar();
  });
})();
