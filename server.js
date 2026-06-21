require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'freshcart_jwt_secret_key_2026_lucky';

// Middleware — allow CORS from any origin so the frontend can connect
app.use(cors({ origin: '*', methods: ['GET','POST','PUT','DELETE','OPTIONS'], allowedHeaders: ['Content-Type','Authorization'] }));
app.use(express.json());

// Serve all static files (images, html, etc) from project directory
app.use(express.static(path.join(__dirname)));
app.use('/images', express.static(path.join(__dirname, 'images')));

let pool;

// Helper to parse PRODUCTS array from main HTML file dynamically
function getProductsFromHtml() {
  // Try index.html first (renamed from commerce.html), then fallback
  const candidates = ['index.html', 'commerce.html'];
  let content = null;
  for (const fname of candidates) {
    const htmlPath = path.join(__dirname, fname);
    if (fs.existsSync(htmlPath)) {
      content = fs.readFileSync(htmlPath, 'utf8');
      console.log(`Reading products from: ${fname}`);
      break;
    }
  }
  if (!content) {
    console.error('No main HTML file found for product seeding.');
    return [];
  }
  const match = content.match(/const PRODUCTS\s*=\s*([\s\S]*?\]);/);
  if (match) {
    try {
      const evalCode = `return ${match[1]}`;
      const products = new Function(evalCode)();
      return products;
    } catch (e) {
      console.error('Failed to parse PRODUCTS array from HTML:', e);
    }
  }
  return [];
}

// Database initialization
async function initDb() {
  try {
    // 1. First connect without database name to ensure database exists
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      port: parseInt(process.env.DB_PORT || '3306')
    });
    
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME || 'freshcart_db'}\`;`);
    await connection.end();
    console.log(`Database verified/created.`);

    // 2. Initialize connection pool
    pool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'freshcart_db',
      port: parseInt(process.env.DB_PORT || '3306'),
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });

    // 3. Create tables
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        phone VARCHAR(20) DEFAULT '',
        addresses JSON DEFAULT NULL,
        role VARCHAR(20) DEFAULT 'user',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS products (
        id INT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        cat VARCHAR(100) NOT NULL,
        price DECIMAL(10,2) NOT NULL,
        orig DECIMAL(10,2) NOT NULL,
        img VARCHAR(255) NOT NULL,
        rating DECIMAL(3,2) NOT NULL,
        rev INT NOT NULL,
        badge VARCHAR(100) DEFAULT '',
        description TEXT
      ) ENGINE=InnoDB;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id VARCHAR(100) PRIMARY KEY,
        user_id INT NOT NULL,
        total_price DECIMAL(10,2) NOT NULL,
        subtotal DECIMAL(10,2) NOT NULL,
        tax DECIMAL(10,2) NOT NULL,
        delivery DECIMAL(10,2) NOT NULL,
        discount DECIMAL(10,2) NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'Order Placed',
        items_json JSON NOT NULL,
        address VARCHAR(255) NOT NULL,
        payment_method VARCHAR(100) NOT NULL,
        payment_details JSON DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);

    // Dynamically update existing users table to add role if it was created in a previous version
    try {
      await pool.query("ALTER TABLE users ADD COLUMN role VARCHAR(20) DEFAULT 'user'");
      console.log('Verified/Added role column to users table.');
    } catch (err) {
      if (err.errno !== 1060) { // 1060 is ER_DUP_FIELDNAME (already exists)
        console.warn('Migration warning for role column:', err.message);
      }
    }

    // Dynamically update existing orders table to add payment_details if it was created in a previous version
    try {
      await pool.query('ALTER TABLE orders ADD COLUMN payment_details JSON DEFAULT NULL');
      console.log('Verified/Added payment_details column to orders table.');
    } catch (err) {
      if (err.errno !== 1060) { // 1060 is ER_DUP_FIELDNAME (already exists)
        console.warn('Migration warning for payment_details column:', err.message);
      }
    }
    
    console.log(`Database tables initialized.`);

    // 4. Seed products if table is empty
    const [rows] = await pool.query('SELECT COUNT(*) as count FROM products');
    if (rows[0].count === 0) {
      console.log('Seeding products catalog from HTML file...');
      const products = getProductsFromHtml();
      if (products && products.length > 0) {
        const query = `INSERT INTO products (id, name, cat, price, orig, img, rating, rev, badge, description) VALUES ?`;
        const values = products.map(p => [
          p.id,
          p.name,
          p.cat,
          p.price,
          p.orig,
          p.img,
          p.rating,
          p.rev,
          p.badge || '',
          p.desc || ''
        ]);
        await pool.query(query, [values]);
        console.log(`Successfully seeded ${products.length} products to database.`);
      } else {
        console.log('No products found to seed.');
      }
    }
  } catch (err) {
    console.error('Database connection / initialization failed:', err);
    process.exit(1);
  }
}

