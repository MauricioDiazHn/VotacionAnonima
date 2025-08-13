-- SOLUCIÓN PARA EL ERROR DE user_id NULL
-- Ejecutar este SQL en Supabase AHORA

-- 1. Primero, hacer la columna user_id opcional temporalmente
ALTER TABLE admin_users ALTER COLUMN user_id DROP NOT NULL;

-- 2. Crear o reemplazar la función del trigger
CREATE OR REPLACE FUNCTION sync_admin_user_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Si no se proporciona user_id, intentar obtenerlo por email
    IF NEW.user_id IS NULL AND NEW.email IS NOT NULL THEN
        SELECT u.id INTO NEW.user_id
        FROM auth.users u
        WHERE u.email = NEW.email;
        
        -- Si aún no se encuentra el usuario, está bien - se actualizará después
        IF NEW.user_id IS NULL THEN
            RAISE WARNING 'Usuario no encontrado para email: %. El user_id se sincronizará cuando el usuario se registre.', NEW.email;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$;

-- 3. Crear el trigger si no existe
DROP TRIGGER IF EXISTS trigger_sync_admin_user_id ON admin_users;
CREATE TRIGGER trigger_sync_admin_user_id
    BEFORE INSERT OR UPDATE ON admin_users
    FOR EACH ROW
    EXECUTE FUNCTION sync_admin_user_id();

-- 4. Función para actualizar user_ids faltantes (ejecutar ocasionalmente)
CREATE OR REPLACE FUNCTION update_missing_user_ids()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    updated_count INTEGER := 0;
BEGIN
    UPDATE admin_users au
    SET user_id = u.id
    FROM auth.users u
    WHERE au.user_id IS NULL 
    AND au.email = u.email;
    
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    
    RAISE NOTICE 'Se actualizaron % registros de admin_users', updated_count;
    RETURN updated_count;
END;
$$;

-- 5. Ejecutar la función para sincronizar datos existentes
SELECT update_missing_user_ids();

-- 6. Verificar el estado actual
SELECT 
    email, 
    user_id, 
    role, 
    is_active,
    CASE 
        WHEN user_id IS NULL THEN 'Usuario no registrado aún'
        ELSE 'Usuario sincronizado'
    END as status
FROM admin_users 
ORDER BY created_at DESC;
