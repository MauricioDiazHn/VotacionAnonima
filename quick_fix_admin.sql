-- SOLUCIÓN RÁPIDA PARA EL ERROR DE RECURSIÓN
-- Ejecutar INMEDIATAMENTE en Supabase SQL Editor

-- 1. Deshabilitar temporalmente RLS para evitar recursión
ALTER TABLE admin_users DISABLE ROW LEVEL SECURITY;

-- 2. Insertar tu usuario como superadmin si no existe
INSERT INTO admin_users (user_id, email, role, is_active, created_at)
SELECT 
    u.id,
    'cotitohn35@gmail.com',
    'superadmin',
    true,
    NOW()
FROM auth.users u
WHERE u.email = 'cotitohn35@gmail.com'
ON CONFLICT (email) DO UPDATE SET
    role = 'superadmin',
    is_active = true;

-- 3. Verificar que el registro se creó correctamente
SELECT * FROM admin_users WHERE email = 'cotitohn35@gmail.com';

-- 4. Opcional: Re-habilitar RLS cuando tengas tiempo de arreglar las políticas
-- ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
