require('dotenv').config();
const express = require('express');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const QRCode = require('qrcode');
const path = require('path');

const app = express();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && !/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL)
    ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

const query = (sql, params = []) => pool.query(sql, params);
const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

async function initDatabase() {
  await query(`CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'employee', created_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await query(`CREATE TABLE IF NOT EXISTS products (
    id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL, description TEXT,
    benefits TEXT, calories INTEGER DEFAULT 0, image TEXT, featured INTEGER DEFAULT 0,
    price NUMERIC(12,2) DEFAULT 0, promo_price NUMERIC(12,2) DEFAULT 0,
    unit TEXT DEFAULT 'kg', offer_until TEXT DEFAULT ''
  )`);
  await query(`CREATE TABLE IF NOT EXISTS recipes (
    id BIGSERIAL PRIMARY KEY, title TEXT NOT NULL, category TEXT, description TEXT,
    ingredients TEXT, instructions TEXT, time TEXT, image TEXT
  )`);
  await query(`CREATE TABLE IF NOT EXISTS reviews (
    id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL, rating INTEGER NOT NULL,
    message TEXT NOT NULL, approved INTEGER DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  // Compatibilidade com versões anteriores do banco.
  await query("ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'employee'");
  await query('ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()');
  await query('ALTER TABLE products ADD COLUMN IF NOT EXISTS price NUMERIC(12,2) DEFAULT 0');
  await query('ALTER TABLE products ADD COLUMN IF NOT EXISTS promo_price NUMERIC(12,2) DEFAULT 0');
  await query("ALTER TABLE products ADD COLUMN IF NOT EXISTS unit TEXT DEFAULT 'kg'");
  await query("ALTER TABLE products ADD COLUMN IF NOT EXISTS offer_until TEXT DEFAULT ''");

  if (process.env.NODE_ENV === 'production') {
    if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)
      throw new Error('Defina SESSION_SECRET com pelo menos 32 caracteres.');
    if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD.length < 12)
      throw new Error('Defina ADMIN_EMAIL e ADMIN_PASSWORD (mínimo 12 caracteres).');
  }
  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@tecfitdasanta.com.br').trim().toLowerCase();
  const adminPass = process.env.ADMIN_PASSWORD || 'TecFit@2026';
  const admin = await query('SELECT id FROM users WHERE email=$1', [adminEmail]);
  if (!admin.rowCount) {
    await query("INSERT INTO users(email,password,role) VALUES($1,$2,'admin')", [adminEmail, bcrypt.hashSync(adminPass, 12)]);
  } else {
    await query("UPDATE users SET role='admin' WHERE email=$1", [adminEmail]);
  }

  const productsCount = await query('SELECT COUNT(*)::int AS n FROM products');
  if (productsCount.rows[0].n === 0) {
    const products = [
      ['Abacate','Frutas','Cremoso e versátil, combina com receitas doces e salgadas.','Fonte de gorduras monoinsaturadas e fibras.',160,'https://images.unsplash.com/photo-1523049673857-eb18f1d7b578?w=800',1],
      ['Morango','Frutas','Fruta refrescante, naturalmente doce e cheia de cor.','Contém vitamina C e compostos antioxidantes.',32,'https://images.unsplash.com/photo-1464965911861-746a04b4bca6?w=800',1],
      ['Brócolis','Verduras','Vai bem no vapor, assado ou em preparações do dia a dia.','Fonte de fibras, vitamina C e vitamina K.',34,'https://images.unsplash.com/photo-1459411621453-7b03977f4bfc?w=800',1],
      ['Cenoura','Legumes','Crocante e prática para saladas, sucos e acompanhamentos.','Contém betacaroteno, precursor da vitamina A.',41,'https://images.unsplash.com/photo-1445282768818-728615cc910a?w=800',0],
      ['Laranja','Frutas','Uma opção prática para consumir in natura.','Fonte de vitamina C e fibras.',47,'https://images.unsplash.com/photo-1547514701-42782101795e?w=800',0],
      ['Tomate','Legumes','Ingrediente curinga para saladas e refeições.','Contém licopeno e vitamina C.',18,'https://images.unsplash.com/photo-1546094096-0df4bcaaa337?w=800',0]
    ];
    for (const p of products) await query('INSERT INTO products(name,category,description,benefits,calories,image,featured) VALUES($1,$2,$3,$4,$5,$6,$7)', p);
  }
  const recipesCount = await query('SELECT COUNT(*)::int AS n FROM recipes');
  if (recipesCount.rows[0].n === 0) {
    const recipes = [
      ['Salada colorida da estação','Leve','Uma combinação fresca para acompanhar suas refeições.','Alface, tomate, cenoura ralada, pepino e azeite.','Higienize os vegetais. Corte, misture em uma tigela e tempere na hora de servir.','15 min','https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=900'],
      ['Vitamina cremosa de morango','Bebidas','Uma bebida simples para o café da manhã ou lanche.','Morangos, leite ou bebida vegetal e banana.','Bata todos os ingredientes no liquidificador até ficar homogêneo. Sirva em seguida.','5 min','https://images.unsplash.com/photo-1553530666-ba11a7da3888?w=900'],
      ['Brócolis assado com alho','Acompanhamentos','Um acompanhamento fácil e cheio de sabor.','Brócolis, alho, azeite, limão e uma pitada de sal.','Separe os floretes, tempere e asse a 200 °C por cerca de 20 minutos.','25 min','https://images.unsplash.com/photo-1518977676601-b53f82aba655?w=900']
    ];
    for (const r of recipes) await query('INSERT INTO recipes(title,category,description,ingredients,instructions,time,image) VALUES($1,$2,$3,$4,$5,$6,$7)', r);
  }
}

