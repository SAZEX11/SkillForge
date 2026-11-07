-- SkillForge - development seed data (safe to re-run; empties every table first)
-- Run with:  npm run db:seed
--
-- DEVELOPMENT CREDENTIALS (never use in production):
--   admin@skillforge.dev    Admin@12345     (admin)
--   manager@skillforge.dev  Manager@12345   (content manager)
--   alice@skillforge.dev    User@12345      (learner, has data)
--   bob@skillforge.dev      User@12345      (learner, empty)
--   carol@skillforge.dev    User@12345      (learner, empty)

BEGIN;

TRUNCATE TABLE
  audit_logs, notifications, user_achievements, achievements, progress, roadmap_items, roadmaps,
  learning_resources, attempt_answers, assessment_attempts, assessment_questions, assessments,
  question_skills, question_options, questions, user_skills, skills, skill_categories,
  password_resets, user_roles, users, roles
RESTART IDENTITY CASCADE;

INSERT INTO roles (name) VALUES ('user'), ('content_manager'), ('admin');

INSERT INTO users (name, email, password_hash, status, career_goal, bio, created_at) VALUES
  ('Ava Admin',     'admin@skillforge.dev',   crypt('Admin@12345',   gen_salt('bf', 10)), 'active', 'Software Engineer',    'Platform administrator.',                          NOW() - INTERVAL '60 days'),
  ('Marco Manager', 'manager@skillforge.dev', crypt('Manager@12345', gen_salt('bf', 10)), 'active', 'Software Engineer',    'Content manager who curates questions.',           NOW() - INTERVAL '45 days'),
  ('Alice Johnson', 'alice@skillforge.dev',   crypt('User@12345',    gen_salt('bf', 10)), 'active', 'Full Stack Developer', 'Aspiring full stack developer learning in public.', NOW() - INTERVAL '14 days'),
  ('Bob Smith',     'bob@skillforge.dev',     crypt('User@12345',    gen_salt('bf', 10)), 'active', 'Backend Developer',    'Interested in APIs and databases.',                NOW() - INTERVAL '6 days'),
  ('Carol Davis',   'carol@skillforge.dev',   crypt('User@12345',    gen_salt('bf', 10)), 'active', 'Frontend Developer',   'Designer moving into frontend engineering.',       NOW() - INTERVAL '2 days');

INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id
FROM (VALUES
  ('admin@skillforge.dev', 'admin'), ('admin@skillforge.dev', 'content_manager'), ('admin@skillforge.dev', 'user'),
  ('manager@skillforge.dev', 'content_manager'), ('manager@skillforge.dev', 'user'),
  ('alice@skillforge.dev', 'user'), ('bob@skillforge.dev', 'user'), ('carol@skillforge.dev', 'user')
) AS m(email, role_name)
JOIN users u ON u.email = m.email
JOIN roles r ON r.name = m.role_name;

INSERT INTO skill_categories (name, description) VALUES
  ('Programming',          'Core programming concepts and computational thinking.'),
  ('Web Development',      'Fundamentals of building pages for the web.'),
  ('Database',             'Relational data modelling and querying.'),
  ('Backend Development',  'Server-side applications, APIs and security.'),
  ('Frontend Development', 'Browser-side interactivity and user interfaces.'),
  ('DevOps',               'Tooling for collaboration, delivery and operations.'),
  ('Software Engineering', 'Professional engineering practices and problem solving.');

INSERT INTO skills (category_id, name, description, threshold)
SELECT c.id, v.name, v.description, v.threshold
FROM (VALUES
  ('Programming',          'JavaScript',       'Language fundamentals, scope, closures and asynchronous programming.', 75),
  ('Programming',          'Data Structures',  'Stacks, queues, hash tables and algorithmic complexity.',              65),
  ('Web Development',      'HTML',             'Semantic markup, accessibility and document structure.',               70),
  ('Web Development',      'CSS',              'Layout, the box model, specificity and responsive styling.',           70),
  ('Frontend Development', 'DOM Manipulation', 'Selecting elements, handling events and updating the page.',          70),
  ('Backend Development',  'Node.js',          'Runtime model, modules, the event loop and environment config.',       70),
  ('Backend Development',  'Express.js',       'Routing, middleware and request handling.',                            70),
  ('Backend Development',  'REST APIs',        'Resource design, HTTP semantics and status codes.',                    70),
  ('Backend Development',  'Authentication',   'Password storage, sessions and common web attacks.',                   70),
  ('Database',             'SQL',              'Querying, joins, aggregation and safe query practices.',               75),
  ('Database',             'PostgreSQL',       'Data types, transactions, indexing and PostgreSQL features.',          70),
  ('DevOps',               'Git',              'Version control workflows, branching and collaboration.',              70),
  ('Software Engineering', 'Problem Solving',  'Decomposition, complexity analysis and algorithmic thinking.',         65)
) AS v(category_name, name, description, threshold)
JOIN skill_categories c ON c.name = v.category_name;