// Authentication Middleware
async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) return res.status(401).json({ error: 'Access token required' });
  
  try {
    const userPayload = jwt.verify(token, JWT_SECRET);
    req.user = userPayload;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
}

// Serve landing frontend page — serve index.html (main storefront)
app.get('/', (req, res) => {
  // Try index.html first, fallback to commerce.html
  const indexPath = path.join(__dirname, 'index.html');
  const commercePath = path.join(__dirname, 'commerce.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else if (fs.existsSync(commercePath)) {
    res.sendFile(commercePath);
  } else {
    res.status(404).send('Storefront not found. Please ensure index.html exists.');
  }
});

// Authentication endpoints
app.post('/api/auth/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required' });
  }

  const cleanEmail = email.toLowerCase().trim();

  try {
    // Check if user exists
    const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [cleanEmail]);
    if (existing.length > 0) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Automatically make admin if email contains the word 'admin'
    const role = cleanEmail.includes('admin') ? 'admin' : 'user';

    // Insert user (default empty addresses array)
    const defaultAddresses = JSON.stringify([]);
    const [result] = await pool.query(
      'INSERT INTO users (name, email, password, phone, addresses, role) VALUES (?, ?, ?, ?, ?, ?)',
      [name, cleanEmail, hashedPassword, '', defaultAddresses, role]
    );

    const userId = result.insertId;
    const userObj = { id: userId, name, email: cleanEmail, phone: '', addresses: [], role };
    
    // Sign token
    const token = jwt.sign(userObj, JWT_SECRET, { expiresIn: '7d' });
    
    res.status(201).json({ success: true, token, user: userObj });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Internal server error during registration: ' + err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const cleanEmail = email.toLowerCase().trim();

  try {
    const [users] = await pool.query('SELECT * FROM users WHERE email = ?', [cleanEmail]);
    if (users.length === 0) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    const user = users[0];
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    const addresses = typeof user.addresses === 'string' ? JSON.parse(user.addresses) : user.addresses || [];
    const userObj = { id: user.id, name: user.name, email: user.email, phone: user.phone || '', addresses, role: user.role };
    const token = jwt.sign(userObj, JWT_SECRET, { expiresIn: '7d' });
    
    res.json({ success: true, token, user: userObj });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error during login' });
  }
});

// User profile retrieve endpoint
app.get('/api/auth/profile', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  try {
    const [users] = await pool.query('SELECT * FROM users WHERE id = ?', [userId]);
    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const user = users[0];
    const addresses = typeof user.addresses === 'string' ? JSON.parse(user.addresses) : user.addresses || [];
    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone || '',
      addresses: addresses,
      role: user.role
    });
  } catch (err) {
    console.error('Fetch profile error:', err);
    res.status(500).json({ error: 'Internal server error during fetching profile' });
  }
});

// User profile update endpoint
app.put('/api/auth/profile', authenticateToken, async (req, res) => {
  const { name, phone, addresses } = req.body;
  const userId = req.user.id;

  try {
    const addrJson = JSON.stringify(addresses || []);
    await pool.query(
      'UPDATE users SET name = ?, phone = ?, addresses = ? WHERE id = ?',
      [name, phone, addrJson, userId]
    );

    const userObj = { id: userId, name, email: req.user.email, phone, addresses: addresses || [], role: req.user.role };
    const token = jwt.sign(userObj, JWT_SECRET, { expiresIn: '7d' });

    res.json({ success: true, token, user: userObj });
  } catch (err) {
    console.error('Profile update error:', err);
    res.status(500).json({ error: 'Internal server error during profile update' });
  }
});