app.use(express.json({ limit: '2mb' }));
if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);
app.use(session({
  store: new PgSession({ pool, tableName: 'user_sessions', createTableIfMissing: true, pruneSessionInterval: 15 * 60 }),
  secret: process.env.SESSION_SECRET || 'development-only-change-this-secret',
  resave: false, saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 8 * 60 * 60 * 1000 }
}));
app.use(express.static(path.join(__dirname, '..', 'public')));
const auth = (req,res,next) => req.session.user ? next() : res.status(401).json({error:'Faça login para continuar.'});
const adminOnly = (req,res,next) => req.session.user?.role === 'admin' ? next() : res.status(403).json({error:'Apenas administradores podem gerenciar contas.'});
const loginAttempts = new Map();
const loginRateLimit = (req,res,next) => {
  const key = (req.ip || 'unknown') + '|' + String(req.body?.email || '').toLowerCase();
  const now = Date.now(); const old = loginAttempts.get(key) || {count:0, until:now + 15*60*1000};
  if (now > old.until) { old.count = 0; old.until = now + 15*60*1000; }
  if (old.count >= 10) return res.status(429).json({error:'Muitas tentativas. Aguarde 15 minutos e tente novamente.'});
  loginAttempts.set(key, old); req.loginAttemptKey = key; next();
};