INSERT INTO achievements (name, description, rule_key, icon) VALUES
  ('First Assessment',  'Complete your first skill assessment.',                            'first_assessment',  'fa-flag-checkered'),
  ('Assessment Master', 'Complete 5 assessments.',                                          'assessment_master', 'fa-medal'),
  ('7 Day Learner',     'Stay active on SkillForge 7 days in a row.',                       'seven_day_learner', 'fa-fire'),
  ('Roadmap Starter',   'Generate your first personalized roadmap.',                        'roadmap_starter',   'fa-route'),
  ('Skill Improver',    'Improve a skill score by at least 10 points between assessments.', 'skill_improver',    'fa-arrow-trend-up'),
  ('Perfect Score',     'Score 100% on an assessment.',                                     'perfect_score',     'fa-bullseye'),
  ('Learning Explorer', 'Complete 5 roadmap items.',                                        'learning_explorer', 'fa-compass'),
  ('Roadmap Finisher',  'Complete every item in a roadmap.',                                'roadmap_finisher',  'fa-trophy'),
  ('Skill Champion',    'Reach a score of 80 or higher in 5 different skills.',             'skill_champion',    'fa-crown');

-- Helper: insert a question, its options and skill mappings. p_correct = 1-based correct option.
CREATE FUNCTION pg_temp.seed_question(
  p_text TEXT, p_difficulty TEXT, p_explanation TEXT, p_skills TEXT[], p_options TEXT[], p_correct INT
) RETURNS VOID AS $$
DECLARE
  v_question_id INT;
  v_mapped      INT;
  i             INT;
BEGIN
  INSERT INTO questions (text, type, difficulty, explanation, status, created_by)
  VALUES (p_text, 'multiple_choice', p_difficulty, p_explanation, 'active',
          (SELECT id FROM users WHERE email = 'manager@skillforge.dev'))
  RETURNING id INTO v_question_id;

  FOR i IN 1..array_length(p_options, 1) LOOP
    INSERT INTO question_options (question_id, option_text, is_correct)
    VALUES (v_question_id, p_options[i], i = p_correct);
  END LOOP;

  INSERT INTO question_skills (question_id, skill_id)
  SELECT v_question_id, id FROM skills WHERE name = ANY(p_skills);
  GET DIAGNOSTICS v_mapped = ROW_COUNT;

  IF v_mapped <> array_length(p_skills, 1) THEN
    RAISE EXCEPTION 'Unknown skill in seed question "%": %', p_text, p_skills;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- JavaScript
SELECT pg_temp.seed_question('What does typeof null return in JavaScript?', 'beginner',
  'This is a long-standing quirk of the language: typeof null returns "object" even though null is a primitive value.',
  ARRAY['JavaScript'], ARRAY['"null"', '"undefined"', '"object"', '"number"'], 3);
SELECT pg_temp.seed_question('Which statement about variables declared with const is correct?', 'beginner',
  'const prevents reassignment of the binding, but an object it refers to can still be mutated.',
  ARRAY['JavaScript'], ARRAY['The binding cannot be reassigned, but an object it refers to can still be mutated', 'The value can never change under any circumstances', 'const variables are hoisted and initialised with undefined', 'const can only hold primitive values'], 1);
SELECT pg_temp.seed_question('What is a closure in JavaScript?', 'intermediate',
  'A closure keeps access to variables from the scope where the function was created, even after that scope has finished.',
  ARRAY['JavaScript'], ARRAY['A function that has no return value', 'A block of code wrapped in curly braces', 'A function bundled with references to the variables in its surrounding scope', 'A method that closes a browser window'], 3);
SELECT pg_temp.seed_question('What does the await keyword do inside an async function?', 'intermediate',
  'await pauses only that async function until the promise settles; the main thread stays free to run other work.',
  ARRAY['JavaScript'], ARRAY['It blocks the entire JavaScript thread until the promise resolves', 'It pauses that function until the promise settles, without blocking the main thread', 'It converts a promise into a callback', 'It runs the promise on a separate operating-system thread'], 2);
