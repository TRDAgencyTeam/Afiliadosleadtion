const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const initSqlJs = require('sql.js');

const app = express();
const PORT = 3000;
const DB_PATH = path.join(__dirname, 'afiliados.db');
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

let db;

async function initDB() {
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    db = new SQL.Database(fs.readFileSync(DB_PATH));
    console.log('✅ Base de datos cargada');
  } else {
    db = new SQL.Database();
    console.log('✅ Base de datos nueva creada');
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS afiliados (
      id TEXT PRIMARY KEY,
      nombre TEXT NOT NULL,
      email TEXT DEFAULT '',
      tipo TEXT DEFAULT 'partner',
      ingreso TEXT DEFAULT '',
      notas TEXT DEFAULT '',
      comision_agencia REAL DEFAULT -1,
      creado_en TEXT DEFAULT (datetime('now'))
    );

    -- Cada "cliente" es una relación afiliado-cliente con licencia mensual
    CREATE TABLE IF NOT EXISTS clientes (
      id TEXT PRIMARY KEY,
      nombre TEXT NOT NULL,
      email TEXT DEFAULT '',
      afiliado_id TEXT NOT NULL,
      fecha_inicio TEXT DEFAULT '',
      precio_licencia REAL DEFAULT 69,
      creado_en TEXT DEFAULT (datetime('now'))
    );

    -- Servicios adicionales vendidos a ese cliente (reactivación, agente AI, etc.)
    -- Solo aplica comisión en mes 1 para agencias
    CREATE TABLE IF NOT EXISTS servicios (
      id TEXT PRIMARY KEY,
      cliente_id TEXT NOT NULL,
      tipo TEXT NOT NULL,
      nombre_personalizado TEXT DEFAULT '',
      precio REAL DEFAULT 0,
      creado_en TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS pagos (
      id TEXT PRIMARY KEY,
      cliente_id TEXT NOT NULL,
      mes_num INTEGER NOT NULL,
      fecha_pago TEXT DEFAULT '',
      monto REAL DEFAULT 0,
      notas TEXT DEFAULT '',
      comprobante_path TEXT DEFAULT '',
      comprobante_nombre TEXT DEFAULT '',
      creado_en TEXT DEFAULT (datetime('now')),
      UNIQUE(cliente_id, mes_num)
    );
  `);

  // Migración: si hay DBs anteriores, adaptar
  try { db.run("ALTER TABLE afiliados ADD COLUMN comision_agencia REAL DEFAULT -1"); } catch(e){}
  try { db.run("ALTER TABLE clientes ADD COLUMN precio_licencia REAL DEFAULT 69"); } catch(e){}

  const count = db.exec("SELECT COUNT(*) FROM afiliados");
  if ((count[0]?.values[0][0] || 0) === 0) seedData();
  saveDB();
}

function saveDB() {
  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
}

function seedData() {
  const afs = [
    ['afl-1','Carolina Zanabria','','agencia','2025-10-01','',-1],
    ['afl-2','Katherine Vargas','','partner','2025-11-01','',-1],
    ['afl-3','Yamile Albornoz','','partner','2025-12-01','',-1],
    ['afl-4','Catalina Smith','','partner','2026-03-01','',-1],
    ['afl-5','Ivelisse','','partner','2026-06-01','',-1],
  ];
  afs.forEach(([id,nombre,email,tipo,ingreso,notas,ca]) =>
    db.run('INSERT OR IGNORE INTO afiliados (id,nombre,email,tipo,ingreso,notas,comision_agencia) VALUES (?,?,?,?,?,?,?)',
      [id,nombre,email,tipo,ingreso,notas,ca]));

  // Clientes con precio_licencia
  const cls = [
    ['cl-1','Karen Millan','','afl-1','octubre 2025',67],
    ['cl-2','Nur Vega','','afl-1','noviembre 2025',67],
    ['cl-3','Mylet','','afl-1','diciembre 2025',67],
    ['cl-4','Yamile','','afl-2','noviembre 2025',67],
    ['cl-5','Elisa Sandobal','','afl-3','diciembre 2025',67],
    ['cl-6','Gonzalo Morales','','afl-1','enero 2026',67],
    ['cl-7','Marcela Cazares','','afl-4','marzo 2026',69],
    ['cl-8','Francisco Lara','','afl-1','mayo 2026',69],
    ['cl-9','Yolanda Uzeta','','afl-5','junio 2026',69],
    ['cl-10','Melida Cabral','','afl-5','junio 2026',69],
  ];
  cls.forEach(([id,nombre,email,afiliado_id,fecha_inicio,precio_licencia]) =>
    db.run('INSERT OR IGNORE INTO clientes (id,nombre,email,afiliado_id,fecha_inicio,precio_licencia) VALUES (?,?,?,?,?,?)',
      [id,nombre,email,afiliado_id,fecha_inicio,precio_licencia]));

  // Servicios adicionales de clientes de agencia (Karen, Nur, Mylet, Gonzalo, Francisco)
  const serviciosSeed = [
    ['srv-1','cl-1','text_ai','',497],
    ['srv-2','cl-2','text_ai','',497],
    ['srv-3','cl-3','text_ai','',497],
    ['srv-4','cl-6','voz_ai','',730],
    ['srv-5','cl-7','text_ai','',598], // Catalina (partner) - no genera comisión de servicio
    ['srv-6','cl-8','text_ai','',797],
    ['srv-7','cl-9','reactivacion','',545],
    ['srv-8','cl-10','reactivacion','',545],
  ];
  serviciosSeed.forEach(([id,cliente_id,tipo,np,precio]) =>
    db.run('INSERT OR IGNORE INTO servicios (id,cliente_id,tipo,nombre_personalizado,precio) VALUES (?,?,?,?,?)',
      [id,cliente_id,tipo,np,precio]));

  // Pagos históricos
  const MONTHS_ES=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  function parseMonthKey(s){if(!s)return null;const p=s.trim().split(' ');const mi=MONTHS_ES.indexOf(p[0].toLowerCase());if(mi===-1)return null;return new Date(parseInt(p[1]),mi,1);}
  function addMonths(d,n){const x=new Date(d);x.setMonth(x.getMonth()+n);return x;}
  const CUTOFF=new Date(2026,4,1);

  cls.forEach(([clId,,,afId,fechaInicio,precioLic])=>{
    const af=afs.find(a=>a[0]===afId);
    const isAgencia=af&&af[3]==='agencia';
    const start=parseMonthKey(fechaInicio);if(!start)return;
    for(let i=0;i<3;i++){
      const mesDate=addMonths(start,i);
      const pct=0.30; // nivel 1 por defecto seed
      let monto;
      if(i===0&&isAgencia){
        // mes 1 agencia: comisión sobre servicio adicional si existe
        const srv=serviciosSeed.find(s=>s[1]===clId);
        if(srv){monto=parseFloat((srv[4]*0.10).toFixed(2));}
        else{monto=parseFloat((precioLic*pct).toFixed(2));}
      }else{
        monto=parseFloat((precioLic*pct).toFixed(2));
      }
      const isPaid=afId==='afl-4'||mesDate<CUTOFF;
      if(isPaid){
        db.run('INSERT OR IGNORE INTO pagos (id,cliente_id,mes_num,fecha_pago,monto,notas) VALUES (?,?,?,?,?,?)',
          [`pago-${clId}-${i}`,clId,i,afId==='afl-4'?'2026-05-27':'2026-04-30',monto,afId==='afl-4'?'Pagado completo':'Pagado antes de mayo 2026']);
      }
    }
  });
  console.log('✅ Datos de ejemplo cargados');
}

function all(sql,params=[]){
  try{const s=db.prepare(sql);s.bind(params);const r=[];while(s.step())r.push(s.getAsObject());s.free();return r;}
  catch(e){console.error(e);return[];}
}
function run(sql,params=[]){db.run(sql,params);saveDB();}

app.use(express.json());
app.use(express.static(path.join(__dirname,'public')));
const storage=multer.diskStorage({destination:(req,file,cb)=>cb(null,UPLOADS_DIR),filename:(req,file,cb)=>cb(null,Date.now()+'-'+file.originalname)});
const upload=multer({storage,limits:{fileSize:10*1024*1024}});

// ── Afiliados ──────────────────────────────────────────────────
app.get('/api/afiliados',(req,res)=>res.json(all('SELECT * FROM afiliados ORDER BY creado_en')));

app.post('/api/afiliados',(req,res)=>{
  const{nombre,email,tipo,ingreso,notas,comision_agencia}=req.body;
  if(!nombre)return res.status(400).json({error:'Nombre requerido'});
  const id='afl-'+Date.now();
  const ca=(tipo==='agencia'&&comision_agencia!=null&&comision_agencia!=='')?parseFloat(comision_agencia):-1;
  run('INSERT INTO afiliados (id,nombre,email,tipo,ingreso,notas,comision_agencia) VALUES (?,?,?,?,?,?,?)',
    [id,nombre,email||'',tipo||'partner',ingreso||'',notas||'',ca]);
  res.json({ok:true,id});
});

app.put('/api/afiliados/:id',(req,res)=>{
  const{nombre,email,tipo,ingreso,notas,comision_agencia}=req.body;
  const ca=(tipo==='agencia'&&comision_agencia!=null&&comision_agencia!=='')?parseFloat(comision_agencia):-1;
  run('UPDATE afiliados SET nombre=?,email=?,tipo=?,ingreso=?,notas=?,comision_agencia=? WHERE id=?',
    [nombre,email||'',tipo,ingreso||'',notas||'',ca,req.params.id]);
  res.json({ok:true});
});

app.delete('/api/afiliados/:id',(req,res)=>{run('DELETE FROM afiliados WHERE id=?',[req.params.id]);res.json({ok:true});});

// ── Clientes ───────────────────────────────────────────────────
app.get('/api/clientes',(req,res)=>res.json(all('SELECT * FROM clientes ORDER BY creado_en')));

app.post('/api/clientes',(req,res)=>{
  const{nombre,email,afiliado_id,fecha_inicio,precio_licencia,servicios}=req.body;
  if(!nombre||!afiliado_id)return res.status(400).json({error:'Faltan campos'});
  const id='cl-'+Date.now();
  run('INSERT INTO clientes (id,nombre,email,afiliado_id,fecha_inicio,precio_licencia) VALUES (?,?,?,?,?,?)',
    [id,nombre,email||'',afiliado_id,fecha_inicio||'',parseFloat(precio_licencia)||69]);
  // Guardar servicios adicionales
  if(servicios&&Array.isArray(servicios)){
    servicios.forEach((s,i)=>{
      const sid='srv-'+Date.now()+'-'+i;
      run('INSERT INTO servicios (id,cliente_id,tipo,nombre_personalizado,precio) VALUES (?,?,?,?,?)',
        [sid,id,s.tipo,s.nombre_personalizado||'',parseFloat(s.precio)||0]);
    });
  }
  res.json({ok:true,id});
});

app.put('/api/clientes/:id',(req,res)=>{
  const{nombre,email,afiliado_id,fecha_inicio,precio_licencia,servicios}=req.body;
  run('UPDATE clientes SET nombre=?,email=?,afiliado_id=?,fecha_inicio=?,precio_licencia=? WHERE id=?',
    [nombre,email||'',afiliado_id,fecha_inicio||'',parseFloat(precio_licencia)||69,req.params.id]);
  // Reemplazar servicios
  run('DELETE FROM servicios WHERE cliente_id=?',[req.params.id]);
  if(servicios&&Array.isArray(servicios)){
    servicios.forEach((s,i)=>{
      const sid='srv-'+Date.now()+'-'+i;
      run('INSERT INTO servicios (id,cliente_id,tipo,nombre_personalizado,precio) VALUES (?,?,?,?,?)',
        [sid,req.params.id,s.tipo,s.nombre_personalizado||'',parseFloat(s.precio)||0]);
    });
  }
  res.json({ok:true});
});

app.delete('/api/clientes/:id',(req,res)=>{
  run('DELETE FROM servicios WHERE cliente_id=?',[req.params.id]);
  run('DELETE FROM clientes WHERE id=?',[req.params.id]);
  res.json({ok:true});
});

// ── Servicios ──────────────────────────────────────────────────
app.get('/api/servicios',(req,res)=>res.json(all('SELECT * FROM servicios')));

// ── Pagos ──────────────────────────────────────────────────────
app.get('/api/pagos',(req,res)=>res.json(all('SELECT * FROM pagos')));

app.post('/api/pagos',upload.single('comprobante'),(req,res)=>{
  const{cliente_id,mes_num,fecha_pago,monto,notas}=req.body;
  if(!cliente_id)return res.status(400).json({error:'Faltan campos'});
  const id='pago-'+Date.now();
  const compPath=req.file?'/uploads/'+req.file.filename:'';
  const compNombre=req.file?req.file.originalname:'';
  run('INSERT OR REPLACE INTO pagos (id,cliente_id,mes_num,fecha_pago,monto,notas,comprobante_path,comprobante_nombre) VALUES (?,?,?,?,?,?,?,?)',
    [id,cliente_id,parseInt(mes_num),fecha_pago||'',parseFloat(monto)||0,notas||'',compPath,compNombre]);
  res.json({ok:true,comprobante_path:compPath});
});

app.delete('/api/pagos/:clienteId/:mesNum',(req,res)=>{
  run('DELETE FROM pagos WHERE cliente_id=? AND mes_num=?',[req.params.clienteId,parseInt(req.params.mesNum)]);
  res.json({ok:true});
});

initDB().then(()=>{
  app.listen(PORT,()=>{
    console.log(`\n🚀 Servidor en http://localhost:${PORT}`);
    console.log('   Presiona Ctrl+C para detener\n');
  });
}).catch(err=>{console.error('Error DB:',err);process.exit(1);});
