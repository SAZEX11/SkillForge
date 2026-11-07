const express = require('express');
const router = express.Router();
const page = (path, view, title) => router.get(path, (req, res) => res.render(view, { title }));
page('/about', 'public/about', 'About');
page('/features', 'public/features', 'Features');
page('/how-it-works', 'public/how-it-works', 'How it works');
page('/contact', 'public/contact', 'Contact');
module.exports = router;
