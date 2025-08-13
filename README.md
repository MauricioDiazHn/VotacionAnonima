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
- 🆕 **Arsenal de Recursos PRO** - Sistema de recursos educativos premium
- 🆕 **Sistema de suscripción PRO** ($1.99/mes)
- 🆕 **Gamificación con puntos** - Gana puntos subiendo recursos
- 🆕 **Top contribuidores** - Los mejores obtienen PRO gratis
- 🆕 **Subida de archivos** - Exámenes, guías, proyectos, apuntes y laboratorios
- 🆕 **Calificación de recursos** - Sistema de 5 estrellas para recursos

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

-- Tabla de likes en comentarios
CREATE TABLE comment_likes (
  id SERIAL PRIMARY KEY,
  comment_id INTEGER REFERENCES comments(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(comment_id, user_id)
);

-- === NUEVAS TABLAS PARA SISTEMA PRO ===

-- Tabla de recursos (ya creada)
CREATE TABLE recursos (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  id_catedratico BIGINT NOT NULL,
  id_usuario_que_subio UUID NOT NULL,
  nombre_archivo TEXT NOT NULL,
  path_storage TEXT NOT NULL,
  tipo_recurso TEXT NOT NULL,
  periodo_academico TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendiente',
  votos_positivos INTEGER NOT NULL DEFAULT 0,
  votos_negativos INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Tabla de perfiles de usuario (ya creada)
CREATE TABLE profiles (
  id UUID NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE NULL,
  username TEXT NULL,
  full_name TEXT NULL,
  avatar_url TEXT NULL,
  es_pro BOOLEAN NOT NULL DEFAULT FALSE,
  fecha_suscripcion TIMESTAMP WITH TIME ZONE NULL,
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_username_key UNIQUE (username),
  CONSTRAINT username_length CHECK ((char_length(username) >= 3))
);

-- Función para manejar nuevos usuarios (ya creada)
CREATE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (new.id, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'avatar_url');
  RETURN new;
END;
$$;

-- Función para incrementar votos en recursos
CREATE OR REPLACE FUNCTION incrementar_voto(recurso_id BIGINT, columna TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF columna = 'votos_positivos' THEN
    UPDATE recursos SET votos_positivos = votos_positivos + 1 WHERE id = recurso_id;
  ELSIF columna = 'votos_negativos' THEN
    UPDATE recursos SET votos_negativos = votos_negativos + 1 WHERE id = recurso_id;
  END IF;
END;
$$;

-- Función para obtener top contribuidores
CREATE OR REPLACE FUNCTION get_top_contributors(limite INTEGER DEFAULT 10)
RETURNS TABLE(
  user_id UUID,
  email TEXT,
  recursos_aprobados BIGINT,
  puntos INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    r.id_usuario_que_subio,
    COALESCE(p.full_name, 'Usuario Anónimo') as email,
    COUNT(*) as recursos_aprobados,
    (COUNT(*) * 100)::INTEGER as puntos
  FROM recursos r
  LEFT JOIN profiles p ON r.id_usuario_que_subio = p.id
  WHERE r.status = 'aprobado'
  GROUP BY r.id_usuario_que_subio, p.full_name
  ORDER BY recursos_aprobados DESC
  LIMIT limite;
END;
$$;

-- Políticas RLS (Row Level Security)
ALTER TABLE professors ENABLE ROW LEVEL SECURITY;
ALTER TABLE ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE comment_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE recursos ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Permitir lectura a todos
CREATE POLICY "Todos pueden leer profesores" ON professors FOR SELECT USING (true);
CREATE POLICY "Todos pueden leer ratings" ON ratings FOR SELECT USING (true);
CREATE POLICY "Todos pueden leer comentarios" ON comments FOR SELECT USING (true);
CREATE POLICY "Todos pueden leer likes" ON comment_likes FOR SELECT USING (true);
CREATE POLICY "Usuarios autenticados pueden ver recursos" ON recursos FOR SELECT TO authenticated USING ((SELECT auth.uid()) IS NOT NULL);

-- Permitir escritura solo a usuarios autenticados
CREATE POLICY "Usuario autenticado puede agregar profesor" ON professors FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Usuario autenticado puede evaluar" ON ratings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Usuario autenticado puede comentar" ON comments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Usuario autenticado puede dar like" ON comment_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Usuario autenticado puede quitar like" ON comment_likes FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Usuario autenticado puede subir recursos" ON recursos FOR INSERT WITH CHECK (auth.uid() = id_usuario_que_subio);

-- Políticas para perfiles
CREATE POLICY "Usuario puede ver su perfil" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Usuario puede actualizar su perfil" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Política para storage (recursos premium)
CREATE POLICY "Solo usuarios premium pueden descargar recursos premium" ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'recursos-pro' AND EXISTS (
    SELECT 1 FROM profiles WHERE id = (SELECT auth.uid()) AND es_pro = true
  )
);

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
✅ **Comentarios anónimos con sistema de likes**
✅ **Búsqueda y filtrado**
✅ **Panel "Mis Evaluaciones"**
✅ **Explorador global de comentarios**
✅ **Descubrimiento aleatorio**
✅ **Agregación de catedráticos**
✅ **Diseño responsive con glassmorphism**
✅ **Persistencia de datos con Supabase**
🆕 **Arsenal de Recursos PRO**
🆕 **Sistema de suscripción y gamificación**
🆕 **Subida y descarga de archivos educativos**
🆕 **Calificación y filtrado de recursos**

## 📱 Uso

1. **Registro/Login**: Crea una cuenta o inicia sesión
2. **Explorar**: Busca catedráticos o usa el descubrimiento aleatorio
3. **Evaluar**: Califica en 3 categorías (Dominio, Metodología, Puntualidad)
4. **Comentar**: Deja comentarios anónimos (opcional)
5. **Ver evaluaciones**: Revisa tus evaluaciones en "Mis Evaluaciones"
6. **Explorar comentarios**: Ve todos los comentarios en "Explorar Todos los Comentarios"
7. **Arsenal de Recursos**: 
   - **Usuarios gratuitos**: Ve la lista de recursos disponibles
   - **Usuarios PRO** ($1.99/mes): Descarga todos los recursos
   - **Contribuir**: Sube tus propios recursos y gana puntos
   - **Top contribuidores**: Los 10 mejores del mes obtienen PRO gratis

### 🏆 Sistema de Puntos
- **100 puntos** por cada recurso subido y aprobado
- **Rankings mensuales** de contribuidores
- **PRO gratuito** para los top 10 contribuidores

El sistema es completamente funcional y listo para producción! 🎉
