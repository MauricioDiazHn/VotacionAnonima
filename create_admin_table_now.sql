-- CREAR TABLA ADMIN_USERS SI NO EXISTE
-- Ejecutar este código en el SQL Editor de Supabase AHORA

-- 1. Crear tabla básica de administradores
CREATE TABLE IF NOT EXISTS admin_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'superadmin')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    is_active BOOLEAN DEFAULT true
);

-- 2. Deshabilitar RLS temporalmente para evitar problemas
ALTER TABLE admin_users DISABLE ROW LEVEL SECURITY;

-- 3. Insertar tu usuario como superadmin
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

-- 4. Verificar que se creó correctamente
SELECT 'Tabla admin_users creada y configurada correctamente' as status;
SELECT * FROM admin_users;