SELECT pg_temp.seed_question('If one promise passed to Promise.all() rejects, what happens?', 'advanced',
  'Promise.all rejects as soon as any input promise rejects. Use Promise.allSettled when you need every outcome.',
  ARRAY['JavaScript'], ARRAY['Promise.all waits for every promise, then resolves with only the successes', 'The rejection is ignored and the remaining results are returned', 'The program crashes with a SyntaxError', 'The returned promise rejects immediately with that reason'], 4);
SELECT pg_temp.seed_question('Which approach finds duplicate values in an array in a single pass?', 'intermediate',
  'A Set offers average O(1) lookups, so you can detect repeats while iterating once, giving O(n) time overall.',
  ARRAY['JavaScript', 'Problem Solving'], ARRAY['Compare every pair of elements with a nested loop', 'Track seen values in a Set while iterating', 'Convert the array to a string and search it', 'Sort the array twice and compare the results'], 2);

-- DOM Manipulation
SELECT pg_temp.seed_question('Which method returns the first element that matches a CSS selector?', 'beginner',
  'document.querySelector() accepts any CSS selector and returns the first matching element, or null.',
  ARRAY['DOM Manipulation'], ARRAY['document.querySelector()', 'document.getElementsByTag()', 'document.findElement()', 'document.selectFirst()'], 1);
SELECT pg_temp.seed_question('What is event delegation?', 'intermediate',
  'Because events bubble, one listener on a parent can handle events from many children, including ones added later.',
  ARRAY['DOM Manipulation'], ARRAY['Assigning each child element its own separate listener', 'Preventing an event from reaching any listener', 'Attaching one listener to a parent and handling events from its children as they bubble up', 'Dispatching events to a different browser tab'], 3);

-- HTML
SELECT pg_temp.seed_question('Which HTML element is intended for a block of primary navigation links?', 'beginner',
  'The nav element is a semantic landmark that helps screen readers and search engines understand the page.',
  ARRAY['HTML'], ARRAY['<navigate>', '<menu-bar>', '<links>', '<nav>'], 4);
SELECT pg_temp.seed_question('Why is the alt attribute important on img elements?', 'beginner',
  'alt text gives screen-reader users a description and is shown when the image fails to load.',
  ARRAY['HTML'], ARRAY['It sets the width of the image', 'It provides a text alternative for screen readers and for when the image fails to load', 'It makes the image load faster', 'It turns the image into a link'], 2);

-- CSS
SELECT pg_temp.seed_question('With box-sizing: border-box, what does an element width include?', 'intermediate',
  'border-box makes the declared width include content, padding and border, which makes layout maths far more predictable.',
  ARRAY['CSS'], ARRAY['Content only', 'Content and margin', 'Content, padding and border', 'Content, padding, border and margin'], 3);
SELECT pg_temp.seed_question('Which declaration turns an element into a flex container?', 'beginner',
  'display: flex enables the flexbox layout model for the element''s direct children.',
  ARRAY['CSS'], ARRAY['position: flex;', 'display: flex;', 'layout: flexbox;', 'flex: container;'], 2);

-- Node.js
SELECT pg_temp.seed_question('Which statement best describes how Node.js handles concurrency?', 'intermediate',
  'Node runs JavaScript on a single thread and delegates I/O to the system via the event loop, keeping calls non-blocking.',
  ARRAY['Node.js'], ARRAY['It creates a new operating-system thread for every incoming request', 'It requires every I/O call to block until it finishes', 'It automatically forks a new process per request', 'It runs JavaScript on a single thread and uses an event loop for non-blocking I/O'], 4);
SELECT pg_temp.seed_question('How do you read an environment variable named PORT in Node.js?', 'beginner',
  'Environment variables are exposed as properties of process.env.',
  ARRAY['Node.js'], ARRAY['process.env.PORT', 'env.get("PORT")', 'os.PORT', 'global.PORT'], 1);

-- Express.js
SELECT pg_temp.seed_question('What does calling next() do in an Express middleware function?', 'intermediate',
  'next() hands control to the next middleware or route handler in the chain. Without it (or a response) the request hangs.',
  ARRAY['Express.js'], ARRAY['Ends the response immediately', 'Passes control to the next middleware or route handler', 'Restarts the current request from the beginning', 'Skips all remaining middleware and sends a 404'], 2);
SELECT pg_temp.seed_question('Where does Express expose the :id value in a route such as /users/:id?', 'beginner',
  'Named route parameters are available on req.params.',
  ARRAY['Express.js'], ARRAY['req.query.id', 'req.body.id', 'req.params.id', 'res.locals.id'], 3);

