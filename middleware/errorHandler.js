
function notFound(req, res) {
  res.status(404).render('errors/404', {
    title: 'Page not found',
    currentUser: null,
    flash: null,
    errors: [],
    path: req.path
  });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  console.error(err);

  const viewData = {
    title: 'Something went wrong',
    currentUser: null,
    flash: null,
    errors: [],
    path: req.path
  };

  if (err.status === 403) {
    return res.status(403).render('errors/403', viewData);
  }

  return res.status(500).render('errors/500', viewData);
}

module.exports = { notFound, errorHandler };
