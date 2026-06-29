-- Universal DB Editor — PostgreSQL test seed
-- Run with:  psql -U postgres -d postgres -f postgres-seed.sql
-- Or paste into the Query Playground once connected.

-- ── Schema ───────────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS order_items CASCADE;
DROP TABLE IF EXISTS orders      CASCADE;
DROP TABLE IF EXISTS customers   CASCADE;
DROP TABLE IF EXISTS books       CASCADE;
DROP TABLE IF EXISTS authors     CASCADE;

CREATE TABLE authors (
  id         SERIAL PRIMARY KEY,
  name       TEXT    NOT NULL,
  country    TEXT    NOT NULL,
  birth_year SMALLINT
);

CREATE TABLE books (
  id         SERIAL PRIMARY KEY,
  title      TEXT    NOT NULL,
  author_id  INT     NOT NULL REFERENCES authors(id),
  genre      TEXT    NOT NULL,
  price      NUMERIC(8,2) NOT NULL,
  stock      INT     NOT NULL DEFAULT 0,
  published  DATE
);

CREATE TABLE customers (
  id      SERIAL PRIMARY KEY,
  name    TEXT   NOT NULL,
  email   TEXT   NOT NULL UNIQUE,
  city    TEXT,
  joined  DATE   NOT NULL
);

CREATE TABLE orders (
  id          SERIAL PRIMARY KEY,
  customer_id INT  NOT NULL REFERENCES customers(id),
  placed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  status      TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','shipped','delivered','cancelled'))
);

CREATE TABLE order_items (
  id         SERIAL PRIMARY KEY,
  order_id   INT          NOT NULL REFERENCES orders(id),
  book_id    INT          NOT NULL REFERENCES books(id),
  quantity   INT          NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price NUMERIC(8,2) NOT NULL
);

-- ── Data ─────────────────────────────────────────────────────────────────────

INSERT INTO authors (name, country, birth_year) VALUES
  ('George Orwell',              'United Kingdom', 1903),
  ('Toni Morrison',              'United States',  1931),
  ('Haruki Murakami',            'Japan',          1949),
  ('Gabriel García Márquez',     'Colombia',       1927),
  ('Chimamanda Ngozi Adichie',   'Nigeria',        1977);

INSERT INTO books (title, author_id, genre, price, stock, published) VALUES
  ('1984',                          1, 'Dystopian',       9.99, 42, '1949-06-08'),
  ('Animal Farm',                   1, 'Satire',          7.99, 30, '1945-08-17'),
  ('Beloved',                       2, 'Historical',     12.99, 18, '1987-09-02'),
  ('Song of Solomon',               2, 'Literary',       11.99, 25, '1977-09-12'),
  ('Norwegian Wood',                3, 'Literary',       13.99, 35, '1987-09-04'),
  ('Kafka on the Shore',            3, 'Magical Realism',14.99, 20, '2002-09-12'),
  ('One Hundred Years of Solitude', 4, 'Magical Realism',15.99, 15, '1967-05-30'),
  ('Love in the Time of Cholera',   4, 'Romance',        13.49, 22, '1985-11-05'),
  ('Purple Hibiscus',               5, 'Literary',       10.99, 40, '2003-10-01'),
  ('Americanah',                    5, 'Contemporary',   12.49, 33, '2013-05-14');

INSERT INTO customers (name, email, city, joined) VALUES
  ('Alice Sharma',  'alice@example.com',  'Mumbai',    '2023-01-15'),
  ('Bob Tanaka',    'bob@example.com',    'Tokyo',     '2023-03-22'),
  ('Carol Osei',    'carol@example.com',  'Accra',     '2023-06-10'),
  ('David Miller',  'david@example.com',  'New York',  '2023-07-04'),
  ('Eva Kowalski',  'eva@example.com',    'Warsaw',    '2023-09-18'),
  ('Frank Santos',  'frank@example.com',  'São Paulo', '2024-01-02'),
  ('Grace Kim',     'grace@example.com',  'Seoul',     '2024-02-14'),
  ('Hiro Yamamoto', 'hiro@example.com',   'Osaka',     '2024-03-30');

INSERT INTO orders (customer_id, placed_at, status) VALUES
  (1, '2024-01-10 09:00:00+00', 'delivered'),
  (1, '2024-03-05 14:30:00+00', 'delivered'),
  (2, '2024-02-14 11:00:00+00', 'delivered'),
  (3, '2024-03-20 08:45:00+00', 'shipped'),
  (4, '2024-04-01 16:00:00+00', 'delivered'),
  (5, '2024-04-15 10:20:00+00', 'pending'),
  (6, '2024-05-02 13:00:00+00', 'delivered'),
  (7, '2024-05-18 09:30:00+00', 'shipped'),
  (8, '2024-06-01 15:00:00+00', 'pending');

INSERT INTO order_items (order_id, book_id, quantity, unit_price) VALUES
  (1, 1,  1,  9.99),
  (1, 5,  1, 13.99),
  (2, 7,  1, 15.99),
  (2, 9,  2, 10.99),
  (3, 2,  1,  7.99),
  (3, 6,  1, 14.99),
  (4, 3,  1, 12.99),
  (5, 10, 1, 12.49),
  (5, 4,  1, 11.99),
  (6, 8,  2, 13.49),
  (7, 1,  3,  9.99),
  (8, 5,  1, 13.99),
  (8, 7,  1, 15.99),
  (9, 9,  1, 10.99);

-- ── Quick sanity check ───────────────────────────────────────────────────────
SELECT 'authors'     AS tbl, COUNT(*) FROM authors
UNION ALL
SELECT 'books',       COUNT(*) FROM books
UNION ALL
SELECT 'customers',   COUNT(*) FROM customers
UNION ALL
SELECT 'orders',      COUNT(*) FROM orders
UNION ALL
SELECT 'order_items', COUNT(*) FROM order_items;
