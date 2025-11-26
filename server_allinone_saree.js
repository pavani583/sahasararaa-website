// server_allinone_saree.js
// Single-file full project: Backend + React frontend (served via CDN) + admin page.
// Manual image URLs (admin pastes image URL). Checkout collects full address (Name, Mobile, Address, City, Pincode).
// Orders use Cash on Delivery; orderStatus = "Placed" (fixed).
// Persistence: data.json file in same folder.
require("dotenv").config();
const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(express.static(__dirname));  // allow serving index.html, admin.html, images, css
const PORT = process.env.PORT || 5000;
const DATA_FILE = path.join(__dirname, 'data.json');
const JWT_SECRET = process.env.JWT_SECRET || 'change_this_jwt_secret_please_change';
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'change_this_admin_secret_please_change';

// Ensure data file exists
if (!fs.existsSync(DATA_FILE)) {
  const seed = {
    users: [],       // { id, name, mobile, isAdmin }
    products: [],    // { id, name, price, category, color, desc, images, stock }
    carts: [],       // { userId, items: [{ productId, qty }] }
    orders: []       // { id, userId, items, totalAmount, paymentMode, orderStatus, shipping, createdAt }
  };
  fs.writeFileSync(DATA_FILE, JSON.stringify(seed, null, 2));
}
function readData(){ return JSON.parse(fs.readFileSync(DATA_FILE)); }
function writeData(d){ fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2)); }

app.use(cors());
app.use(bodyParser.json());

// ---------------- Authentication helpers ----------------
function generateToken(user){
  return jwt.sign({ id: user.id, mobile: user.mobile, name: user.name, isAdmin: user.isAdmin || false }, JWT_SECRET, { expiresIn: '7d' });
}
function authMiddleware(req, res, next){
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ message: 'Missing token' });
  const token = auth.split(' ')[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid token' });
  }
}
function adminCheck(req, res, next){
  const header = req.headers['x-admin-secret'];
  if (header && header === ADMIN_SECRET) return next();
  const auth = req.headers.authorization;
  if (auth) {
    try {
      const token = auth.split(' ')[1];
      const payload = jwt.verify(token, JWT_SECRET);
      if (payload.isAdmin) return next();
    } catch(e){}
  }
  return res.status(403).json({ message: 'Admin only' });
}

// ---------------- Auth routes ----------------
// Register (name + mobile)
app.post('/api/auth/register', (req, res) => {
  const { name, mobile } = req.body;
  if (!name || !mobile) return res.status(400).json({ message: 'name and mobile required' });
  const d = readData();
  if (d.users.find(u => u.mobile === mobile)) return res.status(400).json({ message: 'Mobile already registered' });
  const adminMobiles = ['8050990669']; // set your admin number(s)
  const user = { id: uuidv4(), name, mobile, isAdmin: adminMobiles.includes(mobile) };
  d.users.push(user);
  writeData(d);
  const token = generateToken(user);
  res.json({ message: 'Registered', token, user: { id: user.id, name: user.name, mobile: user.mobile } });
});

// Login (mobile only)
app.post('/api/auth/login', (req, res) => {
  const { mobile } = req.body;
  if (!mobile) return res.status(400).json({ message: 'mobile required' });
  const d = readData();
  const user = d.users.find(u => u.mobile === mobile);
  if (!user) return res.status(404).json({ message: 'Mobile not registered' });
  const token = generateToken(user);
  res.json({ message: 'Logged in', token, user: { id: user.id, name: user.name, mobile: user.mobile } });
});

// ---------------- Products ----------------
// List products (with optional query)
app.get('/api/products', (req, res) => {
  const { q, category, minPrice, maxPrice, sortBy } = req.query;
  const d = readData();
  let list = d.products || [];
  if (q) list = list.filter(p => (p.name||'').toLowerCase().includes(q.toLowerCase()) || (p.desc||'').toLowerCase().includes(q.toLowerCase()));
  if (category) list = list.filter(p => p.category === category);
  if (minPrice) list = list.filter(p => p.price >= Number(minPrice));
  if (maxPrice) list = list.filter(p => p.price <= Number(maxPrice));
  if (sortBy === 'price_asc') list = list.sort((a,b)=>a.price-b.price);
  if (sortBy === 'price_desc') list = list.sort((a,b)=>b.price-a.price);
  res.json(list);
});

