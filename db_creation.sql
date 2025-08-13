-- Crear la tabla de administradores
CREATE TABLE admins (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT-NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insertar los correos de los administradores iniciales
INSERT INTO admins (email) VALUES
('mauricio.diaz@admin.com'),
('admin@evalua-t.com'),
('tu-email@admin.com'),
('cotitohn35@gmail.com');

-- Activar RLS (Row-Level Security) en la tabla de administradores
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;

-- Política para permitir a los administradores leer la lista de administradores
CREATE POLICY "Admins can view other admins"
ON admins
FOR SELECT
USING (
  auth.role() = 'authenticated' AND
  EXISTS (
    SELECT 1
    FROM admins
    WHERE email = auth.email()
  )
);

-- Política para permitir a los administradores agregar nuevos administradores
CREATE POLICY "Admins can insert new admins"
ON admins
FOR INSERT
WITH CHECK (
  auth.role() = 'authenticated' AND
  EXISTS (
    SELECT 1
    FROM admins
    WHERE email = auth.email()
  )
);

-- Política para permitir a los administradores eliminar otros administradores
CREATE POLICY "Admins can delete other admins"
ON admins
FOR DELETE
USING (
  auth.role() = 'authenticated' AND
  EXISTS (
    SELECT 1
    FROM admins
    WHERE email = auth.email()
  )
);