-- REST APIs
SELECT pg_temp.seed_question('Which HTTP status code should be returned after successfully creating a new resource?', 'beginner',
  '201 Created signals that the request succeeded and a new resource now exists.',
  ARRAY['REST APIs'], ARRAY['200 OK', '201 Created', '204 No Content', '302 Found'], 2);
SELECT pg_temp.seed_question('Which HTTP method is idempotent and is typically used to replace a resource?', 'intermediate',
  'PUT replaces a resource, and repeating the same PUT leaves the server in the same state.',
  ARRAY['REST APIs'], ARRAY['POST', 'PATCH', 'PUT', 'CONNECT'], 3);

-- Authentication
SELECT pg_temp.seed_question('Why are passwords hashed with an algorithm such as bcrypt instead of being stored encrypted?', 'intermediate',
  'Hashing is one-way, and bcrypt is deliberately slow and salted, so stolen hashes are expensive to crack.',
  ARRAY['Authentication'], ARRAY['Encrypted passwords take up more database storage', 'Hashes can be decrypted with a key when users forget their password', 'bcrypt removes the need for HTTPS', 'Hashing is one-way, and bcrypt is slow and salted, making stolen hashes costly to crack'], 4);
SELECT pg_temp.seed_question('In session-based authentication, what does the browser cookie normally contain?', 'beginner',
  'The cookie holds only an opaque session identifier. The server looks up the real session data using it.',
  ARRAY['Authentication'], ARRAY['The user password in plain text', 'A session identifier that the server maps to stored session data', 'The full user record as JSON', 'The database connection string'], 2);
SELECT pg_temp.seed_question('What is a CSRF attack?', 'intermediate',
  'Cross-site request forgery abuses the browser''s automatic cookie sending. Anti-CSRF tokens and SameSite cookies mitigate it.',
  ARRAY['Authentication'], ARRAY['Injecting malicious SQL into a form field', 'Guessing passwords with automated login attempts', 'Tricking the browser of a logged-in user into sending an unwanted request to a site that trusts it', 'Intercepting unencrypted traffic on a shared network'], 3);

-- SQL
SELECT pg_temp.seed_question('Which join returns every row from the left table, even when there is no matching row on the right?', 'beginner',
  'LEFT JOIN keeps all left-table rows and fills right-table columns with NULL when nothing matches.',
  ARRAY['SQL'], ARRAY['INNER JOIN', 'LEFT JOIN', 'CROSS JOIN', 'SELF JOIN'], 2);
SELECT pg_temp.seed_question('What is the difference between WHERE and HAVING?', 'intermediate',
  'WHERE filters individual rows before grouping; HAVING filters groups after aggregates are computed.',
  ARRAY['SQL'], ARRAY['HAVING filters rows before grouping, while WHERE filters groups', 'They are interchangeable aliases', 'WHERE only works with numeric columns', 'WHERE filters rows before grouping, while HAVING filters groups after aggregation'], 4);
SELECT pg_temp.seed_question('What is the most reliable way to prevent SQL injection in application code?', 'beginner',
  'Parameterized queries keep user data separate from the SQL text, so input can never change the query structure.',
  ARRAY['SQL', 'Authentication'], ARRAY['Hiding database error messages', 'Escaping quotes by hand in every string', 'Blocking the word SELECT in user input', 'Using parameterized queries (prepared statements)'], 4);
SELECT pg_temp.seed_question('What does COUNT(column_name) do with NULL values?', 'intermediate',
  'COUNT(*) counts rows, while COUNT(column) counts only rows where that column is not NULL.',
  ARRAY['SQL'], ARRAY['It counts them as zero', 'It raises an error', 'It skips rows where the column is NULL', 'It treats them as empty strings'], 3);

-- PostgreSQL
SELECT pg_temp.seed_question('Which PostgreSQL data type stores JSON in a binary format that supports indexing?', 'intermediate',
  'JSONB is stored in a decomposed binary form and supports GIN indexes, unlike the plain-text JSON type.',
  ARRAY['PostgreSQL'], ARRAY['XML', 'TEXT[]', 'JSONB', 'JSON'], 3);
SELECT pg_temp.seed_question('What does ROLLBACK do in a PostgreSQL transaction?', 'beginner',
  'ROLLBACK discards every change made since BEGIN, leaving the database as it was before the transaction.',
  ARRAY['PostgreSQL', 'SQL'], ARRAY['Undoes all changes made since the transaction began', 'Commits all changes made so far', 'Deletes the table being used', 'Restarts the database server'], 1);
