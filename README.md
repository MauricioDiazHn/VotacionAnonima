# Sistema de Evaluación de Catedráticos

Sistema web para evaluar catedráticos de forma anónima con autenticación, comentarios y ratings.

## 🚀 Características

- ✅ **Autenticación completa** con Supabase
- ✅ **Evaluaciones anónimas** con ratings de 1-5 estrellas
- ✅ **Comentarios anónimos** por catedrático
- ✅ **Panel "Mis Evaluaciones"** para ver evaluaciones propias
- ✅ **Explorador global** de todos los comentarios
- ✅ **Búsqueda de catedráticos** en tiempo real
- ✅ **Descubrimiento aleatorio** de catedráticos
- ✅ **Diseño responsive** con glassmorphism
- ✅ **Agregación de catedráticos** (requiere autenticación)

## 🛠️ Configuración

### 1. Variables de entorno

1. Copia el archivo `.env.example` a `.env`:
   ```bash
   cp .env.example .env
   ```

2. Edita el archivo `.env` con tus credenciales de Supabase:
   ```env
   VITE_SUPABASE_URL=tu_url_de_supabase
   VITE_SUPABASE_ANON_KEY=tu_clave_anonima_de_supabase
   ```

### 2. Base de datos Supabase

Ejecuta las siguientes consultas SQL en tu proyecto de Supabase:

```sql
-- Tabla de profesores
CREATE TABLE professors (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  courses TEXT[] NOT NULL,
  avatar TEXT NOT NULL,
  rating DECIMAL(2,1) DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Tabla de evaluaciones
CREATE TABLE ratings (
  id SERIAL PRIMARY KEY,
  professor_id INTEGER REFERENCES professors(id),
  user_id UUID REFERENCES auth.users(id),
  dominio INTEGER NOT NULL CHECK (dominio >= 1 AND dominio <= 5),
  metodologia INTEGER NOT NULL CHECK (metodologia >= 1 AND metodologia <= 5),
  puntualidad INTEGER NOT NULL CHECK (puntualidad >= 1 AND puntualidad <= 5),
  average DECIMAL(2,1) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(professor_id, user_id)
);

-- Tabla de comentarios
CREATE TABLE comments (
  id SERIAL PRIMARY KEY,
  professor_id INTEGER REFERENCES professors(id),
  user_id UUID REFERENCES auth.users(id),
  text TEXT NOT NULL,
  date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Políticas RLS (Row Level Security)
ALTER TABLE professors ENABLE ROW LEVEL SECURITY;
ALTER TABLE ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

-- Permitir lectura a todos
CREATE POLICY "Todos pueden leer profesores" ON professors FOR SELECT USING (true);
CREATE POLICY "Todos pueden leer ratings" ON ratings FOR SELECT USING (true);
CREATE POLICY "Todos pueden leer comentarios" ON comments FOR SELECT USING (true);

-- Permitir escritura solo a usuarios autenticados
CREATE POLICY "Usuario autenticado puede agregar profesor" ON professors FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Usuario autenticado puede evaluar" ON ratings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Usuario autenticado puede comentar" ON comments FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Permitir actualización de rating a todos (para recalcular promedios)
CREATE POLICY "Actualizar rating de profesor" ON professors FOR UPDATE USING (true);
```

## 📁 Estructura del proyecto

```
VotacionAnonima/
├── index.html          # Aplicación principal
├── login.html          # Página de autenticación
├── supabase.js         # Funciones de base de datos
├── .env               # Variables de entorno (no incluido en Git)
├── .env.example       # Plantilla de variables de entorno
├── .gitignore         # Archivos ignorados por Git
└── README.md          # Este archivo
```

## 🌐 Deployment

### Vercel/Netlify
1. Conecta tu repositorio de GitHub
2. Configura las variables de entorno en el panel de administración:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. Despliega

### GitHub Pages
Para GitHub Pages necesitas usar el archivo `supabase.js` con las credenciales incluidas directamente, ya que GitHub Pages no soporta variables de entorno.

## 🔐 Seguridad

- ✅ Las credenciales están en `.env` (ignorado por Git)
- ✅ Row Level Security habilitado en Supabase
- ✅ Evaluaciones únicas por usuario/profesor
- ✅ Comentarios anónimos en el frontend

## 🎯 Funcionalidades completadas

✅ **Sistema completo de autenticación**
✅ **Evaluación de catedráticos (1-5 estrellas en 3 categorías)**  
✅ **Comentarios anónimos**
✅ **Búsqueda y filtrado**
✅ **Panel "Mis Evaluaciones"**
✅ **Explorador global de comentarios**
✅ **Descubrimiento aleatorio**
✅ **Agregación de catedráticos**
✅ **Diseño responsive**
✅ **Persistencia de datos con Supabase**

## 📱 Uso

1. **Registro/Login**: Crea una cuenta o inicia sesión
2. **Explorar**: Busca catedráticos o usa el descubrimiento aleatorio
3. **Evaluar**: Califica en 3 categorías (Dominio, Metodología, Puntualidad)
4. **Comentar**: Deja comentarios anónimos (opcional)
5. **Ver evaluaciones**: Revisa tus evaluaciones en "Mis Evaluaciones"
6. **Explorar comentarios**: Ve todos los comentarios en "Explorar Todos los Comentarios"

El sistema es completamente funcional y listo para producción! 🎉
