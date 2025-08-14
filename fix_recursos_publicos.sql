-- ============================================
-- SOLUCIÓN COMPLETA: RECURSOS PÚBLICOS Y PUNTOS
-- ============================================
-- Ejecutar este archivo completo en el SQL Editor de Supabase

-- 1. PRIMERO: Eliminar políticas problemáticas de la tabla recursos
DROP POLICY IF EXISTS "Todos pueden leer recursos aprobados" ON recursos;
DROP POLICY IF EXISTS "Usuarios autenticados pueden ver recursos" ON recursos;
DROP POLICY IF EXISTS "Usuario autenticado puede subir recursos" ON recursos;
DROP POLICY IF EXISTS "Usuarios autenticados pueden insertar recursos" ON recursos;
DROP POLICY IF EXISTS "Usuario puede actualizar sus propios recursos" ON recursos;
DROP POLICY IF EXISTS "Usuario puede eliminar sus propios recursos" ON recursos;

-- 2. CREAR POLÍTICAS CORRECTAS: Permitir acceso público a recursos aprobados
-- Política para que TODOS (incluso no autenticados) puedan ver recursos aprobados
CREATE POLICY "Todos pueden ver recursos aprobados" ON recursos 
FOR SELECT 
USING (status = 'aprobado');

-- Política para que usuarios autenticados vean sus propios recursos (cualquier status)
CREATE POLICY "Usuarios pueden ver sus propios recursos" ON recursos 
FOR SELECT 
USING (auth.uid() = id_usuario_que_subio);

-- Política para que admins vean todos los recursos
CREATE POLICY "Admins pueden ver todos los recursos" ON recursos 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM admin_users 
    WHERE user_id = auth.uid() 
    AND is_active = true
  )
);

-- Política para insertar recursos (solo usuarios autenticados)
CREATE POLICY "Usuarios autenticados pueden insertar recursos" ON recursos 
FOR INSERT 
WITH CHECK (auth.uid() = id_usuario_que_subio AND auth.uid() IS NOT NULL);

-- Política para actualizar recursos (solo el propietario o admins)
CREATE POLICY "Propietario o admin pueden actualizar recursos" ON recursos 
FOR UPDATE 
USING (
  auth.uid() = id_usuario_que_subio 
  OR EXISTS (
    SELECT 1 FROM admin_users 
    WHERE user_id = auth.uid() 
    AND is_active = true
  )
);

-- Política para eliminar recursos (solo el propietario o admins)
CREATE POLICY "Propietario o admin pueden eliminar recursos" ON recursos 
FOR DELETE 
USING (
  auth.uid() = id_usuario_que_subio 
  OR EXISTS (
    SELECT 1 FROM admin_users 
    WHERE user_id = auth.uid() 
    AND is_active = true
  )
);

-- 3. ASEGURAR QUE RLS ESTÉ HABILITADO
ALTER TABLE recursos ENABLE ROW LEVEL SECURITY;