// Products catalog endpoint
app.get('/api/products', async (req, res) => {
  try {
    const [products] = await pool.query('SELECT * FROM products ORDER BY id ASC');
    // Map database DECIMAL columns to numeric float types
    const mapped = products.map(p => ({
      id: p.id,
      name: p.name,
      cat: p.cat,
      price: parseFloat(p.price),
      orig: parseFloat(p.orig),
      img: p.img,
      rating: parseFloat(p.rating),
      rev: p.rev,
      badge: p.badge || '',
      desc: p.description || ''
    }));
    res.json(mapped);
  } catch (err) {
    console.error('Fetch products error:', err);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// Order placement and retrieval endpoints
app.post('/api/orders', authenticateToken, async (req, res) => {
  const { id, sub, tax, del, disc, total, address, payment, paymentDetails, items } = req.body;
  const userId = req.user.id;

  // Validate required fields
  if (!id || !items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Invalid order request: id and items are required' });
  }
  if (!address || !payment) {
    return res.status(400).json({ error: 'Invalid order request: address and payment are required' });
  }

  try {
    const itemsJson = JSON.stringify(items);
    const paymentDetailsJson = JSON.stringify(paymentDetails || {});

    // Parse numeric values safely
    const safeTotal = parseFloat(total) || 0;
    const safeSub   = parseFloat(sub)   || 0;
    const safeTax   = parseFloat(tax)   || 0;
    const safeDel   = parseFloat(del)   || 0;
    const safeDisc  = parseFloat(disc)  || 0;

    await pool.query(
      'INSERT INTO orders (id, user_id, total_price, subtotal, tax, delivery, discount, address, payment_method, payment_details, items_json, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, userId, safeTotal, safeSub, safeTax, safeDel, safeDisc, address, payment, paymentDetailsJson, itemsJson, 'Order Placed']
    );

    console.log(`Order ${id} saved to DB for user ${userId}`);
    res.status(201).json({ success: true, message: 'Order placed successfully', orderId: id });
  } catch (err) {
    console.error('Place order error:', err.message, '| SQL code:', err.code);
    // Handle duplicate order ID gracefully
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Order already exists with this ID' });
    }
    res.status(500).json({ error: 'Failed to save order to database', detail: err.message });
  }
});


app.get('/api/orders', authenticateToken, async (req, res) => {
  const userId = req.user.id;

  try {
    const [orders] = await pool.query('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC', [userId]);
    const mapped = orders.map(o => {
      const items = typeof o.items_json === 'string' ? JSON.parse(o.items_json) : o.items_json || [];
      const paymentDetails = typeof o.payment_details === 'string' ? JSON.parse(o.payment_details) : o.payment_details || {};
      const dateObj = new Date(o.created_at);
      return {
        id: o.id,
        date: dateObj.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
        time: dateObj.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
        items: items,
        total: parseFloat(o.total_price),
        sub: parseFloat(o.subtotal),
        tax: parseFloat(o.tax),
        del: parseFloat(o.delivery),
        disc: parseFloat(o.discount),
        address: o.address,
        payment: o.payment_method,
        paymentDetails: paymentDetails,
        stage: o.status === 'Delivered' ? 3 : (o.status === 'Out for Delivery' ? 2 : (o.status === 'Packed' ? 1 : 0)),
        status: 'active'
      };
    });
    res.json(mapped);
  } catch (err) {
    console.error('Fetch orders error:', err);
    res.status(500).json({ error: 'Failed to fetch order history' });
  }
});

// Admin Authentication Middleware
function requireAdmin(req, res, next) {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ error: 'Forbidden: Admin access required' });
  }
}

// Admin Console Endpoints
app.get('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const [users] = await pool.query('SELECT id, name, email, phone, role, created_at FROM users ORDER BY id ASC');
    res.json(users);
  } catch (err) {
    console.error('Fetch admin users error:', err);
    res.status(500).json({ error: 'Failed to fetch users list' });
  }
});

app.get('/api/admin/orders', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const query = `
      SELECT o.*, u.name as user_name, u.email as user_email 
      FROM orders o
      JOIN users u ON o.user_id = u.id
      ORDER BY o.created_at DESC
    `;
    const [orders] = await pool.query(query);
    const mapped = orders.map(o => {
      const items = typeof o.items_json === 'string' ? JSON.parse(o.items_json) : o.items_json || [];
      const paymentDetails = typeof o.payment_details === 'string' ? JSON.parse(o.payment_details) : o.payment_details || {};
      const dateObj = new Date(o.created_at);
      return {
        id: o.id,
        date: dateObj.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
        time: dateObj.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
        items: items,
        total: parseFloat(o.total_price),
        sub: parseFloat(o.subtotal),
        tax: parseFloat(o.tax),
        del: parseFloat(o.delivery),
        disc: parseFloat(o.discount),
        address: o.address,
        payment: o.payment_method,
        paymentDetails: paymentDetails,
        status: o.status,
        userName: o.user_name,
        userEmail: o.user_email
      };
    });
    res.json(mapped);
  } catch (err) {
    console.error('Fetch admin orders error:', err);
    res.status(500).json({ error: 'Failed to fetch orders list' });
  }
});

app.put('/api/admin/orders/:id/status', authenticateToken, requireAdmin, async (req, res) => {
  const orderId = req.params.id;
  const { status } = req.body;
  
  if (!status) {
    return res.status(400).json({ error: 'Status is required' });
  }
  
  try {
    const [result] = await pool.query('UPDATE orders SET status = ? WHERE id = ?', [status, orderId]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }
    res.json({ success: true, message: 'Order status updated successfully' });
  } catch (err) {
    console.error('Update order status error:', err);
    res.status(500).json({ error: 'Failed to update order status' });
  }
});

// Boot server
app.listen(PORT, async () => {
  await initDb();
  console.log(`===================================================`);
  console.log(`🛒 FreshCart E-Commerce Server is active!`);
  console.log(`🌐 Local URL: http://localhost:${PORT}`);
  console.log(`🔌 Database Host: ${process.env.DB_HOST || 'localhost'}`);
  console.log(`===================================================`);
});