app.get('/api/products', asyncRoute(async(req,res) => {
  const q = `%${req.query.q || ''}%`, category = `%${req.query.category || ''}%`;
  const r = await query('SELECT * FROM products WHERE name ILIKE $1 AND category ILIKE $2 ORDER BY featured DESC,name', [q,category]); res.json(r.rows);
}));
app.get('/api/products/:id', asyncRoute(async(req,res) => { const r=await query('SELECT * FROM products WHERE id=$1',[req.params.id]); if(!r.rowCount)return res.status(404).json({error:'Produto não encontrado.'}); res.json(r.rows[0]); }));
app.get('/api/recipes', asyncRoute(async(req,res)=>{const r=await query('SELECT * FROM recipes ORDER BY id DESC');res.json(r.rows);}));
app.get('/api/reviews', asyncRoute(async(req,res)=>{const r=await query('SELECT id,name,rating,message,created_at FROM reviews WHERE approved=1 ORDER BY id DESC');res.json(r.rows);}));
app.post('/api/reviews', asyncRoute(async(req,res)=>{const {name,message,rating}=req.body;if(!name?.trim()||!message?.trim()||!Number.isInteger(Number(rating))||Number(rating)<1||Number(rating)>5)return res.status(400).json({error:'Preencha nome, comentário e uma nota de 1 a 5.'});const r=await query('INSERT INTO reviews(name,rating,message) VALUES($1,$2,$3) RETURNING id',[name.trim(),Number(rating),message.trim()]);res.status(201).json({ok:true,id:r.rows[0].id,message:'Avaliação enviada para aprovação.'});}));
app.post('/api/login',loginRateLimit,asyncRoute(async(req,res)=>{const {email,password}=req.body;const r=await query('SELECT * FROM users WHERE email=$1',[String(email||'').trim().toLowerCase()]);const user=r.rows[0];if(!user||!bcrypt.compareSync(password||'',user.password)){const a=loginAttempts.get(req.loginAttemptKey);if(a)a.count++;return res.status(401).json({error:'E-mail ou senha incorretos.'});}loginAttempts.delete(req.loginAttemptKey);req.session.regenerate(err=>{if(err)return res.status(500).json({error:'Não foi possível iniciar a sessão.'});req.session.user={id:user.id,email:user.email,role:user.role||'employee'};req.session.save(()=>res.json({ok:true,email:user.email,role:req.session.user.role}));});}));
app.post('/api/logout',(req,res)=>req.session.destroy(()=>res.json({ok:true})));
app.get('/api/me',(req,res)=>res.json({logged:!!req.session.user,email:req.session.user?.email||null,role:req.session.user?.role||null}));
app.get('/api/admin/staff',auth,adminOnly,asyncRoute(async(req,res)=>{const r=await query('SELECT id,email,role,created_at FROM users ORDER BY role,email');res.json(r.rows);}));
app.post('/api/admin/staff',auth,adminOnly,asyncRoute(async(req,res)=>{const email=String(req.body.email||'').trim().toLowerCase(),password=String(req.body.password||'');if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return res.status(400).json({error:'Informe um e-mail válido.'});if(password.length<10)return res.status(400).json({error:'A senha deve ter pelo menos 10 caracteres.'});try{const r=await query("INSERT INTO users(email,password,role) VALUES($1,$2,'employee') RETURNING id",[email,bcrypt.hashSync(password,12)]);res.status(201).json({id:r.rows[0].id,email,role:'employee'});}catch(e){if(e.code==='23505')return res.status(409).json({error:'Já existe uma conta com esse e-mail.'});throw e;}}));
app.delete('/api/admin/staff/:id',auth,adminOnly,asyncRoute(async(req,res)=>{const id=Number(req.params.id);if(id===Number(req.session.user.id))return res.status(400).json({error:'Você não pode excluir sua própria conta.'});const target=await query('SELECT id,role FROM users WHERE id=$1',[id]);if(!target.rowCount)return res.status(404).json({error:'Conta não encontrada.'});if(target.rows[0].role==='admin')return res.status(403).json({error:'A conta principal de administração não pode ser excluída por aqui.'});await query('DELETE FROM users WHERE id=$1',[id]);res.json({ok:true});}));
app.get('/api/admin/summary',auth,asyncRoute(async(req,res)=>{const r=await query("SELECT (SELECT COUNT(*) FROM products)::int AS products,(SELECT COUNT(*) FROM recipes)::int AS recipes,(SELECT COUNT(*) FROM reviews WHERE approved=0)::int AS pending");res.json(r.rows[0]);}));
app.get('/api/admin/reviews',auth,asyncRoute(async(req,res)=>{const r=await query('SELECT * FROM reviews ORDER BY approved,id DESC');res.json(r.rows);}));
app.patch('/api/admin/reviews/:id',auth,asyncRoute(async(req,res)=>{await query('UPDATE reviews SET approved=$1 WHERE id=$2',[req.body.approved?1:0,req.params.id]);res.json({ok:true});}));
app.delete('/api/admin/reviews/:id',auth,asyncRoute(async(req,res)=>{await query('DELETE FROM reviews WHERE id=$1',[req.params.id]);res.json({ok:true});}));
app.post('/api/admin/products',auth,asyncRoute(async(req,res)=>{const p=req.body;if(!p.name||!p.category)return res.status(400).json({error:'Nome e categoria são obrigatórios.'});const r=await query('INSERT INTO products(name,category,description,benefits,calories,image,featured,price,promo_price,unit,offer_until) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id',[p.name,p.category,p.description||'',p.benefits||'',Number(p.calories)||0,p.image||'',p.featured?1:0,Number(p.price)||0,Number(p.promo_price)||0,p.unit||'kg',p.offer_until||'']);res.status(201).json({id:r.rows[0].id});}));
app.put('/api/admin/products/:id',auth,asyncRoute(async(req,res)=>{const p=req.body;await query('UPDATE products SET name=$1,category=$2,description=$3,benefits=$4,calories=$5,image=$6,featured=$7,price=$8,promo_price=$9,unit=$10,offer_until=$11 WHERE id=$12',[p.name,p.category,p.description||'',p.benefits||'',Number(p.calories)||0,p.image||'',p.featured?1:0,Number(p.price)||0,Number(p.promo_price)||0,p.unit||'kg',p.offer_until||'',req.params.id]);res.json({ok:true});}));
app.delete('/api/admin/products/:id',auth,asyncRoute(async(req,res)=>{await query('DELETE FROM products WHERE id=$1',[req.params.id]);res.json({ok:true});}));
app.get('/api/admin/products/:id/qr',auth,asyncRoute(async(req,res)=>{const r=await query('SELECT id FROM products WHERE id=$1',[req.params.id]);if(!r.rowCount)return res.status(404).json({error:'Produto não encontrado.'});const base=process.env.PUBLIC_URL||`${req.protocol}://${req.get('host')}`;const url=`${base}/produto/${r.rows[0].id}`;const dataUrl=await QRCode.toDataURL(url,{width:360,margin:1,errorCorrectionLevel:'H'});res.json({url,dataUrl});}));
app.post('/api/admin/recipes',auth,asyncRoute(async(req,res)=>{const p=req.body;if(!p.title)return res.status(400).json({error:'Informe o título.'});const r=await query('INSERT INTO recipes(title,category,description,ingredients,instructions,time,image) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',[p.title,p.category||'',p.description||'',p.ingredients||'',p.instructions||'',p.time||'',p.image||'']);res.status(201).json({id:r.rows[0].id});}));
app.delete('/api/admin/recipes/:id',auth,asyncRoute(async(req,res)=>{await query('DELETE FROM recipes WHERE id=$1',[req.params.id]);res.json({ok:true});}));
app.get('/admin',(req,res)=>res.sendFile(path.join(__dirname,'..','public','admin.html')));
app.get('/produto/:id',(req,res)=>res.sendFile(path.join(__dirname,'..','public','product.html')));
app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'..','public','index.html')));
app.use((err,req,res,next)=>{console.error(err);if(res.headersSent)return next(err);res.status(500).json({error:'Erro interno do servidor.'});});

const port=process.env.PORT||3000;
initDatabase().then(()=>app.listen(port,()=>console.log(`Tec Fit da Santa disponível na porta ${port}`))).catch(err=>{console.error('Falha ao iniciar o banco de dados:',err);process.exit(1);});