-- 4. CREAR FUNCIÓN PARA OBTENER RECURSOS PÚBLICOS (incluso sin autenticación)
CREATE OR REPLACE FUNCTION get_public_professor_resources(professor_id_param BIGINT)
RETURNS TABLE(
  id BIGINT,
  id_catedratico BIGINT,
  id_usuario_que_subio UUID,
  nombre_archivo TEXT,
  path_storage TEXT,
  tipo_recurso TEXT,
  periodo_academico TEXT,
  status TEXT,
  votos_positivos INTEGER,
  votos_negativos INTEGER,
  created_at TIMESTAMP WITH TIME ZONE,
  professor_name TEXT,
  average_rating DECIMAL,
  rating_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    r.id,
    r.id_catedratico,
    r.id_usuario_que_subio,
    r.nombre_archivo,
    r.path_storage,
    r.tipo_recurso,
    r.periodo_academico,
    r.status,
    r.votos_positivos,
    r.votos_negativos,
    r.created_at,
    p.name as professor_name,
    CASE 
      WHEN (r.votos_positivos + r.votos_negativos) > 0 
      THEN ROUND((r.votos_positivos::DECIMAL / (r.votos_positivos + r.votos_negativos)) * 5, 1)
      ELSE 0
    END as average_rating,
    (r.votos_positivos + r.votos_negativos) as rating_count
  FROM recursos r
  LEFT JOIN professors p ON r.id_catedratico = p.id
  WHERE r.id_catedratico = professor_id_param
  AND r.status = 'aprobado'
  ORDER BY r.created_at DESC;
END;
$$;

-- 5. FUNCIÓN PARA OBTENER TODOS LOS RECURSOS PÚBLICOS (para explorar)
CREATE OR REPLACE FUNCTION get_all_public_resources()
RETURNS TABLE(
  id BIGINT,
  id_catedratico BIGINT,
  id_usuario_que_subio UUID,
  nombre_archivo TEXT,
  path_storage TEXT,
  tipo_recurso TEXT,
  periodo_academico TEXT,
  status TEXT,
  votos_positivos INTEGER,
  votos_negativos INTEGER,
  created_at TIMESTAMP WITH TIME ZONE,
  professor_name TEXT,
  average_rating DECIMAL,
  rating_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    r.id,
    r.id_catedratico,
    r.id_usuario_que_subio,
    r.nombre_archivo,
    r.path_storage,
    r.tipo_recurso,
    r.periodo_academico,
    r.status,
    r.votos_positivos,
    r.votos_negativos,
    r.created_at,
    p.name as professor_name,
    CASE 
      WHEN (r.votos_positivos + r.votos_negativos) > 0 
      THEN ROUND((r.votos_positivos::DECIMAL / (r.votos_positivos + r.votos_negativos)) * 5, 1)
      ELSE 0
    END as average_rating,
    (r.votos_positivos + r.votos_negativos) as rating_count
  FROM recursos r
  LEFT JOIN professors p ON r.id_catedratico = p.id
  WHERE r.status = 'aprobado'
  ORDER BY r.created_at DESC;
END;
$$;

-- 6. FUNCIÓN PARA CALCULAR PUNTOS DE USUARIO DE MANERA CORRECTA
CREATE OR REPLACE FUNCTION get_user_points(user_id_param UUID)
RETURNS TABLE(
  points INTEGER,
  uploaded_resources INTEGER,
  approved_resources INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  uploaded_count INTEGER;
  approved_count INTEGER;
  total_points INTEGER;
BEGIN
  -- Contar recursos subidos por el usuario
  SELECT COUNT(*) INTO uploaded_count
  FROM recursos
  WHERE id_usuario_que_subio = user_id_param;
  
  -- Contar recursos aprobados por el usuario
  SELECT COUNT(*) INTO approved_count
  FROM recursos
  WHERE id_usuario_que_subio = user_id_param
  AND status = 'aprobado';
  
  -- Calcular puntos: 100 puntos por cada recurso aprobado
  total_points := approved_count * 100;
  
  RETURN QUERY
  SELECT total_points, uploaded_count, approved_count;
END;
$$;

-- 7. HACER LA TABLA profiles ACCESIBLE PÚBLICAMENTE (para mostrar información de contribuidores)
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Enable read access for all users" ON profiles;

-- Permitir lectura pública de perfiles básicos
CREATE POLICY "Todos pueden ver perfiles básicos" ON profiles
FOR SELECT
USING (true);

-- Solo el propietario puede actualizar su perfil
CREATE POLICY "Usuario puede actualizar su propio perfil" ON profiles
FOR UPDATE
USING (auth.uid() = id);

-- Solo usuarios autenticados pueden insertar perfiles
CREATE POLICY "Usuario autenticado puede crear perfil" ON profiles
FOR INSERT
WITH CHECK (auth.uid() = id);

-- 8. VERIFICACIÓN Y MENSAJES DE CONFIRMACIÓN
SELECT 'Políticas de recursos actualizadas correctamente' as mensaje;
SELECT 'Funciones públicas creadas exitosamente' as mensaje;
SELECT 'Sistema de puntos corregido' as mensaje;

-- 9. VERIFICAR RECURSOS APROBADOS EXISTENTES (para debug)
SELECT COUNT(*) as recursos_aprobados_total FROM recursos WHERE status = 'aprobado';

-- 10. OPCIONAL: Crear algunos recursos de prueba si no hay ninguno aprobado
-- (descomenta las siguientes líneas solo si necesitas datos de prueba)

/*
-- Asegurarse de que haya al menos un profesor
INSERT INTO professors (name, department, course) 
VALUES ('Dr. Ejemplo', 'Ingeniería', 'Programación I')
ON CONFLICT DO NOTHING;

-- Crear recurso de prueba aprobado (ajustar los IDs según tu base de datos)
INSERT INTO recursos (
  id_catedratico, 
  id_usuario_que_subio, 
  nombre_archivo, 
  path_storage, 
  tipo_recurso, 
  periodo_academico, 
  status,
  votos_positivos,
  votos_negativos
) VALUES (
  1, -- ID del profesor (ajustar)
  (SELECT id FROM auth.users LIMIT 1), -- Primer usuario registrado
  'Examen_Parcial_Ejemplo.pdf',
  'recursos-pro/ejemplo_examen.pdf',
  'examen',
  '2025-I',
  'aprobado',
  5,
  1
) ON CONFLICT DO NOTHING;
*/

SELECT 'Configuración completada. Los recursos aprobados ahora son visibles para todos los usuarios.' as resultado_final;