// Get product by id
app.get('/api/products/:id', (req, res) => {
  const d = readData();
  const p = d.products.find(x => x.id === req.params.id);
  if (!p) return res.status(404).json({ message: 'Not found' });
  res.json(p);
});

// Admin: add product (images are manual URLs string array)
app.post('/api/products', adminCheck, (req, res) => {
  const { name, price, category, color, desc, images, stock } = req.body;
  if (!name || !price) return res.status(400).json({ message: 'name & price required' });
  const d = readData();
  const p = { id: uuidv4(), name, price: Number(price), category: category||'Sarees', color: color||'', desc: desc||'', images: images||[], stock: Number(stock)||0 };
  d.products.push(p);
  writeData(d);
  res.json({ message: 'Product added', product: p });
});

// Admin: edit product
app.put('/api/products/:id', adminCheck, (req, res) => {
  const d = readData();
  const idx = d.products.findIndex(x => x.id === req.params.id);
  if (idx === -1) return res.status(404).json({ message: 'Not found' });
  const p = d.products[idx];
  ['name','price','category','color','desc','images','stock'].forEach(k => {
    if (req.body[k] !== undefined) p[k] = (k==='price' || k==='stock') ? Number(req.body[k]) : req.body[k];
  });
  d.products[idx] = p;
  writeData(d);
  res.json({ message: 'Updated', product: p });
});

// Admin: delete product
app.delete('/api/products/:id', adminCheck, (req, res) => {
  const d = readData();
  d.products = d.products.filter(x => x.id !== req.params.id);
  writeData(d);
  res.json({ message: 'Deleted' });
});

// ---------------- Cart ----------------
// Add to cart (auth required)
app.post('/api/cart', authMiddleware, (req, res) => {
  const { productId, qty } = req.body;
  const userId = req.user.id;
  const d = readData();
  let cart = d.carts.find(c => c.userId === userId);
  if (!cart){ cart = { userId, items: [] }; d.carts.push(cart); }
  const itemIdx = cart.items.findIndex(i => i.productId === productId);
  if (itemIdx === -1) cart.items.push({ productId, qty: Number(qty)||1 });
  else cart.items[itemIdx].qty += Number(qty)||1;
  writeData(d);
  res.json({ message: 'Added to cart', cart });
});

// Get cart
app.get('/api/cart', authMiddleware, (req, res) => {
  const userId = req.user.id;
  const d = readData();
  const cart = d.carts.find(c => c.userId === userId) || { userId, items: [] };
  const items = cart.items.map(it => {
    const p = d.products.find(x=>x.id===it.productId) || {};
    return { product: p, qty: it.qty };
  });
  res.json({ userId, items });
});

// Remove item from cart
app.delete('/api/cart/:productId', authMiddleware, (req, res) => {
  const userId = req.user.id;
  const d = readData();
  const cart = d.carts.find(c => c.userId === userId);
  if (!cart) return res.json({ message: 'Cart empty' });
  cart.items = cart.items.filter(i => i.productId !== req.params.productId);
  writeData(d);
  res.json({ message: 'Removed', cart });
});

// ---------------- Orders (COD only, orderStatus fixed to "Placed") ----------------
// Checkout: body must include shipping: { name, mobile, address, city, pincode }
app.post('/api/order', authMiddleware, (req, res) => {
  const userId = req.user.id;
  const { shipping } = req.body;
  if (!shipping || !shipping.name || !shipping.mobile || !shipping.address || !shipping.city || !shipping.pincode) {
    return res.status(400).json({ message: 'Complete shipping info required (name,mobile,address,city,pincode)' });
  }
  const d = readData();
  const cart = d.carts.find(c => c.userId === userId);
  if (!cart || cart.items.length === 0) return res.status(400).json({ message: 'Cart empty' });
  let total = 0;
  const items = cart.items.map(it => {
    const p = d.products.find(x=>x.id===it.productId) || {};
    const price = p.price || 0;
    total += price * it.qty;
    return { productId: it.productId, name: p.name||'', price, qty: it.qty };
  });
  const id = uuidv4();
  const order = {
    id,
    userId,
    items,
    totalAmount: total,
    paymentMode: 'Cash on Delivery',
    orderStatus: 'Placed', // fixed, no tracking
    shipping,
    createdAt: new Date().toISOString()
  };
  d.orders.push(order);
  // empty cart for user
  d.carts = d.carts.filter(c => c.userId !== userId);
  writeData(d);
  res.json({ message: 'Order placed', order });
});