SELECT pg_temp.seed_question('What is the main trade-off of adding an index to a table?', 'intermediate',
  'Indexes speed up reads on the indexed columns but cost extra storage and slow down inserts, updates and deletes.',
  ARRAY['PostgreSQL'], ARRAY['Faster writes and slower reads', 'Faster reads on indexed columns, but slower writes and extra storage', 'Indexes make a table read-only', 'There is no trade-off'], 2);

-- Git
SELECT pg_temp.seed_question('Which command creates a new branch and switches to it?', 'beginner',
  'git switch -c <name> (or the older git checkout -b <name>) creates and switches in one step.',
  ARRAY['Git'], ARRAY['git merge feature', 'git branch -d feature', 'git switch -c feature', 'git stash feature'], 3);
SELECT pg_temp.seed_question('What does git pull do?', 'intermediate',
  'git pull is a fetch followed by a merge (or rebase) of the remote changes into the current branch.',
  ARRAY['Git'], ARRAY['Fetches remote changes and merges them into the current branch', 'Uploads local commits to the remote', 'Creates a brand new repository', 'Deletes the remote branch'], 1);

-- Data Structures
SELECT pg_temp.seed_question('Which data structure follows the last-in, first-out (LIFO) principle?', 'beginner',
  'A stack removes the most recently added item first, like a stack of plates.',
  ARRAY['Data Structures'], ARRAY['Queue', 'Linked list', 'Hash map', 'Stack'], 4);
SELECT pg_temp.seed_question('What is the average-case time complexity of looking up a key in a hash table?', 'intermediate',
  'A good hash function spreads keys evenly, giving average O(1) lookups (worst case O(n) with many collisions).',
  ARRAY['Data Structures'], ARRAY['O(n)', 'O(log n)', 'O(1)', 'O(n log n)'], 3);

-- Problem Solving
SELECT pg_temp.seed_question('What is the time complexity of binary search on a sorted array?', 'intermediate',
  'Each step halves the search space, so the work grows logarithmically: O(log n).',
  ARRAY['Problem Solving', 'Data Structures'], ARRAY['O(log n)', 'O(n)', 'O(n^2)', 'O(1)'], 1);
SELECT pg_temp.seed_question('When facing a large, unfamiliar problem, what is the most effective first step?', 'beginner',
  'Decomposing a problem into smaller, well-defined sub-problems makes it tractable and testable.',
  ARRAY['Problem Solving'], ARRAY['Start coding immediately and fix issues later', 'Break it into smaller, well-defined sub-problems', 'Search for a complete ready-made solution', 'Wait until every requirement is perfectly known'], 2);

DROP FUNCTION pg_temp.seed_question(TEXT, TEXT, TEXT, TEXT[], TEXT[], INT);

