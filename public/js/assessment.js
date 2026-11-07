(function () {
  var exam = document.getElementById('exam');
  if (!exam) return;
  var attemptId = exam.dataset.attemptId;
  var csrf = exam.dataset.csrf;
  var questions = Array.prototype.slice.call(exam.querySelectorAll('.question'));
  var prev = document.getElementById('prev-btn');
  var next = document.getElementById('next-btn');
  var submitBtn = document.getElementById('submit-btn');
  var submitForm = document.getElementById('submit-form');
  var timerEl = document.getElementById('timer');
  var status = document.getElementById('save-status');
  var position = document.getElementById('exam-position');
  var bar = document.getElementById('exam-progress');
  var index = 0;
  var secondsLeft = parseInt(exam.dataset.secondsLeft, 10);
  var submitting = false;

  function show(i) {
    index = i;
    questions.forEach(function (q, n) { q.hidden = n !== i; });
    position.textContent = 'Question ' + (i + 1) + ' of ' + questions.length;
    bar.style.width = ((i + 1) / questions.length * 100) + '%';
    prev.disabled = i === 0;
    next.hidden = i === questions.length - 1;
    submitBtn.hidden = i !== questions.length - 1;
  }

  function save(questionId, optionId) {
    status.textContent = 'Saving...';
    fetch('/attempts/' + attemptId + '/answer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ _csrf: csrf, question_id: questionId, option_id: optionId })
    }).then(function (res) {
      status.textContent = res.ok ? 'Answer saved.' : 'Could not save this answer. Check your connection.';
    }).catch(function () { status.textContent = 'Could not save this answer. Check your connection.'; });
  }

  exam.addEventListener('change', function (e) {
    if (e.target.type !== 'radio') return;
    save(e.target.closest('.question').dataset.questionId, e.target.value);
  });

  prev.addEventListener('click', function () { if (index > 0) show(index - 1); });
  next.addEventListener('click', function () { if (index < questions.length - 1) show(index + 1); });

  submitForm.addEventListener('submit', function (e) {
    if (submitting) return;
    var answered = exam.querySelectorAll('input[type="radio"]:checked').length;
    var message = answered < questions.length
      ? 'You have answered ' + answered + ' of ' + questions.length + ' questions. Submit anyway?'
      : 'Submit your assessment now?';
    if (!window.confirm(message)) e.preventDefault();
  });

  function tick() {
    var m = Math.max(0, Math.floor(secondsLeft / 60));
    var s = Math.max(0, secondsLeft % 60);
    timerEl.textContent = (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
    timerEl.classList.toggle('timer-low', secondsLeft <= 60);
    if (secondsLeft <= 0 && !submitting) {
      submitting = true; // the server re-checks the deadline and grades only saved answers
      submitForm.submit();
      return;
    }
    secondsLeft -= 1;
  }
  tick();
  setInterval(tick, 1000);
  show(0);
})();