// Get user's orders
app.get('/api/orders', authMiddleware, (req, res) => {
  const userId = req.user.id;
  const d = readData();
  const orders = d.orders.filter(o => o.userId === userId);
  res.json(orders);
});

// Admin: list all orders (read-only)
app.get('/api/admin/orders', adminCheck, (req, res) => {
  const d = readData();
  res.json(d.orders);
});

// ---------------- Seed sample products ----------------
(function seedProducts(){
  const d = readData();
  if (!d.products || d.products.length === 0) {
    d.products = [
      { id: uuidv4(), name: 'Kanchipuram Pattu Saree - Maroon', price: 8999, category: 'Pattu', color: 'Maroon', desc: 'Traditional Kanchipuram pattu saree with zari border.', images: ['https://via.placeholder.com/800x800?text=Kanchipuram+Maroon'], stock: 5 },
      { id: uuidv4(), name: 'Soft Silk Saree - Pastel Pink', price: 3499, category: 'Silk', color: 'Pink', desc: 'Soft silk saree for parties and weddings.', images: ['https://via.placeholder.com/800x800?text=Soft+Silk+Pink'], stock: 8 },
      { id: uuidv4(), name: 'Banarasi Saree - Gold Zari', price: 12999, category: 'Banarasi', color: 'Gold', desc: 'Rich Banarasi with intricate floral patterns.', images: ['https://via.placeholder.com/800x800?text=Banarasi+Gold'], stock: 3 },
      { id: uuidv4(), name: 'Cotton Daily Wear Saree - Blue', price: 1199, category: 'Cotton', color: 'Blue', desc: 'Comfortable cotton saree for daily wear.', images: ['https://via.placeholder.com/800x800?text=Cotton+Blue'], stock: 20 }
    ];
    writeData(d);
    console.log('Seeded sample products.');
  }
})();