INSERT INTO learning_resources (skill_id, title, description, resource_type, url, difficulty)
SELECT s.id, v.title, v.description, v.resource_type, v.url, v.difficulty
FROM (VALUES
  ('JavaScript',       'MDN JavaScript Guide',               'Comprehensive reference-style guide to the language from variables to modules.',        'Documentation', 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide', 'beginner'),
  ('JavaScript',       'The Modern JavaScript Tutorial',     'Step-by-step tutorial covering closures, prototypes and classes with exercises.',      'Tutorial',      'https://javascript.info/', 'intermediate'),
  ('JavaScript',       'Promises and Async/Await',           'Deep dive into promises, chaining and async patterns.',                                'Article',       'https://javascript.info/promise-basics', 'advanced'),
  ('DOM Manipulation', 'Document and DOM Basics',            'Learn to walk, search and modify the DOM tree.',                                       'Tutorial',      'https://javascript.info/document', 'beginner'),
  ('DOM Manipulation', 'MDN Document Object Model',          'Official reference for DOM interfaces, events and nodes.',                             'Documentation', 'https://developer.mozilla.org/en-US/docs/Web/API/Document_Object_Model', 'intermediate'),
  ('HTML',             'MDN HTML Reference',                 'Authoritative reference for every HTML element and attribute.',                        'Documentation', 'https://developer.mozilla.org/en-US/docs/Web/HTML', 'beginner'),
  ('HTML',             'Learn HTML - web.dev',               'Short lessons on semantic structure, forms, media and accessibility.',                 'Tutorial',      'https://web.dev/learn/html', 'intermediate'),
  ('CSS',              'MDN CSS Reference',                  'Complete documentation of CSS properties, selectors and layout modules.',              'Documentation', 'https://developer.mozilla.org/en-US/docs/Web/CSS', 'beginner'),
  ('CSS',              'Learn CSS - web.dev',                'Modern CSS course covering the box model, layout, specificity and responsive design.', 'Tutorial',      'https://web.dev/learn/css', 'intermediate'),
  ('CSS',              'Flexbox Froggy',                     'A playful game that teaches CSS flexbox through practice.',                            'Practice',      'https://flexboxfroggy.com/', 'beginner'),
  ('Node.js',          'Introduction to Node.js',            'Official getting-started guide to the Node.js runtime.',                               'Tutorial',      'https://nodejs.org/en/learn/getting-started/introduction-to-nodejs', 'beginner'),
  ('Node.js',          'Node.js API Documentation',          'Official API reference for core modules such as fs, http and events.',                 'Documentation', 'https://nodejs.org/docs/latest/api/', 'intermediate'),
  ('Express.js',       'Express Getting Started',            'Install Express and build your first routes and middleware.',                          'Tutorial',      'https://expressjs.com/en/starter/installing.html', 'beginner'),
  ('Express.js',       'Express Routing Guide',              'Detailed guide to route methods, parameters and routers.',                             'Documentation', 'https://expressjs.com/en/guide/routing.html', 'intermediate'),
  ('REST APIs',        'What is REST?',                      'Plain-language overview of REST constraints and resource design.',                     'Article',       'https://restfulapi.net/', 'beginner'),
  ('REST APIs',        'Project-Based Learning Index',       'Curated list of build-it-yourself projects including REST API and full stack apps.',   'Project',       'https://github.com/practical-tutorials/project-based-learning', 'advanced'),
  ('Authentication',   'OWASP Password Storage Cheat Sheet', 'Practical guidance on hashing and storing passwords securely.',                       'Article',       'https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html', 'intermediate'),
  ('Authentication',   'OWASP Authentication Cheat Sheet',   'Security checklist for login flows, sessions and recovery.',                           'Documentation', 'https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html', 'advanced'),
  ('SQL',              'PostgreSQL SQL Tutorial',            'Official introduction to SQL queries, joins and aggregates.',                          'Tutorial',      'https://www.postgresql.org/docs/current/tutorial-sql.html', 'beginner'),
  ('SQL',              'SQLBolt Interactive Lessons',        'Hands-on SQL exercises you run in the browser.',                                       'Practice',      'https://sqlbolt.com/', 'intermediate'),
  ('PostgreSQL',       'PostgreSQL Data Definition Guide',   'Tables, constraints, schemas and data types explained.',                               'Documentation', 'https://www.postgresql.org/docs/current/ddl.html', 'intermediate'),
  ('PostgreSQL',       'PostgreSQL Indexes',                 'How indexes work and when to use each index type.',                                    'Documentation', 'https://www.postgresql.org/docs/current/indexes.html', 'advanced'),
  ('Git',              'Pro Git Book',                       'The definitive free book on Git, from basics to internals.',                           'Documentation', 'https://git-scm.com/book/en/v2', 'beginner'),
  ('Git',              'Learn Git Branching',                'Interactive visual playground for branching, merging and rebasing.',                   'Practice',      'https://learngitbranching.js.org/', 'intermediate'),
  ('Data Structures',  'Data Structures Tutorials',          'Overviews of arrays, stacks, queues, trees and graphs.',                               'Tutorial',      'https://www.geeksforgeeks.org/data-structures/', 'beginner'),
  ('Data Structures',  'VisuAlgo',                           'Animated visualisations of data structures and algorithms.',                           'Practice',      'https://visualgo.net/en', 'intermediate'),
  ('Problem Solving',  'Exercism JavaScript Track',          'Mentored coding exercises that build problem-solving habits.',                         'Practice',      'https://exercism.org/tracks/javascript', 'beginner'),
  ('Problem Solving',  'Codewars Kata',                      'Community-made coding challenges ranked by difficulty.',                               'Practice',      'https://www.codewars.com/', 'intermediate')
) AS v(skill_name, title, description, resource_type, url, difficulty)
JOIN skills s ON s.name = v.skill_name;

INSERT INTO assessments (title, description, time_limit, status, created_by)
SELECT v.title, v.description, v.time_limit, 'published', u.id
FROM (VALUES
  ('JavaScript Fundamentals Assessment', 'Test your command of core JavaScript, the DOM, data structures and problem-solving.', 25),
  ('Backend Development Assessment', 'Evaluate your knowledge of Node.js, Express, REST API design and authentication security.', 30),
  ('SQL & PostgreSQL Assessment', 'Check your skills in querying, transactions, indexing and PostgreSQL features.', 20),
  ('Full Stack Web Development Assessment', 'A broad check across HTML, CSS, the DOM, Git, REST APIs, authentication and SQL.', 35)
) AS v(title, description, time_limit)
CROSS JOIN users u WHERE u.email = 'manager@skillforge.dev';

-- Marks weight difficulty: beginner = 1, intermediate = 2, advanced = 3.
INSERT INTO assessment_questions (assessment_id, question_id, question_order, marks)
SELECT picked.assessment_id, picked.question_id,
       ROW_NUMBER() OVER (PARTITION BY picked.assessment_id ORDER BY picked.weight, picked.question_id),
       picked.weight::NUMERIC
FROM (
  SELECT DISTINCT a.id AS assessment_id, q.id AS question_id,
         CASE q.difficulty WHEN 'beginner' THEN 1 WHEN 'intermediate' THEN 2 ELSE 3 END AS weight
  FROM (VALUES
    ('JavaScript Fundamentals Assessment', ARRAY['JavaScript', 'DOM Manipulation', 'Data Structures', 'Problem Solving']::TEXT[]),
    ('Backend Development Assessment', ARRAY['Node.js', 'Express.js', 'REST APIs', 'Authentication']::TEXT[]),
    ('SQL & PostgreSQL Assessment', ARRAY['SQL', 'PostgreSQL']::TEXT[]),
    ('Full Stack Web Development Assessment', ARRAY['HTML', 'CSS', 'Git', 'DOM Manipulation', 'REST APIs', 'Authentication', 'SQL']::TEXT[])
  ) AS sets(title, skill_names)
  JOIN assessments a      ON a.title = sets.title
  JOIN skills s           ON s.name = ANY(sets.skill_names)
  JOIN question_skills qs ON qs.skill_id = s.id
  JOIN questions q        ON q.id = qs.question_id
) AS picked;

-- Sample completed attempt for Alice so her dashboard has real data (every third question wrong).
DO $$
DECLARE
  v_user       INT := (SELECT id FROM users WHERE email = 'alice@skillforge.dev');
  v_assessment INT := (SELECT id FROM assessments WHERE title = 'JavaScript Fundamentals Assessment');
  v_attempt    INT;
  v_total      NUMERIC;
  v_earned     NUMERIC;
BEGIN
  INSERT INTO assessment_attempts (assessment_id, user_id, started_at, expires_at, status)
  VALUES (v_assessment, v_user, NOW() - INTERVAL '3 days', NOW() - INTERVAL '3 days' + INTERVAL '25 minutes', 'in_progress')
  RETURNING id INTO v_attempt;

  INSERT INTO attempt_answers (attempt_id, question_id, selected_option_id, is_correct, marks_awarded)
  SELECT v_attempt, aq.question_id, o.id, o.is_correct, CASE WHEN o.is_correct THEN aq.marks ELSE 0 END
  FROM assessment_questions aq
  JOIN LATERAL (
    SELECT qo.id, qo.is_correct FROM question_options qo
    WHERE qo.question_id = aq.question_id AND qo.is_correct = (aq.question_order % 3 <> 0)
    ORDER BY qo.id LIMIT 1
  ) o ON TRUE
  WHERE aq.assessment_id = v_assessment;

  SELECT SUM(aq.marks), SUM(aa.marks_awarded) INTO v_total, v_earned
  FROM assessment_questions aq
  JOIN attempt_answers aa ON aa.question_id = aq.question_id AND aa.attempt_id = v_attempt
  WHERE aq.assessment_id = v_assessment;

  UPDATE assessment_attempts
     SET status = 'completed', completed_at = started_at + INTERVAL '14 minutes',
         total_marks = v_total, earned_marks = v_earned, score = ROUND(v_earned / v_total * 100, 2)
   WHERE id = v_attempt;

  INSERT INTO user_skills (user_id, skill_id, score, last_assessed_at)
  SELECT v_user, s.id, ROUND(SUM(aa.marks_awarded) / SUM(aq.marks) * 100, 2), NOW() - INTERVAL '3 days' + INTERVAL '14 minutes'
  FROM attempt_answers aa
  JOIN assessment_questions aq ON aq.assessment_id = v_assessment AND aq.question_id = aa.question_id
  JOIN question_skills qs ON qs.question_id = aa.question_id
  JOIN skills s ON s.id = qs.skill_id
  WHERE aa.attempt_id = v_attempt
  GROUP BY s.id;
END;
$$;

INSERT INTO user_achievements (user_id, achievement_id, earned_at)
SELECT u.id, a.id, NOW() - INTERVAL '3 days'
FROM users u JOIN achievements a ON a.rule_key = 'first_assessment'
WHERE u.email = 'alice@skillforge.dev';

-- Alice's attempt is id 1 because TRUNCATE ... RESTART IDENTITY ran above.
INSERT INTO notifications (user_id, title, message, is_read, link, created_at)
SELECT u.id, n.title, n.message, n.is_read, n.link, NOW() - n.age
FROM (VALUES
  ('alice@skillforge.dev', 'Welcome to SkillForge',           'Your account is ready. Take your first assessment to see where you stand.', TRUE,  '/assessments',       INTERVAL '14 days'),
  ('alice@skillforge.dev', 'Your assessment result is ready', 'Your JavaScript Fundamentals Assessment has been scored. See how you did.', TRUE,  '/attempts/1/result', INTERVAL '3 days'),
  ('alice@skillforge.dev', 'You earned a new achievement',    'You unlocked "First Assessment". Keep going!',                              FALSE, '/achievements',      INTERVAL '3 days'),
  ('alice@skillforge.dev', 'Generate your roadmap',           'Your skill scores are in. Generate a personalized learning roadmap.',       FALSE, '/roadmap',           INTERVAL '2 days'),
  ('bob@skillforge.dev',   'Welcome to SkillForge',           'Your account is ready. Take your first assessment to see where you stand.', FALSE, '/assessments',       INTERVAL '6 days'),
  ('carol@skillforge.dev', 'Welcome to SkillForge',           'Your account is ready. Take your first assessment to see where you stand.', FALSE, '/assessments',       INTERVAL '2 days')
) AS n(email, title, message, is_read, link, age)
JOIN users u ON u.email = n.email;

INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, old_data, new_data, created_at) VALUES
  ((SELECT id FROM users WHERE email = 'admin@skillforge.dev'), 'USER_CREATED', 'user', (SELECT id FROM users WHERE email = 'manager@skillforge.dev'),
   NULL, jsonb_build_object('email', 'manager@skillforge.dev', 'role', 'content_manager'), NOW() - INTERVAL '45 days'),
  ((SELECT id FROM users WHERE email = 'admin@skillforge.dev'), 'ROLE_CHANGED', 'user', (SELECT id FROM users WHERE email = 'manager@skillforge.dev'),
   jsonb_build_object('roles', jsonb_build_array('user')), jsonb_build_object('roles', jsonb_build_array('user', 'content_manager')), NOW() - INTERVAL '44 days'),
  ((SELECT id FROM users WHERE email = 'manager@skillforge.dev'), 'QUESTION_CREATED', 'question', (SELECT MIN(id) FROM questions),
   NULL, jsonb_build_object('text', 'What does typeof null return in JavaScript?', 'difficulty', 'beginner'), NOW() - INTERVAL '40 days'),
  ((SELECT id FROM users WHERE email = 'manager@skillforge.dev'), 'ASSESSMENT_CREATED', 'assessment', (SELECT id FROM assessments WHERE title = 'JavaScript Fundamentals Assessment'),
   NULL, jsonb_build_object('title', 'JavaScript Fundamentals Assessment', 'status', 'draft'), NOW() - INTERVAL '39 days'),
  ((SELECT id FROM users WHERE email = 'manager@skillforge.dev'), 'ASSESSMENT_UPDATED', 'assessment', (SELECT id FROM assessments WHERE title = 'JavaScript Fundamentals Assessment'),
   jsonb_build_object('status', 'draft'), jsonb_build_object('status', 'published'), NOW() - INTERVAL '38 days'),
  ((SELECT id FROM users WHERE email = 'manager@skillforge.dev'), 'RESOURCE_CREATED', 'resource', (SELECT MIN(id) FROM learning_resources),
   NULL, jsonb_build_object('title', 'MDN JavaScript Guide', 'resource_type', 'Documentation'), NOW() - INTERVAL '37 days'),
  ((SELECT id FROM users WHERE email = 'admin@skillforge.dev'), 'USER_UPDATED', 'user', (SELECT id FROM users WHERE email = 'bob@skillforge.dev'),
   jsonb_build_object('career_goal', NULL), jsonb_build_object('career_goal', 'Backend Developer'), NOW() - INTERVAL '5 days');

COMMIT;
