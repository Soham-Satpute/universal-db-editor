// Universal DB Editor — MongoDB test seed
// Run with:  mongosh mongodb://localhost:27017/bookstore mongo-seed.js
// Or paste collection by collection into mongosh interactively.

// ── Switch to (or create) the bookstore database ─────────────────────────────
use("bookstore");

// ── Drop existing collections for a clean seed ───────────────────────────────
db.authors.drop();
db.books.drop();
db.customers.drop();
db.orders.drop();

// ── Authors ──────────────────────────────────────────────────────────────────
db.authors.insertMany([
  { name: "George Orwell",             country: "United Kingdom", birthYear: 1903 },
  { name: "Toni Morrison",             country: "United States",  birthYear: 1931 },
  { name: "Haruki Murakami",           country: "Japan",          birthYear: 1949 },
  { name: "Gabriel García Márquez",    country: "Colombia",       birthYear: 1927 },
  { name: "Chimamanda Ngozi Adichie",  country: "Nigeria",        birthYear: 1977 },
]);

// Grab author IDs for use in books
const authors = db.authors.find().toArray();
const byName = (n) => authors.find((a) => a.name === n)._id;

// ── Books ─────────────────────────────────────────────────────────────────────
// Books embed a short author snapshot so reads are fast, but also store
// the authorId reference for joins when you need the full author document.
db.books.insertMany([
  {
    title: "1984",
    authorId: byName("George Orwell"),
    author: "George Orwell",
    genre: "Dystopian",
    price: 9.99,
    stock: 42,
    published: new Date("1949-06-08"),
    tags: ["classic", "political", "dystopia"],
  },
  {
    title: "Animal Farm",
    authorId: byName("George Orwell"),
    author: "George Orwell",
    genre: "Satire",
    price: 7.99,
    stock: 30,
    published: new Date("1945-08-17"),
    tags: ["classic", "political", "allegory"],
  },
  {
    title: "Beloved",
    authorId: byName("Toni Morrison"),
    author: "Toni Morrison",
    genre: "Historical",
    price: 12.99,
    stock: 18,
    published: new Date("1987-09-02"),
    tags: ["pulitzer", "slavery", "literary"],
  },
  {
    title: "Song of Solomon",
    authorId: byName("Toni Morrison"),
    author: "Toni Morrison",
    genre: "Literary",
    price: 11.99,
    stock: 25,
    published: new Date("1977-09-12"),
    tags: ["national-book-critics", "literary"],
  },
  {
    title: "Norwegian Wood",
    authorId: byName("Haruki Murakami"),
    author: "Haruki Murakami",
    genre: "Literary",
    price: 13.99,
    stock: 35,
    published: new Date("1987-09-04"),
    tags: ["coming-of-age", "romance", "japan"],
  },
  {
    title: "Kafka on the Shore",
    authorId: byName("Haruki Murakami"),
    author: "Haruki Murakami",
    genre: "Magical Realism",
    price: 14.99,
    stock: 20,
    published: new Date("2002-09-12"),
    tags: ["magical-realism", "japan", "surreal"],
  },
  {
    title: "One Hundred Years of Solitude",
    authorId: byName("Gabriel García Márquez"),
    author: "Gabriel García Márquez",
    genre: "Magical Realism",
    price: 15.99,
    stock: 15,
    published: new Date("1967-05-30"),
    tags: ["nobel", "magical-realism", "classic"],
  },
  {
    title: "Love in the Time of Cholera",
    authorId: byName("Gabriel García Márquez"),
    author: "Gabriel García Márquez",
    genre: "Romance",
    price: 13.49,
    stock: 22,
    published: new Date("1985-11-05"),
    tags: ["romance", "latin-america", "classic"],
  },
  {
    title: "Purple Hibiscus",
    authorId: byName("Chimamanda Ngozi Adichie"),
    author: "Chimamanda Ngozi Adichie",
    genre: "Literary",
    price: 10.99,
    stock: 40,
    published: new Date("2003-10-01"),
    tags: ["nigeria", "family", "coming-of-age"],
  },
  {
    title: "Americanah",
    authorId: byName("Chimamanda Ngozi Adichie"),
    author: "Chimamanda Ngozi Adichie",
    genre: "Contemporary",
    price: 12.49,
    stock: 33,
    published: new Date("2013-05-14"),
    tags: ["nigeria", "race", "identity", "immigration"],
  },
]);

// ── Customers ─────────────────────────────────────────────────────────────────
db.customers.insertMany([
  { name: "Alice Sharma",  email: "alice@example.com",  city: "Mumbai",    joined: new Date("2023-01-15") },
  { name: "Bob Tanaka",    email: "bob@example.com",    city: "Tokyo",     joined: new Date("2023-03-22") },
  { name: "Carol Osei",    email: "carol@example.com",  city: "Accra",     joined: new Date("2023-06-10") },
  { name: "David Miller",  email: "david@example.com",  city: "New York",  joined: new Date("2023-07-04") },
  { name: "Eva Kowalski",  email: "eva@example.com",    city: "Warsaw",    joined: new Date("2023-09-18") },
  { name: "Frank Santos",  email: "frank@example.com",  city: "São Paulo", joined: new Date("2024-01-02") },
  { name: "Grace Kim",     email: "grace@example.com",  city: "Seoul",     joined: new Date("2024-02-14") },
  { name: "Hiro Yamamoto", email: "hiro@example.com",   city: "Osaka",     joined: new Date("2024-03-30") },
]);

