// Landing page motion. Loaded in <head> so the "js" class is set before first paint.
(function () {
  document.documentElement.classList.add('js');

  document.addEventListener('DOMContentLoaded', function () {
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Quiz demo: the correct answer gets picked a moment after the step appears.
    var demo = document.querySelector('[data-demo-question]');
    var correct = demo && demo.querySelector('[data-correct]');
    if (correct && !reduce) correct.classList.remove('picked');

    function reveal(el) {
      el.classList.add('in');
      if (correct && !reduce && el.contains(demo)) {
        setTimeout(function () { correct.classList.add('picked'); }, 1000);
      }
    }

    var items = document.querySelectorAll('.reveal');
    if (reduce || !('IntersectionObserver' in window)) {
      items.forEach(function (el) { el.classList.add('in'); });
      if (correct) correct.classList.add('picked');
    } else {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) { reveal(e.target); io.unobserve(e.target); }
        });
      }, { threshold: 0.15, rootMargin: '0px 0px -6% 0px' });
      items.forEach(function (el) { io.observe(el); });
    }

    // Countdown in the quiz demo.
    var timer = document.querySelector('[data-timer]');
    if (timer && !reduce) {
      var left = 24 * 60 + 10;
      setInterval(function () {
        if (document.hidden) return;
        left = left > 0 ? left - 1 : 24 * 60 + 10;
        var m = Math.floor(left / 60), s = left % 60;
        timer.textContent = m + ':' + (s < 10 ? '0' : '') + s;
      }, 1000);
    }
  });
})();



document.addEventListener('DOMContentLoaded', () => {
  const revealItems = document.querySelectorAll('.sf-reveal');

  // Show content when it enters the screen.
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries, currentObserver) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('sf-visible');
          currentObserver.unobserve(entry.target);
        }
      });
    }, {
      threshold: 0.12
    });

    revealItems.forEach(item => observer.observe(item));
  } else {
    // Fallback for older browsers.
    revealItems.forEach(item => item.classList.add('sf-visible'));
  }
});