// ---------------- FRONTEND: React via CDN (index.html) ----------------
const INDEX_HTML = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Saree Boutique — Demo</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
<script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
<style>
  :root{--primary:#8b0000;--muted:#666}
  body{font-family:Inter,Arial,Helvetica,sans-serif;margin:0;background:#fff;color:#111}
  header{background:var(--primary);color:#fff;padding:12px 18px;display:flex;align-items:center;justify-content:space-between}
  header h1{margin:0;font-size:20px}
  a{color:inherit;text-decoration:none}
  .container{max-width:1100px;margin:18px auto;padding:0 12px}
  .grid{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(240px,1fr))}
  .card{border:1px solid #eee;border-radius:8px;padding:10px;background:#fafafa}
  img{max-width:100%;border-radius:6px}
  .btn{background:var(--primary);color:#fff;border:none;padding:8px 10px;border-radius:6px;cursor:pointer}
  input,select,textarea{padding:8px;border-radius:6px;border:1px solid #ddd;width:100%;box-sizing:border-box;margin:6px 0}
  .muted{color:var(--muted)}
  .flex{display:flex;gap:8px;align-items:center}
</style>
</head>
<body>
<header>
  <h1>Saree Boutique</h1>
  <nav style="display:flex;gap:12px;align-items:center">
    <span id="header-welcome" style="font-size:14px"></span>
    <a href="#" id="link-home" style="color:#fff">Home</a>
    <a href="#" id="link-cart" style="color:#fff">Cart (<span id="cart-count">0</span>)</a>
    <a href="#" id="link-orders" style="color:#fff">Orders</a>
    <a href="#" id="link-auth" style="color:#fff">Login/Register</a>
    <a href="/admin.html" style="color:#fff">Admin</a>
  </nav>
</header>
<div id="root" class="container"></div>

<script>
  const e = React.createElement;
  const API = '/api';

  function setAuth(token, user){
    if (token) localStorage.setItem('token', token); else localStorage.removeItem('token');
    if (user) localStorage.setItem('user', JSON.stringify(user)); else localStorage.removeItem('user');
    window.appState.token = token;
    window.appState.user = user;
    updateHeader();
  }
  function getToken(){ return localStorage.getItem('token'); }
  function getUser(){ return localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user')) : null; }
  window.appState = { token: getToken(), user: getUser() };

  function updateHeader(){
    const welcome = document.getElementById('header-welcome');
    const authLink = document.getElementById('link-auth');
    if (window.appState.user) {
      welcome.textContent = 'Hi, ' + window.appState.user.name;
      authLink.textContent = 'Logout';
    } else {
      welcome.textContent = '';
      authLink.textContent = 'Login/Register';
    }
    fetchCartCount();
  }

  document.getElementById('link-home').addEventListener('click', (ev)=>{ ev.preventDefault(); renderApp(); });
  document.getElementById('link-cart').addEventListener('click', (ev)=>{ ev.preventDefault(); renderCart(); });
  document.getElementById('link-orders').addEventListener('click', (ev)=>{ ev.preventDefault(); renderOrders(); });
  document.getElementById('link-auth').addEventListener('click', (ev)=>{ ev.preventDefault(); if (window.appState.user) { setAuth(null,null); alert('Logged out'); renderApp(); } else renderAuth(); });

  function fetchCartCount(){
    const el = document.getElementById('cart-count');
    if (!window.appState.token){ el.textContent = '0'; return; }
    fetch(API + '/cart', { headers: { 'Authorization': 'Bearer ' + window.appState.token } })
      .then(r=>r.json()).then(data => {
        const n = data.items ? data.items.reduce((s,i)=>s+i.qty,0) : 0;
        el.textContent = n;
      }).catch(()=>el.textContent='0');
  }

  function renderApp(){
    const container = document.getElementById('root');
    container.innerHTML = '<h2>Collections</h2><div class="panel"><input id="search" placeholder="Search sarees"/><div style="display:flex;gap:8px"><select id="cat"><option value="">All</option><option>Silk</option><option>Pattu</option><option>Banarasi</option><option>Cotton</option></select><button class="btn" id="btn-search">Search</button></div></div><div id="list" style="margin-top:12px" class="grid"></div>';
    document.getElementById('btn-search').addEventListener('click', loadProducts);
    loadProducts();
  }

  function loadProducts(){
    const q = document.getElementById('search').value || '';
    const cat = document.getElementById('cat').value || '';
    let url = API + '/products';
    const params = [];
    if (q) params.push('q=' + encodeURIComponent(q));
    if (cat) params.push('category=' + encodeURIComponent(cat));
    if (params.length) url += '?' + params.join('&');
    fetch(url).then(r=>r.json()).then(list=>{
      const wrap = document.getElementById('list'); wrap.innerHTML = '';
      list.forEach(p=>{
        const card = document.createElement('div'); card.className='card';
        card.innerHTML = \`
          <img src="\${(p.images && p.images[0]) ? p.images[0] : 'https://via.placeholder.com/500x350?text=' + encodeURIComponent(p.name)}" />
          <h3>\${p.name}</h3>
          <div class="muted">₹\${p.price}</div>
          <div class="muted small">\${p.desc || ''}</div>
          <div style="margin-top:8px" class="flex">
            <button class="btn" onclick="viewProduct('\${p.id}')">View</button>
            <button class="btn" onclick="addToCart('\${p.id}',1)" style="background:#333">Add to Cart</button>
          </div>
        \`;
        wrap.appendChild(card);
      });
    });
  }

  window.viewProduct = function(id){
    fetch(API + '/products/' + id).then(r=>r.json()).then(p=>{
      const root = document.getElementById('root');
      root.innerHTML = '<div style="display:flex;gap:12px"><div style="flex:1"><img src="'+(p.images && p.images[0] ? p.images[0] : 'https://via.placeholder.com/600x600')+'" style="width:100%;height:auto;border-radius:6px"/></div><div style="flex:1"><h2>'+p.name+'</h2><div class="muted">₹'+p.price+'</div><p>'+ (p.desc||'') +'</p><div class="muted">Category: '+p.category+' | Color: '+p.color+'</div><div style="margin-top:12px"><button class="btn" onclick="addToCart(\\''+p.id+'\\',1)">Add to Cart</button><button class="btn" onclick="buyNow(\\''+p.id+'\\')">Buy Now</button></div></div></div>';
    });
  };

  window.addToCart = function(productId, qty){
    if (!window.appState.token){ alert('Please login/register'); renderAuth(); return; }
    fetch(API + '/cart', { method:'POST', headers: { 'Content-Type':'application/json','Authorization':'Bearer ' + window.appState.token }, body: JSON.stringify({ productId, qty }) })
      .then(r=>r.json()).then(res=>{ alert(res.message || 'Added'); fetchCartCount(); }).catch(()=>alert('Error'));
  };

  window.buyNow = function(productId){
    if (!window.appState.token){ alert('Please login/register'); renderAuth(); return; }
    fetch(API + '/cart', { method:'POST', headers:{ 'Content-Type':'application/json','Authorization':'Bearer ' + window.appState.token }, body: JSON.stringify({ productId, qty:1 }) })
      .then(()=> renderCart());
  };

  function renderCart(){
    if (!window.appState.token){ alert('Please login/register'); renderAuth(); return; }
    fetch(API + '/cart', { headers: { 'Authorization': 'Bearer ' + window.appState.token } })
      .then(r=>r.json()).then(data=>{
        const root = document.getElementById('root');
        let html = '<h2>Your Cart</h2>';
        if (!data.items || data.items.length===0) { root.innerHTML = html + '<div class="panel">Cart empty</div>'; return; }
        html += '<div class="panel">';
        let total = 0;
        data.items.forEach(it => {
          const p = it.product || {};
          const sub = (p.price||0) * it.qty; total += sub;
          html += '<div style="display:flex;gap:12px;align-items:center;margin-bottom:8px"><div style="flex:1"><b>'+ (p.name||'') +'</b><div class="muted">₹'+(p.price||0)+'</div></div><div>Qty: '+it.qty+'</div><div><button class="btn" onclick="removeCart(\\''+(p.id||'')+'\\')">Remove</button></div></div>';
        });
        html += '<hr><div><b>Total: ₹'+total+'</b></div><div style="margin-top:8px"><button class="btn" onclick="renderCheckout()">Checkout (Cash on Delivery)</button></div></div>';
        root.innerHTML = html;
      });
  }

  window.removeCart = function(productId){
    fetch(API + '/cart/' + productId, { method:'DELETE', headers: { 'Authorization': 'Bearer ' + window.appState.token } })
      .then(r=>r.json()).then(res=>{ alert(res.message); renderCart(); fetchCartCount(); });
  };

  // Checkout collects full address (name,mobile,address,city,pincode)
  window.renderCheckout = function(){
    if (!window.appState.token){ alert('Please login/register'); renderAuth(); return; }
    const root = document.getElementById('root');
    root.innerHTML = '<h2>Checkout (Cash on Delivery)</h2><div class="panel"><input id="ship-name" placeholder="Name" value="'+(window.appState.user?window.appState.user.name:'')+'"/><input id="ship-mobile" placeholder="Mobile" value="'+(window.appState.user?window.appState.user.mobile:'')+'"/><input id="ship-address" placeholder="Address"/><input id="ship-city" placeholder="City"/><input id="ship-pincode" placeholder="Pincode"/><button class="btn" id="btn-place">Place Order</button></div>';
    document.getElementById('btn-place').addEventListener('click', ()=>{
      const shipping = {
        name: document.getElementById('ship-name').value.trim(),
        mobile: document.getElementById('ship-mobile').value.trim(),
        address: document.getElementById('ship-address').value.trim(),
        city: document.getElementById('ship-city').value.trim(),
        pincode: document.getElementById('ship-pincode').value.trim()
      };
      if (!shipping.name||!shipping.mobile||!shipping.address||!shipping.city||!shipping.pincode) return alert('Please fill all fields');
      fetch(API + '/order', { method:'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + window.appState.token }, body: JSON.stringify({ shipping }) })
        .then(r=>r.json()).then(res=>{ if (res.order) { alert('Order placed: ' + res.order.id); renderOrders(); fetchCartCount(); } else alert(res.message || 'Error'); });
    });
  };

  function renderOrders(){
    if (!window.appState.token){ alert('Please login/register'); renderAuth(); return; }
    fetch(API + '/orders', { headers: { 'Authorization': 'Bearer ' + window.appState.token } })
      .then(r=>r.json()).then(list=>{
        const root = document.getElementById('root');
        let html = '<h2>Your Orders</h2><div class="panel">';
        if (!list || list.length===0) html += 'No orders yet';
        else {
          list.forEach(o=>{
            html += '<div style="border-bottom:1px dashed #ddd;padding:8px 0"><b>Order: '+o.id+'</b><div class="muted">Placed: '+ new Date(o.createdAt).toLocaleString() +'</div><div>Total: ₹'+o.totalAmount+'</div><div>Payment: '+o.paymentMode+' | Status: '+o.orderStatus+'</div><div class="muted">Ship to: '+o.shipping.name+', '+o.shipping.address+', '+o.shipping.city+' - '+o.shipping.pincode+'</div></div>';
          });
        }
        html += '</div>';
        root.innerHTML = html;
      });
  }

  function renderAuth(){
    const root = document.getElementById('root');
    root.innerHTML = '<h2>Login / Register</h2><div class="panel"><h3>Register</h3><input id="reg-name" placeholder="Name"/><input id="reg-mobile" placeholder="Mobile"/><button class="btn" id="btn-reg">Register</button><hr/><h3>Login</h3><input id="login-mobile" placeholder="Mobile"/><button class="btn" id="btn-login">Login</button></div>';
    document.getElementById('btn-reg').addEventListener('click', ()=>{
      const name = document.getElementById('reg-name').value.trim();
      const mobile = document.getElementById('reg-mobile').value.trim();
      if (!name || !mobile) return alert('name & mobile required');
      fetch(API + '/auth/register', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ name, mobile }) })
        .then(r=>r.json()).then(res=>{ if (res.token) { setAuth(res.token, res.user); alert('Registered'); renderApp(); } else alert(res.message || 'Error'); });
    });
    document.getElementById('btn-login').addEventListener('click', ()=>{
      const mobile = document.getElementById('login-mobile').value.trim();
      if (!mobile) return alert('mobile required');
      fetch(API + '/auth/login', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ mobile }) })
        .then(r=>r.json()).then(res=>{ if (res.token) { setAuth(res.token, res.user); alert('Logged in'); renderApp(); } else alert(res.message || 'Error'); });
    });
  }

  // Init
  updateHeader();
  renderApp();
</script>
</body>
</html>`;

// ---------------- ADMIN page (admin.html) ----------------
// Manual image URL: admin pastes image URLs comma separated.
const ADMIN_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><title>Admin - Saree Boutique</title>
<style>
  body{font-family:Arial;padding:18px}
  input,textarea,select{padding:8px;margin:6px 0;width:100%;box-sizing:border-box}
  .btn{padding:8px 10px;background:#8b0000;color:#fff;border:none;border-radius:6px;cursor:pointer}
  table{width:100%;border-collapse:collapse;margin-top:12px}
  th,td{padding:8px;border:1px solid #ddd}
</style>
</head><body>
<h1>Admin Panel (Demo)</h1>
<p>Send header <code>x-admin-secret</code> with value shown on server console to perform admin actions.</p>
<div>
  <h3>Add Product (Manual image URLs)</h3>
  <input id="p-name" placeholder="Name"/>
  <input id="p-price" placeholder="Price"/>
  <input id="p-category" placeholder="Category (e.g., Silk)"/>
  <input id="p-color" placeholder="Color"/>
  <input id="p-stock" placeholder="Stock"/>
  <textarea id="p-desc" placeholder="Description"></textarea>
  <input id="p-images" placeholder="Image URLs (comma separated)"/>
  <button class="btn" id="btn-add">Add Product</button>
</div>
<hr/>
<h3>Products</h3>
<div id="products"></div>
<hr/>
<h3>Orders</h3>
<div id="orders"></div>

<script>
const API = '/api';
const ADMIN_SECRET = '${ADMIN_SECRET}';

function fetchProducts(){
  fetch(API + '/products').then(r=>r.json()).then(list=>{
    let html = '<table><tr><th>Image</th><th>Name</th><th>Price</th><th>Category</th><th>Stock</th><th>Actions</th></tr>';
    list.forEach(p=>{
      html += '<tr>';
      html += '<td><img src="'+(p.images && p.images[0] ? p.images[0] : 'https://via.placeholder.com/80') +'" style="width:80px;border-radius:4px"></td>';
      html += '<td>'+p.name+'</td>';
      html += '<td>'+p.price+'</td>';
      html += '<td>'+p.category+'</td>';
      html += '<td>'+p.stock+'</td>';
      html += '<td><button onclick="deleteP(\\''+p.id+'\\')">Delete</button></td>';
      html += '</tr>';
    });
    html += '</table>';
    document.getElementById('products').innerHTML = html;
  });
}
function fetchOrders(){
  fetch(API + '/admin/orders', { headers: { 'x-admin-secret': ADMIN_SECRET } }).then(r=>r.json()).then(list=>{
    let html = '<table><tr><th>Order ID</th><th>User</th><th>Total</th><th>Payment</th><th>Shipping</th></tr>';
    list.forEach(o => {
      html += '<tr>';
      html += '<td>'+o.id+'</td>';
      html += '<td>'+o.userId+'</td>';
      html += '<td>'+o.totalAmount+'</td>';
      html += '<td>'+o.paymentMode+'</td>';
      html += '<td>'+ (o.shipping ? (o.shipping.name + ', ' + o.shipping.address + ', ' + o.shipping.city + ' - ' + o.shipping.pincode) : '') +'</td>';
      html += '</tr>';
    });
    html += '</table>';
    document.getElementById('orders').innerHTML = html;
  });
}

document.getElementById('btn-add').addEventListener('click', ()=>{
  const name = document.getElementById('p-name').value;
  const price = document.getElementById('p-price').value;
  const category = document.getElementById('p-category').value;
  const color = document.getElementById('p-color').value;
  const stock = document.getElementById('p-stock').value;
  const desc = document.getElementById('p-desc').value;
  const images = document.getElementById('p-images').value.split(',').map(s=>s.trim()).filter(Boolean);
  if (!name || !price) return alert('name & price required');
  fetch(API + '/products', { method:'POST', headers: { 'Content-Type':'application/json', 'x-admin-secret': ADMIN_SECRET }, body: JSON.stringify({ name, price, category, color, stock, desc, images }) })
    .then(r=>r.json()).then(res=>{ alert(res.message); fetchProducts(); });
});

function deleteP(id){
  if (!confirm('Delete product?')) return;
  fetch(API + '/products/' + id, { method:'DELETE', headers: { 'x-admin-secret': ADMIN_SECRET } }).then(r=>r.json()).then(res=>{ alert(res.message); fetchProducts(); });
}

fetchProducts(); fetchOrders();
</script>
</body></html>`;

// Write files if they don't exist (so you can edit later)
if (!fs.existsSync(path.join(__dirname,'index.html'))) fs.writeFileSync(path.join(__dirname,'index.html'), INDEX_HTML);
if (!fs.existsSync(path.join(__dirname,'admin.html'))) fs.writeFileSync(path.join(__dirname,'admin.html'), ADMIN_HTML);

// Serve frontend
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/admin.html', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.use('/static', express.static(path.join(__dirname, 'static')));

// Start server
app.listen(PORT, () => {
  console.log('Server running on http://localhost:' + PORT);
  console.log('ADMIN_SECRET (for demo):', ADMIN_SECRET);
  console.log('JWT_SECRET (change for production):', JWT_SECRET);
});
