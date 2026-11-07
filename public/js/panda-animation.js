document.addEventListener('DOMContentLoaded', function () {

    const panda = document.querySelector('.panda-mascot');

    if (!panda) return;

    const passwordFields = document.querySelectorAll(
        '[data-panda-password]'
    );

    function coverEyes() {
        panda.classList.add('is-covering');
    }

    function showEyes() {
        panda.classList.remove('is-covering');
    }

    passwordFields.forEach(function (field) {

        field.addEventListener('focus', coverEyes);

        field.addEventListener('blur', function () {

            // Check whether another password field receives focus.
            requestAnimationFrame(function () {

                const anotherPasswordFocused = Array.from(passwordFields)
                    .some(function (passwordField) {
                        return passwordField === document.activeElement;
                    });

                if (!anotherPasswordFocused) {
                    showEyes();
                }

            });

        });

    });

});