// ── Orders ────────────────────────────────────────────────────────────────────
// Orders embed full item snapshots (title + price at time of purchase)
// so they stay correct even if book prices change later.
const books = db.books.find().toArray();
const byTitle = (t) => books.find((b) => b.title === t);

const customers = db.customers.find().toArray();
const customer = (n) => customers.find((c) => c.name === n);

db.orders.insertMany([
  {
    customerId: customer("Alice Sharma")._id,
    customer:   "Alice Sharma",
    placedAt:   new Date("2024-01-10T09:00:00Z"),
    status:     "delivered",
    items: [
      { bookId: byTitle("1984")._id,          title: "1984",           quantity: 1, unitPrice: 9.99  },
      { bookId: byTitle("Norwegian Wood")._id, title: "Norwegian Wood", quantity: 1, unitPrice: 13.99 },
    ],
    total: 23.98,
  },
  {
    customerId: customer("Alice Sharma")._id,
    customer:   "Alice Sharma",
    placedAt:   new Date("2024-03-05T14:30:00Z"),
    status:     "delivered",
    items: [
      { bookId: byTitle("One Hundred Years of Solitude")._id, title: "One Hundred Years of Solitude", quantity: 1, unitPrice: 15.99 },
      { bookId: byTitle("Purple Hibiscus")._id,               title: "Purple Hibiscus",               quantity: 2, unitPrice: 10.99 },
    ],
    total: 37.97,
  },
  {
    customerId: customer("Bob Tanaka")._id,
    customer:   "Bob Tanaka",
    placedAt:   new Date("2024-02-14T11:00:00Z"),
    status:     "delivered",
    items: [
      { bookId: byTitle("Animal Farm")._id,        title: "Animal Farm",        quantity: 1, unitPrice: 7.99  },
      { bookId: byTitle("Kafka on the Shore")._id, title: "Kafka on the Shore", quantity: 1, unitPrice: 14.99 },
    ],
    total: 22.98,
  },
  {
    customerId: customer("Carol Osei")._id,
    customer:   "Carol Osei",
    placedAt:   new Date("2024-03-20T08:45:00Z"),
    status:     "shipped",
    items: [
      { bookId: byTitle("Beloved")._id, title: "Beloved", quantity: 1, unitPrice: 12.99 },
    ],
    total: 12.99,
  },
  {
    customerId: customer("David Miller")._id,
    customer:   "David Miller",
    placedAt:   new Date("2024-04-01T16:00:00Z"),
    status:     "delivered",
    items: [
      { bookId: byTitle("Americanah")._id,       title: "Americanah",       quantity: 1, unitPrice: 12.49 },
      { bookId: byTitle("Song of Solomon")._id,  title: "Song of Solomon",  quantity: 1, unitPrice: 11.99 },
    ],
    total: 24.48,
  },
  {
    customerId: customer("Eva Kowalski")._id,
    customer:   "Eva Kowalski",
    placedAt:   new Date("2024-04-15T10:20:00Z"),
    status:     "pending",
    items: [
      { bookId: byTitle("Love in the Time of Cholera")._id, title: "Love in the Time of Cholera", quantity: 2, unitPrice: 13.49 },
    ],
    total: 26.98,
  },
  {
    customerId: customer("Frank Santos")._id,
    customer:   "Frank Santos",
    placedAt:   new Date("2024-05-02T13:00:00Z"),
    status:     "delivered",
    items: [
      { bookId: byTitle("1984")._id, title: "1984", quantity: 3, unitPrice: 9.99 },
    ],
    total: 29.97,
  },
  {
    customerId: customer("Grace Kim")._id,
    customer:   "Grace Kim",
    placedAt:   new Date("2024-05-18T09:30:00Z"),
    status:     "shipped",
    items: [
      { bookId: byTitle("Norwegian Wood")._id,              title: "Norwegian Wood",              quantity: 1, unitPrice: 13.99 },
      { bookId: byTitle("One Hundred Years of Solitude")._id, title: "One Hundred Years of Solitude", quantity: 1, unitPrice: 15.99 },
    ],
    total: 29.98,
  },
  {
    customerId: customer("Hiro Yamamoto")._id,
    customer:   "Hiro Yamamoto",
    placedAt:   new Date("2024-06-01T15:00:00Z"),
    status:     "pending",
    items: [
      { bookId: byTitle("Purple Hibiscus")._id, title: "Purple Hibiscus", quantity: 1, unitPrice: 10.99 },
    ],
    total: 10.99,
  },
]);

// ── Counts ────────────────────────────────────────────────────────────────────
print("authors:  ", db.authors.countDocuments());
print("books:    ", db.books.countDocuments());
print("customers:", db.customers.countDocuments());
print("orders:   ", db.orders.countDocuments());
