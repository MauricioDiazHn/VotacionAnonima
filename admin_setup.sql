-- ============================================
-- CONFIGURACIÓN DE ADMINISTRADORES
-- ============================================
-- Este archivo contiene todas las consultas SQL necesarias para 
-- configurar el sistema de administradores en Supabase

-- 1. Crear tabla de administradores
CREATE TABLE IF NOT EXISTS admin_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'superadmin')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    is_active BOOLEAN DEFAULT true,
    
    -- Constraints
    CONSTRAINT unique_user_admin UNIQUE(user_id)
);

-- 2. Crear índices para mejor rendimiento
CREATE INDEX IF NOT EXISTS idx_admin_users_email ON admin_users(email);
CREATE INDEX IF NOT EXISTS idx_admin_users_user_id ON admin_users(user_id);
CREATE INDEX IF NOT EXISTS idx_admin_users_active ON admin_users(is_active);

-- 3. Habilitar Row Level Security (RLS)
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

-- 4. Crear políticas de seguridad
-- Solo los administradores pueden ver la tabla de administradores
CREATE POLICY "Admins can view admin users" ON admin_users
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM admin_users au 
            WHERE au.user_id = auth.uid() 
            AND au.is_active = true
        )
    );

-- Solo los superadministradores pueden insertar nuevos admins
CREATE POLICY "Superadmins can insert admin users" ON admin_users
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM admin_users au 
            WHERE au.user_id = auth.uid() 
            AND au.role = 'superadmin' 
            AND au.is_active = true
        )
    );

-- Solo los superadministradores pueden actualizar admins
CREATE POLICY "Superadmins can update admin users" ON admin_users
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM admin_users au 
            WHERE au.user_id = auth.uid() 
            AND au.role = 'superadmin' 
            AND au.is_active = true
        )
    );

-- Solo los superadministradores pueden eliminar admins (soft delete recomendado)
CREATE POLICY "Superadmins can delete admin users" ON admin_users
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM admin_users au 
            WHERE au.user_id = auth.uid() 
            AND au.role = 'superadmin' 
            AND au.is_active = true
        )
    );

-- 5. Insertar el primer superadministrador (CAMBIAR EMAIL POR EL TUYO)
-- IMPORTANTE: Ejecutar esto DESPUÉS de registrarte en la aplicación con tu email
INSERT INTO admin_users (user_id, email, role, is_active)
SELECT 
    id,
    'cotitohn35@gmail.com', -- CAMBIAR POR TU EMAIL REAL
    'superadmin',
    true
FROM auth.users 
WHERE email = 'cotitohn35@gmail.com' -- CAMBIAR POR TU EMAIL REAL
ON CONFLICT (email) DO NOTHING;

-- 6. Función para verificar si un usuario es admin (opcional - para usar en otros lugares)
CREATE OR REPLACE FUNCTION is_user_admin(user_email TEXT DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Si no se proporciona email, usar el usuario actual
    IF user_email IS NULL THEN
        user_email := (SELECT email FROM auth.users WHERE id = auth.uid());
    END IF;
    
    -- Verificar si el usuario es admin activo
    RETURN EXISTS (
        SELECT 1 
        FROM admin_users au
        JOIN auth.users u ON au.user_id = u.id
        WHERE u.email = user_email 
        AND au.is_active = true
    );
END;
$$;

-- 7. Función para obtener el rol de un usuario admin
CREATE OR REPLACE FUNCTION get_user_admin_role(user_email TEXT DEFAULT NULL)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_role TEXT;
BEGIN
    -- Si no se proporciona email, usar el usuario actual
    IF user_email IS NULL THEN
        user_email := (SELECT email FROM auth.users WHERE id = auth.uid());
    END IF;
    
    -- Obtener el rol del usuario
    SELECT au.role INTO user_role
    FROM admin_users au
    JOIN auth.users u ON au.user_id = u.id
    WHERE u.email = user_email 
    AND au.is_active = true;
    
    RETURN COALESCE(user_role, 'user');
END;
$$;

-- ============================================
-- INSTRUCCIONES DE USO:
-- ============================================
-- 1. Ejecuta todas estas consultas en el SQL Editor de Supabase
-- 2. CAMBIA el email 'cotitohn35@gmail.com' por tu email real en las líneas 62 y 67
-- 3. Regístrate en la aplicación con ese email
-- 4. Si ya tienes cuenta, las consultas de INSERT no afectarán nada (ON CONFLICT DO NOTHING)
-- 5. Para agregar más administradores, usa las funciones de la aplicación o ejecuta:
--    INSERT INTO admin_users (user_id, email, role) 
--    SELECT id, 'nuevo_admin@email.com', 'admin' 
--    FROM auth.users WHERE email = 'nuevo_admin@email.com';

-- ============================================
-- CONSULTAS ÚTILES PARA ADMINISTRACIÓN:
-- ============================================

-- Ver todos los administradores
-- SELECT au.*, u.email, u.created_at as user_created_at 
-- FROM admin_users au 
-- JOIN auth.users u ON au.user_id = u.id 
-- ORDER BY au.created_at DESC;

-- Desactivar un administrador (soft delete)
-- UPDATE admin_users SET is_active = false WHERE email = 'admin@email.com';

-- Reactivar un administrador
-- UPDATE admin_users SET is_active = true WHERE email = 'admin@email.com';

-- Cambiar rol de un administrador
-- UPDATE admin_users SET role = 'superadmin' WHERE email = 'admin@email.com';
