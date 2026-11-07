// Show/hide toggle for password fields: <div class="pw"><input type="password"><button data-toggle-pw>
document.querySelectorAll('[data-toggle-pw]').forEach(function (btn) {
  btn.addEventListener('click', function () {
    var input = btn.parentElement.querySelector('input');
    var show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    btn.textContent = show ? 'Hide' : 'Show';
    btn.setAttribute('aria-pressed', String(show));
  });
});
